/**
 * Shared MongoDB connection helper. Connects on first call, reuses thereafter.
 * Always URL-encodes the password (the bug we hit at the start of Phase A).
 */

import { MongoClient } from "mongodb";
import { getEnv, mongoUri } from "./env.js";

let cached: MongoClient | null = null;

export async function getMongo(): Promise<MongoClient> {
  if (cached) return cached;
  const client = new MongoClient(mongoUri(getEnv()), { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  cached = client;
  return client;
}

export async function closeMongo(): Promise<void> {
  if (!cached) return;
  await cached.close();
  cached = null;
}
