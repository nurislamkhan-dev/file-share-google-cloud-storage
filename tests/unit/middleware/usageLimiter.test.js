const { uploadLimiter, downloadLimiter, trackDownload, getUsage } = require('../../../src/middleware/usageLimiter');

describe('usageLimiter', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      ip: '192.168.1.1',
      file: null,
      connection: { remoteAddress: '192.168.1.1' }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  describe('uploadLimiter', () => {
    it('should call next if upload limit not exceeded', () => {
      uploadLimiter(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow file upload and track size', () => {
      req.file = { size: 1024 };
      uploadLimiter(req, res, next);

      expect(next).toHaveBeenCalled();

      // Simulate response
      res.json({ publicKey: 'test', privateKey: 'test' });

      const usage = getUsage('192.168.1.1');
      expect(usage.upload).toBe(1024);
    });

    it('should return 429 if upload limit exceeded', () => {
      // Set usage to limit
      req.file = { size: 100 * 1024 * 1024 }; // 100 MB
      uploadLimiter(req, res, next);
      res.json({ publicKey: 'test', privateKey: 'test' });

      // Try to upload again
      req.file = { size: 1 };
      uploadLimiter(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Upload limit exceeded'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('downloadLimiter', () => {
    it('should call next if download limit not exceeded', () => {
      downloadLimiter(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('trackDownload', () => {
    it('should track download size for IP', () => {
      trackDownload('192.168.1.1', 2048);

      const usage = getUsage('192.168.1.1');
      expect(usage.download).toBe(2048);
    });

    it('should accumulate download sizes', () => {
      trackDownload('192.168.1.1', 1024);
      trackDownload('192.168.1.1', 2048);

      const usage = getUsage('192.168.1.1');
      expect(usage.download).toBe(3072);
    });
  });

  describe('getUsage', () => {
    it('should return usage statistics for IP', () => {
      const usage = getUsage('192.168.1.2');

      expect(usage).toHaveProperty('upload');
      expect(usage).toHaveProperty('download');
      expect(usage).toHaveProperty('uploadLimit');
      expect(usage).toHaveProperty('downloadLimit');
      expect(usage.upload).toBe(0);
      expect(usage.download).toBe(0);
    });
  });
});
