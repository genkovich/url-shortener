---
status: living
updated_at: "2026-07-10"
---

# Good first tasks — url-shortener

> Notes to self, left at the scene. Each entry is a real defect somebody would eventually hit,
> written down at the moment I noticed it and decided not to fix it right then.

Nothing consumes this file. It is not a queue, and `npm run ralph` never reads it — the loop works
one SDD feature package at a time and knows nothing about these. They are here so that a defect I
saw once does not have to be found twice.

Every entry lives in two places at once:

- a **marker in the code**, at the exact line that is wrong:
  `// TODO(good-first-task): <what> — docs/good-first-tasks.md#<slug>`
- an **entry in this file**, with the reason, the acceptance criteria, and the command that
  proves the work.

The marker is the anchor. Delete it in the same commit that fixes the line, and the two can never
drift apart.

## How to take one

1. Pick an entry below and read it whole. There is nothing to ask: the AC list is the contract.
2. Write the failing test first. Conventions: [architecture-map.md](./architecture-map.md).
3. Make it green, run `npm run verify`, and delete the marker in the same commit.
4. **Update every document the entry's AC names.** Three of these tasks make sentences elsewhere
   in this repo untrue. A task that fixes the code and leaves the docs lying is not done — it
   has moved the defect somewhere harder to find.

