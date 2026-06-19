import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crawl Jobs — NextCrawl",
  description: "Track active and completed crawl jobs. See progress, errors, and scraped pages.",
};

export default function JobsPage() {
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "var(--color-surface-base)" }}>
      {/* Ambient glow */}
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
            width: "600px",
            height: "400px",
            background: "radial-gradient(ellipse at center, oklch(65% 0.22 270 / 0.08) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--color-border-subtle)" }}
      >
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-medium transition-colors duration-150"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-primary)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-muted)")
            }
          >
            ← Back
          </a>
          <span style={{ color: "var(--color-border-subtle)" }}>|</span>
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Crawl Jobs
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-3xl"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border-subtle)" }}
          >
            📋
          </div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}
          >
            Job Tracker
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            Multi-page crawl job tracking coming in{" "}
            <span
              className="font-mono px-1.5 py-0.5 rounded text-xs"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text-brand)" }}
            >
              Phase 3
            </span>
            . This will show live progress, page counts, error breakdowns, and full results for all crawl jobs.
          </p>
          <a
            href="/"
            className="inline-block"
            id="back-to-preview"
          >
            <span className="btn-primary text-sm">Try the live preview →</span>
          </a>
        </div>
      </main>
    </div>
  );
}
