---
status: living
updated_at: "2026-07-08"
---

# Roadmap — url-shortener

> Outcome-altitude backlog. Each item becomes an SDD feature under `docs/features/<slug>/`.
> No dates. Pull the top **Now** item; then the top **Next** item whose deps are shipped.

## Now
| Feature | Slug | Outcome |
|---|---|---|
| Input validation | `input-validation` | garbage and unsafe URLs are rejected before a link is stored |

## Next
| Feature | Slug | Reach | Impact | Confidence | Effort | RICE |
|---|---|---|---|---|---|---|
| Link expiry | `link-expiry` | M | H | H | M | high |
| Custom alias | `custom-alias` | M | M | H | S | high |
| QR codes | `qr-codes` | M | M | H | S | high |
| Rate limiting | `rate-limiting` | L | H | M | M | med |
| Bulk shorten + delete | `bulk-and-delete` | L | M | M | M | med |

## Later
- Click analytics beyond a counter.
- Metrics endpoint hardening.

## Shipped
| Feature | Slug | Outcome |
|---|---|---|
| Base vertical (shorten + follow + list) | `base-vertical` | a visitor can shorten a URL, follow it, and see click counts |
