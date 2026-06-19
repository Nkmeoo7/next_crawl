# Project Overview

## Project Name
**Webcrawl** *(name as nextcrawl)*

A self-hosted web scraping API that turns any URL into clean, LLM-ready markdown — built as an independent, architecturally-improved alternative to Firecrawl.

---

## Overview

Firecrawl is the dominant open-source tool (130K+ GitHub stars) for turning messy web pages into clean markdown/JSON for AI agents and RAG systems. It is AGPL-licensed, which means its source code cannot be copied or forked for a competing build.

This project is an **independent rebuild** of the same core concept — URL in, clean markdown out — written from scratch, with deliberate architecture and UX improvements in the areas where Firecrawl's self-hosted experience is known to be weak (setup complexity, caching, error visibility, observability).

This is a **portfolio project**, not a commercial product (yet). The end goal is a working, demoable, well-architected system that can be:
1. Shown to YC founders building in the web-data / AI-agent space as proof of relevant, hands-on expertise
2. Potentially evolved into a real product later if it gains traction

---

## Goals

**Primary goal:** Build a working scrape + crawl API with a live preview UI that a technical founder can clone, run with one command, and understand in 10 minutes.

**Secondary goals:**
- Demonstrate production-grade architectural thinking (queues, caching, typed errors, rate limiting) — not just "call Playwright and return text"
- Demonstrate UX thinking — a developer-facing product still needs good UX (live preview, clear errors, job visibility)
- Keep the codebase small enough to read in one sitting (~1,500–2,500 lines total across all stages)
- Make self-hosting trivial — no Docker required for local dev (SQLite, not Postgres)

**Explicit non-goals (for v1):**
- Not trying to match Firecrourcrawl's full feature set (no Interact/Agent/Map endpoints in v1)
- Not building auth, billing, or multi-tenancy
- Not optimizing for scale (this is a portfolio-quality single-node system, not infra for millions of pages/day)

---

## Core User Flow

### Flow 1 — Single page scrape (primary flow)
1. User sends `POST /scrape` with a URL
2. System renders the page (handles JS), strips nav/ads/footer, converts to markdown
3. System checks cache first — if URL was scraped recently, returns cached result instantly
4. Response returns clean markdown + title + metadata + cache status
5. If it fails, response includes a **typed error code** and a human-readable suggestion (not just "failed")

### Flow 2 — Multi-page crawl (secondary flow)
1. User sends `POST /crawl` with a starting URL and a page limit
2. System returns a `job_id` immediately (crawl runs in background)
3. System discovers links, queues each page as a job, respects per-domain rate limits
4. User polls `GET /crawl/:job_id` to see live progress (pages done / total, errors so far)
5. When complete, user fetches all scraped pages as markdown

### Flow 3 — Live preview (UX flow, dashboard)
1. User opens the dashboard, pastes a URL
2. Sees the rendered markdown appear side-by-side with a loading state
3. Can see cache hit/miss, time taken, and any errors inline
4. This is the "wow" demo moment for founders — no API key, no curl, just paste and see

---

## Features

### Core (must-have for v1)
- [ ] `POST /scrape` — single URL → markdown + metadata
- [ ] Playwright-based rendering (handles JS-heavy sites)
- [ ] Readability-based content extraction (strips nav/ads/footer)
- [ ] HTML → Markdown conversion
- [ ] Typed error codes (`JS_TIMEOUT`, `BOT_BLOCKED`, `INVALID_URL`, `DNS_FAILURE`, etc.) with human-readable suggestions
- [ ] Redis (or in-memory for v1) TTL cache — repeat scrapes within window return cached result
- [ ] `POST /crawl` + `GET /crawl/:id` — multi-page crawl with job status polling
- [ ] BullMQ-based job queue with per-domain rate limiting
- [ ] Live preview dashboard (paste URL, see markdown rendered)
- [ ] Job tracker UI (see crawl progress, error breakdown)

### Stretch (nice-to-have, only after core works)
- [ ] `formats` param — return `markdown`, `html`, or `json` (schema-based extraction via LLM)
- [ ] Webhook support on crawl completion
- [ ] `X-Cache: HIT/MISS` response header + cache age
- [ ] Simple API key auth (for when this becomes a real demo deployment)
- [ ] Screenshot capture alongside markdown

### Explicitly out of scope for v1
- Map endpoint (URL discovery without scraping)
- Interact endpoint (click/scroll/fill automation)
- Agent endpoint (autonomous multi-step research)
- Anti-bot proxy rotation / stealth infrastructure
- Multi-tenant billing or usage metering

---

## Scope

**In scope:**
- Single-page scrape pipeline (the core primitive)
- Basic multi-page crawl (breadth-first, depth/page-limit bounded)
- One dashboard UI for preview + job tracking
- Local-first development experience (SQLite, optional Redis)
- Clean, typed REST API matching the shape developers expect (Firecrawl-familiar but not copied)

**Out of scope:**
- Production-scale infrastructure (multi-node workers, proxy farms)
- Anti-bot evasion beyond what Playwright gives out of the box
- Billing, auth complexity, multi-tenant isolation
- Non-web sources (PDFs, DOCX parsing) — may revisit later

---

## Success Criteria

This project is "done enough to show founders" when:

1. **It runs in one command** — `npm install && npm run dev` and it works locally, no Docker required
2. **The core loop is solid** — scrape 20 different real-world URLs (news sites, docs sites, JS-heavy SPAs) and get clean markdown back for at least 90% of them
3. **The cache is visibly working** — a repeat request is demonstrably faster and flagged as a cache hit
4. **Errors are useful** — when a scrape fails, the error tells you *why* and *what to try next*, not just "failed"
5. **The crawl + job system works end-to-end** — start a 10-page crawl, watch it progress in the dashboard, get all pages back
6. **It's demoable in under 2 minutes** — you can screen-share, paste a URL, and show clean output live
7. **The README explains the architecture decisions** — specifically *why* SQLite over Postgres, *why* typed errors, *why* the cache layer — so a founder reading it understands you made deliberate engineering choices, not default ones

---

## How This Maps to the Outreach Goal

When reaching out to founders in the web-scraping / RAG / agent-tooling space, this project should let you say:

> "I built a Firecrawl-style scraping API from scratch — not a fork, an independent rebuild — with a few deliberate improvements: SQLite instead of Postgres for zero-config self-hosting, a TTL cache layer to cut redundant scrapes, and typed error codes so failures are debuggable instead of opaque. Here's the repo and a live demo."

That sentence only works if every claim in it is true and demonstrable. The architecture file and progress tracker exist to keep this project honest and on track toward that exact sentence being true.
