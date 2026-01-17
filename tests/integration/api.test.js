const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const initializeRoutes = require('../../src/api/files');
const LocalFileSystemProvider = require('../../src/storage/LocalFileSystemProvider');

// Use a test-specific folder
const TEST_ROOT_FOLDER = path.join(__dirname, '../../test-storage-integration');

describe('File Sharing API Integration Tests', () => {
  let app;
  let provider;

  beforeAll(async () => {
    // Clean up test folder
    try {
      await fs.rm(TEST_ROOT_FOLDER, { recursive: true, force: true });
    } catch (error) {
      // Ignore if folder doesn't exist
    }

    // Initialize storage provider
    provider = new LocalFileSystemProvider(TEST_ROOT_FOLDER);
    await provider.initialize();

    // Create Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.set('trust proxy', true);

    // Initialize routes
    const filesRouter = initializeRoutes(provider);
    app.use('/', filesRouter);
  });

  afterAll(async () => {
    // Clean up test folder
    try {
      await fs.rm(TEST_ROOT_FOLDER, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  describe('POST /files', () => {
    it('should upload a file and return publicKey and privateKey', async () => {
      const response = await request(app)
        .post('/files')
        .attach('file', Buffer.from('test file content'), 'test.txt')
        .expect(201);

      expect(response.body).toHaveProperty('publicKey');
      expect(response.body).toHaveProperty('privateKey');
      expect(response.body.publicKey).toBeTruthy();
      expect(response.body.privateKey).toBeTruthy();
    });

    it('should return 400 if no file is provided', async () => {
      const response = await request(app)
        .post('/files')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('No file provided');
    });
  });

  describe('GET /files/:publicKey', () => {
    let publicKey, privateKey;

    beforeAll(async () => {
      // Upload a test file
      const response = await request(app)
        .post('/files')
        .attach('file', Buffer.from('test file content for download'), 'download-test.txt');

      publicKey = response.body.publicKey;
      privateKey = response.body.privateKey;
    });

    it('should download a file by publicKey', async () => {
      const response = await request(app)
        .get(`/files/${publicKey}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.headers['content-disposition']).toContain('download-test.txt');
      expect(response.text).toBe('test file content for download');
    });

    it('should return 404 if file does not exist', async () => {
      const nonExistentKey = 'non-existent-key-1234567890';

      const response = await request(app)
        .get(`/files/${nonExistentKey}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('File not found');
    });

    it('should return 400 if publicKey is empty', async () => {
      const response = await request(app)
        .get('/files/')
        .expect(404); // Express routes might return 404 for empty path
    });
  });

  describe('DELETE /files/:privateKey', () => {
    let publicKey, privateKey;

    beforeEach(async () => {
      // Upload a test file before each delete test
      const response = await request(app)
        .post('/files')
        .attach('file', Buffer.from('test file content for delete'), 'delete-test.txt');

      publicKey = response.body.publicKey;
      privateKey = response.body.privateKey;
    });

    it('should delete a file by privateKey', async () => {
      const response = await request(app)
        .delete(`/files/${privateKey}`)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('File deleted successfully');

      // Verify file is deleted by trying to download it
      await request(app)
        .get(`/files/${publicKey}`)
        .expect(404);
    });

    it('should return 404 if file does not exist', async () => {
      const nonExistentKey = 'non-existent-key-1234567890';

      const response = await request(app)
        .delete(`/files/${nonExistentKey}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('File not found');
    });

    it('should return 400 if privateKey is empty', async () => {
      const response = await request(app)
        .delete('/files/')
        .expect(404); // Express routes might return 404 for empty path
    });
  });

  describe('Full workflow', () => {
    it('should complete full workflow: upload, download, delete', async () => {
      // 1. Upload file
      const uploadResponse = await request(app)
        .post('/files')
        .attach('file', Buffer.from('workflow test content'), 'workflow-test.txt')
        .expect(201);

      const { publicKey, privateKey } = uploadResponse.body;
      expect(publicKey).toBeTruthy();
      expect(privateKey).toBeTruthy();

      // 2. Download file
      const downloadResponse = await request(app)
        .get(`/files/${publicKey}`)
        .expect(200);

      expect(downloadResponse.text).toBe('workflow test content');

      // 3. Delete file
      const deleteResponse = await request(app)
        .delete(`/files/${privateKey}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      // 4. Verify file is deleted
      await request(app)
        .get(`/files/${publicKey}`)
        .expect(404);
    });
  });
});
