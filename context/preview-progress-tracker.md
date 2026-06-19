# Progress Tracker

> Update this file at the end of every working session. Keep entries short — this file is for picking up exactly where you left off, not for documentation.

---

## Current Phase
**Phase 1 — Core Scrape Pipeline ✅ COMPLETE**

(Phases: 0 = Planning → 1 = Core Scrape Pipeline → 2 = Cache Layer → 3 = Crawl + Queue → 4 = Dashboard UI → 5 = Polish + README + Demo)

---

## Current Goal
Phase 1 is done. Move to Phase 2: add Readability + Turndown to the scraper so `/scrape` returns actual clean markdown, not raw HTML.

**Next concrete step:** In `apps/api/src/scraper/scrape.ts`, add `@mozilla/readability` + `jsdom` + `turndown` pipeline after Playwright returns the HTML. Return `markdown` field populated. Update `ScrapeSuccess.markdown` from `null` to `string`.

---

## In Progress
- [ ] Phase 2: Readability + Turndown markdown extraction

---

## Completed
- [x] Decided on tech stack (TypeScript, Playwright, Readability, Turndown, BullMQ, Redis, SQLite/Prisma, Next.js)
- [x] Wrote `project-overview.md`
- [x] Wrote `preview-architecture-context.md`
- [x] Defined invariants and storage model
- [x] **Repo scaffolding** — npm workspaces monorepo (`apps/api`, `apps/web`, `packages/shared`)
- [x] **`packages/shared`** — `ErrorCode` enum + typed API response shapes (`ScrapeResult` union)
- [x] **`apps/api`** — Express API, Prisma schema (Job + Page + ErrorLog models), SQLite migration run
- [x] **Error classifier** — `classifyError()` maps raw Playwright errors to `ErrorCode` enum
- [x] **URL normalization** — tracking param removal, deterministic query sort, SHA-256 cache key
- [x] **Core scraper** (Phase 1) — Playwright singleton browser, robots.txt check, resource blocking, typed error returns
- [x] **`POST /scrape` route** — Zod validation, scraper call, SQLite persistence, typed response
- [x] **Playwright Chromium installed** (~114MB headless shell)
- [x] **Prisma migration** — `dev.db` created with `jobs`, `pages`, `error_logs` tables
- [x] **TypeScript** — both `apps/api` and `apps/web` pass `tsc --noEmit` clean
- [x] **`apps/web`** — Next.js 16 + Tailwind v4 dashboard scaffolded
- [x] **Sleek Glow design system** — `globals.css` with `@theme` tokens, component classes, animations
- [x] **Live preview page** — URL input, skeleton loader, result panel, metadata strip, error card
- [x] **Jobs placeholder page** — consistent design, Phase 3 note
- [x] **Root README** with quick start + architecture decisions table
- [x] **Smoke test PASSED** — `POST /scrape https://example.com` → `{ status: "success", title: "Example Domain", durationMs: 2903, jobId: "f8a8147d-..." }`

---

## Open Questions
- [x] Max timeout default for `/scrape` — **decided: 15s** (env `SCRAPE_TIMEOUT_MS`)
- [x] Worker concurrency for v1 — **decided: single-process** (BullMQ concurrency setting upgrades this later)
- [x] Cache TTL configurability — **decided: global env only for v1** (`CACHE_TTL_SECONDS`)
- [x] robots.txt compliance — **decided: v1** (implemented)
- [x] Express vs Fastify — **decided: Express** (less boilerplate, same perf at this scale)

---

## Architecture Decisions Log

> One-line entries. Append only — don't delete old decisions even if later reversed (note the reversal instead).

| Date | Decision | Reason |
|---|---|---|
| 2026-06-19 | SQLite + Prisma instead of Postgres | Zero-config self-hosting; no Docker requirement for local dev |
| 2026-06-19 | Redis used for both cache AND job queue (BullMQ) | Avoids adding a second infra dependency; both are ephemeral by nature |
| 2026-06-19 | Typed error enum instead of raw exceptions in API responses | Directly addresses a known Firecrawl self-hosted UX gap; also good interview talking point |
| 2026-06-19 | robots.txt compliance moved into v1 scope (not stretch) | Credibility/trust signal; cheap to implement; matches what Firecrawl does |
| 2026-06-19 | `/scrape` is synchronous, `/crawl` is async via queue | Matches user expectation — single page should feel instant, multi-page is inherently a background job |
| 2026-06-19 | Express over Fastify | Less boilerplate for this scale; no meaningful perf difference |
| 2026-06-19 | Playwright singleton browser (not per-request launch) | Browser launch is ~1-2s — reusing a single instance is critical for API latency |
| 2026-06-19 | Block images/fonts/stylesheets in Playwright | We only need the DOM for content extraction; blocking resources cuts scrape time ~30-50% |
| 2026-06-19 | Tailwind v4 CSS-first design system (not config-file) | Project uses create-next-app defaults (v4); @theme tokens follow engineering-playbook patterns |
| 2026-06-19 | Sleek Glow (Linear) aesthetic for dashboard | Pitch-black bg + violet glow suits a developer tool demo; memorable, premium, not generic |

---

## Session Notes

> Freeform. Dump anything here at the end of a session — half-finished thoughts, things to remember, bugs you noticed but didn't fix yet.

### 2026-06-19 — Session 1
- Created the three context files (`project-overview.md`, `preview-architecture-context.md`, `preview-progress-tracker.md`).
- No code written yet. Next session should start with repo scaffolding — see "Current Goal" above.
- Reminder for self: the whole point of this project is to demo well to founders. Don't over-build Stage 1 — get raw HTML back from Playwright first, prove the pipeline works, then layer in Readability/Turndown/cache one at a time. Resist the urge to build crawl + dashboard before scrape is rock solid.
- Reminder: keep checking this file matches reality. If a decision in the architecture file gets reversed mid-build, log it here AND update the architecture doc — don't let them drift apart.

### 2026-06-19 — Session 2 (Phase 1 complete)
- Built the entire Phase 1 in one session: monorepo, shared types, API, scraper, DB, Next.js dashboard.
- Smoke test result: `POST /scrape https://example.com` → `{ status: "success", title: "Example Domain", durationMs: 2903ms, jobId: "f8a8147d-..." }` ✅
- Both `apps/api` and `apps/web` pass `tsc --noEmit` clean.
- Playwright Chromium headless shell installed at `~/.cache/ms-playwright/`.
- SQLite DB at `apps/api/prisma/dev.db` — verified job + page rows are written.
- The `markdown` field is `null` in Phase 1 responses — Phase 2 adds Readability + Turndown.
- Dashboard design: Sleek Glow aesthetic, pitch-black `#000000` bg, violet brand glow. Feature cards, skeleton loader, error card with typed code + suggestion all wired up.
- **To start Phase 2:** Edit `apps/api/src/scraper/scrape.ts`, add `@mozilla/readability` + `turndown` pipeline after `page.content()`. Update return type so `markdown` is `string` not `null`.
- Note: `@mozilla/readability` needs jsdom. Both already in `package.json` — just need to wire them up.

---

## How to Use These Three Files Together

- **`project-overview.md`** — the "why" and "what." Rarely changes once written. Read this when you forget why a feature exists or whether something is in scope.
- **`preview-architecture-context.md`** — the "how." Changes occasionally as real decisions get made during build. Read this before writing code for any new component.
- **`preview-progress-tracker.md`** (this file) — the "where am I." Changes every session. Read this first when resuming work; update it last before stopping.
