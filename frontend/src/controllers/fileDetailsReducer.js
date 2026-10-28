export const initialFileDetailsState = Object.freeze({
  status: 'idle',
  key: null,
  data: null,
  error: null,
});

export function fileDetailsReducer(state, action) {
  switch (action.type) {
    case 'LOADING':
      return { status: 'loading', key: action.key, data: null, error: null };
    case 'LOADED':
      return { status: 'success', key: action.key, data: action.data, error: null };
    case 'FAILED':
      return { status: 'error', key: action.key, data: null, error: action.error };
    case 'CLEARED':
      return initialFileDetailsState;
    default:
      return state;
  }
}
