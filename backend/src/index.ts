import express from "express";
import cors from "cors";
import helmet from "helmet";
import { loadEnv } from "./env.js";
import { createAuthRouter } from "./routes/auth.js";
import { createFirsRouter } from "./routes/firs.js";
import { createReceiptsRouter } from "./routes/receipts.js";
import { startBatchWorker } from "./lib/batchWorker.js";
import { prisma } from "./lib/prisma.js";

const env = loadEnv();

const app = express();
app.use(helmet());
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  }),
);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true, anchorMode: env.ANCHOR_MODE });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

app.use("/api/auth", createAuthRouter(env));
app.use("/api/firs", createFirsRouter(env));
app.use("/api/receipts", createReceiptsRouter(env));

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT} (ANCHOR_MODE=${env.ANCHOR_MODE})`);
  if (env.ANCHOR_MODE === "batch") {
    startBatchWorker(env);
    console.log(
      `Batch worker started (interval=${env.BATCH_INTERVAL_SECONDS}s, max=${env.BATCH_MAX_SIZE})`,
    );
  }
});
