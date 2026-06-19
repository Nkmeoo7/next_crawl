# NextCrawl

**A self-hosted web scraping API that turns any URL into clean, LLM-ready markdown.**

This is improved version of webcrawl, acting as a best crawl for the web to make ai context better.
---

## Quick Start

```bash
# 1. Clone & install
git clone <repo-url> && cd nextcrawl
npm install

# 2. Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env if needed (defaults work for local dev)

# 3. Set up database
npm run db:migrate --workspace=apps/api

# 4. Install Playwright browsers (one-time)
npm run install:browsers --workspace=apps/api

# 5. Start (API + dashboard)
npm run dev
```

**That's it.** No Docker. No Postgres. Just Node + optional Redis.

- API: `http://localhost:3001`
- Dashboard: `http://localhost:3000`

---

## API Reference

### `POST /scrape`

Turn a URL into clean HTML (Phase 1) / markdown (Phase 2+).

**Request:**
```json
{ "url": "https://example.com" }
```

**Success response:**
```json
{
  "status": "success",
  "url": "https://example.com",
  "normalizedUrl": "https://example.com",
  "title": "Example Domain",
  "html": "<!DOCTYPE html>...",
  "markdown": null,
  "fromCache": false,
  "scrapedAt": "2026-06-19T11:00:00.000Z",
  "durationMs": 1243,
  "jobId": "uuid"
}
```

**Error response (typed):**
```json
{
  "status": "error",
  "url": "https://bad-url.xyz",
  "errorCode": "DNS_FAILURE",
  "errorMessage": "...",
  "suggestion": "The domain could not be resolved..."
}
```

**Error codes:** `INVALID_URL`, `DNS_FAILURE`, `JS_TIMEOUT`, `BOT_BLOCKED`, `EMPTY_CONTENT`, `ROBOTS_BLOCKED`, `UNKNOWN`

---

## Architecture Decisions

| Decision | Reason |
|---|---|
| SQLite + Prisma (not Postgres) | Zero-config self-hosting — no Docker/Postgres required for local dev |
| Redis for both cache AND queue (BullMQ) | One infra dependency instead of two; both are ephemeral by nature |
| Typed error enum instead of raw exceptions | Directly addresses a known Firecrawl self-hosted UX gap |
| robots.txt compliance in v1 | Credibility signal; cheap to implement; matches what Firecrawl does |
| `/scrape` sync, `/crawl` async | Matches user expectation — single page feels instant, multi-page is background |

See [`context/preview-architecture-context.md`](context/preview-architecture-context.md) for full architecture documentation.

---

## Project Structure

```
nextcrawl/
├── apps/
│   ├── api/          ← Express API + BullMQ worker + Playwright scraper
│   └── web/          ← Next.js dashboard (live preview + job tracker)
├── packages/
│   └── shared/       ← Shared TypeScript types + error enum
└── context/          ← Architecture docs, progress tracker
```

---

## Roadmap

- **Phase 1** ✅ Repo scaffolding + bare `POST /scrape` (raw HTML)
- **Phase 2** — Readability + Turndown (clean markdown extraction)
- **Phase 3** — Redis cache layer + `POST /crawl` + BullMQ worker
- **Phase 4** — Dashboard UI (live preview + job tracker)
- **Phase 5** — Polish, README finalization, demo prep
