/**
 * ContextSync URI parsing and pattern matching — spec §1.
 *
 *   ctx://{org}/{domain}/{id}
 *
 * - `org` is a single path segment
 * - `domain` is a single path segment
 * - `id` may contain additional `/` path segments
 *
 * Patterns extend URIs with glob wildcards:
 *   - `*`  matches any chars within a single path segment (excludes `/`)
 *   - `**` matches any chars including `/`
 *   - bare `*` matches everything
 */

const URI_RE = /^ctx:\/\/([^/]+)\/([^/]+)(?:\/(.+))?$/;

export interface ParsedCtxURI {
  org: string;
  domain: string;
  /** May be undefined if the URI ends after the domain (rare, but representable). */
  id?: string;
}

export function parseCtxURI(uri: string): ParsedCtxURI {
  const m = URI_RE.exec(uri);
  if (!m) throw new Error(`Invalid ctx:// URI: ${uri}`);
  return { org: m[1]!, domain: m[2]!, id: m[3] };
}

export function buildCtxURI(parts: ParsedCtxURI): string {
  if (!parts.org || !parts.domain) {
    throw new Error("buildCtxURI requires org and domain");
  }
  if (parts.org.includes("/") || parts.domain.includes("/")) {
    throw new Error("org and domain must be single path segments");
  }
  return parts.id
    ? `ctx://${parts.org}/${parts.domain}/${parts.id}`
    : `ctx://${parts.org}/${parts.domain}`;
}

/**
 * Compile a glob pattern (spec §1) into a regex.
 *
 *   `*` -> [^/]*     (single segment)
 *   `**` -> .*       (multi-segment)
 *
 * Other regex metacharacters are escaped literally.
 */
export function compilePattern(pattern: string): RegExp {
  if (pattern === "*") return /.*/;

  let regex = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*" && pattern[i + 1] === "*") {
      regex += ".*";
      i += 2;
    } else if (ch === "*") {
      regex += "[^/]*";
      i += 1;
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      regex += "\\" + ch;
      i += 1;
    } else {
      regex += ch;
      i += 1;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

export function matchPattern(uri: string, pattern: string): boolean {
  return compilePattern(pattern).test(uri);
}
