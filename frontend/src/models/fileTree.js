// Returns a copy of the tree that keeps only files whose path contains `query`
// (case-insensitive) and the folders needed to reach them. Returns null if nothing matches.
// An empty query returns the tree unchanged.
export function filterTree(node, query) {
  const q = query.trim().toLowerCase();
  if (!q) return node;
  return prune(node, q);
}

function prune(node, q) {
  if (node.type === 'file') return node.path.toLowerCase().includes(q) ? node : null;

  const children = (node.children ?? []).map((c) => prune(c, q)).filter(Boolean);
  if (children.length === 0) return null;

  return {
    ...node,
    children,
    fileCount: children.reduce((n, c) => n + c.fileCount, 0),
    size: children.reduce((n, c) => n + c.size, 0),
  };
}
