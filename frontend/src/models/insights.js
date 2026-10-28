// Everything the web app can work out about the graph without asking the server again.

// Blast radius for the highlight: every file that depends on `startId`, directly or through other
// files. The same breadth-first search the server uses for the number, run on the reversed
// edges. Excludes the file itself.
export function blastSet(graph, startId) {
  const dependents = new Map();
  for (const edge of graph.edges) {
    if (!dependents.has(edge.target)) dependents.set(edge.target, []);
    dependents.get(edge.target).push(edge.source);
  }

  const seen = new Set([startId]);
  const queue = [startId];
  for (let head = 0; head < queue.length; head += 1) {
    for (const file of dependents.get(queue[head]) ?? []) {
      if (!seen.has(file)) {
        seen.add(file);
        queue.push(file);
      }
    }
  }
  seen.delete(startId);
  return seen;
}

// "a -> b -> c -> (back to a)" for the cycles list.
export function describeLoop(cycle) {
  const short = (id) => id.slice(id.lastIndexOf('/') + 1);
  const names = cycle.path.map(short);
  return cycle.path.length === 1
    ? `${names[0]} imports itself`
    : `${names.join(' → ')} → ${names[0]}`;
}

// id -> godScore, for colouring. Files the report does not list stay out of the map.
export function heatMap(health) {
  return new Map((health?.files ?? []).map((f) => [f.id, f.godScore]));
}
