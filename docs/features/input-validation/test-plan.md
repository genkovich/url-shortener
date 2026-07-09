---
status: Accepted
owner: "genkovich"
reviewers: ["Tech Lead"]
updated_at: "2026-07-08"
feature_size: "S"
---

# Test plan — input-validation

## Levels
| Level | Scope | Strategy |
|---|---|---|
| Unit | `validateUrl` guard (accept/reject/normalize) + dedup logic | pure function tests over in-memory store |
| Integration | create path returns 400 / 200 / 201 correctly | drive the running service and assert responses |
| E2E-through-UI | inline error shown for bad input | drive the frontend and read the rendered message |

## AC coverage
| AC | Test name | Level | Expected outcome |
|---|---|---|---|
| AC-01 | valid https url shortens | Integration | 201, 7-char code (base-vertical unchanged) |
| AC-02 | empty / whitespace-only refused | Unit + Integration | 400, nothing stored |
| AC-03 | unsafe scheme refused | Unit + Integration | 400 for javascript:/data:/file:/ftp: |
| AC-04 | malformed url refused | Unit + Integration | 400 for `not a url`, `http://` |
| AC-05 | too-long url refused | Unit | 400 above max length |
| AC-06 | surrounding whitespace trimmed | Unit | stored url has no leading/trailing spaces |
| AC-07 | same url reuses code | Unit + Integration | one row, 200 with existing code |

## Edge cases / error paths
- URL exactly at the max length (2048) — accepted; one char over — refused.
- Whitespace-only string (`"   "`) — treated as empty (AC-02), not a valid URL.
- Scheme-only / host-less (`http://`) — malformed (AC-04).
- Uppercase scheme (`HTTP://…`) — accepted (scheme compared case-insensitively).
- Dedup keys on the **normalized** (trimmed) URL, so `" https://x "` and `"https://x"` collapse to one code.

## Test data
- valid: `https://example.com/a`
- unsafe: `javascript:alert(1)`, `data:text/html,x`, `file:///etc/passwd`, `ftp://host/f`
- malformed: `not a url`, `http://`
- long: `https://example.com/` + `a`.repeat(2048)
- padded: `"  https://example.com/a  "`

## NFR validation (load)
N/A — pure string checks on the create path.

## CI placement
Unit in `tests/unit/validation.test.js` + integration in `tests/integration/validation.test.js`,
both run by `npm run test:fast` (per-task gate). E2E-through-UI (`tests/e2e/`) runs via
`npm run test:e2e`, exercised as part of `npm run gate` (full repo gate).
