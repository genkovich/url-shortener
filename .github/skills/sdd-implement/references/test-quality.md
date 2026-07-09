# Test quality — what the RED test should assert

A test is worth writing only if it pins down *behaviour* the feature promises. The RED step ([`tdd-loop.md`](./tdd-loop.md)) writes it **before** the code; the rules here decide whether it's any good. Stack: Node + Vitest + supertest, SQLite via `better-sqlite3`.

## What a good test is

- **Verifies behaviour through the public interface**, not the implementation. It asserts the observable outcome an AC names — a status code, a returned shape, a stored-then-retrievable value — never *how* the code got there.
- **Reads like a spec.** The `it(...)` name is the promise; the body is the smallest example that proves it. Someone who never saw the code should understand the requirement from the test alone.
- **Survives a refactor.** Rename a helper, swap a loop for `reduce`, extract a module — a good test stays green because none of that changed the behaviour. If an internal rename breaks it, the test was coupled to the wrong thing.

## Seams — where you test

A *seam* is the public boundary you exercise. This repo has exactly two:

- **The HTTP app** — `createApp(openDb(':memory:'))`, driven with `supertest` (`request(app).post('/api/shorten')...`), already used by `tests/integration/shorten.test.js`. The seam for anything with a route: shorten, redirect, stats, validation, aliases.
- **The domain functions** — `createLink`, `resolveLink`, `listLinks`, `getStats` in `src/shorten.js`, called with a real in-memory `db`, already used by `tests/unit/shorten.test.js`. The seam for pure logic with no HTTP surface (code generation, dedup, expiry checks).

Pick the seam matching the AC's altitude: a route-level promise (status/JSON) tests through the app; a pure-logic promise tests the function directly. Do **not** reach past the seam into internals.

## Anti-patterns (reject these in RED)

- **Implementation-coupled.** Mocking an internal collaborator, or querying the DB to *verify* the outcome instead of asking the interface. Bad: after `POST /api/shorten`, `db.prepare('SELECT ...')` and assert the row exists. Good: `GET /api/stats/:code` (or the redirect) returns what was stored — verified through the same public surface a real client uses.
- **Tautological.** The expected value is computed the way the code computes it, so the test can never catch a bug. Bad: `expect(getStats(db, code).clicks).toBe(row.clicks)`. Good: create a link, resolve it twice, assert `clicks === 2` — a concrete number derived from behaviour.
- **Horizontal slicing.** Writing every test first, then all the code. Work in **vertical slices / tracer bullets**: one test → make it green → next test. One RED at a time keeps each failure diagnostic and each GREEN minimal.

## Mocking

- **Only at system boundaries** — wall-clock time, randomness, outbound HTTP to a third party. Inject those (pass a clock, seed the RNG) rather than mock your own modules.
- **Never mock your own modules.** Don't stub `shorten.js` to test a route; run the real function against the real in-memory DB.
- **In this repo the in-memory DB *is* the seam.** `openDb(':memory:')` gives a real, disposable SQLite per test (`beforeEach`) — prefer it over any mock: it exercises the actual SQL and schema, and is already fast and isolated.

```js
// GOOD — behaviour through the public seam, concrete expectation
it('rejects a non-http url with 400', async () => {
  const app = createApp(openDb(':memory:'));
  const res = await request(app).post('/api/shorten').send({ url: 'ftp://nope' });
  expect(res.status).toBe(400);
});

// BAD — verifies via internals, and the expectation is tautological
it('stores a link', async () => {
  const db = openDb(':memory:');
  const { code } = createLink(db, 'https://x.io');
  const row = db.prepare('SELECT * FROM links WHERE code = ?').get(code);
  expect(row.code).toBe(code); // asserts nothing about behaviour
});
```
