import "dotenv/config";
import express from "express";
import { closeBrowser } from "./scraper/scrape";
import scrapeRouter from "./routes/scrape";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: "1mb" }));

// Basic CORS — dashboard at localhost:3000 needs to call the API
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() });
});

app.use("/scrape", scrapeRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    errorCode: "NOT_FOUND",
    errorMessage: "This endpoint does not exist.",
    suggestion: "Available endpoints: GET /health, POST /scrape",
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`\n🕷️  NextCrawl API running on http://localhost:${PORT}`);
  console.log(`   Health:  GET  http://localhost:${PORT}/health`);
  console.log(`   Scrape:  POST http://localhost:${PORT}/scrape\n`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(async () => {
    await closeBrowser();
    console.log("Browser closed. Goodbye.");
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
