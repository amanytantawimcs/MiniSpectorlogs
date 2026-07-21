const path = require('path');
const express = require('express');
const pool = require('./db');

const app = express();
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
app.use('/api', require('./routes/sync'));

// Frontend and API share one origin — no CORS needed.
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`MiniSpector Log Lite listening on :${PORT}`));
