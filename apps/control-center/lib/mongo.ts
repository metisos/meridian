import "server-only";
import { MongoClient, type Db } from "mongodb";
import { mongoUri, env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __meridianMongo: { client: MongoClient | null; promise: Promise<MongoClient> | null } | undefined;
}

function cache() {
  if (!globalThis.__meridianMongo) {
    globalThis.__meridianMongo = { client: null, promise: null };
  }
  return globalThis.__meridianMongo;
}

export async function getMongo(): Promise<MongoClient> {
  const c = cache();
  if (c.client) return c.client;
  if (!c.promise) {
    c.promise = new MongoClient(mongoUri(), { serverSelectionTimeoutMS: 8000 })
      .connect()
      .then((client) => { c.client = client; return client; });
  }
  return c.promise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongo();
  return client.db(env.MONGODB_DB);
}
