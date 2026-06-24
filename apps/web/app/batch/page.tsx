"use client";

import { useState, useCallback, useRef } from "react";
import { buildXml, downloadXml, downloadMarkdown, buildFilename } from "../lib/export";
import type { DocumentEntry } from "../lib/export";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscoveredUrl {
  url: string;
  checked: boolean;
}

type PageScrapeStatus =
  | { status: "queued" }
  | { status: "running" }
  | { status: "success"; title: string | null; durationMs: number }
  | { status: "failed"; errorCode: string; errorMessage: string };

interface ScrapePageResult {
  index: number;
  url: string;
  status: "success" | "failed";
  title?: string | null;
  html?: string;
  normalizedUrl?: string;
  durationMs?: number;
  scrapedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface BatchDonePayload {
  total: number;
  succeeded: number;
  failed: number;
  results: ScrapePageResult[];
}

type BatchStep = "input" | "discovered" | "scraping" | "done";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MAX_SELECT = 10;

// ─── Sub-components ───────────────────────────────────────────────────────────

function SpiderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9V3M9.5 10.5 5 7M14.5 10.5 19 7M9.5 13.5 3 16M14.5 13.5 21 16M12 15v6M9.5 10.5 3 8M14.5 10.5 21 8M9.5 13.5 5 17M14.5 13.5 19 17" />
    </svg>
  );
}

