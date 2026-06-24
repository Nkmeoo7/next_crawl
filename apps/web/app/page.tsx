"use client";

import { useState, useRef, useCallback } from "react";
import { ErrorCode } from "@nextcrawl/shared";
import type { ScrapeResult } from "@nextcrawl/shared";
import { chunkContent } from "./lib/chunker";
import { buildXml, downloadXml, buildFilename } from "./lib/export";
import type { RagChunk } from "./lib/chunker";
import type { DocumentEntry } from "./lib/export";

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

// ─── RAG Chunk Viewer ─────────────────────────────────────────────────────────

function RagChunkViewer({ chunks, chunkSize, overlapPct }: { chunks: RagChunk[]; chunkSize: number; overlapPct: number }) {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="space-y-3 animate-fade-in-up">
      {/* Stats bar */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 rounded-lg text-xs font-mono flex-wrap"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border-subtle)" }}
      >
        <span style={{ color: "var(--color-text-brand)" }}>
          🧩 {chunks.length} chunks
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>·</span>
        <span style={{ color: "var(--color-text-secondary)" }}>
          ~{chunkSize} tokens target
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>·</span>
        <span style={{ color: "var(--color-text-secondary)" }}>
          {Math.round(overlapPct * 100)}% overlap
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>·</span>
        <span style={{ color: "var(--color-text-secondary)" }}>
          cl100k_base tokenizer
        </span>
      </div>

      {/* Chunk list */}
      <div className="space-y-2" style={{ maxHeight: "480px", overflowY: "auto" }}>
        {chunks.map((chunk) => (
          <div
            key={chunk.index}
            className="rounded-lg border transition-colors duration-150 cursor-pointer"
            style={{
              border: expanded === chunk.index
                ? "1px solid oklch(65% 0.22 270 / 0.5)"
                : "1px solid var(--color-border-subtle)",
              background: expanded === chunk.index
                ? "oklch(65% 0.22 270 / 0.05)"
                : "var(--color-surface-2)",
            }}
            onClick={() => setExpanded(expanded === chunk.index ? null : chunk.index)}
          >
            {/* Chunk header */}
            <div className="flex items-center justify-between px-4 py-2.5 gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                  style={{ background: "oklch(65% 0.22 270 / 0.15)", color: "var(--color-text-brand)" }}
                >
                  #{chunk.index + 1}
                </span>
                <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {chunk.tokenCount.toLocaleString()} tokens · {chunk.charCount.toLocaleString()} chars
                </span>
              </div>
              <svg
                className="w-3.5 h-3.5 transition-transform duration-150"
                style={{
                  color: "var(--color-text-muted)",
                  transform: expanded === chunk.index ? "rotate(180deg)" : "rotate(0deg)",
                }}
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </div>

            {/* Chunk content */}
            {expanded === chunk.index && (
              <div
                className="px-4 pb-4 pt-1 border-t text-xs font-mono leading-relaxed whitespace-pre-wrap"
                style={{
                  borderColor: "oklch(65% 0.22 270 / 0.2)",
                  color: "var(--color-text-secondary)",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                {chunk.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RAG Mode Toggle ──────────────────────────────────────────────────────────

function RagToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      id="rag-mode-toggle"
      onClick={onToggle}
      aria-pressed={enabled}
      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full transition-all duration-200 font-semibold"
      style={{
        background: enabled ? "oklch(65% 0.22 270 / 0.18)" : "var(--color-surface-3)",
        border: enabled ? "1px solid oklch(65% 0.22 270 / 0.5)" : "1px solid var(--color-border-subtle)",
        color: enabled ? "var(--color-text-brand)" : "var(--color-text-muted)",
        boxShadow: enabled ? "0 0 12px oklch(65% 0.22 270 / 0.2)" : "none",
      }}
    >
      <span
        className="w-2 h-2 rounded-full transition-colors duration-200"
        style={{ background: enabled ? "var(--color-text-brand)" : "var(--color-text-muted)" }}
      />
      RAG Mode
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ScrapeState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);
  const [ragMode, setRagMode] = useState(false);
  const [ragChunks, setRagChunks] = useState<RagChunk[] | null>(null);
  const [isChunking, setIsChunking] = useState(false);
  const [exportingXml, setExportingXml] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const RAG_CHUNK_SIZE = 1000;
  const RAG_OVERLAP = 0.1;

  const handleScrape = useCallback(async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    setState({ phase: "loading" });
    setRagChunks(null);
    setRagMode(false);

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
    let content: string;
    if (ragMode && ragChunks) {
      content = JSON.stringify(ragChunks, null, 2);
    } else {
      content = state.data.html ?? "";
    }
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRagToggle = async () => {
    if (state.phase !== "success") return;
    const next = !ragMode;
    setRagMode(next);
    if (next && !ragChunks) {
      setIsChunking(true);
      // Defer to next tick so UI updates before the blocking tiktoken call
      setTimeout(async () => {
        const content = state.data.html ?? "";
        const chunks = chunkContent(content, RAG_CHUNK_SIZE, RAG_OVERLAP);
        setRagChunks(chunks);
        setIsChunking(false);
      }, 0);
    }
  };

  const handleExportXml = async () => {
    if (state.phase !== "success") return;
    setExportingXml(true);
    try {
      const doc: DocumentEntry = {
        url: state.data.url,
        normalizedUrl: state.data.normalizedUrl,
        title: state.data.title,
        content: state.data.html ?? "",
        scrapedAt: state.data.scrapedAt,
      };
      const xml = buildXml([doc]);
      const filename = buildFilename(state.data.normalizedUrl, "xml");
      downloadXml(xml, filename);
    } finally {
      setExportingXml(false);
    }
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
          <a href="/batch" className="btn-ghost text-xs" id="nav-batch">
            Batch
          </a>
          <a href="/jobs" className="btn-ghost text-xs" id="nav-jobs">
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

                {/* Right side actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {state.phase === "success" && (
                    <>
                      <span
                        className="text-xs font-mono"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {state.data.durationMs}ms
                      </span>

                      {/* RAG Mode toggle */}
                      <RagToggle enabled={ragMode} onToggle={handleRagToggle} />

                      {/* Export for AI button */}
                      <button
                        id="export-xml-btn"
                        onClick={handleExportXml}
                        disabled={exportingXml}
                        className="btn-ghost text-xs py-1 px-2.5"
                        aria-label="Export as AI Project Context (XML)"
                        title="Download as Claude/ChatGPT-optimized XML"
                      >
                        {exportingXml ? "Exporting…" : "⬇ Export for AI"}
                      </button>

                      {/* Copy button */}
                      <button
                        id="copy-btn"
                        onClick={handleCopy}
                        className="btn-ghost text-xs py-1 px-2.5"
                        aria-label="Copy output"
                      >
                        {copied ? "✓ Copied" : ragMode ? "Copy JSON" : "Copy"}
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

                  {/* RAG Mode — chunk viewer */}
                  {ragMode ? (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p
                          className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          RAG Chunks
                        </p>
                        <span
                          className="text-xs px-2 py-0.5 rounded font-mono"
                          style={{ background: "var(--color-surface-3)", color: "var(--color-text-brand)" }}
                        >
                          cl100k_base · {RAG_CHUNK_SIZE} tok · {Math.round(RAG_OVERLAP * 100)}% overlap
                        </span>
                      </div>
                      {isChunking ? (
                        <div className="flex items-center gap-3 py-8 justify-center">
                          <div className="w-5 h-5 rounded-full border-2 border-[var(--color-brand)] border-t-transparent animate-spin-slow" />
                          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                            Tokenizing content…
                          </span>
                        </div>
                      ) : ragChunks ? (
                        <RagChunkViewer chunks={ragChunks} chunkSize={RAG_CHUNK_SIZE} overlapPct={RAG_OVERLAP} />
                      ) : null}
                    </div>
                  ) : (
                    /* Raw HTML output */
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
                  )}
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
                icon: "🧩",
                title: "RAG Mode",
                desc: "Toggle RAG Mode to chunk content into token-precise JSON arrays with overlap — ready for any LLM pipeline.",
              },
              {
                icon: "📦",
                title: "AI Export",
                desc: "Export scraped pages as Claude/ChatGPT-optimized XML bundles with rich metadata attributes.",
              },
              {
                icon: "🗺️",
                title: "Batch Mode",
                desc: "Paste a root URL, pick from discovered sitemap pages, and scrape up to 10 at once with live SSE progress.",
              },
              {
                icon: "🛡️",
                title: "Typed Errors",
                desc: "Every failure maps to a code: DNS_FAILURE, BOT_BLOCKED, JS_TIMEOUT — plus a fix suggestion.",
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
