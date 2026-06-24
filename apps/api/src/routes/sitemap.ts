import { Router, Request, Response } from "express";
import { z } from "zod";
import { discoverUrls } from "../lib/sitemap";

const router = Router();

const SitemapQuerySchema = z.object({
  url: z.string().min(1, "url query param is required"),
});

// ─── GET /sitemap ─────────────────────────────────────────────────────────────
// Discovers all pages from a root URL via sitemap.xml (with BFS fallback).
// Returns: { urls: string[], source: "sitemap" | "sitemap_index" | "crawl_fallback", count: number }

router.get("/", async (req: Request, res: Response) => {
  const parsed = SitemapQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      status: "error",
      errorCode: "INVALID_REQUEST",
      errorMessage: parsed.error.errors.map((e) => e.message).join("; "),
      suggestion: "Provide a `url` query parameter. Example: GET /sitemap?url=https://nextjs.org/docs",
    });
    return;
  }

  const { url } = parsed.data;

  try {
    new URL(url); // throws if invalid
  } catch {
    res.status(400).json({
      status: "error",
      errorCode: "INVALID_URL",
      errorMessage: `"${url}" is not a valid URL.`,
      suggestion: "Include the protocol: https://example.com",
    });
    return;
  }

  try {
    const result = await discoverUrls(url);
    res.json({ status: "success", ...result });
  } catch (err) {
    console.error("[sitemap] Discovery failed:", err);
    res.status(500).json({
      status: "error",
      errorCode: "DISCOVERY_FAILED",
      errorMessage: err instanceof Error ? err.message : "Failed to discover URLs.",
      suggestion: "Make sure the URL is publicly accessible and try again.",
    });
  }
});

export default router;
