require('dotenv').config();

const express = require('express');
const path = require('path');
const StorageFactory = require('./storage/StorageFactory');
const initializeRoutes = require('./api/files');
const cleanupJob = require('./jobs/cleanupJob');

/**
 * Main application entry point
 * Sets up Express server, storage provider, API routes, and cleanup job
 */
async function startServer() {
  const app = express();

  // Get configuration from environment variables
  const port = process.env.PORT || 3000;
  const providerType = process.env.PROVIDER || 'local';
  const folder = process.env.FOLDER || './storage';
  const configPath = process.env.CONFIG;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Trust proxy for accurate IP addresses (useful when behind reverse proxy)
  app.set('trust proxy', true);

  // Initialize storage provider
  let storageProvider;
  try {
    console.log(`Initializing storage provider: ${providerType}`);
    storageProvider = await StorageFactory.createProvider(providerType, folder, configPath);
    console.log(`Storage provider initialized successfully`);
  } catch (error) {
    console.error('Failed to initialize storage provider:', error);
    process.exit(1);
  }

  // Initialize cleanup job
  try {
    cleanupJob.initialize(storageProvider);
  } catch (error) {
    console.error('Failed to initialize cleanup job:', error);
    // Don't exit - cleanup job failure shouldn't prevent server from starting
  }

  // Initialize API routes
  const filesRouter = initializeRoutes(storageProvider);
  app.use('/', filesRouter);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      provider: providerType
    });
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  // Start server
  app.listen(port, () => {
    console.log(`File Sharing API Server started on port ${port}`);
    console.log(`Storage provider: ${providerType}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    cleanupJob.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    cleanupJob.stop();
    process.exit(0);
  });
}

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