| Task | File | Size |
|---|---|---|
| [escape-html](#escape-html) | `src/public/app.js` | S |
| [fetch-error](#fetch-error) | `src/public/app.js` | S |
| [copy-feedback](#copy-feedback) | `src/public/app.js` | XS |
| [stable-list-order](#stable-list-order) | `src/shorten.js` | XS |
| [api-json-404](#api-json-404) | `src/app.js` | S |
| [graceful-shutdown](#graceful-shutdown) | `src/server.js` | S |

---

### `escape-html`

**Where:** `src/public/app.js` → `loadLinks()`
**Size:** S

**Why.** The row template interpolates the stored `url` and `code` straight into `innerHTML`.
Nothing validates a URL on the way in (that is what `input-validation` is for), so a stored
`<img src=x onerror="…">` is markup by the time it reaches the table, and it runs in the
visitor's page. This is the only place in the repo that builds DOM out of stored data, which
makes it the whole read-side attack surface — and it is currently wide open. `input-validation`
closes the write side; **no scheduled feature closes this one.**

**AC**

- [ ] `loadLinks()` no longer interpolates stored values into `innerHTML`. Build the cells with
      `createElement` + `textContent`, or escape before interpolating.
- [ ] The `title` attribute on the truncated cell carries the raw URL without becoming an
      attribute-injection vector of its own.
- [ ] The code cell still links to `/<code>`, and the click counter and timestamp columns render
      exactly as before.
- [ ] A regression test stores `<img src=x onerror="document.title='pwned'">` as a URL through
      `POST /api/shorten`, loads the page, and asserts the payload did **not** execute.
- [ ] [architecture-map.md](./architecture-map.md#constraints--known-tech-debt) — the bullet that
      says the read side is unfixed now says what is true.
- [ ] [base-vertical T4](./features/base-vertical/tasks/T4-obmorda.md#edge-cases) — the
      `url` rendered into `innerHTML` row is rewritten.
- [ ] [base-vertical epic](./features/base-vertical/tasks/_epic.md) — the *Known hole,
      deliberately left open* bullet no longer describes an open hole on the read side.
- [ ] [link-expiry T4](./features/link-expiry/tasks/T4-expired-badge.md) — Step 3 hands the next
      implementer a `<td>` snippet built by string interpolation. Rewrite it against whatever row
      builder you leave behind. (`qr-codes` T3 and `bulk-and-delete` T4 already forbid growing the
      interpolated template and use `createElement`; they need nothing.)

**Verify:** `npm run test:e2e && npm run lint`

---

### `fetch-error`

**Where:** `src/public/app.js` → the two `fetch` calls
**Size:** S

**Why.** Neither `fetch` has a rejection path. Stop the server, or lose the network, and the
submit handler's promise rejects into nothing: the button does nothing, the page looks healthy,
and the only evidence is a line in a console the visitor will never open. `loadLinks()` fails the
same way on first paint. A frontend that cannot say *"I could not reach the server"* is
indistinguishable from a frontend that is broken.

**AC**

- [ ] Both `fetch` calls handle a rejected promise; neither leaves an unhandled rejection.
- [ ] When `POST /api/shorten` cannot be reached, the `#error` line shows a human message.
- [ ] When `GET /api/links` cannot be reached, the failure is reported rather than swallowed, and
      the table is not silently blanked.
- [ ] An HTTP error and a network failure are both handled; they are different code paths
      (`res.ok === false` versus a thrown `TypeError`) and only one of them exists today.
- [ ] A Playwright test aborts the request (`page.route('**/api/shorten', r => r.abort())`) and
      asserts the error line becomes visible.

**Verify:** `npm run test:e2e`

---

### `copy-feedback`

**Where:** `src/public/app.js` → the `#copy` click handler
**Size:** XS

**Why.** `navigator.clipboard.writeText()` returns a promise that nobody awaits, and the button
gives no signal at all. Two different failures look identical to the visitor — nothing happens:

- on an insecure origin (`http://192.168.x.x:3000`, which is any phone on the same Wi-Fi)
  `navigator.clipboard` is `undefined`, and the handler throws a `TypeError`;
- when permission is denied, the promise rejects.

On `localhost` — a secure context by browser rule — neither ever fires, which is exactly why this
survived. Success is also silent: nothing tells the visitor the link is on their clipboard.

**AC**

- [ ] On success the button reports it and returns to its resting state on its own.
- [ ] On failure — `navigator.clipboard` missing, or the promise rejecting — the visitor is told,
      and the short URL stays selectable so they can copy it by hand.
- [ ] No unhandled rejection and no `TypeError` in the console on either path.
- [ ] [base-vertical T4](./features/base-vertical/tasks/T4-obmorda.md#edge-cases) — the
      `Clipboard blocked` row no longer describes a silent no-op.

**Verify:** `npm run test:e2e && npm run lint`, plus open the app over the machine's LAN address
rather than `localhost` and click the button.

---

### `stable-list-order`

**Where:** `src/shorten.js` → `listLinks()`
**Size:** XS

**Why.** `ORDER BY created_at DESC` sorts on a millisecond timestamp. Two links created in the
same millisecond tie, and SQLite may return tied rows in any order it likes. Today the whole repo
pays for that: the unit test asserts membership instead of order, and **three** documents carry a
paragraph explaining why it cannot do better. One extra sort key removes all four.

`ORDER BY created_at DESC, rowid DESC` gives a total order — `links` is an ordinary rowid table,
so `rowid` is insertion order and newest still comes first. (`rowid` is not preserved across
`VACUUM`; this project never runs one, and if it ever does, the tiebreaker becomes arbitrary but
stays *deterministic*, which is the property the tests need.) Sorting by `code` instead would be
deterministic too — and would order links alphabetically, which nobody asked for.

**AC**

- [ ] `listLinks()` returns a total order: newest first, ties broken deterministically.
- [ ] A unit test pins three links to the same `created_at` (`vi.setSystemTime`) and asserts the
      exact order of the returned array — not its membership.
- [ ] `tests/unit/shorten.test.js` — the comment saying order is not asserted is gone, because it
      is now asserted.
- [ ] [base-vertical T2](./features/base-vertical/tasks/T2-domain-functions.md#edge-cases) — the
      `Two links created in the same millisecond` row, and the `Data delta` SQL above it.
- [ ] [base-vertical T4](./features/base-vertical/tasks/T4-obmorda.md#edge-cases) — the
      `Two links in the same millisecond` row.
- [ ] [base-vertical T5](./features/base-vertical/tasks/T5-seed-tests.md#edge-cases) — the
      `List order` row.

**Verify:** `npm run test:fast`

---

### `api-json-404`

**Where:** `src/app.js`
**Size:** S

**Why.** Measured, not assumed: `GET /api/nope` answers with Express's default HTML error page
(`Content-Type: text/html`), while every hand-written error in this service answers
`{ error: '<short>' }`. `architecture-map.md` states that error shape as a convention; the one
place nobody wrote by hand quietly breaks it. A client that calls `res.json()` on a mistyped
endpoint gets a JSON parse error rather than the `404` it could have handled.

**AC**

- [ ] Any unmatched request under `/api` answers `404 { error: 'not found' }` as
      `application/json`, whatever the method.
- [ ] The fallback is declared **below every `/api/*` route** and **above** the catch-all
      `GET /:code`. Declared too high it swallows the endpoints; declared too low it never runs.
      This is the route-order rule from [architecture-map.md](./architecture-map.md), applied to
      the one route that has no path of its own.
- [ ] Existing endpoints are untouched, and `GET /:code` on an unknown code still answers with its
      own `404`.
- [ ] The frontend still loads: `express.static` serves `/`, `/style.css`, `/app.js`.
- [ ] Integration tests cover `GET /api/nope` and `POST /api/links` (a real path, a method it does
      not implement), with `GET /api/links` as a control that must stay `200`.
- [ ] A control assertion pins that `DELETE /api/links` still returns `501` — it reaches the
      `DELETE /api/:code` stub with `code = "links"`, and untangling that belongs to
      `bulk-and-delete`, not here.

**Verify:** `npm run test:fast`

---

### `graceful-shutdown`

**Where:** `src/server.js`
**Size:** S

**Why.** There is no `SIGINT` or `SIGTERM` handler. Ctrl-C — and every container stop — kills the
process where it stands. `server.close()` never runs, so in-flight requests are cut mid-response.
`db.close()` never runs, and that one is visible on disk: with `journal_mode = WAL`, SQLite
removes `data/links.db-wal` and `data/links.db-shm` only when the last connection closes cleanly.
Measured — a clean `db.close()` leaves one file behind, a killed process leaves three.

**AC**

- [ ] `app.listen(...)` keeps the returned server, and both `SIGINT` and `SIGTERM` stop accepting
      connections (`server.close()`), then close the database, then exit `0`.
- [ ] A second signal during shutdown exits immediately. One hung request must never be able to
      make Ctrl-C useless.
- [ ] The process exits `0` on a signal, not `130`/`143`.
- [ ] Nothing else in `src/server.js` changes; `createApp` and `openDb` keep their signatures.

**Verify** (POSIX shell — the signal names do not exist on Windows):

```bash
node src/server.js & pid=$!
sleep 1 && kill -TERM $pid; wait $pid; echo "exit=$?"   # 143 before, 0 after
ls data/links.db-wal                                     # must be gone
```
