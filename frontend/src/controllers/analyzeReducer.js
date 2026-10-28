// State machine for one analysis: idle -> loading -> success | error.
// Pure function, so every transition is unit-tested without React.
export const initialAnalyzeState = Object.freeze({
  status: 'idle',
  url: '',
  data: null,
  error: null,
});

export function analyzeReducer(state, action) {
  switch (action.type) {
    case 'ANALYZE_STARTED':
      return { status: 'loading', url: action.url, data: null, error: null };
    case 'ANALYZE_SUCCEEDED':
      return { ...state, status: 'success', data: action.data, error: null };
    case 'ANALYZE_FAILED':
      return { ...state, status: 'error', data: null, error: action.error };
    case 'RESET':
      return initialAnalyzeState;
    default:
      return state;
  }
}
