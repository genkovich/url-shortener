---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-08"
feature_size: "M"
---

# Test plan — link-expiry

## Levels
| Level | Scope | Strategy |
|---|---|---|
| Unit | domain expiry logic (valid vs expired vs default, boundary) | pure function tests over in-memory store |
| Integration | follow path refuses expired, redirects valid | drive the running service and assert responses |
| E2E-through-UI | expired badge in the links list | drive the frontend and read the rendered state |

## AC coverage
| AC | Test name | Level | Expected outcome |
|---|---|---|---|
| AC-01 | create with ttl stores expiry | Unit | link carries an expiry moment |
| AC-02 | valid link follows | Integration | redirected to original |
| AC-03 | expired link refused | Integration | refused as gone, not redirected |
| AC-04 | default ttl applied when omitted | Unit | expiry never undefined after create |
| AC-05 | list marks expired vs active | E2E-through-UI | badge matches follow behaviour |

## Edge cases / error paths
- Link exactly at `expires_at` (boundary) — define as expired (`now >= expires_at`).
- Legacy row `expires_at = NULL` — treated as non-expiring until backfilled.
- Following an expired link must not count a click (refused before the counter).

## Test data
See data-model.md fixtures (valid / expired / legacy).

## NFR validation (load)
N/A — single column compare on read.

## CI placement
Unit in `tests/unit/expiry.test.js` + integration in `tests/integration/expiry.test.js`, both
run by `npm run test:fast` (per-task gate). E2E-through-UI (`tests/e2e/`) runs via
`npm run test:e2e`, exercised as part of `npm run gate` (full repo gate).
