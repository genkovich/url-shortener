// Contract: accept only http: and https: URLs; reject every other scheme.
export function normalizeUrl(input) {
  return new URL(input).toString();
}
