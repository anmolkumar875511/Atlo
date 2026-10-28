const HOTSPOT_COUNT = 10;

// Percentile rank in (0, 1]: the file with the biggest value gets 1. Ties share their average
// rank. Raw products like churn x complexity x coupling are very lopsided (one file can be 1000x
// the median), so ranks keep the heatmap readable where a plain min-max would paint almost
// everything green.
export function percentileRanks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    const average = (i + j) / 2 + 1; // 1-based average rank of the tie group
    for (let k = i; k <= j; k += 1) ranks[order[k][1]] = average / order.length;
    i = j + 1;
  }
  return ranks;
}

// God file score: churn x complexity x (fanIn + fanOut), turned into a 0..1 percentile rank.
// A file scores high only when ALL of these are high: it changes often, is hard to understand,
// and many files are tied to it. If git history is not available, churn is treated as 1, so the
// score becomes structural only, and `basis` says so.
export function buildHealthReport({ nodes, churn }) {
  const available = Boolean(churn?.available);
  const counts = churn?.counts ?? new Map();

  const rows = nodes.map((node) => {
    const commits = available ? (counts.get(node.id) ?? 0) : null;
    const raw = (available ? commits : 1) * node.complexity * (node.fanIn + node.fanOut);
    return { id: node.id, churn: commits, raw, godScore: 0 };
  });

  // Files with a raw score of 0 (never changed, or not connected) stay at 0 and out of the ranking.
  const scored = rows.filter((r) => r.raw > 0);
  const ranks = percentileRanks(scored.map((r) => r.raw));
  scored.forEach((row, i) => {
    row.godScore = Math.round(ranks[i] * 1000) / 1000;
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hotspots = [...scored]
    .sort((a, b) => b.raw - a.raw || a.id.localeCompare(b.id))
    .slice(0, HOTSPOT_COUNT)
    .map((row) => {
      const node = byId.get(row.id);
      return {
        id: row.id,
        godScore: row.godScore,
        churn: row.churn,
        complexity: node.complexity,
        fanIn: node.fanIn,
        fanOut: node.fanOut,
        blastRadius: node.blastRadius ?? null,
      };
    });

  return {
    basis: available ? 'churn' : 'structural',
    churn: {
      available,
      commits: churn?.commits ?? 0,
      windowDays: churn?.windowDays ?? null,
      reason: available ? null : (churn?.reason ?? 'unavailable'),
      ms: churn?.ms ?? 0,
    },
    files: rows.map(({ id, churn: c, godScore }) => ({ id, churn: c, godScore })),
    hotspots,
  };
}
