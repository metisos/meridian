/**
 * Environment loading for the CLI. Loads `.env.local` from the repo root,
 * validates with zod, and returns a typed config. Every command reads from this.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";
import { URL } from "node:url";

// Try a few locations so the CLI works regardless of CWD
loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), "../../.env.local") });
loadEnv({ path: resolve(process.cwd(), "../.env.local") });

const Schema = z.object({
  // GCP
  GCP_PROJECT: z.string().default("meridian-metisos"),
  GCP_REGION: z.string().default("us-central1"),
  GCP_ZONE: z.string().default("us-central1-a"),

  // MongoDB
  MONGODB_USER: z.string(),
  MONGODB_PASSWORD: z.string(),
  MONGODB_HOST: z.string(),
  MONGODB_APP_NAME: z.string().default("Cluster0"),
  MONGODB_DB: z.string().default("meridian_db"),

  // Splunk REST
  SPLUNK_BASE_URL: z.string().url(),
  SPLUNK_USERNAME: z.string().default("admin"),
  /** Optional. Doctor uses Secret Manager fallback if not in env. */
  SPLUNK_ADMIN_PASSWORD: z.string().optional(),

  // Splunk HEC
  SPLUNK_HEC_URL: z.string().url(),
  SPLUNK_HEC_TOKEN: z.string(),
  SPLUNK_HEC_INDEX: z.string().default("main"),

  // Embedding
  EMBED_BACKEND: z.enum(["local", "gemini"]).default("local"),
  EMBED_MODEL: z.string().default("nomic-ai/nomic-embed-text-v1.5"),
  EMBED_DIM: z.coerce.number().int().positive().default(768),

  // Gemini — Vertex AI is primary; API key is the fallback for environments without ADC
  GEMINI_BACKEND: z.enum(["vertex", "apikey"]).default("vertex"),
  GEMINI_API_KEY: z.string().optional(),
  /** Default model. gemini-3.1-pro-preview requires VERTEX_LOCATION=global. */
  GEMINI_MODEL: z.string().default("gemini-3.1-pro-preview"),
  /** Vertex AI region. "global" required for Gemini 3.1 Pro; "us-central1" for 2.5 series. */
  VERTEX_LOCATION: z.string().default("global"),
});

export type EnvConfig = z.infer<typeof Schema>;

let cached: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment (check .env.local at repo root):\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Build the URL-encoded MongoDB URI from the parts in env. */
export function mongoUri(env: EnvConfig = getEnv()): string {
  const pw = encodeURIComponent(env.MONGODB_PASSWORD);
  return `mongodb+srv://${env.MONGODB_USER}:${pw}@${env.MONGODB_HOST}/?appName=${env.MONGODB_APP_NAME}`;
}

/** Coerce the Splunk base URL into a `URL` for host/port access. */
export function splunkUrl(env: EnvConfig = getEnv()): URL {
  return new URL(env.SPLUNK_BASE_URL);
}
