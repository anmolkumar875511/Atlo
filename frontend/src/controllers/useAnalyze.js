import { useCallback, useEffect, useReducer, useRef } from 'react';
import { toApiError } from '../models/apiError.js';
import { analyzeRepository } from '../services/atloApi.js';
import { analyzeReducer, initialAnalyzeState } from './analyzeReducer.js';

// The "C" of web-side MVC. Views call `analyze(url)` and read `status/data/error`;
// they never touch fetch, abort logic or state transitions.
export function useAnalyze() {
  const [state, dispatch] = useReducer(analyzeReducer, initialAnalyzeState);
  const inFlight = useRef(null);

  const analyze = useCallback(async (url) => {
    inFlight.current?.abort(); // a newer request wins
    const controller = new AbortController();
    inFlight.current = controller;

    dispatch({ type: 'ANALYZE_STARTED', url });
    try {
      const data = await analyzeRepository(url, { signal: controller.signal });
      if (!controller.signal.aborted) dispatch({ type: 'ANALYZE_SUCCEEDED', data });
    } catch (err) {
      if (controller.signal.aborted) return;
      dispatch({ type: 'ANALYZE_FAILED', error: toApiError(err) });
    }
  }, []);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    dispatch({ type: 'RESET' });
  }, []);

  useEffect(() => () => inFlight.current?.abort(), []);

  return { ...state, analyze, reset };
}
