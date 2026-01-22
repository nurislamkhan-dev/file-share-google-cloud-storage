const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
const fs = require('fs').promises;

const StorageProvider = require('./StorageProvider');

/**
 * Google Cloud Storage provider
 * Stores files in Google Cloud Storage buckets with metadata in Cloud Storage
 */
class GoogleCloudStorageProvider extends StorageProvider {
  /**
   * @param {string} configPath - Absolute path to the configuration file
   */
  constructor(configPath) {
    super();
    this.configPath = configPath;
    this.config = null;
    this.storage = null;
    this.bucket = null;
    this.metadataBucket = null;
  }

  /**
   * Load configuration from file
   * @returns {Promise<Object>} Configuration object
   */
  async _loadConfig() {
    if (this.config) {
      return this.config;
    }

    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configContent);
      
      // Validate required configuration fields
      const requiredFields = ['bucket', 'credentials'];
      for (const field of requiredFields) {
        if (!this.config[field]) {
          throw new Error(`Missing required configuration field: ${field}`);
        }
      }

      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration from ${this.configPath}: ${error.message}`);
    }
  }

  /**
   * Initialize the storage provider by connecting to Google Cloud Storage
   * @returns {Promise<void>}
   */
  async initialize() {
    await this._loadConfig();

    // Initialize Google Cloud Storage client
    // Credentials can be a path to a JSON file or an object
    const credentials = typeof this.config.credentials === 'string'
      ? this.config.credentials
      : this.config.credentials;

    this.storage = new Storage({
      projectId: this.config.projectId,
      keyFilename: typeof credentials === 'string' ? credentials : undefined,
      credentials: typeof credentials === 'object' ? credentials : undefined
    });

    // Get bucket for file storage
    const bucketName = this.config.bucket;
    this.bucket = this.storage.bucket(bucketName);

    // Check if bucket exists, create if configured to do so
    const [exists] = await this.bucket.exists();
    if (!exists) {
      if (this.config.createBucketIfNotExists) {
        console.log(`Creating bucket ${bucketName}...`);
        await this.bucket.create({
          location: this.config.location || 'US',
          storageClass: this.config.storageClass || 'STANDARD'
        });
        console.log(`Bucket ${bucketName} created successfully`);
      } else {
        throw new Error(`Bucket ${bucketName} does not exist and createBucketIfNotExists is false`);
      }
    }

    // Use separate bucket for metadata or same bucket with prefix
    this.metadataPrefix = this.config.metadataPrefix || 'metadata/';

    console.log(`Google Cloud Storage provider initialized with bucket: ${bucketName}`);
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
   * Get metadata file path in Cloud Storage
   * @param {string} key - Public or private key
   * @returns {string}
   */
  _getMetadataPath(key) {
    return `${this.metadataPrefix}${key}.json`;
  }

  /**
   * Get file path in Cloud Storage
   * @param {string} key - Public or private key
   * @returns {string}
   */
  _getFilePath(key) {
    const prefix = this.config.filePrefix || 'files/';
    return `${prefix}${key}`;
  }

  /**
   * Upload a file to Google Cloud Storage
   * @param {Buffer} fileBuffer - The file content as a buffer
   * @param {string} originalName - The original filename
   * @param {string} mimeType - The MIME type of the file
   * @returns {Promise<{publicKey: string, privateKey: string}>}
   */
  async uploadFile(fileBuffer, originalName, mimeType) {
    if (!this.bucket) {
      throw new Error('Storage provider not initialized');
    }

    const { publicKey, privateKey } = this._generateKeys();

    // Save the file using the public key as filename
    const filePath = this._getFilePath(publicKey);
    const file = this.bucket.file(filePath);

    await file.save(fileBuffer, {
      metadata: {
        contentType: mimeType,
        metadata: {
          originalName,
          publicKey,
          privateKey
        }
      }
    });

    // Save metadata
    const metadata = {
      publicKey,
      privateKey,
      originalName,
      mimeType,
      createdAt: new Date().toISOString(),
      lastAccessed: null,
      fileSize: fileBuffer.length,
      filePath
    };

    // Save metadata for both public and private keys
    const publicMetadataPath = this._getMetadataPath(publicKey);
    const privateMetadataPath = this._getMetadataPath(privateKey);
    
    const publicMetadataFile = this.bucket.file(publicMetadataPath);
    const privateMetadataFile = this.bucket.file(privateMetadataPath);

    await publicMetadataFile.save(JSON.stringify(metadata), {
      metadata: {
        contentType: 'application/json'
      }
    });

    await privateMetadataFile.save(JSON.stringify(metadata), {
      metadata: {
        contentType: 'application/json'
      }
    });

    return { publicKey, privateKey };
  }

  /**
   * Download a file from Google Cloud Storage
   * @param {string} publicKey - The public key identifying the file
   * @returns {Promise<{buffer: Buffer, mimeType: string, originalName: string}>}
   */
  async downloadFile(publicKey) {
    if (!this.bucket) {
      throw new Error('Storage provider not initialized');
    }

    const metadataPath = this._getMetadataPath(publicKey);
    const metadataFile = this.bucket.file(metadataPath);

    // Check if metadata exists
    const [metadataExists] = await metadataFile.exists();
    if (!metadataExists) {
      throw new Error('File not found');
    }

    // Read metadata
    const [metadataContent] = await metadataFile.download();
    const metadata = JSON.parse(metadataContent.toString('utf-8'));

    // Read file
    const filePath = metadata.filePath || this._getFilePath(publicKey);
    const file = this.bucket.file(filePath);
    const [fileBuffer] = await file.download();

    // Update last accessed timestamp
    metadata.lastAccessed = new Date().toISOString();
    await metadataFile.save(JSON.stringify(metadata), {
      metadata: {
        contentType: 'application/json'
      }
    });

    // Also update the private key metadata
    const privateMetadataPath = this._getMetadataPath(metadata.privateKey);
    const privateMetadataFile = this.bucket.file(privateMetadataPath);
    await privateMetadataFile.save(JSON.stringify(metadata), {
      metadata: {
        contentType: 'application/json'
      }
    });

    return {
      buffer: fileBuffer,
      mimeType: metadata.mimeType,
      originalName: metadata.originalName
    };
  }

  /**
   * Delete a file from Google Cloud Storage
   * @param {string} privateKey - The private key identifying the file
   * @returns {Promise<boolean>}
   */
  async deleteFile(privateKey) {
    if (!this.bucket) {
      throw new Error('Storage provider not initialized');
    }

    const metadataPath = this._getMetadataPath(privateKey);
    const metadataFile = this.bucket.file(metadataPath);

    // Check if metadata exists
    const [metadataExists] = await metadataFile.exists();
    if (!metadataExists) {
      return false;
    }

    // Read metadata
    let metadata;
    try {
      const [metadataContent] = await metadataFile.download();
      metadata = JSON.parse(metadataContent.toString('utf-8'));
    } catch (error) {
      return false;
    }

    // Delete file
    const filePath = metadata.filePath || this._getFilePath(metadata.publicKey);
    const file = this.bucket.file(filePath);
    try {
      await file.delete();
    } catch (error) {
      // File might not exist, continue with metadata deletion
      console.warn(`File ${filePath} could not be deleted:`, error.message);
    }

    // Delete metadata files
    const publicMetadataPath = this._getMetadataPath(metadata.publicKey);
    const publicMetadataFile = this.bucket.file(publicMetadataPath);
    
    try {
      await publicMetadataFile.delete();
    } catch (error) {
      // Ignore if doesn't exist
      console.warn(`Metadata file ${publicMetadataPath} could not be deleted:`, error.message);
    }

    try {
      await metadataFile.delete();
    } catch (error) {
      // Ignore if doesn't exist
      console.warn(`Metadata file ${metadataPath} could not be deleted:`, error.message);
    }

    return true;
  }

  /**
   * Get metadata for a file
   * @param {string} privateKey - The private key identifying the file
   * @returns {Promise<{lastAccessed: Date|null, createdAt: Date}>}
   */
  async getFileMetadata(privateKey) {
    if (!this.bucket) {
      throw new Error('Storage provider not initialized');
    }

    const metadataPath = this._getMetadataPath(privateKey);
    const metadataFile = this.bucket.file(metadataPath);

    try {
      const [metadataContent] = await metadataFile.download();
      const metadata = JSON.parse(metadataContent.toString('utf-8'));

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
    if (!this.bucket) {
      throw new Error('Storage provider not initialized');
    }

    const metadataPath = this._getMetadataPath(publicKey);
    const metadataFile = this.bucket.file(metadataPath);

    try {
      const [metadataContent] = await metadataFile.download();
      const metadata = JSON.parse(metadataContent.toString('utf-8'));

      metadata.lastAccessed = new Date().toISOString();
      await metadataFile.save(JSON.stringify(metadata), {
        metadata: {
          contentType: 'application/json'
        }
      });

      // Also update private key metadata
      const privateMetadataPath = this._getMetadataPath(metadata.privateKey);
      const privateMetadataFile = this.bucket.file(privateMetadataPath);
      await privateMetadataFile.save(JSON.stringify(metadata), {
        metadata: {
          contentType: 'application/json'
        }
      });
    } catch (error) {
      // File might not exist, ignore
      console.warn(`Could not update last accessed for ${publicKey}:`, error.message);
    }
  }

  /**
   * Get all files that match cleanup criteria
   * @param {Date} inactiveSince - Files not accessed since this date should be returned
   * @returns {Promise<Array<{privateKey: string}>>}
   */
  async getInactiveFiles(inactiveSince) {
    if (!this.bucket) {
      throw new Error('Storage provider not initialized');
    }

    const inactiveFiles = [];

    try {
      // List all metadata files with the private key prefix
      const [files] = await this.bucket.getFiles({
        prefix: this.metadataPrefix
      });

      for (const file of files) {
        // Check if this is a private key metadata file by trying to read it
        // and checking if the privateKey matches the filename
        try {
          const [content] = await file.download();
          const metadata = JSON.parse(content.toString('utf-8'));

          // Extract key from filename (remove prefix and .json extension)
          const keyFromFilename = file.name
            .replace(this.metadataPrefix, '')
            .replace('.json', '');

          // Only process if this is a private key file (has privateKey that matches filename)
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
    } catch (error) {
      console.error('Error listing files for cleanup:', error);
    }

    return inactiveFiles;
  }
}

module.exports = GoogleCloudStorageProvider;
