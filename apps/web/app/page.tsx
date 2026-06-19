"use client";

import { useState, useRef, useCallback } from "react";
import { ErrorCode } from "@nextcrawl/shared";
import type { ScrapeResult } from "@nextcrawl/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScrapeState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success"; data: Extract<ScrapeResult, { status: "success" }> & { jobId?: string } }
  | { phase: "error"; data: Extract<ScrapeResult, { status: "error" }> };

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const EXAMPLE_URLS = [
  "https://vercel.com",
  "https://linear.app",
  "https://nextjs.org/docs",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SpiderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9V3M9.5 10.5 5 7M14.5 10.5 19 7M9.5 13.5 3 16M14.5 13.5 21 16M12 15v6M9.5 10.5 3 8M14.5 10.5 21 8M9.5 13.5 5 17M14.5 13.5 19 17" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-8 h-8 rounded-full border-2 border-[var(--color-brand)] border-t-transparent animate-spin-slow"
          role="status"
          aria-label="Loading"
        />
        <p className="text-[var(--color-text-muted)] text-sm animate-pulse-dot">
          Rendering page…
        </p>
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="p-6 space-y-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-3 rounded"
          style={{ width: `${60 + Math.random() * 40}%`, animationDelay: `${i * 0.05}s` }}
        />
      ))}
    </div>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-[var(--color-text-muted)] shrink-0 w-20">{label}</span>
      <span
        className={`text-[var(--color-text-secondary)] truncate ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function ErrorCard({ data }: { data: Extract<ScrapeResult, { status: "error" }> }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-4 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--color-error-bg)] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[var(--color-error)]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-[var(--color-text-primary)] font-semibold text-sm">Scrape failed</p>
            <span className="badge badge-error mt-1">{data.errorCode}</span>
          </div>
        </div>
        <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
          {data.errorMessage}
        </p>
        <div className="card p-4 space-y-1">
          <p className="text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider mb-2">Suggestion</p>
          <p className="text-sm text-[var(--color-text-secondary)]">{data.suggestion}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ScrapeState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleScrape = useCallback(async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    setState({ phase: "loading" });

    try {
      const res = await fetch(`${API_URL}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (data.status === "success") {
        setState({ phase: "success", data });
      } else {
        setState({ phase: "error", data });
      }
    } catch (err) {
      setState({
        phase: "error",
        data: {
          status: "error",
          url: trimmed,
          errorCode: ErrorCode.UNKNOWN,
          errorMessage: err instanceof Error ? err.message : "Network error — is the API running?",
          suggestion: `Make sure the API is running at ${API_URL}. Run: npm run dev:api`,
        },
      });
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScrape(url);
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
    handleScrape(exampleUrl);
  };

  const handleCopy = async () => {
    if (state.phase !== "success") return;
    const content = state.data.html ?? "";
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const successData = state.phase === "success" ? state.data : null;

  return (
    <div className="flex flex-col min-h-dvh" style={{ background: "var(--color-surface-base)" }}>

      {/* ── Ambient glow ─────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          style={{
            position: "absolute",
            top: "-200px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "500px",
            background: "radial-gradient(ellipse at center, oklch(65% 0.22 270 / 0.12) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header
        className="relative z-10 flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-2.5">
          <SpiderIcon className="w-6 h-6 text-[var(--color-brand)]" />
          <span
            className="font-bold tracking-tight text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            NextCrawl
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{
              background: "var(--color-surface-2)",
              color: "var(--color-text-muted)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            v0.1
          </span>
        </div>

        <nav className="flex items-center gap-2">
          <a
            href="/jobs"
            className="btn-ghost text-xs"
            id="nav-jobs"
          >
            Jobs
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-xs"
            id="nav-github"
          >
            GitHub ↗
          </a>
        </nav>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex flex-col flex-1 px-4 pt-12 pb-6 max-w-6xl mx-auto w-full gap-8">

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="text-center space-y-4">
          <h1
            className="text-4xl font-bold tracking-tight text-[var(--color-text-primary)]"
            style={{ letterSpacing: "-0.03em", lineHeight: 1.15 }}
          >
            URL in.{" "}
            <span style={{ color: "var(--color-text-brand)" }}>
              Clean markdown out.
            </span>
          </h1>
          <p
            className="text-base max-w-lg mx-auto"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Paste any URL — NextCrawl renders it (including JS-heavy SPAs), strips
            nav/ads/footers, and returns clean content ready for LLMs or RAG pipelines.
          </p>
        </section>

        {/* ── URL Input ───────────────────────────────────────────────── */}
        <section aria-label="URL input">
          <form
            id="scrape-form"
            onSubmit={handleSubmit}
            className="flex gap-2 max-w-2xl mx-auto w-full"
          >
            <input
              ref={inputRef}
              id="url-input"
              type="url"
              className="url-input flex-1"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="URL to scrape"
              autoFocus
              spellCheck={false}
            />
            <button
              id="scrape-btn"
              type="submit"
              className="btn-primary"
              disabled={state.phase === "loading" || !url.trim()}
            >
              {state.phase === "loading" ? (
                <>
                  <div
                    className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin-slow"
                    aria-hidden="true"
                  />
                  Scraping…
                </>
              ) : (
                "Scrape →"
              )}
            </button>
          </form>

          {/* Example URLs */}
          {state.phase === "idle" && (
            <div className="flex items-center justify-center gap-3 mt-4 flex-wrap animate-fade-in-up">
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Try:
              </span>
              {EXAMPLE_URLS.map((exUrl) => (
                <button
                  key={exUrl}
                  onClick={() => handleExampleClick(exUrl)}
                  className="text-xs font-mono px-2.5 py-1 rounded transition-colors duration-150"
                  style={{
                    color: "var(--color-text-brand)",
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border-subtle)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "oklch(65% 0.22 270 / 0.4)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "var(--color-border-subtle)";
                  }}
                >
                  {exUrl.replace("https://", "")}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Results ─────────────────────────────────────────────────── */}
        {state.phase !== "idle" && (
          <section
            id="results-panel"
            className="card animate-fade-in-up"
            style={{ minHeight: "500px", overflow: "hidden" }}
            aria-live="polite"
            aria-label="Scrape results"
          >
            {/* Result header bar */}
            {(
              <div
                className="flex items-center justify-between px-5 py-3 border-b gap-4 flex-wrap"
                style={{
                  borderColor: "var(--color-border-subtle)",
                  background: "var(--color-surface-2)",
                }}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Status badge */}
                  {state.phase === "loading" && (
                    <span className="badge badge-loading">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot" />
                      Scraping
                    </span>
                  )}
                  {state.phase === "success" && (
                    <span className="badge badge-success">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      Success
                    </span>
                  )}
                  {state.phase === "error" && (
                    <span className="badge badge-error">
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      Failed
                    </span>
                  )}

                  {/* Cache badge */}
                  {state.phase === "success" && state.data.fromCache && (
                    <span className="badge badge-cache">⚡ Cache HIT</span>
                  )}

                  {/* Title */}
                  {state.phase === "success" && state.data.title && (
                    <span
                      className="text-xs truncate max-w-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {state.data.title}
                    </span>
                  )}
                </div>

                {/* Right side meta */}
                <div className="flex items-center gap-4">
                  {state.phase === "success" && (
                    <>
                      <span
                        className="text-xs font-mono"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {state.data.durationMs}ms
                      </span>
                      <button
                        id="copy-btn"
                        onClick={handleCopy}
                        className="btn-ghost text-xs py-1 px-2.5"
                        aria-label="Copy output"
                      >
                        {copied ? "✓ Copied" : "Copy"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Result body */}
            <div style={{ padding: "1.5rem", minHeight: "440px", height: "100%" }}>
              {state.phase === "loading" && <SkeletonLoader />}

              {state.phase === "error" && <ErrorCard data={state.data} />}

              {state.phase === "success" && (
                <div className="space-y-5 animate-fade-in-up">
                  {/* Metadata strip */}
                  <div
                    className="card p-4 space-y-2"
                    style={{ background: "var(--color-surface-2)" }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-3"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      Metadata
                    </p>
                    <MetaRow label="URL" value={state.data.normalizedUrl} mono />
                    <MetaRow label="Title" value={state.data.title ?? "—"} />
                    <MetaRow label="Scraped at" value={new Date(state.data.scrapedAt).toLocaleString()} />
                    <MetaRow label="Duration" value={`${state.data.durationMs}ms`} mono />
                    {state.data.jobId && (
                      <MetaRow label="Job ID" value={state.data.jobId} mono />
                    )}
                  </div>

                  {/* HTML output */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Raw HTML{" "}
                        <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>
                          ({Math.round((state.data.html?.length ?? 0) / 1024)}KB)
                        </span>
                      </p>
                      <span
                        className="text-xs px-2 py-0.5 rounded font-mono"
                        style={{
                          background: "var(--color-surface-3)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        Phase 1 · Markdown in Phase 2
                      </span>
                    </div>
                    <div className="output-panel">
                      <pre className="p-5 text-xs overflow-auto" style={{ maxHeight: "400px" }}>
                        <code>{state.data.html?.slice(0, 8000)}</code>
                        {(state.data.html?.length ?? 0) > 8000 && (
                          <div
                            className="mt-3 pt-3 border-t text-xs"
                            style={{
                              borderColor: "var(--color-border-subtle)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            … {Math.round(((state.data.html?.length ?? 0) - 8000) / 1024)}KB more
                            (truncated for display)
                          </div>
                        )}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Feature cards (shown only on idle) ──────────────────────── */}
        {state.phase === "idle" && (
          <section
            aria-label="Feature highlights"
            className="grid grid-cols-1 gap-4 mt-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
          >
            {[
              {
                icon: "⚡",
                title: "TTL Cache",
                desc: "Repeat requests for the same URL return instantly from cache. Zero redundant scrapes.",
              },
              {
                icon: "🦾",
                title: "JS Rendering",
                desc: "Playwright renders SPAs, waits for DOM — handles React, Vue, Angular out of the box.",
              },
              {
                icon: "🛡️",
                title: "Typed Errors",
                desc: "Every failure maps to a code: DNS_FAILURE, BOT_BLOCKED, JS_TIMEOUT — plus a fix suggestion.",
              },
              {
                icon: "🤖",
                title: "robots.txt",
                desc: "Respects robots.txt by default. Credibility over capability.",
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="card p-5 space-y-2"
                style={{ background: "var(--color-surface-1)" }}
              >
                <div className="text-2xl">{feat.icon}</div>
                <h2
                  className="font-semibold text-sm"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {feat.title}
                </h2>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {feat.desc}
                </p>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer
        className="relative z-10 text-center py-6 text-xs border-t"
        style={{
          color: "var(--color-text-muted)",
          borderColor: "var(--color-border-subtle)",
        }}
      >
        NextCrawl · Phase 1 · Built from scratch · Not a Firecrawl fork
      </footer>
    </div>
  );
}
