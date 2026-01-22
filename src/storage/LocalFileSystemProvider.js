const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const StorageProvider = require('./StorageProvider');

/**
 * Local filesystem storage provider
 * Stores files on the local file system with metadata in JSON files
 */
class LocalFileSystemProvider extends StorageProvider {
  /**
   * @param {string} rootFolder - Absolute path to the root folder for storing files
   */
  constructor(rootFolder) {
    super();
    this.rootFolder = rootFolder;
    this.metadataFolder = path.join(rootFolder, '.metadata');
    this.filesFolder = path.join(rootFolder, 'files');
  }

  /**
   * Initialize the storage provider by creating necessary directories
   * @returns {Promise<void>}
   */
  async initialize() {
    // Create root folder if it doesn't exist
    await fs.mkdir(this.rootFolder, { recursive: true });
    await fs.mkdir(this.metadataFolder, { recursive: true });
    await fs.mkdir(this.filesFolder, { recursive: true });
  }

  /**
   * Generate a unique key pair for a file
   * @returns {{publicKey: string, privateKey: string}}
   */
  _generateKeys() {
    const publicKey = crypto.randomBytes(32).toString('hex');
    const privateKey = crypto.randomBytes(32).toString('hex');
    return { publicKey, privateKey };
  }

  /**
   * Get metadata file path for a given key
   * @param {string} key - Public or private key
   * @returns {string}
   */
  _getMetadataPath(key) {
    return path.join(this.metadataFolder, `${key}.json`);
  }

  /**
   * Get file path for a given key
   * @param {string} key - Public or private key
   * @returns {string}
   */
  _getFilePath(key) {
    return path.join(this.filesFolder, key);
  }

  /**
   * Upload a file to local storage
   * @param {Buffer} fileBuffer - The file content as a buffer
   * @param {string} originalName - The original filename
   * @param {string} mimeType - The MIME type of the file
   * @returns {Promise<{publicKey: string, privateKey: string}>}
   */
  async uploadFile(fileBuffer, originalName, mimeType) {
    const { publicKey, privateKey } = this._generateKeys();

    // Save the file using the public key as filename
    const filePath = this._getFilePath(publicKey);
    await fs.writeFile(filePath, fileBuffer);

    // Save metadata
    const metadata = {
      publicKey,
      privateKey,
      originalName,
      mimeType,
      createdAt: new Date().toISOString(),
      lastAccessed: null,
      fileSize: fileBuffer.length
    };

    // Save metadata for both public and private keys
    const publicMetadataPath = this._getMetadataPath(publicKey);
    const privateMetadataPath = this._getMetadataPath(privateKey);
    await fs.writeFile(publicMetadataPath, JSON.stringify(metadata));
    await fs.writeFile(privateMetadataPath, JSON.stringify(metadata));

    return { publicKey, privateKey };
  }

  /**
   * Download a file from local storage
   * @param {string} publicKey - The public key identifying the file
   * @returns {Promise<{buffer: Buffer, mimeType: string, originalName: string}>}
   */
  async downloadFile(publicKey) {
    const metadataPath = this._getMetadataPath(publicKey);
    
    // Check if metadata exists
    try {
      await fs.access(metadataPath);
    } catch (error) {
      throw new Error('File not found');
    }

    // Read metadata
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Read file
    const filePath = this._getFilePath(publicKey);
    const buffer = await fs.readFile(filePath);

    // Update last accessed timestamp
    metadata.lastAccessed = new Date().toISOString();
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
    
    // Also update the private key metadata
    const privateMetadataPath = this._getMetadataPath(metadata.privateKey);
    await fs.writeFile(privateMetadataPath, JSON.stringify(metadata));

    return {
      buffer,
      mimeType: metadata.mimeType,
      originalName: metadata.originalName
    };
  }

  /**
   * Delete a file from local storage
   * @param {string} privateKey - The private key identifying the file
   * @returns {Promise<boolean>}
   */
  async deleteFile(privateKey) {
    const metadataPath = this._getMetadataPath(privateKey);
    
    // Check if metadata exists
    let metadata;
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(metadataContent);
    } catch (error) {
      return false;
    }

    // Delete file
    const filePath = this._getFilePath(metadata.publicKey);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist, continue with metadata deletion
    }

    // Delete metadata files
    const publicMetadataPath = this._getMetadataPath(metadata.publicKey);
    try {
      await fs.unlink(publicMetadataPath);
    } catch (error) {
      // Ignore if doesn't exist
    }

    try {
      await fs.unlink(metadataPath);
    } catch (error) {
      // Ignore if doesn't exist
    }

    return true;
  }

  /**
   * Get metadata for a file
   * @param {string} privateKey - The private key identifying the file
   * @returns {Promise<{lastAccessed: Date|null, createdAt: Date}>}
   */
  async getFileMetadata(privateKey) {
    const metadataPath = this._getMetadataPath(privateKey);
    
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      return {
        lastAccessed: metadata.lastAccessed ? new Date(metadata.lastAccessed) : null,
        createdAt: new Date(metadata.createdAt)
      };
    } catch (error) {
      throw new Error('File metadata not found');
    }
  }

  /**
   * Update last accessed timestamp for a file
   * @param {string} publicKey - The public key identifying the file
   * @returns {Promise<void>}
   */
  async updateLastAccessed(publicKey) {
    const metadataPath = this._getMetadataPath(publicKey);
    
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      metadata.lastAccessed = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata));
      
      // Also update private key metadata
      const privateMetadataPath = this._getMetadataPath(metadata.privateKey);
      await fs.writeFile(privateMetadataPath, JSON.stringify(metadata));
    } catch (error) {
      // File might not exist, ignore
    }
  }

  /**
   * Get all files that match cleanup criteria
   * @param {Date} inactiveSince - Files not accessed since this date should be returned
   * @returns {Promise<Array<{privateKey: string}>>}
   */
  async getInactiveFiles(inactiveSince) {
    const inactiveFiles = [];
    
    try {
      const metadataFiles = await fs.readdir(this.metadataFolder);
      
      for (const metadataFile of metadataFiles) {
        // Only process private key metadata files (we can identify them by checking both keys)
        // For simplicity, we'll check all metadata files and use privateKey from metadata
        if (metadataFile.endsWith('.json')) {
          try {
            const metadataPath = path.join(this.metadataFolder, metadataFile);
            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);
            
            // Only process if this is a private key file (has privateKey that matches filename)
            const keyFromFilename = metadataFile.replace('.json', '');
            if (metadata.privateKey === keyFromFilename) {
              const lastAccessed = metadata.lastAccessed ? new Date(metadata.lastAccessed) : null;
              const createdAt = new Date(metadata.createdAt);
              
              // File is inactive if never accessed and created before threshold, or last accessed before threshold
              const referenceDate = lastAccessed || createdAt;
              
              if (referenceDate < inactiveSince) {
                inactiveFiles.push({ privateKey: metadata.privateKey });
              }
            }
          } catch (error) {
            // Skip invalid metadata files
            continue;
          }
        }
      }
    } catch (error) {
      // Metadata folder might not exist yet
    }
    
    return inactiveFiles;
  }
}

module.exports = LocalFileSystemProvider;
