// Decides how a graph is laid out. Pure, so the rules are tested without a browser.

// What the worker needs: ids, sizes and import links only. Call links are hidden by default and
// must not pull files together, and labels and colours are not needed for positions.
export function layoutInput(elements) {
  const nodes = [];
  const edges = [];
  for (const el of elements) {
    if (el.group === 'nodes') nodes.push({ id: el.data.id, size: el.data.size });
    else if (el.classes !== 'call') edges.push({ source: el.data.source, target: el.data.target });
  }
  return { nodes, edges };
}

// Worker answer -> { id: {x, y} } for Cytoscape's "preset" layout.
export function toPositions(ids, xs, ys) {
  const positions = {};
  for (let i = 0; i < ids.length; i += 1) positions[ids[i]] = { x: xs[i], y: ys[i] };
  return positions;
}
