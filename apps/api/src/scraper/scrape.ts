import { chromium, Browser, BrowserContext } from "playwright";
import robotsParser from "robots-parser";
import { ErrorCode, ErrorSuggestions } from "@nextcrawl/shared";
import type { ScrapeResult } from "@nextcrawl/shared";
import { classifyError } from "../lib/errors";
import { normalizeUrl } from "../lib/url";

const TIMEOUT_MS = parseInt(process.env.SCRAPE_TIMEOUT_MS ?? "15000", 10);

// ─── Singleton browser ────────────────────────────────────────────────────────
// We reuse a single Playwright browser instance across requests instead of
// launching a new browser per request (launch is expensive ~1-2s).

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return browser;
}

// ─── robots.txt check ─────────────────────────────────────────────────────────

async function isAllowedByRobots(url: string, userAgent: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return true; // If we can't fetch robots.txt, allow by default
    const text = await res.text();
    const robots = robotsParser(robotsUrl, text);
    return robots.isAllowed(url, userAgent) ?? true;
  } catch {
    return true; // Network error fetching robots.txt → allow (fail open)
  }
}

// ─── Main scrape function ─────────────────────────────────────────────────────

export async function scrapeUrl(rawUrl: string): Promise<ScrapeResult> {
  const startTime = Date.now();
  let normalizedUrl: string;

  // Step 1: Normalize + validate URL
  try {
    normalizedUrl = normalizeUrl(rawUrl);
  } catch {
    return {
      status: "error",
      url: rawUrl,
      errorCode: ErrorCode.INVALID_URL,
      errorMessage: `"${rawUrl}" is not a valid HTTP or HTTPS URL.`,
      suggestion: ErrorSuggestions[ErrorCode.INVALID_URL],
    };
  }

  // Step 2: robots.txt compliance (Architecture v1 requirement)
  const userAgent = "NextCrawlBot/1.0";
  const allowed = await isAllowedByRobots(normalizedUrl, userAgent);
  if (!allowed) {
    return {
      status: "error",
      url: rawUrl,
      errorCode: ErrorCode.ROBOTS_BLOCKED,
      errorMessage: `robots.txt disallows scraping "${normalizedUrl}".`,
      suggestion: ErrorSuggestions[ErrorCode.ROBOTS_BLOCKED],
    };
  }

  // Step 3: Launch browser + scrape
  let context: BrowserContext | null = null;
  try {
    const b = await getBrowser();
    context = await b.newContext({
      userAgent,
      // Mimic a real browser viewport
      viewport: { width: 1280, height: 800 },
      // Disable images/fonts to speed up scraping
      // (content extraction only needs the DOM)
    });

    // Block image/font/media resources to speed things up
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "media", "stylesheet"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const page = await context.newPage();

    await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUT_MS,
    });

    // Wait a bit for any JS-driven content to render
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => {
      // networkidle can be flaky on heavy SPA pages — proceed anyway
    });

    const title = await page.title();
    const html = await page.content();

    if (!html || html.trim().length < 50) {
      return {
        status: "error",
        url: rawUrl,
        errorCode: ErrorCode.EMPTY_CONTENT,
        errorMessage: "Page loaded but returned no readable content.",
        suggestion: ErrorSuggestions[ErrorCode.EMPTY_CONTENT],
      };
    }

    const durationMs = Date.now() - startTime;

    return {
      status: "success",
      url: rawUrl,
      normalizedUrl,
      title: title || null,
      html,
      markdown: null, // Phase 2: Readability + Turndown
      fromCache: false,
      scrapedAt: new Date().toISOString(),
      durationMs,
    };
  } catch (err) {
    const errorCode = classifyError(err);
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    return {
      status: "error",
      url: rawUrl,
      errorCode,
      errorMessage,
      suggestion: ErrorSuggestions[errorCode],
    };
  } finally {
    await context?.close();
  }
}

/**
 * Gracefully close the shared browser instance.
 * Call this on process exit to avoid zombie Chromium processes.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
