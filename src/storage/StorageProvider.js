/**
 * Abstract base class for storage providers
 * All storage providers must implement this interface
 */
class StorageProvider {
  /**
   * Upload a file to storage
   * @param {Buffer} fileBuffer - The file content as a buffer
   * @param {string} originalName - The original filename
   * @param {string} mimeType - The MIME type of the file
   * @returns {Promise<{publicKey: string, privateKey: string}>} - Keys for accessing the file
   */
  async uploadFile(fileBuffer, originalName, mimeType) {
    throw new Error('uploadFile must be implemented by storage provider');
  }

  /**
   * Download a file from storage
   * @param {string} publicKey - The public key identifying the file
   * @returns {Promise<{buffer: Buffer, mimeType: string, originalName: string}>} - File data
   */
  async downloadFile(publicKey) {
    throw new Error('downloadFile must be implemented by storage provider');
  }

  /**
   * Delete a file from storage
   * @param {string} privateKey - The private key identifying the file
   * @returns {Promise<boolean>} - True if file was deleted, false otherwise
   */
  async deleteFile(privateKey) {
    throw new Error('deleteFile must be implemented by storage provider');
  }

  /**
   * Get metadata for a file (used for cleanup job)
   * @param {string} privateKey - The private key identifying the file
   * @returns {Promise<{lastAccessed: Date|null, createdAt: Date}>} - File metadata
   */
  async getFileMetadata(privateKey) {
    throw new Error('getFileMetadata must be implemented by storage provider');
  }

  /**
   * Update last accessed timestamp for a file
   * @param {string} publicKey - The public key identifying the file
   * @returns {Promise<void>}
   */
  async updateLastAccessed(publicKey) {
    throw new Error('updateLastAccessed must be implemented by storage provider');
  }

  /**
   * Get all files that match cleanup criteria
   * @param {Date} inactiveSince - Files not accessed since this date should be returned
   * @returns {Promise<Array<{privateKey: string}>>} - List of files to cleanup
   */
  async getInactiveFiles(inactiveSince) {
    throw new Error('getInactiveFiles must be implemented by storage provider');
  }
}

module.exports = StorageProvider;
