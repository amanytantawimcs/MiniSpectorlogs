async function verifyAdminCredentials(pool, username, passwordHash) {
  if (!username || !passwordHash) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM admins WHERE username = $1 AND password_hash = $2',
    [username, passwordHash]
  );
  return rows.length > 0;
}

module.exports = { verifyAdminCredentials };
