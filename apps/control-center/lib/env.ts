import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

export const env = {
  get MONGODB_USER() { return req("MONGODB_USER"); },
  get MONGODB_PASSWORD() { return req("MONGODB_PASSWORD"); },
  get MONGODB_HOST() { return req("MONGODB_HOST"); },
  get MONGODB_APP_NAME() { return process.env.MONGODB_APP_NAME ?? "Cluster0"; },
  get MONGODB_DB() { return process.env.MONGODB_DB ?? "meridian_db"; },
  get GEMINI_BACKEND() { return (process.env.GEMINI_BACKEND ?? "vertex") as "vertex" | "apikey"; },
  get GEMINI_MODEL() { return process.env.GEMINI_MODEL ?? "gemini-3.1-pro-preview"; },
  /** GCP project ID — falls back to Cloud Run's injected GOOGLE_CLOUD_PROJECT
   *  so we never have to hardcode the project ID in repo config. */
  get GCP_PROJECT() {
    return process.env.GCP_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? req("GCP_PROJECT");
  },
  get VERTEX_LOCATION() { return process.env.VERTEX_LOCATION ?? "global"; },
  get GEMINI_API_KEY() { return process.env.GEMINI_API_KEY ?? ""; },
  get SPLUNK_WEB_URL() { return process.env.SPLUNK_WEB_URL ?? ""; },
  get SPLUNK_BASE_URL() { return process.env.SPLUNK_BASE_URL ?? ""; },
  get SPLUNK_MCP_TOKEN() { return process.env.SPLUNK_MCP_TOKEN ?? ""; },
};

export function mongoUri(): string {
  const pw = encodeURIComponent(env.MONGODB_PASSWORD);
  return `mongodb+srv://${env.MONGODB_USER}:${pw}@${env.MONGODB_HOST}/?appName=${env.MONGODB_APP_NAME}`;
}
