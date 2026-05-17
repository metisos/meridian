import "server-only";
import mammoth from "mammoth";

export interface IncomingAttachment {
  name: string;
  mime: string;
  /** base64-encoded file content (no data: prefix). */
  data_base64: string;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface PreparedAttachments {
  parts: GeminiPart[];
  /** Short human-readable summary of what was attached — appended to the user text part. */
  prefaceText: string;
}

const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_PER_FILE = 10 * 1024 * 1024;

const GEMINI_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

const GEMINI_PDF_MIME = "application/pdf";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PLAIN_TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/x-log",
]);

function decodeBase64(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

function describe(name: string, mime: string, sizeBytes: number): string {
  const kb = (sizeBytes / 1024).toFixed(1);
  return `${name} (${mime}, ${kb} KB)`;
}

/* Validate and normalize incoming attachments into Gemini-ready parts.
 * Skips items that exceed size limits and emits a prefaceText line per file
 * so the user's message implicitly references each attachment in context. */
export async function prepareAttachments(
  raw: IncomingAttachment[] | undefined,
): Promise<PreparedAttachments> {
  if (!raw || raw.length === 0) return { parts: [], prefaceText: "" };

  const parts: GeminiPart[] = [];
  const descriptions: string[] = [];
  let totalBytes = 0;

  for (const item of raw) {
    const bytes = decodeBase64(item.data_base64);
    if (bytes.byteLength > MAX_PER_FILE) {
      descriptions.push(`${item.name} — skipped (>10MB)`);
      continue;
    }
    if (totalBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
      descriptions.push(`${item.name} — skipped (request budget exceeded)`);
      continue;
    }
    totalBytes += bytes.byteLength;

    const mime = item.mime.toLowerCase();

    if (GEMINI_IMAGE_MIMES.has(mime) || mime === GEMINI_PDF_MIME) {
      // Native inline binary support
      parts.push({
        inlineData: { mimeType: mime, data: item.data_base64 },
      });
      descriptions.push(describe(item.name, mime, bytes.byteLength));
    } else if (mime === DOCX_MIME || item.name.toLowerCase().endsWith(".docx")) {
      // Extract text via mammoth, attach as a text part
      try {
        const result = await mammoth.extractRawText({ buffer: bytes });
        const text = result.value.trim();
        parts.push({
          text: `\n\n--- attached document: ${item.name} ---\n${text}\n--- end of ${item.name} ---\n`,
        });
        descriptions.push(`${item.name} (docx, ${text.length.toLocaleString()} chars extracted)`);
      } catch (e) {
        descriptions.push(`${item.name} — DOCX parse failed: ${(e as Error).message}`);
      }
    } else if (PLAIN_TEXT_MIMES.has(mime) || /\.(txt|md|csv|log|json)$/i.test(item.name)) {
      const text = bytes.toString("utf8");
      parts.push({
        text: `\n\n--- attached file: ${item.name} (${mime}) ---\n${text}\n--- end of ${item.name} ---\n`,
      });
      descriptions.push(describe(item.name, mime, bytes.byteLength));
    } else {
      descriptions.push(`${item.name} — unsupported (${mime})`);
    }
  }

  const prefaceText = descriptions.length
    ? `\n\n[user attached ${descriptions.length} file${descriptions.length === 1 ? "" : "s"}: ${descriptions.join("; ")}]`
    : "";

  return { parts, prefaceText };
}
