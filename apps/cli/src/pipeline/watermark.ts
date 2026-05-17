/**
 * Ingest watermark — stored as a single document in MongoDB so the CLI is
 * stateless on the workstation. Re-running `meridian ingest run` picks up
 * where the previous run left off.
 *
 * Document model:
 *   { _id: "ingest:<index>", last_indextime_iso: "2026-05-20T14:05:30.000Z" }
 */

import type { Db } from "mongodb";

const COLLECTION = "watermarks";

export interface Watermark {
  _id: string;
  last_indextime_iso: string;
}

function key(index: string): string {
  return `ingest:${index}`;
}

export async function getWatermark(db: Db, index: string): Promise<string | null> {
  const w = await db.collection<Watermark>(COLLECTION).findOne({ _id: key(index) });
  return w?.last_indextime_iso ?? null;
}

export async function setWatermark(db: Db, index: string, isoTime: string): Promise<void> {
  await db
    .collection<Watermark>(COLLECTION)
    .updateOne({ _id: key(index) }, { $set: { last_indextime_iso: isoTime } }, { upsert: true });
}

export async function resetWatermark(db: Db, index: string): Promise<void> {
  await db.collection<Watermark>(COLLECTION).deleteOne({ _id: key(index) });
}
