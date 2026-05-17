"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  RiskMapData,
  RiskNode,
  RiskEdge,
  EntityCategory,
  InvestigationSummary,
} from "@/lib/riskmap";
import { EXPLAINERS } from "@/lib/explainers";
import { InfoTip } from "./InfoTip";
import { Pill } from "./atoms";

interface PositionedNode extends RiskNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
}

const W = 1200;
const H = 720;

const CAT_COLOR: Record<EntityCategory, string> = {
  infrastructure: "var(--info)",
  business: "var(--accent)",
  compliance: "var(--warn)",
  other: "var(--fg-3)",
};

const CAT_SOFT: Record<EntityCategory, string> = {
  infrastructure: "var(--info-soft)",
  business: "var(--accent-soft)",
  compliance: "var(--warn-soft)",
  other: "var(--bg-2)",
};

const CAT_LABEL: Record<EntityCategory, string> = {
  infrastructure: "Infrastructure",
  business: "Business",
  compliance: "Compliance",
  other: "Other",
};

const CAT_EXPLAINER: Record<EntityCategory, React.ReactNode> = {
  infrastructure: EXPLAINERS.categoryInfrastructure,
  business: EXPLAINERS.categoryBusiness,
  compliance: EXPLAINERS.categoryCompliance,
  other: <>Entities that don&apos;t fit the standard buckets.</>,
};

function simulate(nodes: RiskNode[], edges: RiskEdge[]): PositionedNode[] {
  const cx = W / 2;
  const cy = H / 2;
  const r0 = Math.min(W, H) / 4;
  const placed: PositionedNode[] = nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, nodes.length);
    return {
      ...n,
      x: cx + Math.cos(angle) * r0,
      y: cy + Math.sin(angle) * r0,
      vx: 0,
      vy: 0,
      fx: 0,
      fy: 0,
    };
  });
  const byUri = new Map(placed.map((n) => [n.uri, n]));

  const iterations = 320;
  const repulsion = 18000;
  const springK = 0.012;
  const springLen = 110;
  const gravityK = 0.012;
  const damping = 0.84;
  const maxStep = 12;

  for (let iter = 0; iter < iterations; iter++) {
    for (const n of placed) { n.fx = 0; n.fy = 0; }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 0.1;
        const d = Math.sqrt(d2);
        const f = repulsion / d2;
        const fx = (f * dx) / d;
        const fy = (f * dy) / d;
        a.fx += fx; a.fy += fy;
        b.fx -= fx; b.fy -= fy;
      }
    }
    for (const e of edges) {
      const a = byUri.get(e.from);
      const b = byUri.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const force = springK * (d - springLen) * Math.min(3, e.weight);
      const fx = (force * dx) / d;
      const fy = (force * dy) / d;
      a.fx += fx; a.fy += fy;
      b.fx -= fx; b.fy -= fy;
    }
    for (const n of placed) {
      n.fx += (cx - n.x) * gravityK;
      n.fy += (cy - n.y) * gravityK;
    }
    for (const n of placed) {
      n.vx = (n.vx + n.fx) * damping;
      n.vy = (n.vy + n.fy) * damping;
      const step = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (step > maxStep) {
        n.vx = (n.vx * maxStep) / step;
        n.vy = (n.vy * maxStep) / step;
      }
      n.x += n.vx;
      n.y += n.vy;
      const m = 32;
      if (n.x < m) n.x = m;
      if (n.x > W - m) n.x = W - m;
      if (n.y < m) n.y = m;
      if (n.y > H - m) n.y = H - m;
    }
  }
  return placed;
}

function nodeRadius(heat: number, maxHeat: number): number {
  if (maxHeat <= 0) return 9;
  const t = heat / maxHeat;
  return 8 + t * 12;
}

type Lens = "category" | "compliance";

const COMPLIANCE_COLORS: Record<string, string> = {
  "pci-dss": "#d65454",
  "soc2": "#5095d6",
  "gdpr": "#9b59b6",
  "hipaa": "#e8a93a",
  "iso27001": "#3fb87f",
};

