import { heatColor } from './heat.js';

// Muted colours that sit well on the obsidian background and stay apart from each other.
const PALETTE = [
  '#c9a24b',
  '#6d8fb3',
  '#b0304a',
  '#7f9c8a',
  '#b07a42',
  '#8a7fb0',
  '#cdc6b4',
  '#d8b864',
  '#9a6b6b',
  '#5f8a8f',
];
const OVERFLOW_COLOR = '#8f8a7d';

// "folder" colours by group; "heat" colours by god-file score once the health report is loaded.
export function nodeColor(node, { colors, colorMode = 'folder', heat = null }) {
  if (colorMode === 'heat') return heatColor(heat?.get(node.id) ?? 0);
  return colors.get(node.cluster) ?? OVERFLOW_COLOR;
}

// Biggest groups get the first (most distinct) colours. Same repo -> same colours every time.
export function buildClusterColors(nodes) {
  const counts = new Map();
  for (const node of nodes) counts.set(node.cluster, (counts.get(node.cluster) ?? 0) + 1);
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const colors = new Map();
  ordered.forEach(([cluster], i) => {
    colors.set(cluster, i < PALETTE.length ? PALETTE[i] : OVERFLOW_COLOR);
  });
  return colors;
}

export function clusterSummary(nodes, colors) {
  const counts = new Map();
  for (const node of nodes) counts.set(node.cluster, (counts.get(node.cluster) ?? 0) + 1);
  return [...counts.entries()]
    .map(([cluster, count]) => ({ cluster, count, color: colors.get(cluster) }))
    .sort((a, b) => b.count - a.count || a.cluster.localeCompare(b.cluster));
}

// Files that many others import are drawn bigger. Capped so one hub cannot swallow the map.
export function nodeSize(fanIn) {
  return Math.round(12 + Math.min(28, Math.sqrt(fanIn) * 4));
}

export function isIsolated(node) {
  return node.fanIn + node.fanOut === 0;
}

export function toElements(
  graph,
  { hideIsolated = false, colors, colorMode = 'folder', heat = null },
) {
  const nodes = hideIsolated ? graph.nodes.filter((n) => !isIsolated(n)) : graph.nodes;
  const visible = new Set(nodes.map((n) => n.id));

  const nodeElements = nodes.map((n) => ({
    group: 'nodes',
    data: {
      id: n.id,
      label: n.name,
      cluster: n.cluster,
      color: nodeColor(n, { colors, colorMode, heat }),
      size: nodeSize(n.fanIn),
    },
    classes: n.inCycle ? 'in-cycle' : '',
  }));

  const edgeElements = graph.edges.map((e) => ({
    group: 'edges',
    data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target },
  }));

  // Call links are drawn on top of import links, hidden until the person turns them on. A file that
  // has no import link can still have a call link, so each end is checked against the visible set.
  const callElements = (graph.callEdges ?? [])
    .filter((e) => visible.has(e.source) && visible.has(e.target))
    .map((e) => ({
      group: 'edges',
      data: { id: `call:${e.source}->${e.target}`, source: e.source, target: e.target },
      classes: 'call',
    }));

  return [...nodeElements, ...edgeElements, ...callElements];
}
