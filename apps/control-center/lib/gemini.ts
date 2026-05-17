import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __meridianGenai: GoogleGenAI | undefined;
}

export function getGenAI(): GoogleGenAI {
  if (globalThis.__meridianGenai) return globalThis.__meridianGenai;
  if (env.GEMINI_BACKEND === "vertex") {
    globalThis.__meridianGenai = new GoogleGenAI({
      vertexai: true,
      project: env.GCP_PROJECT,
      location: env.VERTEX_LOCATION,
    });
  } else {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY required when GEMINI_BACKEND=apikey");
    globalThis.__meridianGenai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return globalThis.__meridianGenai;
}