function StatusIcon({ status }: { status: PageScrapeStatus["status"] }) {
  if (status === "success") {
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--color-success-bg)" }}>
        <svg className="w-3 h-3" style={{ color: "var(--color-success)" }} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
        </svg>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--color-error-bg)" }}>
        <svg className="w-3 h-3" style={{ color: "var(--color-error)" }} viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--color-surface-3)" }}>
        <div className="w-2.5 h-2.5 rounded-full border border-[var(--color-brand)] border-t-transparent animate-spin-slow" />
      </span>
    );
  }
  // queued
  return (
    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
      style={{ border: "1px solid var(--color-border-subtle)", background: "var(--color-surface-2)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-text-muted)" }} />
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BatchPage() {
  const [rootUrl, setRootUrl] = useState("");
  const [step, setStep] = useState<BatchStep>("input");
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoveredUrls, setDiscoveredUrls] = useState<DiscoveredUrl[]>([]);
  const [discoverSource, setDiscoverSource] = useState<string>("sitemap");

  const [pageStatuses, setPageStatuses] = useState<Map<string, PageScrapeStatus>>(new Map());
  const [batchResults, setBatchResults] = useState<ScrapePageResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);

  const abortRef = useRef<(() => void) | null>(null);

  const selectedUrls = discoveredUrls.filter((u) => u.checked).map((u) => u.url);
  const selectedCount = selectedUrls.length;

  // ── Step 1: Discover pages ────────────────────────────────────────────────────

  const handleDiscover = useCallback(async () => {
    const trimmed = rootUrl.trim();
    if (!trimmed) return;
    setDiscovering(true);
    setDiscoverError(null);
    setDiscoveredUrls([]);
    setStep("input");

    try {
      const res = await fetch(`${API_URL}/sitemap?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (!res.ok || data.status !== "success") {
        setDiscoverError(data.errorMessage ?? "Failed to discover pages.");
        return;
      }

      const urls: DiscoveredUrl[] = (data.urls as string[]).map((url) => ({
        url,
        checked: false,
      }));
      setDiscoveredUrls(urls);
      setDiscoverSource(data.source);
      setStep("discovered");
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setDiscovering(false);
    }
  }, [rootUrl]);

  // ── Step 2: Toggle checkboxes ─────────────────────────────────────────────────

  const toggleUrl = (url: string) => {
    setDiscoveredUrls((prev) =>
      prev.map((u) => {
        if (u.url !== url) return u;
        // Enforce max selection
        if (!u.checked && selectedCount >= MAX_SELECT) return u;
        return { ...u, checked: !u.checked };
      })
    );
  };

  const selectAll = () => {
    setDiscoveredUrls((prev) => {
      let count = 0;
      return prev.map((u) => {
        if (count >= MAX_SELECT) return { ...u, checked: false };
        count++;
        return { ...u, checked: true };
      });
    });
  };

  const deselectAll = () => {
    setDiscoveredUrls((prev) => prev.map((u) => ({ ...u, checked: false })));
  };

  // ── Step 3: Start batch scraping via SSE ──────────────────────────────────────

  const handleStartScraping = useCallback(async () => {
    if (selectedUrls.length === 0) return;

    setStep("scraping");
    setBatchResults([]);
    setBatchSummary(null);

    // Initialize all selected pages as queued
    const initialStatuses = new Map<string, PageScrapeStatus>();
    for (const url of selectedUrls) {
      initialStatuses.set(url, { status: "queued" });
    }
    setPageStatuses(new Map(initialStatuses));

    let closed = false;
    abortRef.current = () => { closed = true; };

    try {
      const res = await fetch(`${API_URL}/batch/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: selectedUrls }),
      });

      if (!res.ok || !res.body) {
        setDiscoverError("Batch request failed. Is the API running?");
        setStep("discovered");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let event = "";
        let dataStr = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            event = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6).trim();
          } else if (line === "") {
            // End of an SSE message — parse it
            if (event && dataStr) {
              try {
                const payload = JSON.parse(dataStr);

                if (event === "progress") {
                  const { url, status, title, durationMs, errorCode, errorMessage } = payload;
                  setPageStatuses((prev) => {
                    const next = new Map(prev);
                    if (status === "running") {
                      next.set(url, { status: "running" });
                    } else if (status === "success") {
                      next.set(url, { status: "success", title: title ?? null, durationMs: durationMs ?? 0 });
                    } else if (status === "failed") {
                      next.set(url, { status: "failed", errorCode: errorCode ?? "UNKNOWN", errorMessage: errorMessage ?? "" });
                    }
                    return next;
                  });
                } else if (event === "done") {
                  const donePayload = payload as BatchDonePayload;
                  setBatchResults(donePayload.results);
                  setBatchSummary({ total: donePayload.total, succeeded: donePayload.succeeded, failed: donePayload.failed });
                  setStep("done");
                }
              } catch {
                /* skip malformed SSE */
              }
            }
            event = "";
            dataStr = "";
          }
        }
      }
    } catch (err) {
      console.error("[batch] SSE error:", err);
      setDiscoverError("Batch scraping failed unexpectedly.");
      setStep("discovered");
    }
  }, [selectedUrls]);

  // ── Step 4: Download outputs ──────────────────────────────────────────────────

  const handleDownloadMarkdown = () => {
    const sections = batchResults
      .filter((r) => r.status === "success" && r.html)
      .map((r) => `## ${r.url}\n\n${r.html ?? ""}`)
      .join("\n\n---\n\n");

    const filename = buildFilename(rootUrl, "md");
    downloadMarkdown(sections, filename);
  };

  const handleDownloadXml = () => {
    const docs: DocumentEntry[] = batchResults
      .filter((r) => r.status === "success" && r.html)
      .map((r) => ({
        url: r.url,
        normalizedUrl: r.normalizedUrl ?? r.url,
        title: r.title ?? null,
        content: r.html ?? "",
        scrapedAt: r.scrapedAt ?? new Date().toISOString(),
      }));

    const xml = buildXml(docs);
    const filename = buildFilename(rootUrl, "xml");
    downloadXml(xml, filename);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--color-surface-base)" }}>
      {/* Ambient glow */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "-200px", left: "50%", transform: "translateX(-50%)",
          width: "700px", height: "400px",
          background: "radial-gradient(ellipse at center, oklch(65% 0.22 270 / 0.1) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
      </div>

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-4">
          <a href="/" className="flex items-center gap-2.5 text-sm font-medium transition-colors duration-150"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >
            <SpiderIcon className="w-4 h-4" />
            NextCrawl
          </a>
          <span style={{ color: "var(--color-border-subtle)" }}>|</span>
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Batch Scrape
          </span>
        </div>
        <a href="/" className="btn-ghost text-xs" id="nav-back">
          ← Single URL
        </a>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 px-4 py-10 max-w-4xl mx-auto w-full space-y-8">

        {/* ── Page title ────────────────────────────────────────────── */}
        <section className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <span className="text-3xl">🗺️</span>
          </div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "var(--color-text-primary)", letterSpacing: "-0.03em" }}
          >
            Sitemap{" "}
            <span style={{ color: "var(--color-text-brand)" }}>Batch Mode</span>
          </h1>
          <p className="text-sm max-w-lg mx-auto" style={{ color: "var(--color-text-secondary)" }}>
            Paste a root docs URL. NextCrawl discovers all pages via sitemap.xml (with BFS fallback), lets you pick up to {MAX_SELECT}, and scrapes them all with live progress.
          </p>
        </section>

        {/* ── Step 1: Root URL input ─────────────────────────────────── */}
        <section className="card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono font-bold px-2 py-0.5 rounded"
              style={{ background: "oklch(65% 0.22 270 / 0.15)", color: "var(--color-text-brand)" }}
            >
              Step 1
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Enter a root URL
            </span>
          </div>

          <div className="flex gap-2">
            <input
              id="batch-url-input"
              type="url"
              className="url-input flex-1"
              placeholder="https://nextjs.org/docs"
              value={rootUrl}
              onChange={(e) => setRootUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
              aria-label="Root URL for sitemap discovery"
              spellCheck={false}
            />
            <button
              id="discover-btn"
              onClick={handleDiscover}
              disabled={discovering || !rootUrl.trim()}
              className="btn-primary"
            >
              {discovering ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin-slow" aria-hidden="true" />
                  Discovering…
                </>
              ) : (
                "Discover Pages →"
              )}
            </button>
          </div>

          {discoverError && (
            <div
              className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm"
              style={{ background: "var(--color-error-bg)", border: "1px solid oklch(65% 0.22 25 / 0.3)" }}
            >
              <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--color-error)" }} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span style={{ color: "var(--color-error)" }}>{discoverError}</span>
            </div>
          )}
        </section>

        {/* ── Step 2: Page checklist ─────────────────────────────────── */}
        {(step === "discovered" || step === "scraping" || step === "done") && discoveredUrls.length > 0 && (
          <section className="card p-6 space-y-4 animate-fade-in-up">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                  style={{ background: "oklch(65% 0.22 270 / 0.15)", color: "var(--color-text-brand)" }}
                >
                  Step 2
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Select pages to scrape
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: discoverSource === "sitemap" || discoverSource === "sitemap_index"
                      ? "var(--color-success-bg)" : "var(--color-warning-bg)",
                    color: discoverSource === "sitemap" || discoverSource === "sitemap_index"
                      ? "var(--color-success)" : "var(--color-warning)",
                    border: `1px solid ${discoverSource === "sitemap" || discoverSource === "sitemap_index" ? "oklch(65% 0.18 145 / 0.3)" : "oklch(72% 0.18 75 / 0.3)"}`,
                  }}
                >
                  {discoverSource === "sitemap" ? "✓ sitemap.xml" :
                    discoverSource === "sitemap_index" ? "✓ sitemap index" : "⚡ BFS crawl"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span style={{ color: "var(--color-text-muted)" }}>
                  {selectedCount}/{MAX_SELECT} selected · {discoveredUrls.length} found
                </span>
                {step === "discovered" && (
                  <>
                    <button onClick={selectAll} className="btn-ghost text-xs py-1 px-2" id="select-all-btn">
                      Select top {MAX_SELECT}
                    </button>
                    <button onClick={deselectAll} className="btn-ghost text-xs py-1 px-2" id="deselect-all-btn">
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* URL list */}
            <div
              className="space-y-1 rounded-lg overflow-hidden"
              style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid var(--color-border-subtle)" }}
            >
              {discoveredUrls.map((u, i) => {
                const isDisabled = step !== "discovered" || (!u.checked && selectedCount >= MAX_SELECT);
                const scrapeStatus = pageStatuses.get(u.url);

                return (
                  <label
                    key={u.url}
                    htmlFor={`url-check-${i}`}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-100"
                    style={{
                      background: u.checked ? "oklch(65% 0.22 270 / 0.06)" : "transparent",
                      opacity: isDisabled ? 0.4 : 1,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      borderBottom: i < discoveredUrls.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                    }}
                  >
                    {/* Checkbox or status icon */}
                    {step === "discovered" ? (
                      <input
                        id={`url-check-${i}`}
                        type="checkbox"
                        checked={u.checked}
                        disabled={isDisabled}
                        onChange={() => toggleUrl(u.url)}
                        className="w-4 h-4 accent-[var(--color-brand)] shrink-0"
                        style={{ accentColor: "oklch(65% 0.22 270)" }}
                      />
                    ) : scrapeStatus ? (
                      <StatusIcon status={scrapeStatus.status} />
                    ) : (
                      <span className="w-5 h-5 shrink-0" />
                    )}

                    <span
                      className="text-xs font-mono truncate flex-1"
                      style={{ color: u.checked ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                    >
                      {u.url.replace(/^https?:\/\//, "")}
                    </span>

                    {/* Duration badge on success */}
                    {scrapeStatus?.status === "success" && (
                      <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-success)" }}>
                        {scrapeStatus.durationMs}ms
                      </span>
                    )}
                    {scrapeStatus?.status === "failed" && (
                      <span className="text-xs font-mono shrink-0" style={{ color: "var(--color-error)" }}>
                        {scrapeStatus.errorCode}
                      </span>
                    )}
                    {scrapeStatus?.status === "running" && (
                      <span className="text-xs shrink-0 animate-pulse-dot" style={{ color: "var(--color-text-muted)" }}>
                        Rendering JS…
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Start scraping button */}
            {step === "discovered" && (
              <button
                id="start-batch-btn"
                onClick={handleStartScraping}
                disabled={selectedCount === 0}
                className="btn-primary w-full"
              >
                Scrape {selectedCount} page{selectedCount !== 1 ? "s" : ""} →
              </button>
            )}
          </section>
        )}

        {/* ── Step 3: Live SSE progress board ───────────────────────── */}
        {step === "scraping" && (
          <section className="card p-6 space-y-4 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                style={{ background: "oklch(65% 0.22 270 / 0.15)", color: "var(--color-text-brand)" }}
              >
                Step 3
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Scraping in progress
              </span>
              <div className="w-4 h-4 rounded-full border-2 border-[var(--color-brand)] border-t-transparent animate-spin-slow ml-1" />
            </div>

            <div className="space-y-2">
              {selectedUrls.map((url, i) => {
                const status = pageStatuses.get(url) ?? { status: "queued" };
                return (
                  <div
                    key={url}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300"
                    style={{
                      background: status.status === "running"
                        ? "oklch(65% 0.22 270 / 0.06)"
                        : "var(--color-surface-2)",
                      border: status.status === "running"
                        ? "1px solid oklch(65% 0.22 270 / 0.3)"
                        : "1px solid var(--color-border-subtle)",
                    }}
                  >
                    <span className="text-xs font-mono w-5 shrink-0 text-right"
                      style={{ color: "var(--color-text-muted)" }}>
                      {i + 1}
                    </span>
                    <StatusIcon status={status.status} />
                    <span className="text-xs font-mono flex-1 truncate"
                      style={{ color: "var(--color-text-secondary)" }}>
                      {url.replace(/^https?:\/\//, "")}
                    </span>
                    {status.status === "running" && (
                      <span className="text-xs animate-pulse-dot" style={{ color: "var(--color-text-brand)" }}>
                        Rendering JS…
                      </span>
                    )}
                    {status.status === "success" && (
                      <span className="text-xs font-mono" style={{ color: "var(--color-success)" }}>
                        {status.durationMs}ms
                      </span>
                    )}
                    {status.status === "failed" && (
                      <span className="text-xs font-mono" style={{ color: "var(--color-error)" }}>
                        {status.errorCode}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Step 4: Done + download ────────────────────────────────── */}
        {step === "done" && batchSummary && (
          <section className="card p-6 space-y-5 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                style={{ background: "var(--color-success-bg)", color: "var(--color-success)", border: "1px solid oklch(65% 0.18 145 / 0.3)" }}
              >
                Done ✓
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Batch complete
              </span>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total", value: batchSummary.total, color: "var(--color-text-brand)" },
                { label: "Succeeded", value: batchSummary.succeeded, color: "var(--color-success)" },
                { label: "Failed", value: batchSummary.failed, color: batchSummary.failed > 0 ? "var(--color-error)" : "var(--color-text-muted)" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg px-4 py-3 text-center"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border-subtle)" }}
                >
                  <div className="text-2xl font-bold font-mono" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Download buttons */}
            {batchSummary.succeeded > 0 && (
              <div className="flex gap-3 flex-wrap">
                <button
                  id="download-md-btn"
                  onClick={handleDownloadMarkdown}
                  className="btn-primary flex-1"
                >
                  ⬇ Download Merged Markdown
                </button>
                <button
                  id="download-xml-btn"
                  onClick={handleDownloadXml}
                  className="btn-ghost flex-1"
                  style={{ borderColor: "oklch(65% 0.22 270 / 0.3)", color: "var(--color-text-brand)" }}
                >
                  ⬇ Export for AI (XML)
                </button>
              </div>
            )}

            {batchSummary.succeeded === 0 && (
              <p className="text-sm text-center py-2" style={{ color: "var(--color-text-muted)" }}>
                All pages failed to scrape. Check error codes above.
              </p>
            )}

            {/* Scrape again */}
            <button
              onClick={() => {
                setStep("discovered");
                setPageStatuses(new Map());
                setBatchResults([]);
                setBatchSummary(null);
              }}
              className="btn-ghost w-full text-xs"
            >
              ← Select different pages
            </button>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer
        className="relative z-10 text-center py-6 text-xs border-t"
        style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border-subtle)" }}
      >
        NextCrawl · Batch Mode · sitemap.xml + BFS fallback · SSE live progress
      </footer>
    </div>
  );
}
