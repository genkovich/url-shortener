-- link-expiry: add nullable expiry moment (unix ms). Idempotent-ish: guarded by implement.
ALTER TABLE links ADD COLUMN expires_at INTEGER;
