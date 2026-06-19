<div align="center">

# NextCrawl

**A self-hosted web scraping API. URL in — clean, LLM-ready markdown out.**

Built from scratch as an architecturally-improved alternative to Firecrawl.  
Zero Docker. Zero Postgres. One command to run.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.44-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## What is this?

[Firecrawl](https://github.com/mendableai/firecrawl) (130K+ ⭐) is the dominant open-source tool for turning web pages into clean markdown for AI agents and RAG pipelines. It's AGPL-licensed and requires four separate Docker services to self-host.

NextCrawl is an **independent rebuild of the same concept** — not a fork — with three deliberate improvements:

| Problem with Firecrawl self-hosted | NextCrawl's approach |
|---|---|
| Requires Postgres + Redis + API + Worker Docker services | SQLite (zero-config) + optional Redis |
| Errors surface as raw exceptions or vague HTTP 500s | Every failure maps to a typed `ErrorCode` with a developer suggestion |
| No built-in TTL cache — re-scrapes the same URL every time | Redis TTL cache: repeat requests within the window return in ~5ms |

---

## Quick Start

> **Requirements:** Node.js 20+, npm 9+. Redis is optional for Phase 1.

```bash
# 1. Clone & install dependencies
git clone https://github.com/your-username/nextcrawl.git
cd nextcrawl
npm install

# 2. Configure the API environment
cp apps/api/.env.example apps/api/.env
# Defaults work out of the box for local dev — no changes needed

# 3. Create the SQLite database
npm run db:migrate --workspace=apps/api

# 4. Install Playwright's Chromium (one-time, ~115MB)
npm run install:browsers --workspace=apps/api

# 5. Start both API and dashboard
npm run dev
```

| Service | URL |
|---|---|
| REST API | `http://localhost:3001` |
| Live Preview Dashboard | `http://localhost:3000` |
| API Health Check | `http://localhost:3001/health` |

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client / Dashboard                        │
│                   (Next.js — localhost:3000)                     │
└─────────────────────────────┬────────────────────────────────────┘
                              │  HTTP REST
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Express API  :3001                         │
│                                                                  │
│   POST /scrape     POST /crawl     GET /crawl/:id   GET /health  │
│       │                │                                         │
│       │                │                                         │
│   [Zod validation + URL normalization + robots.txt check]        │
└───────┬────────────────┬─────────────────────────────────────────┘
        │                │
        │                │ async (returns job_id immediately)
        │                ▼
        │      ┌─────────────────┐
        │      │  BullMQ Queue   │  ← Redis-backed, per-domain rate limit
        │      └────────┬────────┘
        │               │
        │               ▼
        │      ┌─────────────────────────────────────┐
        │      │          Worker Process              │
        │      │                                     │
        │      │  1. Playwright (headless Chromium)  │
        │      │  2. @mozilla/readability            │
        │      │  3. turndown (HTML → Markdown)      │
        │      │  4. Write Page row → SQLite         │
        │      │  5. Update cache → Redis TTL        │
        │      └─────────────────────────────────────┘
        │
        │ sync (POST /scrape — single page, fast path)
        ▼
┌───────────────────┐        ┌───────────────────┐
│   Redis Cache     │        │   SQLite (Prisma) │
│                   │        │                   │
│ Key: SHA-256 hash │        │ Table: jobs       │
│ of normalized URL │        │ Table: pages      │
│ TTL: 3600s (1hr)  │        │ Table: error_logs │
│                   │        │                   │
│ HIT  → return     │        │ Source of truth   │
│ MISS → scrape     │        │ for all job state │
└───────────────────┘        └───────────────────┘
```

### Request Flow — `POST /scrape` (synchronous)

```
Client
  │
  ├─→ Validate URL (Zod schema)
  ├─→ Normalize URL (strip utm_*, fragments, sort params)
  ├─→ Check robots.txt (fail fast with ROBOTS_BLOCKED if disallowed)
  ├─→ Check Redis cache by SHA-256(normalized_url)
  │     ├─ HIT  → return {fromCache: true} immediately (~5ms)
  │     └─ MISS → launch Playwright scrape pipeline:
  │                 ├─ Playwright: goto(url, {waitUntil: "networkidle"})
  │                 ├─ Readability: extract main content from DOM
  │                 ├─ Turndown: convert HTML → clean Markdown
  │                 ├─ Write to Redis cache (TTL = CACHE_TTL_SECONDS)
  │                 └─ Persist Job + Page row to SQLite
  └─→ Return typed ScrapeResult (success | error — never a raw exception)
```

### Request Flow — `POST /crawl` (asynchronous)

```
Client
  │
  ├─→ Validate start URL + page limit
  ├─→ Create Job row (status: "queued") in SQLite
  ├─→ Return {job_id} immediately (non-blocking)
  └─→ Push seed URL onto BullMQ "crawl-jobs" queue
        │
        └─→ Worker picks up job:
              ├─ Scrape page (same pipeline as /scrape)
              ├─ Discover <a href> links on success
              ├─ Queue newly discovered URLs (bounded by page limit)
              ├─ Respect per-domain rate limit delay
              ├─ Update Job.pages_done in SQLite
              └─ When limit reached → Job.status = "completed"

# Poll progress:
GET /crawl/:job_id → reads from SQLite (never touches the queue)
```

---

## API Reference

### `POST /scrape`

Render a URL with a headless browser and return clean content.

**Request body:**
```json
{
  "url": "https://example.com",
  "timeout": 15000
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | ✅ | Full HTTP/HTTPS URL to scrape |
| `timeout` | number | ❌ | Max wait in ms (default: `SCRAPE_TIMEOUT_MS` env, 15000) |

**Success `200`:**
```jsonc
{
  "status": "success",
  "url": "https://example.com?utm_source=google",     // original
  "normalizedUrl": "https://example.com",              // cache key input
  "title": "Example Domain",
  "html": "<!DOCTYPE html>...",                        // Phase 1
  "markdown": "# Example Domain\n\nThis domain...",   // Phase 2+
  "fromCache": false,
  "scrapedAt": "2026-06-19T11:00:00.000Z",
  "durationMs": 1243,
  "jobId": "f8a8147d-db7f-4d9f-b1ec-b723d95869c6"
}
```

**Error `422`:**
```jsonc
{
  "status": "error",
  "url": "https://notasite.xyz",
  "errorCode": "DNS_FAILURE",
  "errorMessage": "net::ERR_NAME_NOT_RESOLVED at https://notasite.xyz",
  "suggestion": "The domain could not be resolved. Check the URL for typos or try again — the site may be temporarily unreachable."
}
```

**All error codes:**

| Code | Cause | Example |
|---|---|---|
| `INVALID_URL` | Malformed URL or non-HTTP scheme | `ftp://...`, `not a url` |
| `DNS_FAILURE` | Domain not found or unreachable | Typo in domain, server down |
| `JS_TIMEOUT` | Page took longer than `timeout` ms to render | Heavy SPA, slow server |
| `BOT_BLOCKED` | 403 / CAPTCHA / bot detection triggered | Anti-scraping middleware |
| `EMPTY_CONTENT` | Page loaded but has no readable content | Login walls, empty SPAs |
| `ROBOTS_BLOCKED` | `robots.txt` disallows this URL for our user-agent | Respected by default |
| `UNKNOWN` | Catch-all for unexpected errors (check server logs) | — |

---

### `POST /crawl`

Start a multi-page crawl from a seed URL. Returns immediately with a `job_id`.

**Request body:**
```json
{
  "url": "https://docs.example.com",
  "limit": 25
}
```

**Response `202`:**
```json
{
  "jobId": "a1b2c3d4-...",
  "status": "queued"
}
```

---

### `GET /crawl/:jobId`

Poll job status and results.

**Response:**
```jsonc
{
  "jobId": "a1b2c3d4-...",
  "status": "running",           // "queued" | "running" | "completed" | "failed"
  "startUrl": "https://docs.example.com",
  "totalPages": 25,
  "pagesDone": 12,
  "createdAt": "2026-06-19T11:00:00.000Z",
  "completedAt": null,
  "pages": [
    {
      "url": "https://docs.example.com/intro",
      "status": "success",
      "title": "Introduction",
      "fromCache": false,
      "scrapedAt": "2026-06-19T11:00:03.000Z"
    }
    // ...
  ]
}
```

---

### `GET /health`

```json
{ "status": "ok", "version": "0.1.0", "timestamp": "2026-06-19T11:00:00.000Z" }
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript 5 + Node.js 20 | Type safety across API, worker, and frontend in one ecosystem |
| API Framework | Express 4 | Lightweight; no overhead for a REST-only service at this scale |
| Browser Automation | Playwright (Chromium headless) | Industry standard for JS-rendered pages; handles SPAs, infinite scroll, dynamic content |
| Content Extraction | `@mozilla/readability` + `jsdom` | The same engine as Firefox Reader Mode — battle-tested for stripping nav/ads/footer |
| HTML → Markdown | `turndown` | MIT licensed, simple, and configurable |
| Job Queue | BullMQ + Redis | Async crawl jobs with retries, delays, and per-domain rate limiting |
| Database | SQLite + Prisma | Zero-config self-hosting; no Docker/Postgres needed for local dev |
| Cache | Redis (TTL-based) | Same Redis instance as the queue — one infra dependency, not two |
| Frontend | Next.js 16 + Tailwind v4 | Live preview UI and job tracker alongside the API in the same monorepo |
| Validation | Zod | Runtime schema validation at the API boundary |

---

## Project Structure

```
nextcrawl/
├── apps/
│   ├── api/                    ← Express REST API + scraper pipeline
│   │   ├── prisma/
│   │   │   └── schema.prisma   ← Job, Page, ErrorLog models (SQLite)
│   │   └── src/
│   │       ├── index.ts        ← App entry, graceful shutdown
│   │       ├── routes/
│   │       │   └── scrape.ts   ← POST /scrape handler
│   │       ├── scraper/
│   │       │   └── scrape.ts   ← Playwright → Readability → Turndown pipeline
│   │       └── lib/
│   │           ├── errors.ts   ← classifyError(): raw exception → ErrorCode
│   │           └── url.ts      ← URL normalization + SHA-256 cache key
│   │
│   └── web/                    ← Next.js dashboard
│       └── app/
│           ├── page.tsx        ← Live preview (URL input → markdown output)
│           ├── jobs/page.tsx   ← Crawl job tracker
│           └── globals.css     ← Tailwind v4 design system (Sleek Glow theme)
│
├── packages/
│   └── shared/                 ← Types shared between API and frontend
│       └── src/
│           ├── errors.ts       ← ErrorCode enum + ErrorSuggestions map
│           └── types.ts        ← ScrapeResult, CrawlJobSummary, etc.
│
├── context/                    ← Architecture docs + progress tracker
│   ├── project-overview.md
│   ├── preview-architecture-context.md
│   └── preview-progress-tracker.md
│
└── package.json                ← npm workspaces root
```

---

## Configuration

All configuration is via environment variables in `apps/api/.env`:

```bash
# Server
PORT=3001
CORS_ORIGIN="http://localhost:3000"

# Database — SQLite, no setup required
DATABASE_URL="file:./dev.db"

# Redis — required for crawl queue; optional for Phase 1
REDIS_URL="redis://localhost:6379"

# Scraper
SCRAPE_TIMEOUT_MS=15000      # Max time to wait for a page to render
CACHE_TTL_SECONDS=3600       # How long a cached scrape stays fresh (1 hour)
```

---

## Key Design Decisions

### Why SQLite instead of Postgres?

Firecrawl self-hosted requires a full Postgres instance — that's one more service to run, configure, and maintain. NextCrawl uses SQLite, which is a single file on disk. For a single-node tool processing thousands (not millions) of pages, SQLite handles the load without complaint. When this scales to need Postgres, changing `provider = "sqlite"` to `provider = "postgresql"` in `schema.prisma` and running `prisma migrate` is the entire migration.

### Why typed errors instead of raw exceptions?

When a Firecrawl self-hosted scrape fails, you often get a raw Playwright stack trace or a generic `{"error": "Failed to scrape"}`. That's useless to a developer at 2am. NextCrawl maps every failure to a typed `ErrorCode` from a documented enum, paired with a specific, actionable suggestion. This is implemented in a single `classifyError()` function — a clean seam that ensures no raw exception ever reaches an API consumer.

### Why Redis for both cache AND queue?

Rather than running Redis for BullMQ and something else (in-memory, Memcached) for cache, Redis handles both. Cache entries are just TTL'd keys. If Redis is flushed, the only loss is cache warmth and in-flight crawl jobs — all durable data (job history, results) lives in SQLite. This mirrors the hot/ephemeral vs. cold/durable pattern from production systems, with half the infra.

### Why Playwright over Puppeteer or Cheerio?

Cheerio is fast but doesn't execute JavaScript — useless for SPAs. Puppeteer works but Playwright is better maintained, has a better API, and has first-party TypeScript types. The singleton browser pattern (one Chromium instance per process, not one per request) keeps latency reasonable.

---

## Development Roadmap

| Phase | Status | Description |
|---|---|---|
| **0** — Planning | ✅ Done | Architecture docs, storage model, invariants |
| **1** — Scrape Pipeline | ✅ Done | `POST /scrape` → raw HTML, Playwright, SQLite, typed errors |
| **2** — Markdown Extraction | 🔄 Next | Add Readability + Turndown — `markdown` field populated |
| **3** — Cache + Crawl | ⏳ Pending | Redis TTL cache, `POST /crawl`, BullMQ worker, `GET /crawl/:id` |
| **4** — Dashboard UI | ⏳ Pending | Live preview renders markdown, job tracker with live progress |
| **5** — Polish | ⏳ Pending | Demo prep, README finalization, error handling hardening |

---

## System Invariants

These rules are enforced throughout the codebase and must never be violated:

1. **Every scrape produces exactly one outcome** — `success` with content, or `error` with a typed code. Silent nulls and unhandled exceptions never reach the API response.
2. **Cache keys are derived from normalized URLs only** — two requests for the same logical page (different tracking params, trailing slash, or fragment) always hit the same cache entry.
3. **`pages_done` never exceeds `total_pages`** in a crawl job.
4. **The worker never blocks the API** — `/crawl` is always async via the queue.
5. **Per-domain rate limiting is the worker's responsibility**, not the API's.
6. **SQLite is the single source of truth** — Redis can be wiped without data loss.
7. **No content is retained indefinitely** — cache entries expire via TTL.

---

## Contributing

This is a portfolio project under active development. Issues and PRs are welcome once Phase 3 is complete.

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
<sub>Built from scratch · Not a Firecrawl fork · Independent architecture</sub>
</div>
