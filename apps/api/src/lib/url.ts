/**
 * URL normalization — ensures two logically equivalent URLs produce the same
 * cache key. This implements Architecture Invariant #2.
 *
 * Rules applied:
 * 1. Lowercase the scheme and host
 * 2. Remove trailing slash (unless root path)
 * 3. Remove common tracking params (utm_*, fbclid, gclid, ref, etc.)
 * 4. Remove URL fragment (#...)
 * 5. Sort remaining query params for deterministic ordering
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "ref",
  "referrer",
  "_ga",
  "mc_cid",
  "mc_eid",
]);

export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`INVALID_URL: Could not parse "${raw}"`);
  }

  // Only allow http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`INVALID_URL: Unsupported protocol "${url.protocol}"`);
  }

  // Remove fragment
  url.hash = "";

  // Remove tracking params
  for (const key of TRACKING_PARAMS) {
    url.searchParams.delete(key);
  }

  // Sort remaining params (deterministic cache key)
  url.searchParams.sort();

  // Remove trailing slash from path (unless it's just "/")
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  // Lowercase scheme + host (already done by URL constructor)
  return url.toString();
}

/**
 * Returns a short SHA-256 hex string for use as a Redis cache key suffix.
 * We use a hash because URLs can be arbitrarily long.
 */
import { createHash } from "crypto";

export function urlCacheKey(normalizedUrl: string): string {
  return `scrape:cache:${createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 32)}`;
}
