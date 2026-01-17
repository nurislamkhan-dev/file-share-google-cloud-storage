const express = require('express');
const multer = require('multer');
const { uploadLimiter, downloadLimiter, trackDownload } = require('../middleware/usageLimiter');

const router = express.Router();

// Configure multer for handling multipart/form-data
// Store file in memory as buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB limit per file
  }
});

/**
 * Initialize routes with storage provider
 * @param {StorageProvider} storageProvider - The storage provider instance
 */
function initializeRoutes(storageProvider) {
  if (!storageProvider) {
    throw new Error('Storage provider is required for file routes');
  }

  /**
   * POST /files
   * Upload a new file
   * Accepts multipart/form-data with a 'file' field
   * Returns {publicKey, privateKey}
   */
  router.post('/files', uploadLimiter, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file provided',
          message: 'Please provide a file in the request body with the field name "file"'
        });
      }

      const { buffer, originalname, mimetype } = req.file;

      // Upload file to storage
      const { publicKey, privateKey } = await storageProvider.uploadFile(
        buffer,
        originalname,
        mimetype
      );

      res.status(201).json({
        publicKey,
        privateKey
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({
        error: 'Upload failed',
        message: error.message
      });
    }
  });

  /**
   * GET /files/:publicKey
   * Download an existing file
   * Accepts publicKey as URL parameter
   * Returns file stream with appropriate MIME type
   */
  router.get('/files/:publicKey', downloadLimiter, async (req, res) => {
    try {
      const { publicKey } = req.params;

      if (!publicKey || publicKey.trim() === '') {
        return res.status(400).json({
          error: 'Invalid public key',
          message: 'Public key is required'
        });
      }

      // Download file from storage
      const { buffer, mimeType, originalName } = await storageProvider.downloadFile(publicKey);

      // Track download usage
      trackDownload(req.ip || req.connection.remoteAddress || 'unknown', buffer.length);

      // Set appropriate headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
      res.setHeader('Content-Length', buffer.length);

      // Send file buffer
      res.send(buffer);
    } catch (error) {
      if (error.message === 'File not found') {
        return res.status(404).json({
          error: 'File not found',
          message: 'The requested file does not exist'
        });
      }

      console.error('Error downloading file:', error);
      res.status(500).json({
        error: 'Download failed',
        message: error.message
      });
    }
  });

  /**
   * DELETE /files/:privateKey
   * Delete an existing file
   * Accepts privateKey as URL parameter
   * Returns confirmation JSON
   */
  router.delete('/files/:privateKey', async (req, res) => {
    try {
      const { privateKey } = req.params;

      if (!privateKey || privateKey.trim() === '') {
        return res.status(400).json({
          error: 'Invalid private key',
          message: 'Private key is required'
        });
      }

      // Delete file from storage
      const deleted = await storageProvider.deleteFile(privateKey);

      if (!deleted) {
        return res.status(404).json({
          error: 'File not found',
          message: 'The requested file does not exist'
        });
      }

      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({
        error: 'Delete failed',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = initializeRoutes;
