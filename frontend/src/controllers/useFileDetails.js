import { useEffect, useReducer, useRef } from 'react';
import { toApiError } from '../models/apiError.js';
import { fetchFile } from '../services/atloApi.js';
import { fileDetailsReducer, initialFileDetailsState } from './fileDetailsReducer.js';

const CACHE_LIMIT = 40;

// Loads one file's details when the selection changes. Files already seen come from a small
// in-memory cache, so clicking back and forth between files is instant.
export function useFileDetails(snapshotId, path) {
  const [state, dispatch] = useReducer(fileDetailsReducer, initialFileDetailsState);
  const cache = useRef(new Map());

  useEffect(() => {
    if (!path) {
      dispatch({ type: 'CLEARED' });
      return undefined;
    }

    const key = `${snapshotId}:${path}`;
    const cached = cache.current.get(key);
    if (cached) {
      dispatch({ type: 'LOADED', key, data: cached });
      return undefined;
    }

    const controller = new AbortController();
    dispatch({ type: 'LOADING', key });
    fetchFile(snapshotId, path, { signal: controller.signal })
      .then((data) => {
        cache.current.set(key, data);
        if (cache.current.size > CACHE_LIMIT) {
          cache.current.delete(cache.current.keys().next().value);
        }
        dispatch({ type: 'LOADED', key, data });
      })
      .catch((err) => {
        if (!controller.signal.aborted) dispatch({ type: 'FAILED', key, error: toApiError(err) });
      });

    return () => controller.abort();
  }, [snapshotId, path]);

  return state;
}
