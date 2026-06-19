import { ErrorCode } from "@nextcrawl/shared";

/**
 * Maps raw Playwright / network exceptions to a typed ErrorCode.
 *
 * This is the single place where raw errors become typed errors.
 * No other part of the codebase should inspect raw error messages — it all
 * goes through here.
 */
export function classifyError(err: unknown): ErrorCode {
  if (!(err instanceof Error)) return ErrorCode.UNKNOWN;

  const msg = err.message.toLowerCase();

  // DNS / network failures
  if (
    msg.includes("net::err_name_not_resolved") ||
    msg.includes("getaddrinfo") ||
    msg.includes("enotfound") ||
    msg.includes("dns")
  ) {
    return ErrorCode.DNS_FAILURE;
  }

  // Timeout
  if (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("net::err_timed_out")
  ) {
    return ErrorCode.JS_TIMEOUT;
  }

  // Bot block / access denied
  if (
    msg.includes("403") ||
    msg.includes("forbidden") ||
    msg.includes("blocked") ||
    msg.includes("captcha") ||
    msg.includes("net::err_blocked_by_client")
  ) {
    return ErrorCode.BOT_BLOCKED;
  }

  // Connection refused / server unavailable
  if (
    msg.includes("econnrefused") ||
    msg.includes("net::err_connection_refused") ||
    msg.includes("net::err_connection_failed") ||
    msg.includes("net::err_address_unreachable")
  ) {
    return ErrorCode.DNS_FAILURE; // Surface as DNS failure — close enough for user guidance
  }

  return ErrorCode.UNKNOWN;
}
