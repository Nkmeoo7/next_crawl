# Architecture Context

## Overview (Stack)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node.js) | Same ecosystem as Firecrawl; Playwright's best-supported language; one language across API + worker + frontend |
| Web framework | Express or Fastify | Lightweight REST API, no need for anything heavier |
| Browser automation | Playwright | Industry standard for JS-rendered pages; handles SPAs, infinite scroll waits, etc. |
| Content extraction | `@mozilla/readability` + `jsdom` | Same library Firefox Reader Mode uses — battle-tested for stripping nav/ads/footer |
| HTML → Markdown | `turndown` | MIT licensed, simple, configurable |
| Job queue | BullMQ + Redis | Needed for crawl jobs (multi-page, async, retryable). Redis also doubles as the cache layer |
| Database | SQLite + Prisma | Stores job metadata, crawl history, cached results' metadata. SQLite = zero-config self-host (no Docker/Postgres needed) |
| Cache | Redis (TTL-based) | Repeat-URL scrapes within a configurable window return instantly from cache |
| Frontend (dashboard) | Next.js | Live preview UI + job tracker, in the same repo as the API (API routes can live here too, or call out to the Express API) |
| Dev environment | Local Node + optional Redis (via `redis-server` or a single lightweight container) | No multi-service Docker Compose requirement for v1 |

**Why not Firecrawl's exact stack?**
Firecrawl self-hosted requires Postgres + Redis + API + Playwright as four separate Docker services. For a portfolio project meant to be cloned and run quickly by a founder evaluating you, that's friction. SQLite removes one entire service dependency without sacrificing anything v1 needs (job history, cache metadata — none of this needs Postgres-level concurrency at this scale).

---

## System Boundaries

**What this system owns:**
- Accepting scrape/crawl requests via REST API
- Rendering pages (via Playwright) and extracting clean content
- Converting content to markdown
- Queuing and tracking multi-page crawl jobs
- Caching scrape results for a TTL window
- Serving a dashboard UI for live preview + job status

**What this system explicitly does NOT own (v1):**
- Authentication / user accounts (single-user local tool for now)
- Proxy rotation / anti-bot evasion infrastructure (relies on Playwright defaults only)
- LLM-based structured extraction (stretch goal, not core path)
- Persistent long-term storage of scraped content at scale (cache is TTL-bound, not an archive)
- Horizontal scaling / multi-node worker distribution (single worker process is fine for v1)

**External boundaries (what it talks to):**
- The live internet (via Playwright → real browser requests)
- Redis (cache + job queue)
- SQLite file on disk (job/crawl metadata)
- No third-party APIs required for core flow (LLM extraction stretch goal would call OpenAI/Claude API)

---

## Storage Model

### SQLite (via Prisma) — persistent metadata

```
Job
- id (uuid, pk)
- type ("scrape" | "crawl")
- status ("queued" | "running" | "completed" | "failed")
- start_url
- created_at
- completed_at
- total_pages (nullable, crawl only)
- pages_done (nullable, crawl only)

Page
- id (uuid, pk)
- job_id (fk -> Job)
- url
- status ("success" | "failed")
- markdown (nullable)
- title (nullable)
- error_code (nullable)
- error_message (nullable)
- scraped_at
- from_cache (boolean)

ErrorLog (optional, for debugging/demo purposes)
- id
- page_id (fk -> Page)
- error_code
- raw_message
- timestamp
```

### Redis — ephemeral cache + queue

```
Cache:
  key:   scrape:cache:{normalized_url_hash}
  value: { markdown, title, metadata, scraped_at }
  ttl:   configurable, default 3600s (1 hour)

Queue (BullMQ):
  queue: "crawl-jobs"
  job payload: { job_id, url, depth, parent_job_id }
  per-domain rate limit: configurable delay between requests to same domain
```

**Why split this way?**
- Redis is disposable — if it's flushed, nothing important is lost, only cache warmth and in-flight jobs (which can be re-queued)
- SQLite is the source of truth — job history, results, and errors survive restarts
- This separation mirrors a real production pattern (hot/ephemeral vs. durable storage) without needing a second heavyweight DB

---

## Starter System Design

