---
id: T5
title: "Tests: unit + integration for AC-01..07"
feature: custom-alias
project: url-shortener
layer: tests
deps: ["T3"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07"]
files_hint: ["tests/unit/alias.test.js", "tests/integration/alias.test.js"]
wave: 3
priority: Must
estimate: S
blocks: []
owner: "TBD"
status: todo
context_budget: "~3000 tokens"
created: 2026-07-09
spec_refs: ["§5 AC-01", "§5 AC-07", "§6 Non-functional requirements"]
sad_refs: ["§10 Quality requirements"]
openapi_paths: []
adr_refs: ["ADR-0001"]
---

# T5 · Coverage sweep for AC-01 … AC-07

**Feature:** [custom-alias](./_epic.md)
**Priority:** Must
**Estimate:** S
**Wave:** 3 (ui + tests)

## Position in the sequence

- **Blocked by:** T3 — the integration cases need `400` and `409` from the route.
- **Blocks:** — nothing. It ships in parallel with T4.
- **Why this wave:** T1–T3 wrote most of these tests under TDD. This is the audit: every spec AC has a covering case, both length boundaries are asserted, and the three "quietly wrong" cases get their own tests.

## Why (user story)

As a **maintainer**, I want the reserved-name check, the length boundaries and the no-overwrite guarantee pinned by tests, so that the three ways this feature can silently break are the three ways it cannot.

Spec §5 (AC-01 … AC-07), [test-plan.md](../test-plan.md) → AC coverage.

## Linked artifacts (read-only references — DO NOT inline)

- 🌐 Sequence:     [sad.md](../sad.md#10-quality-requirements) — QG-1 reachability, QG-2 no overwrite, QG-3 backwards-compat
- 🗄  Data delta:   none — both suites open `:memory:`
- 🌐 API contract: [openapi.yaml](../contracts/openapi.yaml) — the integration cases assert `201` / `400` / `409` and the three `error` strings
- 📜 Relevant ADR: [ADR-0001](../adr/0001-alias-as-code.md) — the case asymmetry the tests must encode
- 📋 Spec ACs:     [spec §5](../spec.md#5-acceptance-criteria) — AC-01 … AC-07
- 🧬 Parity ref:   [test-plan.md](../test-plan.md) — the AC-coverage table and the test-data list are the source of every literal below

## Data delta

```
NO SCHEMA CHANGE. Both suites open their own database:
  createApp(openDb(':memory:'))   -- integration, per test
  openDb(':memory:')              -- unit, per test
```

## API contract

_API surface: none._ The integration suite drives `POST /api/shorten`, `GET /:code`,
`GET /api/links` and `GET /api/stats/:code` through supertest.

## Acceptance criteria (GWT)

- [ ] **AC-t5-1 (coverage — all):** Every one of AC-01 … AC-07 has at least one test whose name names it, matching the table in [test-plan.md](../test-plan.md).
- [ ] **AC-t5-2 (length boundaries — AC-03):** Four assertions, not two: 3 accepted, 2 refused, 32 accepted, 33 refused.
- [ ] **AC-t5-3 (reserved in upper case — AC-04):** `HEALTHZ` is refused. A test that only tries `healthz` passes against a case-sensitive check, and a case-sensitive check ships an unreachable link.
- [ ] **AC-t5-4 (anchored pattern — AC-03):** `slash/name` is refused. A test that only tries `has space` passes against an unanchored regex, which would accept `bad/launch-2026`.
- [ ] **AC-t5-5 (no overwrite — AC-05, QG-2):** After a `409`, the existing row's `url`, `clicks` and `created_at` are unchanged. Assert the row, not the status.
- [ ] **AC-t5-6 (alias bypasses dedup — AC-07):** Shortening a stored URL again with an alias yields a second link; both codes redirect to the same address. A dedup that ignores the alias would return the old code with `200` and pass a naive AC-01 test.
- [ ] **AC-t5-7 (case-sensitive uniqueness):** `Foo` and `foo` both succeed and produce two rows.
- [ ] **AC-t5-8 (aliased link is a link — AC-06):** `GET /<alias>` → `302`, the click is counted, the row appears in `GET /api/links`, and `GET /api/stats/<alias>` answers `200`.
- [ ] **AC-t5-9 (seed suites untouched):** `tests/unit/shorten.test.js` and `tests/integration/shorten.test.js` pass unmodified.

## Checklist (atomic steps for impl-agent)

- [ ] Step 1 — Read the test-data list in [test-plan.md](../test-plan.md). Every literal you need is there: `launch-2026`, `abc`, `a_b-C9`, the 32- and 33-character strings, `ab`, `has space`, `dot.name`, `slash/name`, `pct%20`, `emoji-🙂`, `api`, `healthz`, `metrics`, `HEALTHZ`, `Metrics`, and the `Foo`/`foo` pair.
- [ ] Step 2 — `tests/unit/alias.test.js`: `validateAlias` over the whole data list, then `createLink` with an alias (accept, taken, bypass-dedup, case pair).
- [ ] Step 3 — `tests/integration/alias.test.js`: `201` with `code === alias`; `400 invalid alias`; `400 reserved alias` for both `healthz` and `HEALTHZ`; `409 alias taken`; `201` with a generated code for `alias: null` and for an omitted field.
- [ ] Step 4 — Add AC-t5-5 explicitly: create, claim again, then read the row back through `GET /api/stats/<alias>` and `GET /api/links` and compare every field.
- [ ] Step 5 — Add AC-t5-8: follow the alias, check `302` and the incremented click count.
- [ ] Step 6 — Run `npm run test:fast`. Then unanchor `ALIAS_PATTERN` (drop `^` and `$`) and confirm AC-t5-4 goes red. Then make the reserved check case-sensitive and confirm AC-t5-3 goes red. Revert both. A suite that survives either mutation is not testing what it claims.

## Edge cases

| Case | Behaviour |
|---|---|
| `"emoji-🙂"` | Refused. Worth its own assertion: `.length` counts UTF-16 code units, so a surrogate pair makes a "10-character" alias look like 11. The pattern rejects it on the character class long before length matters, and the test documents that. |
| `"Foo"` and `"foo"` | Two rows, both `201`. If a future maintainer "fixes" this by folding case, this test goes red — which is the point. Folding case would also break every generated base62 code. |
| `alias: null` vs omitted | Both `201` with a generated code. Two tests, because they travel different paths through `req.body` and only one of them has ever been exercised by hand. |
| `alias: ''` | `400 invalid alias`. Distinct from omitted, and easy to break: any `alias &&` guard in the route or the domain turns it into "omitted" silently. |
| Testing the collision through the primary key | Do not. Assert that `AliasError.reason === 'alias taken'`, never that `better-sqlite3` threw `SQLITE_CONSTRAINT`. The driver's message is not part of any contract. |
| e2e for the form | Lives in T4 (`tests/e2e/alias.spec.js`), not here. `npm run test:fast` must not need a browser. |

## Definition of Done

- [ ] Every checklist step done; AC-t5-1 … AC-t5-9 green.
- [ ] `npm run test:fast` green; `npm run lint` clean.
- [ ] Every AC in [test-plan.md](../test-plan.md)'s coverage table maps to a named test.
- [ ] Step 6's two mutations were actually run, and each turned a specific test red.
- [ ] PR linked back to `tasks/T5-tests.md`.
- [ ] `tracker.md` updated: status `done`.
