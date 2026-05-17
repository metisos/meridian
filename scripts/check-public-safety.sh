#!/usr/bin/env bash
# Pre-push safety scanner. Refuses exit 0 if any of the following are found
# in files about to be pushed:
#   1. Files matching the excluded-paths allow-list
#   2. Lines matching known secret patterns
#   3. Specific literal secret values pulled from local .env.local (if present)
#
# Usage:
#   scripts/check-public-safety.sh              # scans HEAD vs origin (or all tracked if no remote)
#   scripts/check-public-safety.sh --staged     # scans staged files only
#   scripts/check-public-safety.sh --working    # scans the entire working tree
#
# Exit codes:
#   0 — safe to push
#   1 — at least one finding (printed)
#   2 — invocation error

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

MODE="diff"
if [[ "${1:-}" == "--staged" ]]; then
  MODE="staged"
elif [[ "${1:-}" == "--working" ]]; then
  MODE="working"
elif [[ -n "${1:-}" ]]; then
  echo "Unknown flag: $1" >&2
  echo "Usage: $0 [--staged | --working]" >&2
  exit 2
fi

# ─── Collect candidate files ────────────────────────────────────────────────
if [[ "$MODE" == "staged" ]]; then
  mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
elif [[ "$MODE" == "working" ]]; then
  mapfile -t FILES < <(git ls-files 2>/dev/null && git ls-files --others --exclude-standard 2>/dev/null || true)
else
  # Compare local HEAD against the remote tracking branch if one exists,
  # otherwise fall back to "everything tracked".
  if git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
    UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}')
    mapfile -t FILES < <(git diff --name-only --diff-filter=ACMR "$UPSTREAM"...HEAD 2>/dev/null || true)
  else
    mapfile -t FILES < <(git ls-files 2>/dev/null || true)
  fi
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "✓ No files in scan set ($MODE)"
  exit 0
fi

echo "Scanning ${#FILES[@]} file(s) in mode: $MODE"
echo

# ─── Excluded paths ─────────────────────────────────────────────────────────
EXCLUDED_PATTERNS=(
  '^docs/'
  '^\.rosetta/'
  '^ROSETTA\.md$'
  '^\.aider\.conf\.yml$'
  '^\.claude/'
  '^\.cursor'
  '^\.env$'
  '^\.env\.local$'
  '^\.env\.production$'
  '^\.env\.staging$'
  '^\.env\.development$'
  '^\.env\.local\.[^.]+$'
  '\.key$'
  '\.pem$'
  '\.p12$'
  'service-account.*\.json$'
  'gcp-key.*\.json$'
  '^credentials\.json$'
  '^application_default_credentials\.json$'
  '\.token$'
)

# ─── Generic secret patterns (regex, ERE) ───────────────────────────────────
SECRET_PATTERNS=(
  'MONGODB_PASSWORD\s*=\s*[^[:space:]]'
  'MONGODB_URI\s*=\s*mongodb'
  'SPLUNK_MCP_TOKEN\s*=\s*[A-Za-z0-9+/=.]{20,}'
  'SPLUNK_HEC_TOKEN\s*=\s*[a-f0-9-]{30,}'
  'GEMINI_API_KEY\s*=\s*AIzaSy[A-Za-z0-9_-]{20,}'
  'AIzaSy[A-Za-z0-9_-]{33}'
  'sk-[A-Za-z0-9]{20,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  '"private_key":\s*"-----BEGIN'
  'mongodb\+srv://[^[:space:]:]+:[^[:space:]@]+@'
  # Infrastructure-pointer patterns — never publish these in cleartext.
  # IPv4 dotted-quad except common doc/private ranges and localhost.
  '\b(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\b'
  # Atlas connection host pattern (cluster name + region hash)
  '[a-z0-9]+\.[a-z0-9]{5,}\.mongodb\.net'
)
# Reserved allowlist (unused). Kept as the canonical "do not add real IPs
# here" comment.

