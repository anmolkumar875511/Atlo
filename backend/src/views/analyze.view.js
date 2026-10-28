// The "V" of server-side MVC: shapes a domain snapshot into the public JSON contract.
// File contents never leave the server in this response.
export function renderAnalyze({ snapshot, cached }) {
  return {
    data: {
      id: snapshot.id,
      repo: snapshot.repo,
      cached,
      stats: snapshot.stats,
      tree: snapshot.tree,
      graph: snapshot.graph,
      onboarding: snapshot.onboarding,
    },
  };
}
