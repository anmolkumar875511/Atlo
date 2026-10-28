// State of the graph screen: what is open, what is highlighted, which overlays are on.
// One pure reducer, so the rules ("opening a file switches to the File tab", "picking a cycle
// clears the file selection") are tested without a browser.
export const initialExplorerState = Object.freeze({
  // `id` changes on every request, so asking for the same line twice still scrolls there.
  target: { path: null, line: null, id: 0 },
  // The highlighted graph node. Files that are not in the graph (README, JSON) have none.
  selectedId: null,
  tab: 'file', // file | hotspots | cycles | start
  colorMode: 'folder', // folder | heat
  hideIsolated: false,
  showCalls: false,
  showCycles: false,
  showBlast: false,
  activeCycleId: null,
  fitSignal: 0,
});

const TOGGLES = new Set(['hideIsolated', 'showCalls', 'showCycles', 'showBlast']);
const TABS = new Set(['file', 'hotspots', 'cycles', 'start']);

export function explorerReducer(state, action) {
  switch (action.type) {
    case 'OPEN':
      return {
        ...state,
        target: { path: action.path, line: action.line ?? null, id: state.target.id + 1 },
        selectedId: action.inGraph ? action.path : null,
        tab: 'file',
        activeCycleId: null,
      };
    case 'JUMP':
      return { ...state, target: { ...state.target, line: action.line, id: state.target.id + 1 } };
    case 'DESELECT':
      return { ...state, selectedId: null };
    case 'SET_TAB':
      // The red cycle highlight belongs to the Cycles tab, so leaving that tab turns it off.
      return TABS.has(action.tab)
        ? {
            ...state,
            tab: action.tab,
            activeCycleId: action.tab === 'cycles' ? state.activeCycleId : null,
          }
        : state;
    case 'SET_COLOR_MODE':
      return action.mode === 'heat' || action.mode === 'folder'
        ? { ...state, colorMode: action.mode }
        : state;
    case 'TOGGLE':
      return TOGGLES.has(action.key) ? { ...state, [action.key]: !state[action.key] } : state;
    case 'SELECT_CYCLE':
      // Clicking the active cycle again switches the highlight off.
      return {
        ...state,
        activeCycleId: state.activeCycleId === action.id ? null : action.id,
        selectedId: null,
      };
    case 'FIT':
      return { ...state, fitSignal: state.fitSignal + 1 };
    default:
      return state;
  }
}
