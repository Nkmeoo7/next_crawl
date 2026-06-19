/**
 * Typed error codes for all scrape/crawl failures.
 * Every failure the API surfaces must use one of these — no raw exceptions.
 */
export enum ErrorCode {
  /** The supplied URL is malformed or not a valid HTTP/HTTPS URL. */
  INVALID_URL = "INVALID_URL",
  /** DNS resolution failed — the domain does not exist or is unreachable. */
  DNS_FAILURE = "DNS_FAILURE",
  /** Playwright timed out waiting for the page to load/render. */
  JS_TIMEOUT = "JS_TIMEOUT",
  /** The page responded with a bot-block / CAPTCHA / 403. */
  BOT_BLOCKED = "BOT_BLOCKED",
  /** Page loaded but contained no extractable content (empty body, login wall, etc.) */
  EMPTY_CONTENT = "EMPTY_CONTENT",
  /** robots.txt disallows scraping this URL (enforced in v1). */
  ROBOTS_BLOCKED = "ROBOTS_BLOCKED",
  /** A failure type that does not map to any of the above. Always log the raw error. */
  UNKNOWN = "UNKNOWN",
}

/**
 * Human-readable suggestions paired with each error code.
 * These are surfaced directly in API responses — should be useful to a developer, not just informational.
 */
export const ErrorSuggestions: Record<ErrorCode, string> = {
  [ErrorCode.INVALID_URL]: "Check that the URL starts with http:// or https:// and is correctly formatted.",
  [ErrorCode.DNS_FAILURE]: "The domain could not be resolved. Check the URL for typos or try again — the site may be temporarily unreachable.",
  [ErrorCode.JS_TIMEOUT]: "The page took too long to load. Try increasing the timeout param, or the site may have heavy JavaScript that blocks rendering.",
  [ErrorCode.BOT_BLOCKED]: "The target site detected automated access and blocked the request. Consider adding a delay or using a different user-agent.",
  [ErrorCode.EMPTY_CONTENT]: "The page loaded but contained no readable content. It may require authentication or render content via a login wall.",
  [ErrorCode.ROBOTS_BLOCKED]: "This URL is disallowed by the site's robots.txt. Respect this restriction unless you have explicit permission from the site owner.",
  [ErrorCode.UNKNOWN]: "An unexpected error occurred. Check the server logs for the raw error details.",
};
