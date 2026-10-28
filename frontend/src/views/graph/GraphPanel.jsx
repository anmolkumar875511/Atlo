import { useGraphExplorer } from '../../controllers/useGraphExplorer.js';
import { useFps } from '../../controllers/useFps.js';
import { plural } from '../../models/format.js';
import SearchBar from '../search/SearchBar.jsx';
import SidePane from '../insights/SidePane.jsx';
import GraphLegend from './GraphLegend.jsx';
import GraphView from './GraphView.jsx';
import './graph.css';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

function Toggle({ checked, onChange, children, title }) {
  return (
    <label className="graph-panel__toggle" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

export default function GraphPanel({ snapshotId, graph, onboarding }) {
  const { state, health, colors, summary, heat, cycleHighlight, blastIds, actions } =
    useGraphExplorer(snapshotId, graph);
  const fps = useFps(DEBUG);

  if (graph.nodes.length === 0) {
    return (
      <p className="graph-panel__empty">
        No JavaScript, TypeScript or Python files were found, so there is no dependency graph to
        draw.
      </p>
    );
  }

  const isolatedCount = graph.nodes.filter((n) => n.fanIn + n.fanOut === 0).length;
  const callCount = graph.callEdges.length;
  const heatReady = health.status === 'success';

  return (
    <section className="graph-panel" aria-label="Dependency graph and code">
      <div className="graph-panel__toolbar">
        <SearchBar
          snapshotId={snapshotId}
          onPick={(result) => actions.open(result.file, result.line)}
        />
        <span className="graph-panel__counts">
          {graph.stats.nodes.toLocaleString('en-US')} files ·{' '}
          {graph.stats.edges.toLocaleString('en-US')} links
        </span>
        <button type="button" className="graph-panel__button" onClick={actions.fit}>
          Fit
        </button>
      </div>

      <div className="graph-panel__options">
        <div className="seg" role="group" aria-label="Colour files by">
          <span className="seg__label">Colour</span>
          {[
            ['folder', 'Folder'],
            ['heat', 'Heat'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={state.colorMode === mode}
              className={`seg__btn${state.colorMode === mode ? ' seg__btn--on' : ''}`}
              title={
                mode === 'heat'
                  ? 'God-file heatmap: churn × complexity × coupling'
                  : 'Colour by top-level folder'
              }
              onClick={() => actions.setColorMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <Toggle
          checked={state.showCycles}
          onChange={() => actions.toggle('showCycles')}
          title="Ring every file that is part of a circular import"
        >
          Cycles ({graph.stats.cycles})
        </Toggle>
        <Toggle
          checked={state.showCalls}
          onChange={() => actions.toggle('showCalls')}
          title="Dashed lines: a function in one file calls a function in another (name based)"
        >
          Call links ({callCount})
        </Toggle>
        <Toggle
          checked={state.showBlast}
          onChange={() => actions.toggle('showBlast')}
          title="Select a file to light up every file that could break if it changes"
        >
          Blast radius
        </Toggle>
        <Toggle checked={state.hideIsolated} onChange={() => actions.toggle('hideIsolated')}>
          Hide unlinked ({isolatedCount})
        </Toggle>
      </div>

      <div className="graph-panel__body">
        <div className="graph-panel__stage">
          <GraphView
            graph={graph}
            colors={colors}
            hideIsolated={state.hideIsolated}
            selectedId={state.selectedId}
            onSelect={actions.selectNode}
            fitSignal={state.fitSignal}
            colorMode={state.colorMode}
            heat={heat}
            showCalls={state.showCalls}
            showCycles={state.showCycles}
            cycleHighlight={cycleHighlight}
            blastIds={blastIds}
          />
          <GraphLegend
            summary={summary}
            colorMode={state.colorMode}
            heatReady={heatReady}
            showCalls={state.showCalls}
            showCycles={state.showCycles}
          />
          {blastIds && (
            <div className="graph-panel__banner" role="status">
              {plural(blastIds.size, 'file')} could break if this file changes
            </div>
          )}
          {DEBUG && <div className="graph-panel__fps">{fps} fps</div>}
        </div>
        <SidePane
          snapshotId={snapshotId}
          graph={graph}
          onboarding={onboarding}
          health={health}
          explorer={state}
          actions={actions}
        />
      </div>
    </section>
  );
}
