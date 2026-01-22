const path = require('path');
const LocalFileSystemProvider = require('./LocalFileSystemProvider');
const GoogleCloudStorageProvider = require('./GoogleCloudStorageProvider');

/**
 * Factory class for creating storage providers based on configuration
 */
class StorageFactory {
  /**
   * Create a storage provider instance based on configuration
   * @param {string} providerType - Type of provider ('local' or 'google')
   * @param {string} folder - Root folder path (for local provider)
   * @param {string} configPath - Path to configuration file (for google provider)
   * @returns {Promise<StorageProvider>}
   */
  static async createProvider(providerType = 'local', folder, configPath) {
    if (providerType === 'local') {
      if (!folder) {
        throw new Error('FOLDER environment variable is required for local provider');
      }
      
      const absoluteFolder = path.isAbsolute(folder) ? folder : path.resolve(process.cwd(), folder);
      const provider = new LocalFileSystemProvider(absoluteFolder);
      await provider.initialize();
      return provider;
    } else if (providerType === 'google') {
      if (!configPath) {
        throw new Error('CONFIG environment variable is required for google provider');
      }
      
      const absoluteConfigPath = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
      const provider = new GoogleCloudStorageProvider(absoluteConfigPath);
      await provider.initialize();
      return provider;
    } else {
      throw new Error(`Unknown provider type: ${providerType}. Supported types: 'local', 'google'`);
    }
  }
}

module.exports = StorageFactory;
