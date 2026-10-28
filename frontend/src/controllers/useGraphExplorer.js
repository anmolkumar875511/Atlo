import { useCallback, useMemo, useReducer } from 'react';
import { buildClusterColors, clusterSummary } from '../models/graph.js';
import { blastSet, heatMap } from '../models/insights.js';
import { explorerReducer, initialExplorerState } from './explorerReducer.js';
import { useHealth } from './useHealth.js';

// The "C" for the graph screen. Views read values and call handlers; they do not own state.
export function useGraphExplorer(snapshotId, graph) {
  const [state, dispatch] = useReducer(explorerReducer, initialExplorerState);

  // Git history is only requested when something on screen needs it.
  const needsHealth = state.colorMode === 'heat' || state.tab === 'hotspots';
  const health = useHealth(snapshotId, needsHealth);

  const colors = useMemo(() => buildClusterColors(graph.nodes), [graph]);
  const summary = useMemo(() => clusterSummary(graph.nodes, colors), [graph, colors]);
  const nodeIds = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph]);
  const heat = useMemo(() => heatMap(health.data), [health.data]);

  const cycleHighlight = useMemo(() => {
    const cycle = graph.cycles.find((c) => c.id === state.activeCycleId);
    return cycle ? new Set(cycle.files) : null;
  }, [graph, state.activeCycleId]);

  const blastIds = useMemo(
    () => (state.showBlast && state.selectedId ? blastSet(graph, state.selectedId) : null),
    [graph, state.showBlast, state.selectedId],
  );

  const open = useCallback(
    (path, line = null) => dispatch({ type: 'OPEN', path, line, inGraph: nodeIds.has(path) }),
    [nodeIds],
  );

  const actions = useMemo(
    () => ({
      open,
      jump: (line) => dispatch({ type: 'JUMP', line }),
      selectNode: (id) => (id ? open(id) : dispatch({ type: 'DESELECT' })),
      setTab: (tab) => dispatch({ type: 'SET_TAB', tab }),
      setColorMode: (mode) => dispatch({ type: 'SET_COLOR_MODE', mode }),
      toggle: (key) => dispatch({ type: 'TOGGLE', key }),
      selectCycle: (id) => dispatch({ type: 'SELECT_CYCLE', id }),
      fit: () => dispatch({ type: 'FIT' }),
    }),
    [open],
  );

  return { state, health, colors, summary, heat, cycleHighlight, blastIds, actions };
}
