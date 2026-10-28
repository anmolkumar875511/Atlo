import { useEffect, useState } from 'react';
import { toApiError } from '../models/apiError.js';
import { searchRepo } from '../services/atloApi.js';

const IDLE = { status: 'idle', results: [], error: null };

// Debounced search: waits for a short pause in typing, and drops answers that arrive late.
export function useSearch(snapshotId, delay = 150) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setState(IDLE);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, status: 'loading' }));
      try {
        const results = await searchRepo(snapshotId, text, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ status: 'done', results, error: null });
      } catch (err) {
        if (!controller.signal.aborted) {
          setState({ status: 'error', results: [], error: toApiError(err) });
        }
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [snapshotId, query, delay]);

  return { query, setQuery, ...state };
}
