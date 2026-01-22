const fs = require('fs').promises;
const path = require('path');
const LocalFileSystemProvider = require('../../../src/storage/LocalFileSystemProvider');

// Use a test-specific folder
const TEST_ROOT_FOLDER = path.join(__dirname, '../../../test-storage');

describe('LocalFileSystemProvider', () => {
  let provider;

  beforeEach(async () => {
    // Clean up test folder before each test
    try {
      await fs.rm(TEST_ROOT_FOLDER, { recursive: true, force: true });
    } catch (error) {
      // Ignore if folder doesn't exist
    }

    provider = new LocalFileSystemProvider(TEST_ROOT_FOLDER);
    await provider.initialize();
  });

  afterEach(async () => {
    // Clean up test folder after each test
    try {
      await fs.rm(TEST_ROOT_FOLDER, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  describe('uploadFile', () => {
    it('should upload a file and return publicKey and privateKey', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const result = await provider.uploadFile(fileBuffer, originalName, mimeType);

      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('privateKey');
      expect(result.publicKey).toBeTruthy();
      expect(result.privateKey).toBeTruthy();
      expect(result.publicKey).not.toBe(result.privateKey);
    });

    it('should save file content to filesystem', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const { publicKey } = await provider.uploadFile(fileBuffer, originalName, mimeType);

      const filePath = path.join(TEST_ROOT_FOLDER, 'files', publicKey);
      const savedContent = await fs.readFile(filePath);

      expect(savedContent.toString()).toBe('test file content');
    });

    it('should save metadata for both public and private keys', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const { publicKey, privateKey } = await provider.uploadFile(fileBuffer, originalName, mimeType);

      const publicMetadataPath = path.join(TEST_ROOT_FOLDER, '.metadata', `${publicKey}.json`);
      const privateMetadataPath = path.join(TEST_ROOT_FOLDER, '.metadata', `${privateKey}.json`);

      const publicMetadata = JSON.parse(await fs.readFile(publicMetadataPath, 'utf-8'));
      const privateMetadata = JSON.parse(await fs.readFile(privateMetadataPath, 'utf-8'));

      expect(publicMetadata.originalName).toBe(originalName);
      expect(publicMetadata.mimeType).toBe(mimeType);
      expect(publicMetadata.publicKey).toBe(publicKey);
      expect(publicMetadata.privateKey).toBe(privateKey);
      expect(publicMetadata).toEqual(privateMetadata);
    });
  });

  describe('downloadFile', () => {
    it('should download a file by publicKey', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const { publicKey } = await provider.uploadFile(fileBuffer, originalName, mimeType);

      const result = await provider.downloadFile(publicKey);

      expect(result.buffer.toString()).toBe('test file content');
      expect(result.mimeType).toBe(mimeType);
      expect(result.originalName).toBe(originalName);
    });

    it('should throw error if file does not exist', async () => {
      const nonExistentKey = 'non-existent-key';

      await expect(provider.downloadFile(nonExistentKey)).rejects.toThrow('File not found');
    });

    it('should update lastAccessed timestamp on download', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const { publicKey, privateKey } = await provider.uploadFile(fileBuffer, originalName, mimeType);

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await provider.downloadFile(publicKey);

      const metadata = await provider.getFileMetadata(privateKey);
      expect(metadata.lastAccessed).not.toBeNull();
      expect(metadata.lastAccessed.getTime()).toBeGreaterThan(metadata.createdAt.getTime());
    });
  });

  describe('deleteFile', () => {
    it('should delete a file by privateKey', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const { publicKey, privateKey } = await provider.uploadFile(fileBuffer, originalName, mimeType);

      const deleted = await provider.deleteFile(privateKey);

      expect(deleted).toBe(true);

      // File should not exist
      const filePath = path.join(TEST_ROOT_FOLDER, 'files', publicKey);
      await expect(fs.access(filePath)).rejects.toThrow();

      // Metadata should not exist
      const metadataPath = path.join(TEST_ROOT_FOLDER, '.metadata', `${privateKey}.json`);
      await expect(fs.access(metadataPath)).rejects.toThrow();
    });

    it('should return false if file does not exist', async () => {
      const nonExistentKey = 'non-existent-key';

      const deleted = await provider.deleteFile(nonExistentKey);

      expect(deleted).toBe(false);
    });
  });

  describe('getFileMetadata', () => {
    it('should return file metadata', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const { privateKey } = await provider.uploadFile(fileBuffer, originalName, mimeType);

      const metadata = await provider.getFileMetadata(privateKey);

      expect(metadata).toHaveProperty('createdAt');
      expect(metadata).toHaveProperty('lastAccessed');
      expect(metadata.createdAt).toBeInstanceOf(Date);
      expect(metadata.lastAccessed).toBeNull(); // Initially null
    });

    it('should throw error if metadata does not exist', async () => {
      const nonExistentKey = 'non-existent-key';

      await expect(provider.getFileMetadata(nonExistentKey)).rejects.toThrow('File metadata not found');
    });
  });

  describe('getInactiveFiles', () => {
    it('should return inactive files', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      const { privateKey } = await provider.uploadFile(fileBuffer, originalName, mimeType);

      // Set lastAccessed to a date in the past
      const metadataPath = path.join(TEST_ROOT_FOLDER, '.metadata', `${privateKey}.json`);
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      metadata.lastAccessed = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
      await fs.writeFile(metadataPath, JSON.stringify(metadata));

      const inactiveSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const inactiveFiles = await provider.getInactiveFiles(inactiveSince);

      expect(inactiveFiles).toHaveLength(1);
      expect(inactiveFiles[0].privateKey).toBe(privateKey);
    });

    it('should return empty array if no inactive files', async () => {
      const fileBuffer = Buffer.from('test file content');
      const originalName = 'test.txt';
      const mimeType = 'text/plain';

      await provider.uploadFile(fileBuffer, originalName, mimeType);

      const inactiveSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const inactiveFiles = await provider.getInactiveFiles(inactiveSince);

      expect(inactiveFiles).toHaveLength(0);
    });
  });
});
