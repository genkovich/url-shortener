---
status: Living
updated_at: "2026-07-08"
---

# Domain Context — url-shortener

## Glossary
- visitor — the single person using the service to shorten and follow links. NOT an authenticated account; there is no ownership or multi-user role.
- link — a stored mapping from a short code to an original address. NOT the code alone; a link owns its code, address, timestamps, and clicks.
- code — the short public handle in the path. NOT an internal surrogate key; it is the shareable identifier.
- alias — a code the visitor chose rather than one the service generated. NOT a second name for a link; it IS the code.
- short_url — the full user-facing address that redirects. NOT just the code; includes scheme and host.
- click — one resolved redirect through a code. NOT a view of the frontend.
- frontend — the web UI (form + links table). NOT the service itself; it only calls the service.
- expiry — the moment after which following a link stops working. NOT deletion; the link stays for history.
- TTL — the lifetime chosen for a link at creation, from which its expiry is derived. NOT a countdown shown to the visitor; an input.

## Invariants
- A code maps to exactly one address for its lifetime.
- clicks is monotonic non-decreasing.

## Out of scope
- Authentication / multi-user ownership (single-visitor service).
- Analytics beyond a click counter.
