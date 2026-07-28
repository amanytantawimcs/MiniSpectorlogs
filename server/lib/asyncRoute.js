// Guarantees every wrapped route sends a response even if the handler
// rejects (e.g. a DB error). Without this, a rejected pool.query() inside a
// route becomes an unhandled rejection — process.on('unhandledRejection') in
// index.js logs it and keeps the server alive, but never sends a response
// for that specific request, so it just hangs forever from the client's
// perspective.
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((e) => {
      console.error('[route error]', req.method, req.originalUrl, e);
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    });
  };
}

module.exports = { asyncRoute };
