import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
// Also try the repo-root .env.local if we're running from a workspace dir
loadEnv({ path: resolve(process.cwd(), "../../.env.local") });

const Schema = z.object({
  SPLUNK_HEC_URL: z.string().url().describe("e.g. https://splunk.example.com:8088/services/collector"),
  SPLUNK_HEC_TOKEN: z.string().min(20),
  SPLUNK_HEC_INDEX: z.string().default("main"),
  SPLUNK_BASE_URL: z.string().url().optional(),
  SPLUNK_USERNAME: z.string().default("admin"),
  GCP_PROJECT: z.string().optional(),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(): Config {
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment (check .env.local):\n${issues}`);
  }
  return parsed.data;
}
