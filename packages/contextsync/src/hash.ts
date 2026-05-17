/**
 * Content-addressing for artifacts. SHA-256 of canonical JSON (RFC 8785-ish:
 * recursive sort by key, no whitespace, UTF-8) of the artifact's content +
 * content_type + name. Stored as the `hash` field on each Version.
 */

import { createHash } from "node:crypto";

export function canonicalJSONStringify(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite numbers cannot be canonicalized");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stringify).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value as object).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stringify((value as Record<string, unknown>)[k])}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

export function hashArtifactContent(input: {
  name: string;
  content_type: string;
  content: unknown;
}): string {
  const canonical = canonicalJSONStringify({
    name: input.name,
    content_type: input.content_type,
    content: input.content,
  });
  const hex = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}