# ─── Specific known literals from local .env.local ──────────────────────────
LITERALS=()
if [[ -f .env.local ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    # Strip KEY=
    val="${line#*=}"
    # Skip empties and placeholder-looking values
    [[ -z "$val" || "$val" =~ ^(replace-me|your-|change-me|example) ]] && continue
    # Only treat as a secret if KEY contains PASSWORD, TOKEN, KEY, SECRET, URI
    key="${line%%=*}"
    if [[ "$key" =~ (PASSWORD|TOKEN|SECRET|API_KEY|MCP_TOKEN|HEC_TOKEN|URI)$ ]]; then
      # Skip very short values that would cause too many false positives
      if [[ ${#val} -ge 8 ]]; then
        LITERALS+=("$val")
      fi
    fi
  done < .env.local
fi

# ─── Scan ──────────────────────────────────────────────────────────────────
FAIL=0

printf '%-44s %s\n' "Check" "Status"
printf '%-44s %s\n' "----------------------------------------" "------"

# 1) Excluded paths
hits=()
for f in "${FILES[@]}"; do
  for pat in "${EXCLUDED_PATTERNS[@]}"; do
    if [[ "$f" =~ $pat ]]; then
      hits+=("$f")
      break
    fi
  done
done
if [[ ${#hits[@]} -gt 0 ]]; then
  printf '%-44s \033[31mFAIL\033[0m (%d files)\n' "Excluded paths" "${#hits[@]}"
  for h in "${hits[@]}"; do echo "    └─ $h"; done
  FAIL=1
else
  printf '%-44s \033[32mOK\033[0m\n' "Excluded paths"
fi

# 2) Generic regex secret patterns
#
# Two false-positive guards:
#   a) Skip files whose name signals "placeholder-only" content
#      (.env.example, .env.local.sample, *.template, etc.)
#   b) Skip individual lines containing `${` — those are template-literal
#      interpolations in source code, not real secrets.
SAFE_PLACEHOLDER_FILES='\.(example|sample|template)$|\.local\.sample$|\.env\.example$'

hits=()
for f in "${FILES[@]}"; do
  [[ ! -f "$f" ]] && continue
  if [[ "$f" =~ $SAFE_PLACEHOLDER_FILES ]]; then continue; fi
  if file "$f" 2>/dev/null | grep -q "binary"; then continue; fi
  for pat in "${SECRET_PATTERNS[@]}"; do
    if matches=$(grep -nE "$pat" "$f" 2>/dev/null); then
      while IFS= read -r line; do
        # Skip lines that are clearly template-literal interpolations
        if [[ "$line" == *'${'* ]]; then continue; fi
        # Skip documented private/test IP ranges (RFC 1918, loopback, link-local)
        if [[ "$line" =~ (^|[^0-9])(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|0\.0\.0\.0|255\.255\.255\.255) ]]; then continue; fi
        # Skip obvious doc/example placeholders
        if [[ "$line" =~ (example\.com|splunk\.example|localhost|placeholder) ]]; then continue; fi
        hits+=("$f: $line")
      done <<< "$matches"
    fi
  done
done
if [[ ${#hits[@]} -gt 0 ]]; then
  printf '%-44s \033[31mFAIL\033[0m (%d hits)\n' "Secret patterns" "${#hits[@]}"
  for h in "${hits[@]}"; do echo "    └─ $h"; done
  FAIL=1
else
  printf '%-44s \033[32mOK\033[0m\n' "Secret patterns"
fi

# 3) Literal values from .env.local
if [[ ${#LITERALS[@]} -gt 0 ]]; then
  hits=()
  for f in "${FILES[@]}"; do
    [[ ! -f "$f" ]] && continue
    if file "$f" 2>/dev/null | grep -q "binary"; then continue; fi
    for lit in "${LITERALS[@]}"; do
      if grep -qF -- "$lit" "$f" 2>/dev/null; then
        hits+=("$f contains literal value from .env.local")
      fi
    done
  done
  # dedupe
  if [[ ${#hits[@]} -gt 0 ]]; then
    printf '%-44s \033[31mFAIL\033[0m (%d hits)\n' "Literal env values in tracked files" "${#hits[@]}"
    printf '    └─ %s\n' "${hits[@]}" | sort -u
    FAIL=1
  else
    printf '%-44s \033[32mOK\033[0m\n' "Literal env values (${#LITERALS[@]} checked)"
  fi
else
  printf '%-44s \033[33mSKIP\033[0m (.env.local not present)\n' "Literal env values"
fi

echo
if [[ $FAIL -eq 0 ]]; then
  echo "✓ Safe to push."
  exit 0
else
  echo "✗ One or more checks failed. Fix the findings above before pushing."
  exit 1
fi
