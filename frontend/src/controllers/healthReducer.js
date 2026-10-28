// State machine for the health report: idle -> loading -> success | error.
// Pure, so every transition is unit-tested without React.
export const initialHealthState = Object.freeze({ status: 'idle', data: null, error: null });

export function healthReducer(state, action) {
  switch (action.type) {
    case 'LOADING':
      return { status: 'loading', data: null, error: null };
    case 'LOADED':
      return { status: 'success', data: action.data, error: null };
    case 'FAILED':
      return { status: 'error', data: null, error: action.error };
    case 'RESET':
      return initialHealthState;
    default:
      return state;
  }
}
