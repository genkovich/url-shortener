---
status: living
updated_at: "2026-07-10"
---

# Roadmap — url-shortener

> Outcome-altitude backlog. Each item becomes an SDD feature under `docs/features/<slug>/`.
> No dates. Pull the top **Now** item; then the top **Next** item whose deps are shipped.

## Now
| Feature | Slug | Outcome |
|---|---|---|
| Input validation | `input-validation` | garbage and unsafe URLs are rejected before a link is stored |

## Next
| Feature | Slug | Reach | Impact | Confidence | Effort | RICE | Depends on |
|---|---|---|---|---|---|---|---|
| Link expiry | `link-expiry` | M | H | H | M | high | — |
| Custom alias | `custom-alias` | M | M | H | S | high | — |
| QR codes | `qr-codes` | M | M | H | S | high | — |
| Rate limiting | `rate-limiting` | L | H | M | M | med | — |
| Bulk shorten + delete | `bulk-and-delete` | L | M | M | M | med | `input-validation` |

`Depends on` is a **hard** dependency: the named feature must appear under **Shipped** before this
one may start. Nothing enforces it. This queue is read by a human, and the ordering decision stays
with the human — `npm run ralph` takes the feature it is told to take (`--feature <slug>`) and does
not consult this file at all. A loop that picked its own next task would need a rule, and a rule is
one more thing that can be wrong while looking right.

Soft dependencies are deliberately absent from the column, because they do not block: `qr-codes`
answers `410` for an expired link **only if** `link-expiry` has shipped. Without it that branch
does not exist, and the feature is complete regardless.

## Later
- Click analytics beyond a counter.
- Metrics endpoint hardening.

## Shipped
| Feature | Slug | Outcome |
|---|---|---|
| Base vertical (shorten + follow + list) | `base-vertical` | a visitor can shorten a URL, follow it, and see click counts |
