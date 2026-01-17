const cleanupJob = require('../../../src/jobs/cleanupJob');

describe('cleanupJob', () => {
  let mockStorageProvider;

  beforeEach(() => {
    mockStorageProvider = {
      getInactiveFiles: jest.fn(),
      deleteFile: jest.fn()
    };

    // Stop any running intervals
    cleanupJob.stop();
  });

  afterEach(() => {
    cleanupJob.stop();
  });

  describe('initialize', () => {
    it('should initialize cleanup job with storage provider', () => {
      expect(() => cleanupJob.initialize(mockStorageProvider)).not.toThrow();
    });

    it('should throw error if storage provider is not provided', () => {
      expect(() => cleanupJob.initialize(null)).toThrow('Storage provider is required for cleanup job');
    });
  });

  describe('runCleanup', () => {
    it('should return number of deleted files', async () => {
      cleanupJob.initialize(mockStorageProvider);

      const inactiveSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      mockStorageProvider.getInactiveFiles.mockResolvedValue([
        { privateKey: 'key1' },
        { privateKey: 'key2' }
      ]);
      mockStorageProvider.deleteFile.mockResolvedValue(true);

      const deletedCount = await cleanupJob.runCleanup();

      expect(deletedCount).toBe(2);
      expect(mockStorageProvider.getInactiveFiles).toHaveBeenCalled();
      expect(mockStorageProvider.deleteFile).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully', async () => {
      cleanupJob.initialize(mockStorageProvider);

      mockStorageProvider.getInactiveFiles.mockRejectedValue(new Error('Storage error'));

      const deletedCount = await cleanupJob.runCleanup();

      expect(deletedCount).toBe(0);
    });

    it('should handle deletion errors gracefully', async () => {
      cleanupJob.initialize(mockStorageProvider);

      mockStorageProvider.getInactiveFiles.mockResolvedValue([
        { privateKey: 'key1' }
      ]);
      mockStorageProvider.deleteFile.mockRejectedValue(new Error('Delete error'));

      const deletedCount = await cleanupJob.runCleanup();

      expect(deletedCount).toBe(0);
    });
  });

  describe('stop', () => {
    it('should stop the cleanup job', () => {
      cleanupJob.initialize(mockStorageProvider);
      cleanupJob.stop();

      // Should not throw error
      expect(() => cleanupJob.stop()).not.toThrow();
    });
  });
});
