import "server-only";
import { fetchInvestigations } from "./queries";
import { getDb } from "./mongo";
import type { Investigation } from "./types";

interface RawEntityGraphRow {
  uri: string;
  name?: string;
  entity_type?: string;
  relationships?: Array<{ target_uri: string; relation?: string }>;
}

async function fetchEntityGraph(): Promise<RawEntityGraphRow[]> {
  const db = await getDb();
  return (await db
    .collection("entity_graph")
    .find({})
    .toArray()) as unknown as RawEntityGraphRow[];
}

export type EntityCategory = "infrastructure" | "business" | "compliance" | "other";

export interface RiskNode {
  uri: string;
  name: string;
  entity_type: string;
  category: EntityCategory;
  /** Number of investigations that touched this entity (root or blast). */
  heat: number;
  /** Number of investigations where this entity was the root / trigger. */
  is_root_for: number;
  /** Investigation URIs that touched this entity. */
  investigation_uris: string[];
}

export interface RiskEdge {
  from: string;
  to: string;
  /** Number of investigations that link these two entities. */
  weight: number;
}

export interface InvestigationSummary {
  uri: string;
  short_id: string;
  hypothesis_short: string;
  confidence: number;
  severity: Investigation["severity"];
  status: Investigation["status"];
  created_at: string;
}

export interface RiskMapData {
  nodes: RiskNode[];
  edges: RiskEdge[];
  investigations_index: Record<string, InvestigationSummary>;
  total_investigations: number;
  max_heat: number;
  generated_at: string;
}

function nameFromUri(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

function typeFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 2] ?? "entity";
}

function categoryFromUri(uri: string): EntityCategory {
  if (uri.includes("/compliance/")) return "compliance";
  if (uri.includes("/sla/") || uri.includes("/client") || uri.includes("/customer")) return "business";
  if (uri.includes("/entities/")) return "infrastructure";
  return "other";
}

function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return s.length > 140 ? s.slice(0, 137) + "…" : s;
}

export async function fetchRiskMap(): Promise<RiskMapData> {
  const [investigations, graphRows] = await Promise.all([
    fetchInvestigations(100),
    fetchEntityGraph(),
  ]);
  const nodeMap = new Map<string, RiskNode>();
  const edgeMap = new Map<string, RiskEdge>();
  const invIndex: Record<string, InvestigationSummary> = {};

  const ensureNode = (
    uri: string,
    name: string,
    entity_type: string,
    category: EntityCategory,
  ): RiskNode => {
    let n = nodeMap.get(uri);
    if (!n) {
      n = {
        uri,
        name,
        entity_type,
        category,
        heat: 0,
        is_root_for: 0,
        investigation_uris: [],
      };
      nodeMap.set(uri, n);
    }
    return n;
  };

  const ensureEdge = (a: string, b: string) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let e = edgeMap.get(key);
    if (!e) {
      e = { from: a, to: b, weight: 0 };
      edgeMap.set(key, e);
    }
    e.weight += 1;
  };

  const link = (node: RiskNode, invUri: string) => {
    if (!node.investigation_uris.includes(invUri)) {
      node.investigation_uris.push(invUri);
    }
  };

  for (const inv of investigations) {
    invIndex[inv.investigation_uri] = {
      uri: inv.investigation_uri,
      short_id: inv.investigation_uri.split("/").pop() ?? inv.investigation_uri,
      hypothesis_short: firstSentence(inv.root_cause_hypothesis),
      confidence: inv.confidence,
      severity: inv.severity,
      status: inv.status,
      created_at: inv.created_at,
    };

    const rootUri = inv.blast_radius.root_entity_uri;
    if (rootUri) {
      const root = ensureNode(
        rootUri,
        nameFromUri(rootUri),
        typeFromUri(rootUri),
        categoryFromUri(rootUri),
      );
      root.is_root_for += 1;
      root.heat += 1;
      link(root, inv.investigation_uri);
    }

    const cats: Array<{ items: typeof inv.blast_radius.infrastructure; cat: EntityCategory }> = [
      { items: inv.blast_radius.infrastructure, cat: "infrastructure" },
      { items: inv.blast_radius.business, cat: "business" },
      { items: inv.blast_radius.compliance, cat: "compliance" },
    ];
    for (const { items, cat } of cats) {
      for (const e of items) {
        const n = ensureNode(e.uri, e.name, e.entity_type, cat);
        n.heat += 1;
        link(n, inv.investigation_uri);
        if (rootUri) ensureEdge(rootUri, e.uri);
      }
    }
  }

  // Merge entity_graph — adds entities the agent hasn't seen yet (heat stays 0)
  // and adds static dependency edges from the graph.
  for (const row of graphRows) {
    const cat = categoryFromUri(row.uri);
    ensureNode(
      row.uri,
      row.name ?? nameFromUri(row.uri),
      row.entity_type ?? typeFromUri(row.uri),
      cat,
    );
    for (const rel of row.relationships ?? []) {
      const tcat = categoryFromUri(rel.target_uri);
      ensureNode(
        rel.target_uri,
        nameFromUri(rel.target_uri),
        typeFromUri(rel.target_uri),
        tcat,
      );
      ensureEdge(row.uri, rel.target_uri);
    }
  }

  const nodes = Array.from(nodeMap.values()).sort((a, b) => b.heat - a.heat);
  const edges = Array.from(edgeMap.values());
  const max_heat = nodes.reduce((m, n) => Math.max(m, n.heat), 0);

  return {
    nodes,
    edges,
    investigations_index: invIndex,
    total_investigations: investigations.length,
    max_heat,
    generated_at: new Date().toISOString(),
  };
}
