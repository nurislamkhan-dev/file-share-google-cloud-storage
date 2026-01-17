/**
 * Daily usage limiter middleware
 * Tracks and limits upload/download traffic per IP address
 */

// In-memory store for tracking usage per IP
// In production, this should be replaced with Redis or another persistent store
const dailyUsageStore = new Map();

// Default limits (bytes per day)
const DEFAULT_UPLOAD_LIMIT = 100 * 1024 * 1024; // 100 MB
const DEFAULT_DOWNLOAD_LIMIT = 500 * 1024 * 1024; // 500 MB

// Configuration from environment variables
const UPLOAD_LIMIT = parseInt(process.env.UPLOAD_LIMIT, 10) || DEFAULT_UPLOAD_LIMIT;
const DOWNLOAD_LIMIT = parseInt(process.env.DOWNLOAD_LIMIT, 10) || DEFAULT_DOWNLOAD_LIMIT;

/**
 * Get today's date string as a key
 * @returns {string}
 */
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

/**
 * Get usage key for an IP address
 * @param {string} ip - IP address
 * @returns {string}
 */
function getUsageKey(ip) {
  return `${ip}:${getTodayKey()}`;
}

/**
 * Get or initialize usage record for an IP
 * @param {string} ip - IP address
 * @returns {{upload: number, download: number, lastReset: string}}
 */
function getUsageRecord(ip) {
  const key = getUsageKey(ip);
  
  if (!dailyUsageStore.has(key)) {
    dailyUsageStore.set(key, {
      upload: 0,
      download: 0,
      lastReset: getTodayKey()
    });
  }
  
  return dailyUsageStore.get(key);
}

/**
 * Cleanup old usage records (older than today)
 * This runs periodically to prevent memory leaks
 */
function cleanupOldRecords() {
  const today = getTodayKey();
  const keysToDelete = [];
  
  for (const [key, record] of dailyUsageStore.entries()) {
    if (record.lastReset !== today) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => dailyUsageStore.delete(key));
}

// Run cleanup every hour
setInterval(cleanupOldRecords, 60 * 60 * 1000);

/**
 * Middleware to limit upload traffic per IP
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function uploadLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const usage = getUsageRecord(ip);
  
  if (usage.upload >= UPLOAD_LIMIT) {
    return res.status(429).json({
      error: 'Upload limit exceeded',
      message: `Daily upload limit of ${UPLOAD_LIMIT / (1024 * 1024)} MB exceeded for this IP address`,
      limit: UPLOAD_LIMIT,
      used: usage.upload
    });
  }
  
  // Track upload size after upload completes
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    // Calculate size from file if available (set by upload route)
    const uploadSize = req.file ? req.file.size : 0;
    usage.upload += uploadSize;
    
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    const uploadSize = req.file ? req.file.size : 0;
    usage.upload += uploadSize;
    
    return originalJson.call(this, data);
  };
  
  next();
}

/**
 * Middleware to limit download traffic per IP
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function downloadLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const usage = getUsageRecord(ip);
  
  if (usage.download >= DOWNLOAD_LIMIT) {
    return res.status(429).json({
      error: 'Download limit exceeded',
      message: `Daily download limit of ${DOWNLOAD_LIMIT / (1024 * 1024)} MB exceeded for this IP address`,
      limit: DOWNLOAD_LIMIT,
      used: usage.download
    });
  }
  
  // Track download size after download completes
  // Note: File size will be tracked in the route handler after fetching file metadata
  
  next();
}

/**
 * Track download usage for an IP
 * @param {string} ip - IP address
 * @param {number} size - Size of downloaded file in bytes
 */
function trackDownload(ip, size) {
  const usage = getUsageRecord(ip);
  usage.download += size;
}

/**
 * Get current usage for an IP
 * @param {string} ip - IP address
 * @returns {{upload: number, download: number, uploadLimit: number, downloadLimit: number}}
 */
function getUsage(ip) {
  const usage = getUsageRecord(ip);
  return {
    upload: usage.upload,
    download: usage.download,
    uploadLimit: UPLOAD_LIMIT,
    downloadLimit: DOWNLOAD_LIMIT
  };
}

module.exports = {
  uploadLimiter,
  downloadLimiter,
  trackDownload,
  getUsage
};
