/**
 * Inactive storage cleanup job
 * Periodically removes files that haven't been accessed for a configurable period
 */

// Default inactivity period: 30 days
const DEFAULT_INACTIVITY_PERIOD_DAYS = 30;
const INACTIVITY_PERIOD_MS = (parseInt(process.env.INACTIVITY_PERIOD_DAYS, 10) || DEFAULT_INACTIVITY_PERIOD_DAYS) * 24 * 60 * 60 * 1000;

// Default cleanup interval: 24 hours
const DEFAULT_CLEANUP_INTERVAL_HOURS = 24;
const CLEANUP_INTERVAL_MS = (parseInt(process.env.CLEANUP_INTERVAL_HOURS, 10) || DEFAULT_CLEANUP_INTERVAL_HOURS) * 60 * 60 * 1000;

let cleanupInterval = null;
let storageProvider = null;

/**
 * Initialize the cleanup job
 * @param {StorageProvider} provider - The storage provider instance
 */
function initialize(provider) {
  if (!provider) {
    throw new Error('Storage provider is required for cleanup job');
  }
  
  storageProvider = provider;
  
  // Run cleanup immediately on startup (optional)
  // Then schedule periodic cleanup
  runCleanup();
  
  // Schedule periodic cleanup
  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  
  console.log(`Cleanup job initialized. Will run every ${CLEANUP_INTERVAL_MS / (60 * 60 * 1000)} hours`);
  console.log(`Files inactive for more than ${INACTIVITY_PERIOD_MS / (24 * 60 * 60 * 1000)} days will be removed`);
}

/**
 * Run the cleanup process
 * @returns {Promise<number>} - Number of files deleted
 */
async function runCleanup() {
  if (!storageProvider) {
    console.error('Cleanup job: Storage provider not initialized');
    return 0;
  }
  
  try {
    const inactiveSince = new Date(Date.now() - INACTIVITY_PERIOD_MS);
    console.log(`Cleanup job: Starting cleanup for files inactive since ${inactiveSince.toISOString()}`);
    
    const inactiveFiles = await storageProvider.getInactiveFiles(inactiveSince);
    console.log(`Cleanup job: Found ${inactiveFiles.length} inactive files`);
    
    let deletedCount = 0;
    
    for (const file of inactiveFiles) {
      try {
        const deleted = await storageProvider.deleteFile(file.privateKey);
        if (deleted) {
          deletedCount++;
          console.log(`Cleanup job: Deleted file with privateKey ${file.privateKey.substring(0, 8)}...`);
        }
      } catch (error) {
        console.error(`Cleanup job: Error deleting file ${file.privateKey}:`, error.message);
      }
    }
    
    console.log(`Cleanup job: Completed. Deleted ${deletedCount} files`);
    return deletedCount;
  } catch (error) {
    console.error('Cleanup job: Error during cleanup:', error);
    return 0;
  }
}

/**
 * Stop the cleanup job
 */
function stop() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('Cleanup job stopped');
  }
}

module.exports = {
  initialize,
  runCleanup,
  stop
};
