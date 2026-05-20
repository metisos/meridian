# Meridian — Architecture Diagram

> Context-aware incident intelligence on the MetisOS protocol stack.
> **State and compute, decoupled.**

---

## High-level tiers

```mermaid
flowchart TB
  subgraph SURFACE["🖥️  Surface — apps/control-center"]
    UI["Next.js 16 · React 19 · Server Components<br/>Lobby · Overview · Agent · Incidents · Risk Map · Casebook · Sources"]
  end

  subgraph COMPUTE["🧠  Compute — packages/agent"]
    INV["investigate(eventUri)<br/>canonical 7-step procedure"]
    LOOP["AgenticLoop<br/>search_tools · list_tools · call_tool"]
    GEM["Gemini 3.1 Pro Preview<br/>Vertex AI · location: global"]
  end

  subgraph STATE["🗄️  State — MongoDB Atlas"]
    ART["artifacts<br/>(ContextSync, content-addressed)"]
    MEM["agent_memory<br/>(investigations / casebook)"]
    PRV["provenance<br/>(append-only audit log)"]
    EGR["entity_graph"]
    VEC["Atlas Vector Search<br/>768-d cosine · nomic v1.5"]
  end

  subgraph PROTOCOL["📜  Protocol — packages/contextsync + packages/usc"]
    CS["ContextSyncClient<br/>URIs · versioning · provenance"]
    USC["USC tuple + cross-tier match<br/>C(p,Q) = exp(-d_s²/...) · exp(-d_t²/...)"]
  end

  subgraph INTEGRATION["🔌  Integration — MCP servers"]
    SPLUNK["Splunk MCP Server<br/>(Splunkbase 7931, HTTPS)"]
    MONGOMCP["MongoDB MCP Server<br/>(v1.10, stdio)"]
  end

  UI -->|"Server-side Mongo queries (lib/queries.ts)"| STATE
  UI -->|"SSE chat · /api/chat · /api/replay"| COMPUTE
  COMPUTE --> CS
  COMPUTE --> USC
  COMPUTE -->|"native MCP tool-use"| SPLUNK
  COMPUTE -->|"native MCP tool-use"| MONGOMCP
  CS --> STATE
  USC --> STATE
  MONGOMCP --> STATE
  SPLUNK <-->|"SPL search · alerts · indexes"| SPLUNK_ENT[("Splunk Enterprise 10.2<br/>on GCE")]

  classDef surface fill:#1d2230,stroke:#3ecf8e,color:#e8efe9
  classDef compute fill:#1d2230,stroke:#5cdba8,color:#e8efe9
  classDef state   fill:#1d2230,stroke:#3ecf8e,color:#e8efe9
  classDef protocol fill:#1d2230,stroke:#3ecf8e,color:#e8efe9
  classDef edge    fill:#0f1318,stroke:#3ecf8e,color:#e8efe9
  class SURFACE,UI surface
  class COMPUTE,INV,LOOP,GEM compute
  class STATE,ART,MEM,PRV,EGR,VEC state
  class PROTOCOL,CS,USC protocol
  class INTEGRATION,SPLUNK,MONGOMCP,SPLUNK_ENT edge
```

---

## End-to-end flow — detection → narrative

```mermaid
sequenceDiagram
  participant Splunk as Splunk Enterprise
  participant Splunkbase as Splunk MCP (7931)
  participant Ingest as Ingest worker
  participant CS as ContextSyncClient
  participant Mongo as MongoDB Atlas
  participant Embed as Embedding worker<br/>(nomic-embed-text-v1.5)
  participant Agent as Gemini 3.1 Pro agent
  participant CC as Control Center

  Splunk->>Splunkbase: Detection fires (SPL alert)
  Splunkbase-->>Ingest: Tool result (raw event)
  Ingest->>CS: createArtifact(event)
  CS->>CS: Stamp USC tuple<br/>(s, t, σ_s, σ_t, r_s, r_t, ctx://...)
  CS->>Mongo: insert artifact + provenance entry
  Mongo->>Embed: change-stream / worker tick
  Embed->>Mongo: write 768-d vector to artifact

  Note over Agent: User opens incident OR new detection arrives
  CC->>Agent: investigate(eventUri)
  Agent->>Mongo: vector + text retrieval (RRF fused)
  Agent->>Splunkbase: SPL queries via MCP tool-use
  Agent->>Mongo: entity-graph traversal (blast radius)
  Agent->>Agent: 7-step investigate() loop
  Agent->>Mongo: persist investigation to agent_memory
  Agent->>Mongo: append provenance entry (fire-and-forget)
  Agent-->>CC: SSE-streamed narrative + ctx:// citations
  CC->>Mongo: query for render (Server Components, no REST)
```

---

## The seven-step `investigate()` procedure

```mermaid
flowchart LR
  S0["0 · Hydrate seed<br/>fetch artifact by ctx:// URI"] --> S1["1 · Retrieve<br/>hybrid: $vectorSearch + $text, RRF k=60"]
  S1 --> S2["2 · Causal chain<br/>order by USC time + entity links"]
  S2 --> S3["3 · Blast radius<br/>traverse entity_graph<br/>(user → host → service → data)"]
  S3 --> S4["4 · Root cause<br/>hypothesize, score, justify"]
  S4 --> S5["5 · Rank actions<br/>severity · scope · reversibility"]
  S5 --> S6["6 · Compose narrative<br/>cite every claim by ctx:// URI"]
  S6 --> S7["7 · Persist<br/>write to agent_memory + provenance"]
```

---

## ASCII fallback (renders anywhere)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Surface       apps/control-center  (Next.js 16, React 19, Server   │
│                                       Components, MCP-free)         │
│                                            ↑                         │
│  Compute       packages/agent          investigate()  +              │
│                                        AgenticLoop (meta-tools)      │
│                  ┌─────────────────────┼─────────────────────┐       │
│                  │   GeminiClient      │   MCP clients       │       │
│                  │   (Vertex / API key)│   (mongo, splunk)   │       │
│                  └─────────────────────┴─────────────────────┘       │
│                                            ↕                         │
│  Persistence   MongoDB Atlas   artifacts · agent_memory · provenance │
│                                · entity_graph · actors               │
│                                Vector indexes (768d cosine)          │
│                                            ↕                         │
│  Protocol      packages/contextsync    ContextSyncClient             │
│                packages/usc            USC tuple + cross-tier match  │
│                                            ↕                         │
│  Integration   Splunk MCP (Splunkbase 7931, Splunk Enterprise 10.2)  │
│                MongoDB MCP (mongodb-mcp-server v1.10, stdio)         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Why this shape

- **Surface, compute, state, protocol, integration** are five distinct tiers. Each can evolve without the others. Swap Splunk for Sentinel? Only the integration tier changes. Swap Gemini 3 for the next model? Only the compute tier changes. The contract between tiers is the **ContextSync URI**.

- **Citations aren't free-text strings — they're `ctx://` URIs**. Every claim in the surface dereferences back to a content-addressed artifact in state. This is what makes "every claim is cited" *enforceable*.

- **USC** (Universal Spatiotemporal Coordinates) stamps every artifact with a seven-field tuple `(s, t, σ_s, σ_t, r_s, r_t, frame)`. Cross-tier matching becomes a closed-form Gaussian product, not a heuristic — and Meridian computes it live from stored fields, never synthesizes it.

- **MCP everywhere.** Splunk over Streamable HTTP. MongoDB as a stdio subprocess. Gemini 3 uses native MCP tool-use via `@google/genai`, so the model can reason about its tool surface using meta-tools (`search_tools`, `list_tools`, `call_tool`).
