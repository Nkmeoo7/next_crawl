import type { ErrorCode } from "./errors";

// ─── Scrape ─────────────────────────────────────────────────────────────────

export interface ScrapeSuccess {
  status: "success";
  url: string;
  /** Normalized URL used for cache key derivation. */
  normalizedUrl: string;
  title: string | null;
  /** Raw HTML (Phase 1). Will be markdown in Phase 2+. */
  html: string;
  /** Clean markdown (null in Phase 1, populated after Readability/Turndown). */
  markdown: string | null;
  fromCache: boolean;
  scrapedAt: string; // ISO 8601
  /** How long the scrape took in milliseconds. */
  durationMs: number;
}

export interface ScrapeError {
  status: "error";
  url: string;
  errorCode: ErrorCode;
  errorMessage: string;
  /** Developer-friendly next step. */
  suggestion: string;
}

export type ScrapeResult = ScrapeSuccess | ScrapeError;

// ─── Crawl ───────────────────────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface CrawlJobSummary {
  jobId: string;
  status: JobStatus;
  startUrl: string;
  totalPages: number | null;
  pagesDone: number;
  createdAt: string;
  completedAt: string | null;
}

export interface CrawlJobDetail extends CrawlJobSummary {
  pages: Array<{
    url: string;
    status: "success" | "failed";
    title: string | null;
    errorCode: ErrorCode | null;
    fromCache: boolean;
    scrapedAt: string;
  }>;
}