const COMPLIANCE_PATTERNS: Array<{ uri_match: RegExp; framework: string; label: string }> = [
  { uri_match: /pci-dss|payment|card/i, framework: "pci-dss", label: "PCI-DSS" },
  { uri_match: /soc2|soc-2|incident-report/i, framework: "soc2", label: "SOC 2" },
  { uri_match: /gdpr|breach|privacy/i, framework: "gdpr", label: "GDPR" },
  { uri_match: /hipaa|phi/i, framework: "hipaa", label: "HIPAA" },
  { uri_match: /iso27001|iso-27001/i, framework: "iso27001", label: "ISO 27001" },
];

function classifyCompliance(uri: string, name: string): string | null {
  const haystack = `${uri} ${name}`.toLowerCase();
  for (const p of COMPLIANCE_PATTERNS) {
    if (p.uri_match.test(haystack)) return p.framework;
  }
  return null;
}

export function RiskMap({ data }: { data: RiskMapData }) {
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lens, setLens] = useState<Lens>("category");
  const [enabled, setEnabled] = useState<Record<EntityCategory, boolean>>({
    infrastructure: true,
    business: true,
    compliance: true,
    other: true,
  });

  // The force-directed simulation accumulates ~320 iterations of floating-point
  // ops whose ULP-level results differ between server-render and hydration
  // (different V8 build, different SIMD path). Defer the layout to after mount
  // so the server renders an empty SVG canvas and the client computes once.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const positioned = useMemo(
    () => (mounted ? simulate(data.nodes, data.edges) : []),
    [data, mounted],
  );
  const byUri = useMemo(() => new Map(positioned.map((n) => [n.uri, n])), [positioned]);

  // Compliance lens: BFS from each compliance entity, assigning each reachable
  // node to its nearest framework. Computed once per data prop.
  const frameworkByUri = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const e of data.edges) {
      if (!adj.has(e.from)) adj.set(e.from, new Set());
      if (!adj.has(e.to)) adj.set(e.to, new Set());
      adj.get(e.from)!.add(e.to);
      adj.get(e.to)!.add(e.from);
    }
    const assignment = new Map<string, { framework: string; distance: number }>();
    const seeds: Array<{ uri: string; framework: string }> = [];
    for (const n of data.nodes) {
      if (n.category !== "compliance") continue;
      const fw = classifyCompliance(n.uri, n.name);
      if (fw) seeds.push({ uri: n.uri, framework: fw });
    }
    for (const seed of seeds) {
      const visited = new Map([[seed.uri, 0]]);
      const queue = [[seed.uri, 0] as [string, number]];
      while (queue.length) {
        const [u, d] = queue.shift()!;
        const prev = assignment.get(u);
        if (!prev || d < prev.distance) {
          assignment.set(u, { framework: seed.framework, distance: d });
        }
        if (d >= 3) continue;
        for (const n of adj.get(u) ?? []) {
          if (visited.has(n)) continue;
          visited.set(n, d + 1);
          queue.push([n, d + 1]);
        }
      }
    }
    return assignment;
  }, [data]);

  const visibleNodes = positioned.filter((n) => enabled[n.category]);
  const visibleSet = new Set(visibleNodes.map((n) => n.uri));
  const visibleEdges = data.edges.filter((e) => visibleSet.has(e.from) && visibleSet.has(e.to));

  const colorForNode = (n: RiskNode): string => {
    if (lens === "compliance") {
      const a = frameworkByUri.get(n.uri);
      if (a) return COMPLIANCE_COLORS[a.framework] ?? "var(--fg-3)";
      return "var(--fg-4)";
    }
    return CAT_COLOR[n.category];
  };

  // The active node (selected wins over hover)
  const focusUri = selected ?? hover;
  const focus = focusUri ? byUri.get(focusUri) ?? null : null;

  // For highlighting: edges connected to focused node
  const focusEdges = useMemo(() => {
    if (!focusUri) return new Set<string>();
    const s = new Set<string>();
    for (const e of data.edges) {
      if (e.from === focusUri || e.to === focusUri) {
        s.add(`${e.from}__${e.to}`);
      }
    }
    return s;
  }, [focusUri, data.edges]);

  // Connected entity URIs to the selected node
  const connectedUris = useMemo(() => {
    if (!selected) return new Set<string>();
    const s = new Set<string>();
    for (const e of data.edges) {
      if (e.from === selected) s.add(e.to);
      else if (e.to === selected) s.add(e.from);
    }
    return s;
  }, [selected, data.edges]);

  const topByCategory = useMemo(() => {
    const result: Record<EntityCategory, RiskNode[]> = {
      infrastructure: [], business: [], compliance: [], other: [],
    };
    for (const n of data.nodes) result[n.category].push(n);
    return result;
  }, [data.nodes]);

  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 340px",
        minHeight: 0,
        background: "var(--bg-0)",
      }}
    >
      {/* Graph column */}
      <section style={{ display: "flex", flexDirection: "column", minHeight: 0, padding: "18px 20px 24px" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div>
            <div className="overline-accent" style={{ fontSize: 10, marginBottom: 2, display: "inline-flex", alignItems: "center" }}>
              Risk Map
              <InfoTip term="Risk Map" width={340}>{EXPLAINERS.riskGraph}</InfoTip>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-0)", letterSpacing: -0.1 }}>
              {data.nodes.length} entit{data.nodes.length === 1 ? "y" : "ies"} ·{" "}
              <span className="mono" style={{ color: "var(--fg-2)" }}>
                {data.edges.length} dependenc{data.edges.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2, display: "inline-flex", alignItems: "center" }}>
              Heat overlay reflects investigations across the agent&apos;s casebook.
              <InfoTip term="Heat overlay" width={320}>{EXPLAINERS.riskMapHeat}</InfoTip>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <LensToggle lens={lens} onChange={setLens} />
          {lens === "category" && (
            <CategoryToggles enabled={enabled} onToggle={(c) => setEnabled((e) => ({ ...e, [c]: !e[c] }))} />
          )}
          {lens === "compliance" && <ComplianceLegend />}
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: "var(--bg-1)",
            border: "1px solid var(--bd-1)",
            borderRadius: 6,
            position: "relative",
            overflow: "hidden",
          }}
          onClick={(e) => {
            // Click on empty graph background → clear selection
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "100%", display: "block" }}
            onClick={(e) => {
              // Click on SVG background (not a node) → clear selection
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <defs>
              <pattern id="rm-grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="var(--bd-1)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#rm-grid)" opacity="0.25" />

            {/* Edges */}
            {visibleEdges.map((e) => {
              const a = byUri.get(e.from);
              const b = byUri.get(e.to);
              if (!a || !b) return null;
              const isFocus = focusEdges.has(`${e.from}__${e.to}`);
              return (
                <line
                  key={`${e.from}__${e.to}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={isFocus ? "var(--accent)" : "var(--bd-2)"}
                  strokeWidth={isFocus ? Math.max(1.5, 1 + Math.log2(1 + e.weight)) : 1}
                  opacity={isFocus ? 0.95 : selected ? 0.18 : 0.45}
                />
              );
            })}

            {/* Nodes */}
            {visibleNodes.map((n) => {
              const r = nodeRadius(n.heat, data.max_heat);
              const isSelected = selected === n.uri;
              const isHover = hover === n.uri;
              const isConnected = selected && connectedUris.has(n.uri);
              const dim = selected && !isSelected && !isConnected;
              const color = colorForNode(n);
              return (
                <g
                  key={n.uri}
                  transform={`translate(${n.x},${n.y})`}
                  onMouseEnter={() => setHover(n.uri)}
                  onMouseLeave={() => setHover((h) => (h === n.uri ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected((s) => (s === n.uri ? null : n.uri));
                  }}
                  style={{ cursor: "pointer", opacity: dim ? 0.35 : 1, transition: "opacity 150ms" }}
                >
                  {(isSelected || n.is_root_for > 0) && (
                    <circle
                      r={r + (isSelected ? 7 : 4)}
                      fill="none"
                      stroke={isSelected ? "var(--accent)" : color}
                      strokeWidth={isSelected ? 2 : 1}
                      opacity={isSelected ? 1 : 0.45}
                    />
                  )}
                  <circle
                    r={r}
                    fill={color}
                    fillOpacity={n.heat > 0 ? 0.95 : 0.55}
                    stroke="var(--bg-1)"
                    strokeWidth={2}
                  />
                  {isHover && !isSelected && (
                    <circle r={r + 2} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7} />
                  )}
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="Inter, sans-serif"
                    fontWeight={isSelected || isHover ? 600 : 500}
                    fill="var(--fg-0)"
                  >
                    {n.name.length > 22 ? n.name.slice(0, 19) + "…" : n.name}
                  </text>
                  <text
                    y={r + 26}
                    textAnchor="middle"
                    fontSize={9}
                    fontFamily="IBM Plex Mono, monospace"
                    fill="var(--fg-3)"
                  >
                    {n.entity_type}{n.heat > 0 ? ` · ${n.heat}×` : ""}
                  </text>
                  <title>{`${n.name}\n${n.entity_type}\nCategory: ${CAT_LABEL[n.category]}\nTouched by ${n.heat} investigation${n.heat === 1 ? "" : "s"}${n.is_root_for > 0 ? `\nRoot of ${n.is_root_for}` : ""}`}</title>
                </g>
              );
            })}
          </svg>

          {/* Hover preview (when nothing is selected) */}
          {!selected && focus && hover === focus.uri && <NodeHoverCard node={focus} />}

          {/* Selection hint */}
          {!selected && (
            <div
              style={{
                position: "absolute",
                right: 16,
                bottom: 16,
                padding: "6px 10px",
                background: "var(--bg-2)",
                border: "1px solid var(--bd-1)",
                borderRadius: 3,
                fontSize: 10.5,
                color: "var(--fg-3)",
                fontFamily: "var(--font-mono, monospace)",
              }}
              className="mono"
            >
              click any node to inspect
            </div>
          )}
        </div>
      </section>

      {/* Sidebar — Inspector OR Category list */}
      <aside
        style={{
          borderLeft: "1px solid var(--bd-1)",
          background: "var(--bg-1)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {selected && focus ? (
          <Inspector
            node={focus}
            allByUri={byUri}
            investigationsIndex={data.investigations_index}
            connectedUris={connectedUris}
            onSelectEntity={(uri) => setSelected(uri)}
            onClose={() => setSelected(null)}
          />
        ) : (
          <CategoryList
            topByCategory={topByCategory}
            onHover={setHover}
            onSelect={(uri) => setSelected(uri)}
            hover={hover}
          />
        )}
      </aside>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Inspector                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function Inspector({
  node,
  allByUri,
  investigationsIndex,
  connectedUris,
  onSelectEntity,
  onClose,
}: {
  node: RiskNode;
  allByUri: Map<string, RiskNode>;
  investigationsIndex: Record<string, InvestigationSummary>;
  connectedUris: Set<string>;
  onSelectEntity: (uri: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const color = CAT_COLOR[node.category];
  const soft = CAT_SOFT[node.category];
  const investigations = node.investigation_uris
    .map((u) => investigationsIndex[u])
    .filter((x): x is InvestigationSummary => !!x)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const connected = Array.from(connectedUris)
    .map((u) => allByUri.get(u))
    .filter((x): x is RiskNode => !!x)
    .sort((a, b) => b.heat - a.heat);

  const sevColor = (s: InvestigationSummary["severity"]) =>
    s === "critical" ? "var(--crit)" : s === "high" ? "var(--accent)" : s === "medium" ? "var(--info)" : "var(--fg-3)";

  return (
    <>
      {/* Header */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div className="overline-accent" style={{ flex: 1, fontSize: 10 }}>Inspector</div>
          <button
            onClick={onClose}
            aria-label="Close inspector"
            style={{
              width: 22, height: 22, borderRadius: 11,
              border: "1px solid var(--bd-2)",
              background: "transparent",
              color: "var(--fg-2)",
              cursor: "pointer",
              fontSize: 12, lineHeight: 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "2px 8px",
              fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
              textTransform: "uppercase", color, background: soft,
              border: `1px solid ${color}55`,
              borderRadius: 3,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 4, background: color }} />
            {CAT_LABEL[node.category]}
          </span>
          {node.is_root_for > 0 && (
            <span
              className="mono"
              style={{
                fontSize: 9.5, color: "var(--accent)",
                padding: "1px 6px", border: "1px solid var(--accent-bd)",
                background: "var(--accent-soft)", borderRadius: 3,
                letterSpacing: 0.3, textTransform: "uppercase",
              }}
            >
              Root of {node.is_root_for}
            </span>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-0)", letterSpacing: -0.1, lineHeight: 1.25 }}>
          {node.name}
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)", marginTop: 2 }}>
          {node.entity_type}
        </div>
        <div
          className="mono"
          style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 6, wordBreak: "break-all" }}
          title={node.uri}
        >
          {node.uri}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--bd-1)" }}>
        <StatCell k="Touched by" v={`${node.heat}×`} sub={`investigation${node.heat === 1 ? "" : "s"}`} />
        <StatCell k="Root for" v={node.is_root_for.toString()} sub="trigger events" last />
      </div>

      {/* Body */}
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 14px 18px" }}>
        <SectionHeading term="investigations" text={`Investigations · ${investigations.length}`}>
          {EXPLAINERS.inspectorInvestigations}
        </SectionHeading>
        {investigations.length === 0 ? (
          <EmptyBlock>No investigations recorded for this entity.</EmptyBlock>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
            {investigations.map((inv) => (
              <button
                key={inv.uri}
                onClick={() => router.push(`/app/incidents?id=${encodeURIComponent(inv.uri)}`)}
                className="inspector-row"
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--bd-1)",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "var(--fg-0)",
                  display: "grid",
                  gap: 5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: sevColor(inv.severity),
                    }}
                  />
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--accent)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.short_id}
                  </span>
                  <Pill color="accent" mono>{Math.round(inv.confidence * 100)}%</Pill>
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.45 }}>
                  {inv.hypothesis_short}
                </div>
                <div style={{ fontSize: 10, color: "var(--fg-3)", display: "flex", gap: 8, marginTop: 1 }}>
                  <span style={{ color: sevColor(inv.severity), textTransform: "capitalize", fontWeight: 600 }}>
                    {inv.severity}
                  </span>
                  <span style={{ color: "var(--fg-4)" }}>·</span>
                  <span style={{ textTransform: "capitalize" }}>{inv.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <SectionHeading term="connections" text={`Connected to · ${connected.length}`}>
          {EXPLAINERS.inspectorConnections}
        </SectionHeading>
        {connected.length === 0 ? (
          <EmptyBlock>No links to other entities in the casebook.</EmptyBlock>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 22 }}>
            {connected.map((c) => (
              <button
                key={c.uri}
                onClick={() => onSelectEntity(c.uri)}
                className="inspector-row"
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  background: "transparent",
                  border: "1px solid var(--bd-1)",
                  borderRadius: 3,
                  cursor: "pointer",
                  color: "var(--fg-0)",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 4, background: CAT_COLOR[c.category] }} />
                <span style={{ minWidth: 0, overflow: "hidden" }}>
                  <span style={{ fontSize: 12, color: "var(--fg-0)" }}>{c.name}</span>
                  <span className="mono" style={{ display: "block", fontSize: 10, color: "var(--fg-3)" }}>
                    {c.entity_type}
                  </span>
                </span>
                {c.heat > 0 && (
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-2)" }}>{c.heat}×</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--bd-1)",
          background: "var(--bg-2)",
        }}
      >
        <button
          onClick={() => router.push(`/app/incidents?entity=${encodeURIComponent(node.uri)}`)}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "var(--accent)",
            color: "var(--accent-text)",
            border: "none",
            borderRadius: 4,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: 0.1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          Open in Incidents
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 6h6M6.5 3.5L9 6L6.5 8.5" />
          </svg>
        </button>
      </div>
    </>
  );
}

function StatCell({
  k,
  v,
  sub,
  last,
}: { k: string; v: string; sub: string; last?: boolean }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRight: last ? "none" : "1px solid var(--bd-1)",
      }}
    >
      <div className="overline" style={{ fontSize: 9, marginBottom: 4 }}>{k}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--fg-0)", lineHeight: 1, letterSpacing: -0.3 }}>
        {v}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--fg-2)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function SectionHeading({ term, text, children }: { term: string; text: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginBottom: 8,
        fontSize: 10, fontWeight: 600, letterSpacing: 0.16, textTransform: "uppercase",
        color: "var(--fg-2)",
      }}
    >
      {text}
      <InfoTip term={term} width={300}>{children}</InfoTip>
    </div>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        marginBottom: 22,
        fontSize: 11.5,
        color: "var(--fg-3)",
        background: "var(--bg-2)",
        border: "1px dashed var(--bd-2)",
        borderRadius: 4,
      }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Category list (default sidebar when nothing selected)                      */
/* ────────────────────────────────────────────────────────────────────────── */

function CategoryList({
  topByCategory,
  onHover,
  onSelect,
  hover,
}: {
  topByCategory: Record<EntityCategory, RiskNode[]>;
  onHover: (uri: string | null) => void;
  onSelect: (uri: string) => void;
  hover: string | null;
}) {
  return (
    <>
      <header style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd-1)" }}>
        <div className="overline-accent" style={{ marginBottom: 3, display: "inline-flex", alignItems: "center" }}>
          Environment
          <InfoTip term="Environment" width={320}>{EXPLAINERS.riskMapEnvironment}</InfoTip>
        </div>
        <div style={{ fontSize: 13, color: "var(--fg-0)", fontWeight: 600 }}>
          Entities by category
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 3 }}>
          Click any row to open the inspector.
        </div>
      </header>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 14px 20px" }}>
        {(["infrastructure", "business", "compliance", "other"] as EntityCategory[]).map((cat) => {
          const items = topByCategory[cat];
          if (items.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginBottom: 8, paddingBottom: 6,
                  borderBottom: "1px solid var(--bd-1)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 4, background: CAT_COLOR[cat] }} />
                <span className="overline" style={{ fontSize: 9.5, color: "var(--fg-1)", flex: 1, fontWeight: 600, display: "inline-flex", alignItems: "center" }}>
                  {CAT_LABEL[cat]}
                  <InfoTip term={CAT_LABEL[cat]} width={300}>{CAT_EXPLAINER[cat]}</InfoTip>
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)" }}>{items.length}</span>
              </div>
              {items.map((n) => (
                <button
                  key={n.uri}
                  onClick={() => onSelect(n.uri)}
                  onMouseEnter={() => onHover(n.uri)}
                  onMouseLeave={() => onHover(null)}
                  className="riskmap-sidebar-row"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    padding: "6px 8px",
                    background: hover === n.uri ? "var(--bg-3)" : "transparent",
                    border: "1px solid transparent",
                    borderRadius: 3,
                    cursor: "pointer",
                    color: "var(--fg-0)",
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 12, color: "var(--fg-0)" }}>{n.name}</span>
                    <span className="mono" style={{ display: "block", fontSize: 10, color: "var(--fg-3)", marginTop: 1 }}>
                      {n.entity_type}
                    </span>
                  </span>
                  {n.heat > 0 && (
                    <span
                      className="mono"
                      style={{
                        alignSelf: "center", fontSize: 10.5, fontWeight: 600,
                        color: CAT_COLOR[cat],
                        padding: "1px 6px",
                        background: CAT_SOFT[cat],
                        border: `1px solid ${CAT_COLOR[cat]}55`,
                        borderRadius: 9,
                      }}
                    >
                      {n.heat}×
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function LensToggle({ lens, onChange }: { lens: Lens; onChange: (l: Lens) => void }) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        background: "var(--bg-1)",
        border: "1px solid var(--bd-1)",
        borderRadius: 4,
      }}
    >
      {(["category", "compliance"] as Lens[]).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          style={{
            padding: "5px 11px",
            background: lens === l ? "var(--bg-3)" : "transparent",
            color: lens === l ? "var(--fg-0)" : "var(--fg-2)",
            border: "none",
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.2,
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {l === "category" ? "Category" : "Compliance"}
        </button>
      ))}
    </div>
  );
}

function ComplianceLegend() {
  const items: Array<{ key: string; label: string }> = [
    { key: "pci-dss", label: "PCI-DSS" },
    { key: "soc2", label: "SOC 2" },
    { key: "gdpr", label: "GDPR" },
    { key: "hipaa", label: "HIPAA" },
    { key: "iso27001", label: "ISO 27001" },
  ];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {items.map((it) => (
        <span
          key={it.key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 9px",
            fontSize: 10.5,
            color: "var(--fg-1)",
            background: "var(--bg-2)",
            border: "1px solid var(--bd-1)",
            borderRadius: 3,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 4, background: COMPLIANCE_COLORS[it.key] }} />
          {it.label}
        </span>
      ))}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 9px",
          fontSize: 10.5,
          color: "var(--fg-3)",
          background: "var(--bg-2)",
          border: "1px solid var(--bd-1)",
          borderRadius: 3,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--fg-4)" }} />
        Uncovered
      </span>
    </div>
  );
}

function CategoryToggles({
  enabled, onToggle,
}: {
  enabled: Record<EntityCategory, boolean>;
  onToggle: (c: EntityCategory) => void;
}) {
  const cats: EntityCategory[] = ["infrastructure", "business", "compliance"];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {cats.map((c) => (
        <button
          key={c}
          onClick={() => onToggle(c)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px",
            background: enabled[c] ? "var(--bg-2)" : "transparent",
            border: `1px solid ${enabled[c] ? "var(--bd-2)" : "var(--bd-1)"}`,
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 11,
            color: enabled[c] ? "var(--fg-0)" : "var(--fg-3)",
            fontWeight: 500,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 4, background: enabled[c] ? CAT_COLOR[c] : "var(--bd-2)" }} />
          {CAT_LABEL[c]}
        </button>
      ))}
    </div>
  );
}

function NodeHoverCard({ node }: { node: PositionedNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 16, bottom: 16,
        padding: "10px 12px",
        background: "var(--bg-1)",
        border: "1px solid var(--bd-2)",
        borderRadius: 4,
        boxShadow: "var(--shadow-2)",
        fontSize: 12,
        maxWidth: 320,
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 5, background: CAT_COLOR[node.category] }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)" }}>{node.name}</span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--fg-3)", marginBottom: 4 }}>
        {node.entity_type} · {CAT_LABEL[node.category]}
      </div>
      <div style={{ fontSize: 11, color: "var(--fg-1)" }}>
        Touched by <span className="mono" style={{ color: "var(--fg-0)", fontWeight: 600 }}>{node.heat}</span> investigation{node.heat === 1 ? "" : "s"}
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--accent)" }}>Click to inspect →</div>
    </div>
  );
}
