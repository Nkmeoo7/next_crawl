import { Router, Request, Response } from "express";
import { z } from "zod";
import { scrapeUrl } from "../scraper/scrape";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ─── Validation schema ────────────────────────────────────────────────────────

const ScrapeRequestSchema = z.object({
  url: z.string().min(1, "url is required"),
  /** Optional timeout override (ms). Bounded to avoid abuse. */
  timeout: z.number().int().min(1000).max(60000).optional(),
});

// ─── POST /scrape ─────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  // 1. Parse + validate request body
  const parsed = ScrapeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      status: "error",
      errorCode: "INVALID_REQUEST",
      errorMessage: parsed.error.errors.map((e) => e.message).join("; "),
      suggestion: "Provide a valid JSON body with a `url` field.",
    });
    return;
  }

  const { url } = parsed.data;

  // 2. Run scrape pipeline
  const result = await scrapeUrl(url);

  // 3. Persist to SQLite (creates a Job + Page record for history/debugging)
  try {
    const job = await prisma.job.create({
      data: {
        type: "scrape",
        status: result.status === "success" ? "completed" : "failed",
        startUrl: url,
        totalPages: 1,
        pagesDone: result.status === "success" ? 1 : 0,
        completedAt: new Date(),
        pages: {
          create: {
            url,
            status: result.status,
            html: result.status === "success" ? result.html : null,
            markdown: result.status === "success" ? result.markdown : null,
            title: result.status === "success" ? result.title : null,
            errorCode: result.status === "error" ? result.errorCode : null,
            errorMessage: result.status === "error" ? result.errorMessage : null,
            fromCache: result.status === "success" ? result.fromCache : false,
            durationMs: result.status === "success" ? result.durationMs : null,
          },
        },
      },
    });

    // Add jobId to the response for traceability
    res.status(result.status === "success" ? 200 : 422).json({
      ...result,
      jobId: job.id,
    });
  } catch (dbErr) {
    // DB write failure should not fail the scrape response — log and continue
    console.error("[DB] Failed to persist scrape result:", dbErr);
    res.status(result.status === "success" ? 200 : 422).json(result);
  }
});

export default router;