```
                          ┌─────────────────────┐
                          │   Next.js Dashboard  │
                          │  (live preview + job  │
                          │   tracker UI)         │
                          └──────────┬───────────┘
                                     │ REST calls
                                     ▼
                          ┌─────────────────────┐
                          │   Express/Fastify API │
                          │  POST /scrape         │
                          │  POST /crawl          │
                          │  GET  /crawl/:id      │
                          └──────────┬───────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       ┌─────────────┐      ┌──────────────┐     ┌──────────────┐
       │ Redis Cache  │      │  SQLite (via  │     │  BullMQ Queue │
       │ (TTL lookup) │      │   Prisma)     │     │  (crawl jobs) │
       └─────────────┘      └──────────────┘     └──────┬───────┘
                                                          │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │   Worker Process  │
                                                 │  - Playwright      │
                                                 │  - Readability      │
                                                 │  - Turndown          │
                                                 │  - writes results     │
                                                 │    back to SQLite      │
                                                 │  - updates cache         │
                                                 └──────────────────────┘
```

### Request flow — `POST /scrape`
1. API receives URL → normalizes it (strip tracking params, trailing slash, etc.)
2. Checks Redis cache by normalized URL hash
3. **Cache hit:** return immediately with `from_cache: true`
4. **Cache miss:** run scrape pipeline synchronously (Playwright → Readability → Turndown) → write to cache → write to SQLite → return result
5. Any failure at any pipeline stage returns a typed error, not a raw exception

### Request flow — `POST /crawl`
1. API receives start URL + limit → creates a `Job` row (status: queued) → returns `job_id` immediately
2. Pushes initial URL onto BullMQ queue
3. Worker process pulls jobs, scrapes each page (same pipeline as single scrape), discovers links on success, queues newly discovered links (bounded by limit/depth)
4. Worker respects per-domain delay (simple in-memory or Redis-backed rate limiter)
5. Each completed page updates `Page` row and increments `Job.pages_done`
6. `GET /crawl/:id` reads current state from SQLite — no need to touch the queue directly

---

## Invariants

These are rules the system must never violate, regardless of which feature is being built:

1. **Every scrape attempt produces exactly one outcome**: success with markdown, or failure with a typed error code. Never silent nulls, never unhandled exceptions reaching the API response.

2. **Cache keys are derived from normalized URLs only.** Two requests for the same logical page (differing only in tracking params, trailing slash, or fragment) must hit the same cache entry.

3. **A crawl job's `pages_done` must never exceed `total_pages`,** and `total_pages` is only finalized once link discovery for that crawl is complete (or the limit is hit).

4. **The worker never blocks the API.** `/scrape` may run synchronously (it's meant to be fast/single-page), but anything crawl-related is always async via the queue — the API must never wait on a multi-page job.

5. **Every error surfaced to the user has a code from a fixed, documented enum** (`INVALID_URL`, `DNS_FAILURE`, `JS_TIMEOUT`, `BOT_BLOCKED`, `EMPTY_CONTENT`, `UNKNOWN`). No raw stack traces or driver-level errors ever reach the API response.

6. **Per-domain rate limiting is enforced at the worker level, not the API level** — the API can accept a crawl instantly; politeness toward target sites is the worker's job.

7. **SQLite is the only source of truth for "what happened."** Redis can be wiped at any time without corrupting job history — at worst, in-flight jobs need to be manually re-queued.

8. **No scraped content is retained indefinitely by default.** Cache entries expire via TTL; SQLite-stored page content is for demo/debugging purposes in v1, not meant to be a permanent archive (document this clearly if it ever becomes a real product, for ToS/legal reasons).

---

## Open Architecture Questions (to resolve before/during build)

- Should `/scrape` have a max timeout before giving up (e.g. 15s)? → Yes, needs a default + override param.
- Single worker process for v1, or worker pool from day one? → Start single-process; BullMQ concurrency setting can scale this later without an architecture change.
- Should cache TTL be configurable per-request or only globally via env var? → Global default for v1, per-request override as a stretch goal.
- robots.txt compliance — enforced at v1 or stretch? → **Should be v1.** This is a credibility signal for founders (Firecrawl respects robots.txt by default) and it's cheap to implement early.
