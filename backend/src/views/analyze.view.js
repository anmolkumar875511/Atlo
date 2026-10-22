export function renderAnalyze({ snapshot, cached }) {
  return {
    data: {
      id: snapshot.id,
      repo: snapshot.repo,
      cached,
      stats: snapshot.stats,
      tree: snapshot.tree,
    },
  };
}
