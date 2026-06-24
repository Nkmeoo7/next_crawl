/**
 * Sitemap discovery library
 *
 * Strategy:
 *   1. Try fetching <rootUrl>/sitemap.xml (also tries /sitemap_index.xml).
 *   2. Parse all <loc> entries from the sitemap.
 *   3. If no sitemap found → BFS link crawl fallback.
 *
 * BFS guardrails:
 *   - Host-lock: only follow links that match the original hostname.
 *   - Sanitize: skip URLs with # anchors or binary extensions.
 *   - Depth limit: maxDepth = 3 (configurable).
 *   - Count limit: max 100 URLs returned.
 */

import { XMLParser } from "fast-xml-parser";
import { chromium, Browser } from "playwright";

const MAX_URLS = 100;
const MAX_DEPTH = 3;
const BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|webp|pdf|zip|tar|gz|mp4|mp3|woff|woff2|ttf|eot|ico|css|js|ts)(\?.*)?$/i;

export interface SitemapResult {
  urls: string[];
  source: "sitemap" | "sitemap_index" | "crawl_fallback";
  count: number;
}

// ─── Shared browser for sitemap crawls ───────────────────────────────────────

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

export async function closeSitemapBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// ─── URL Sanitization ─────────────────────────────────────────────────────────

function isSafeUrl(urlStr: string, allowedHost: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.hostname !== allowedHost) return false; // host-lock
    if (u.hash) return false; // skip anchors (#section)
    if (BINARY_EXTENSIONS.test(u.pathname)) return false; // skip binary files
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeUrlForDedup(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    u.hash = "";
    // Remove trailing slash for dedup (but keep root /)
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return urlStr;
  }
}

// ─── Sitemap XML Parsing ──────────────────────────────────────────────────────

function extractLocsFromXml(xml: string): string[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  try {
    const doc = parser.parse(xml);

    // sitemap_index: has <sitemapindex><sitemap><loc>
    const sitemapIndex = doc?.sitemapindex?.sitemap;
    if (sitemapIndex) {
      const items = Array.isArray(sitemapIndex) ? sitemapIndex : [sitemapIndex];
      return items.map((s: { loc?: string }) => s?.loc).filter(Boolean) as string[];
    }

    // urlset: has <urlset><url><loc>
    const urlset = doc?.urlset?.url;
    if (urlset) {
      const items = Array.isArray(urlset) ? urlset : [urlset];
      return items.map((u: { loc?: string }) => u?.loc).filter(Boolean) as string[];
    }
  } catch {
    /* malformed XML — fall through */
  }
  return [];
}

async function fetchSitemapXml(rootUrl: string): Promise<{ locs: string[]; source: "sitemap" | "sitemap_index" } | null> {
  const parsed = new URL(rootUrl);
  const base = `${parsed.protocol}//${parsed.host}`;

  for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap/sitemap.xml"]) {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "NextCrawlBot/1.0" },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const locs = extractLocsFromXml(xml);
      if (locs.length === 0) continue;
      // Detect if it's an index (contains more sitemap URLs)
      const isIndex = locs.some((l) => l.endsWith(".xml"));
      if (isIndex) {
        // Fetch the first child sitemap to expand
        const childLocs: string[] = [];
        for (const childUrl of locs.slice(0, 5)) {
          try {
            const childRes = await fetch(childUrl, {
              signal: AbortSignal.timeout(6000),
              headers: { "User-Agent": "NextCrawlBot/1.0" },
            });
            if (!childRes.ok) continue;
            const childXml = await childRes.text();
            childLocs.push(...extractLocsFromXml(childXml));
            if (childLocs.length >= MAX_URLS) break;
          } catch {
            /* skip failed child sitemap */
          }
        }
        if (childLocs.length > 0) {
          return { locs: childLocs.slice(0, MAX_URLS), source: "sitemap_index" };
        }
      }
      return { locs: locs.slice(0, MAX_URLS), source: "sitemap" };
    } catch {
      /* try next path */
    }
  }
  return null;
}

// ─── BFS Crawl Fallback ───────────────────────────────────────────────────────

async function bfsCrawl(rootUrl: string): Promise<string[]> {
  const allowedHost = new URL(rootUrl).hostname;
  const visited = new Set<string>();
  const found: string[] = [];
  // Queue entries: [url, depth]
  const queue: [string, number][] = [[normalizeUrlForDedup(rootUrl), 0]];
  visited.add(normalizeUrlForDedup(rootUrl));

  const b = await getBrowser();

  while (queue.length > 0 && found.length < MAX_URLS) {
    const [currentUrl, depth] = queue.shift()!;
    found.push(currentUrl);

    if (depth >= MAX_DEPTH) continue;

    let links: string[] = [];
    const context = await b.newContext({
      userAgent: "NextCrawlBot/1.0",
      viewport: { width: 1280, height: 800 },
    });
    try {
      // Block media to speed up
      await context.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "font", "media", "stylesheet"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });
      const page = await context.newPage();
      await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
      links = await page.$$eval("a[href]", (anchors) =>
        anchors.map((a) => (a as HTMLAnchorElement).href)
      );
    } catch {
      /* page failed — skip its links */
    } finally {
      await context.close();
    }

    for (const rawLink of links) {
      try {
        const normalized = normalizeUrlForDedup(rawLink);
        if (visited.has(normalized)) continue;
        if (!isSafeUrl(normalized, allowedHost)) continue;
        visited.add(normalized);
        queue.push([normalized, depth + 1]);
      } catch {
        /* skip malformed links */
      }
    }
  }

  return found;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function discoverUrls(rootUrl: string): Promise<SitemapResult> {
  // Validate URL first
  const parsed = new URL(rootUrl); // throws if invalid
  const allowedHost = parsed.hostname;

  // 1. Try sitemap.xml
  const sitemapResult = await fetchSitemapXml(rootUrl);
  if (sitemapResult) {
    // Filter to same-host URLs only
    const filtered = sitemapResult.locs
      .filter((url) => isSafeUrl(url, allowedHost))
      .slice(0, MAX_URLS);
    return {
      urls: filtered,
      source: sitemapResult.source,
      count: filtered.length,
    };
  }

  // 2. BFS fallback
  const crawledUrls = await bfsCrawl(rootUrl);
  return {
    urls: crawledUrls,
    source: "crawl_fallback",
    count: crawledUrls.length,
  };
}
