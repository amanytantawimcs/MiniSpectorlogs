// A minimal stand-in for the `pg` Pool used across server/lib and
// server/routes — just enough surface (.query, .connect) for the routes
// under test, with a scriptable response queue so each test controls
// exactly what the "database" returns without a real Postgres connection.
class FakePool {
  constructor() {
    this.calls = [];
    this._responses = [];
  }

  // Queue up { rows } (or a rejecting error) to be returned by the next
  // .query() call, in order.
  respondWith(...responses) {
    this._responses.push(...responses);
  }

  async query(text, params) {
    this.calls.push({ text, params });
    const next = this._responses.shift();
    if (next === undefined) return { rows: [] };
    if (next instanceof Error) throw next;
    return next;
  }

  // Used by routes that open a transaction client (pool.connect() then
  // client.query('BEGIN'/'COMMIT'/'ROLLBACK')). The fake client just proxies
  // back to this same pool's query() so the same response queue drives both.
  async connect() {
    const self = this;
    return {
      query: (text, params) => self.query(text, params),
      release: () => {},
    };
  }
}

module.exports = { FakePool };
