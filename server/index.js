const path = require('path');
const express = require('express');
const pool = require('./db');
const { ensureLoginLogTable } = require('./lib/loginLog');
const { ensureUsersAdminColumn } = require('./lib/usersSchema');

// A rejected pool.query() in a route with no try/catch becomes an unhandled
// rejection, which crashes the whole process (and every other in-flight
// request) instead of just failing that one request. Log and keep serving.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

const app = express();

// Required for the rate limiter (server/lib/rateLimit.js) to see the real
// client IP instead of Railway's own proxy IP for every request — without
// this every request looks like it comes from the same address and the
// limiter effectively becomes global instead of per-client.
app.set('trust proxy', 1);

// Railway terminates TLS at its edge and forwards plain HTTP internally,
// setting x-forwarded-proto so the app can tell which the client actually
// used. Force HTTPS rather than just assuming the platform default holds —
// passcodes and session tokens go out on every request, and this is the one
// place that actually decides whether those go over the wire in the clear.
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'development' && req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '5mb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'db_unreachable', error: e.message });
  }
});

app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/export', require('./routes/export'));
app.use('/api', require('./routes/sync'));

// Frontend and API share one origin — no CORS needed.
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 8080;
Promise.all([
  ensureLoginLogTable(pool).catch((e) => console.error('[startup] could not ensure login_log table:', e.message)),
  ensureUsersAdminColumn(pool).catch((e) => console.error('[startup] could not ensure users.is_admin column:', e.message)),
]).finally(() => {
  app.listen(PORT, () => console.log(`MiniSpector Log Lite listening on :${PORT}`));
});
