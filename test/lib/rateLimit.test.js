const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rateLimit } = require('../../server/lib/rateLimit');

// Express req/res doubles — just enough surface for the middleware under
// test (req.ip/baseUrl/path, res.status().json()).
function fakeReq(ip, path = '/login') {
  return { ip, baseUrl: '', path };
}
function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('allows requests under the max, blocks once the max is exceeded', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 3 });
  const req = fakeReq('1.2.3.4');
  let nextCalls = 0;
  const next = () => { nextCalls++; };

  for (let i = 0; i < 3; i++) {
    const res = fakeRes();
    limiter(req, res, next);
    assert.equal(res.statusCode, null, `attempt ${i + 1} should pass through, not be blocked`);
  }
  assert.equal(nextCalls, 3);

  const blockedRes = fakeRes();
  limiter(req, blockedRes, next);
  assert.equal(blockedRes.statusCode, 429);
  assert.equal(nextCalls, 3, 'next() should not be called once blocked');
});

test('different IPs are tracked independently', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 1 });
  const next = () => {};

  const resA1 = fakeRes();
  limiter(fakeReq('1.1.1.1'), resA1, next);
  assert.equal(resA1.statusCode, null, 'first request from IP A should pass');

  const resB1 = fakeRes();
  limiter(fakeReq('2.2.2.2'), resB1, next);
  assert.equal(resB1.statusCode, null, "IP B's first request should not be blocked by IP A's usage");

  const resA2 = fakeRes();
  limiter(fakeReq('1.1.1.1'), resA2, next);
  assert.equal(resA2.statusCode, 429, "IP A's second request should now be blocked");
});

test('different routes for the same IP are tracked independently', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 1 });
  const next = () => {};
  // Unique IP for this test — the limiter's bucket map is module-level state
  // with no reset between tests, so reusing an IP another test already hit
  // would carry over leftover usage and fail for an unrelated reason.
  const ip = '3.3.3.3';

  const res1 = fakeRes();
  limiter(fakeReq(ip, '/login'), res1, next);
  assert.equal(res1.statusCode, null);

  const res2 = fakeRes();
  limiter(fakeReq(ip, '/reset-passcode'), res2, next);
  assert.equal(res2.statusCode, null, 'a different route path should have its own bucket');
});

test('the window resets after windowMs elapses', async () => {
  const limiter = rateLimit({ windowMs: 50, max: 1 });
  const req = fakeReq('9.9.9.9', '/window-reset-test');
  const next = () => {};

  const res1 = fakeRes();
  limiter(req, res1, next);
  assert.equal(res1.statusCode, null);

  const res2 = fakeRes();
  limiter(req, res2, next);
  assert.equal(res2.statusCode, 429, 'should be blocked while still inside the window');

  await new Promise((resolve) => setTimeout(resolve, 60));

  const res3 = fakeRes();
  limiter(req, res3, next);
  assert.equal(res3.statusCode, null, 'should be allowed again once the window has elapsed');
});
