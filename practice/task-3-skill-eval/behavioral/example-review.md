# Review of `src/shorten.js`

**Blocking — `src/shorten.js:1-3`**

`normalizeUrl` calls `new URL(input)` but never enforces the contract's `http:` / `https:`
allowlist. Inputs such as `javascript:alert(1)` therefore pass through unchanged. Reject every
other scheme before returning the normalized URL.

VERDICT: REJECT
