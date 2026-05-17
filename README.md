# Meridian

> **From detection to full investigation. In seconds.**

Meridian is a reasoning agent for the SOC. It ingests detections from Splunk, Sentinel, or CrowdStrike, reconstructs the causal chain, maps blast radius, and ranks response actions — all cited to source events. No hallucinations. No hand-waving. Every claim is traceable.

Built by [Metis Analytics](https://metisos.co) on the MetisOS protocol stack.

## What's in this repo

| Layer | Component |
|---|---|
| **Surface** | `apps/control-center` — Next.js 16 dashboard (Lobby, Overview, Meridian Agent, Incidents, Risk Map, Casebook, Sources, /technical) |
| **Compute** | `packages/agent` — Gemini 3.1 Pro reasoning agent: `investigate()` + agentic loop with MCP meta-tools |
| **Protocol** | `packages/contextsync` — ContextSync Protocol client (versioned, content-addressed artifacts, immutable provenance) |
| **Coordinates** | `packages/usc` — USC seven-field tuple + cross-tier match formula |
| **Persistence** | MongoDB Atlas + Atlas Vector Search (768-d cosine) + MongoDB `$text` BM25 — hybrid retrieval via Reciprocal Rank Fusion |
| **Integration** | Splunk MCP Server (Splunkbase app 7931) — agent executes SPL searches against live Splunk Enterprise |
| **CLI** | `apps/cli` — `meridian` command for ingest / investigate / query / USC match |
| **Synthetic data** | `apps/eventgen` — five incident archetype generators (cascading failure, auth brute-force, privilege escalation, data exfiltration, DDoS surge) |

## What makes it different

- **Source-bound by protocol.** Every claim in every surface carries a `ctx://` URI. The agent's reasoning is auditable, not magic.
- **Real cross-tier math.** USC match scores in the UI are computed live from stored artifact tuples — `C_spatial · C_temporal = C(p,Q)` — not simulated.
- **The agent executes searches.** Connected to a live Splunk Enterprise instance via the Splunk MCP Server. Ask the agent in natural language, it generates SPL, runs it, summarizes the result.
- **Hybrid retrieval, surfaced honestly.** Atlas Vector Search + MongoDB `$text` BM25, fused with RRF (k=60), both raw scores rendered next to the combined rank.
- **Replay the agent loop.** Click "Replay" on any incident to watch the seven-step `investigate()` procedure stream out with per-step durations and evidence summaries.
- **Multimodal input.** The agent reads attached screenshots, PDFs, DOCX, and plain-text files inline.
- **Canvas exports.** Incident reports stream into a Claude-style canvas — copy markdown, download `.md`, render to PDF via the browser's print pipeline, or save as Word `.docx`.

## Getting started

```bash
pnpm install
cp .env.example .env.local
# edit .env.local — see "Environment" section below
pnpm --filter @meridian/control-center dev   # control-center on http://localhost:3001
pnpm --filter @meridian/cli dev -- --help    # CLI subcommands
```

## Environment

Required variables are documented in [`.env.example`](.env.example). The control-center reads from `.env.local` at the repo root. Required for full functionality:

- **MongoDB Atlas** — Cluster credentials. M0 free tier is sufficient for the demo (~60 MB used of 512 MB cap).
- **Gemini / Vertex AI** — Either ADC for Vertex (preferred; `gemini-3.1-pro-preview` at `location: global`) or a Google AI Studio API key fallback.
- **Splunk Enterprise + Splunk MCP Server** — The agent connects via the Splunkbase MCP Server app (7931). You'll need both the Splunk REST endpoint URL and the MCP bearer token from the app's `/mcp_token` endpoint.

For production deployments, secrets bind from GCP Secret Manager rather than `.env.local`.

## Project structure

```
meridian/
├── apps/
│   ├── cli/                 # `meridian` CLI
│   ├── eventgen/            # Synthetic incident archetype generators
│   └── control-center/      # Next.js 16 dashboard
├── packages/
│   ├── shared/              # Cross-package types
│   ├── contextsync/         # ContextSync Protocol client
│   ├── usc/                 # USC tuple + cross-tier match
│   └── agent/               # Reasoning agent (investigate + agentic loop)
└── scripts/
    └── check-public-safety.sh   # Pre-push secret scanner
```

## Releases + deploy

- **Frontend hosting:** Firebase App Hosting (Next.js SSR via Cloud Run, deployed on push to `main` via GitHub Actions).
- **Data:** MongoDB Atlas, hosted.
- **Compute:** Gemini 3.1 Pro via Vertex AI, location `global`. ADC auth on Cloud Run.
- **Detection source:** Splunk Enterprise on GCE, MCP server at `/services/mcp`.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Acknowledgements

Meridian rides on the shoulders of Google Gemini 3.1 Pro, MongoDB Atlas (and the new hybrid-retrieval `$search` / `$vectorSearch` combo), Splunk Enterprise + the Splunk MCP Server, the Model Context Protocol SDK, nomic-embed-text-v1.5 (Apache 2.0), and Next.js 16 + React 19.

Built by Christian Johnson at **Metis Analytics**, Saint Louis, Missouri.
