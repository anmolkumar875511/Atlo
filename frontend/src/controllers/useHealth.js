import { useCallback, useEffect, useReducer, useState } from 'react';
import { toApiError } from '../models/apiError.js';
import { fetchHealth } from '../services/atloApi.js';
import { healthReducer, initialHealthState } from './healthReducer.js';

// Loads the health report the first time `enabled` becomes true. Reading git history is slow, so
// nothing is requested until the person opens the Hotspots tab or switches to the heat colouring.
export function useHealth(snapshotId, enabled) {
  const [state, dispatch] = useReducer(healthReducer, initialHealthState);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    dispatch({ type: 'LOADING' });
    fetchHealth(snapshotId, { signal: controller.signal })
      .then((data) => dispatch({ type: 'LOADED', data }))
      .catch((err) => {
        if (!controller.signal.aborted) dispatch({ type: 'FAILED', error: toApiError(err) });
      });
    return () => controller.abort();
  }, [snapshotId, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
