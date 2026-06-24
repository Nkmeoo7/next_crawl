import { Router, Request, Response } from "express";
import { z } from "zod";
import { scrapeUrl } from "../scraper/scrape";

const router = Router();

const MAX_BATCH = 10;

const BatchRequestSchema = z.object({
  urls: z
    .array(z.string().min(1))
    .min(1, "At least one URL is required")
    .max(MAX_BATCH, `Maximum ${MAX_BATCH} URLs per batch`),
});

// ─── GET /batch/scrape ────────────────────────────────────────────────────────
// Accepts a JSON body with { urls: string[] } and streams per-page scrape
// progress back to the client via Server-Sent Events (SSE).
//
// SSE event types:
//   "start"    { total: number }
//   "progress" { index: number, url: string, status: "success"|"failed", durationMs?, errorCode? }
//   "done"     { total: number, succeeded: number, failed: number }
//   "error"    { message: string }
//
// The results array is sent as the final "done" event payload.

router.post("/scrape", async (req: Request, res: Response) => {
  // Parse body
  const parsed = BatchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      status: "error",
      errorCode: "INVALID_REQUEST",
      errorMessage: parsed.error.errors.map((e) => e.message).join("; "),
      suggestion: `Provide a JSON body with a \`urls\` array (max ${MAX_BATCH} URLs).`,
    });
    return;
  }

  const { urls } = parsed.data;

  // ── Set up SSE headers ──────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering if present
  res.flushHeaders();

  function sendEvent(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Force flush if res.flush exists (compression middleware sometimes buffers)
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  }

  // ── Emit start ──────────────────────────────────────────────────────────────
  sendEvent("start", { total: urls.length });

  const results: Array<{
    index: number;
    url: string;
    status: "success" | "failed";
    title?: string | null;
    html?: string;
    errorCode?: string;
    errorMessage?: string;
    durationMs?: number;
    scrapedAt?: string;
    normalizedUrl?: string;
  }> = [];

  let succeeded = 0;
  let failed = 0;

  // ── Scrape sequentially (Playwright is resource-heavy — no concurrency in v1) ──
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    sendEvent("progress", {
      index: i,
      url,
      status: "running",
    });

    try {
      const result = await scrapeUrl(url);

      if (result.status === "success") {
        succeeded++;
        results.push({
          index: i,
          url,
          status: "success",
          title: result.title,
          html: result.html,
          normalizedUrl: result.normalizedUrl,
          durationMs: result.durationMs,
          scrapedAt: result.scrapedAt,
        });
        sendEvent("progress", {
          index: i,
          url,
          status: "success",
          title: result.title,
          durationMs: result.durationMs,
        });
      } else {
        failed++;
        results.push({
          index: i,
          url,
          status: "failed",
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
        sendEvent("progress", {
          index: i,
          url,
          status: "failed",
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Unexpected error";
      results.push({ index: i, url, status: "failed", errorCode: "UNKNOWN", errorMessage: message });
      sendEvent("progress", { index: i, url, status: "failed", errorCode: "UNKNOWN", errorMessage: message });
    }
  }

  // ── Emit done with full results ─────────────────────────────────────────────
  sendEvent("done", {
    total: urls.length,
    succeeded,
    failed,
    results,
  });

  res.end();
});

export default router;
