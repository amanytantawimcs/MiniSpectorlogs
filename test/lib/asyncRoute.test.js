const { test } = require('node:test');
const assert = require('node:assert/strict');
const { asyncRoute } = require('../../server/lib/asyncRoute');

function fakeRes() {
  const res = { statusCode: null, body: null, headersSent: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.headersSent = true; return res; };
  return res;
}

// Regression test for the actual bug found this session: routes with no
// try/catch around a rejected pool.query() became unhandled rejections that
// never sent a response — the request just hung forever from the client's
// perspective, confirmed live against /api/admin/login and
// /api/projects/:code before this wrapper existed.
test('a rejecting handler still produces a response instead of hanging', async () => {
  const handler = asyncRoute(async () => {
    throw new Error('simulated DB failure');
  });
  const res = fakeRes();
  handler({ method: 'GET', originalUrl: '/test' }, res, () => {});

  // The rejection is caught asynchronously (via .catch on the returned
  // promise) — give the microtask queue a turn before asserting.
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
});

test('the error response never leaks the raw error message to the client', async () => {
  const handler = asyncRoute(async () => {
    throw new Error('duplicate key value violates unique constraint "admins_username_key"');
  });
  const res = fakeRes();
  handler({ method: 'POST', originalUrl: '/test' }, res, () => {});
  await new Promise((resolve) => setImmediate(resolve));

  assert.doesNotMatch(res.body.error, /admins_username_key/, 'internal DB detail must not reach the client');
});

test('a successful handler is unaffected — no error response is sent', async () => {
  const handler = asyncRoute(async (req, res) => {
    res.status(200).json({ success: true });
  });
  const res = fakeRes();
  handler({}, res, () => {});
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test('does not double-send if the handler already sent a response before rejecting', async () => {
  const handler = asyncRoute(async (req, res) => {
    res.status(200).json({ success: true });
    throw new Error('late failure after response already sent');
  });
  const res = fakeRes();
  handler({ method: 'GET', originalUrl: '/test' }, res, () => {});
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(res.statusCode, 200, 'should keep the original response, not overwrite it with a 500');
});
