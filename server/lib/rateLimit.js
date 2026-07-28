// Minimal in-memory rate limiter — no new dependency, same "in-memory is
// fine at this scale" trade-off as sessions.js. Without this, /api/admin/login
// and /api/users/:id/verify-passcode can be hit with unlimited attempts; a
// 4-digit passcode is only 10,000 combinations, trivial to brute-force with
// no throttling at all. Requires app.set('trust proxy', ...) in index.js so
// req.ip reflects the real client behind Railway's proxy, not the proxy's
// own IP for every request.

const buckets = new Map(); // key -> { count, resetAt }

function rateLimit({ windowMs = 60_000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = (req.ip || 'unknown') + ':' + req.baseUrl + req.path;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      return res.status(429).json({ success: false, error: 'Too many attempts. Try again in a minute.' });
    }
    next();
  };
}

module.exports = { rateLimit };
