import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  RPC_URL: z.string().url().default("http://127.0.0.1:8545"),
  CHAIN_ID: z.coerce.number().optional(),
  FIR_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  SIGNER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  /** `batch` = save PENDING then worker anchors; `single` = anchor before save (Phase I). */
  ANCHOR_MODE: z.enum(["batch", "single"]).default("batch"),
  /** Flush pending FIRs when the oldest is at least this many seconds old. */
  BATCH_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  /** Flush immediately when this many FIRs are pending (max 64). */
  BATCH_MAX_SIZE: z.coerce.number().int().min(1).max(64).default(64),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
