import { lazy, Suspense, useState } from 'react';
import { useAnalyze } from '../controllers/useAnalyze.js';
import ErrorBanner from './ErrorBanner.jsx';
import FileTree from './FileTree.jsx';
import LoadingState from './LoadingState.jsx';
import RepoInput from './RepoInput.jsx';
import StatsBar from './StatsBar.jsx';
import Tabs from './Tabs.jsx';

// Cytoscape is large, so it is only downloaded when a graph is actually shown.
const GraphPanel = lazy(() => import('./graph/GraphPanel.jsx'));

const TABS = [
  { id: 'graph', label: 'Dependency graph' },
  { id: 'files', label: 'File tree' },
];

export default function AnalyzePage() {
  const { status, url, data, error, analyze, reset } = useAnalyze();
  const [tab, setTab] = useState('graph');

  return (
    <>
      <RepoInput onSubmit={analyze} disabled={status === 'loading'} />

      {status === 'loading' && <LoadingState url={url} />}
      {status === 'error' && <ErrorBanner error={error} onDismiss={reset} />}
      {status === 'success' && (
        <>
          <StatsBar repo={data.repo} stats={data.stats} graph={data.graph} cached={data.cached} />
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          {tab === 'graph' ? (
            <Suspense fallback={<p className="loading__text">Loading graph…</p>}>
              <GraphPanel
                key={data.id}
                snapshotId={data.id}
                graph={data.graph}
                onboarding={data.onboarding}
              />
            </Suspense>
          ) : (
            <FileTree key={data.id} tree={data.tree} />
          )}
        </>
      )}
    </>
  );
}
