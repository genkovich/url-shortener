---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-09"
feature_size: "S"
---

# Test plan — custom-alias

## Levels
| Level | Scope | Strategy |
|---|---|---|
| Unit | `validateAlias` (shape, length, reserved) and the `createLink` claim branch | pure function tests + in-memory store |
| Integration | `POST /api/shorten` returns 201 / 400 / 409 correctly; an aliased link follows and lists | drive the service through supertest |
| E2E-through-UI | the optional alias field creates a link under that alias | drive the frontend and read the rendered short URL |

## AC coverage
| AC | Test name | Level | Expected outcome |
|---|---|---|---|
| AC-01 | valid alias becomes the code | Unit + Integration | 201, `code === alias`, `short_url` ends with it |
| AC-02 | no alias keeps random code | Unit + Integration | 201, 7-char base62 code |
| AC-03 | malformed alias refused | Unit + Integration | 400 `invalid alias` |
| AC-04 | reserved alias refused, any case | Unit + Integration | 400 `reserved alias` for `api`, `healthz`, `metrics`, `HEALTHZ` |
| AC-05 | taken alias refused | Unit + Integration | 409 `alias taken`, existing row untouched |
| AC-06 | aliased link behaves normally | Integration | `GET /<alias>` → 302 + click counted; appears in `GET /api/links` |
| AC-07 | alias bypasses dedup | Unit + Integration | same URL + alias → second link; both codes resolve |

## Edge cases / error paths
- Length exactly 3 and exactly 32 — accepted; 2 and 33 — refused.
- `HEALTHZ`, `Healthz`, `healthz` — all refused as reserved. Express matches `/HEALTHZ` to the `/healthz` route, so any case would be unreachable.
- `Foo` and `foo` — two different links. Uniqueness is case-sensitive (SQLite binary collation).
- Aliases containing `/`, `.`, `?`, `%`, `#`, a space, or a non-ASCII letter — refused as malformed. Each would change what the path means.
- A taken alias must leave the existing row byte-identical: same `url`, same `clicks`, same `created_at`. Assert the row, not just the status.
- Alias supplied together with an invalid URL — the URL error wins (`input-validation` runs first), and nothing is stored.
- `alias: null` — treated as omitted, not as a malformed alias.

## Test data
- valid: `launch-2026`, `abc`, `a_b-C9`, `x`.repeat(32)
- malformed: `ab` (too short), `x`.repeat(33), `has space`, `dot.name`, `slash/name`, `pct%20`, `emoji-🙂`
- reserved: `api`, `healthz`, `metrics`, `HEALTHZ`, `Metrics`
- taken: create `launch-2026`, then claim it again
- case pair: `Foo` and `foo`

## NFR validation (load)
N/A — one regular expression, one `Set` lookup, one primary-key probe per create.

## CI placement
Unit in `tests/unit/alias.test.js` + integration in `tests/integration/alias.test.js`, both run by
`npm run test:fast` (per-task gate). E2E-through-UI in `tests/e2e/alias.spec.js`, run by
`npm run test:e2e` and included in `npm run gate`.
