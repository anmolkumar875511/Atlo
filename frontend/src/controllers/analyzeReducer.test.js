import { describe, expect, it } from 'vitest';
import { analyzeReducer, initialAnalyzeState } from './analyzeReducer.js';

describe('analyzeReducer', () => {
  it('starts idle', () => {
    expect(initialAnalyzeState.status).toBe('idle');
  });

  it('idle -> loading clears old data and error', () => {
    const prev = { status: 'error', url: 'old', data: null, error: new Error('x') };
    expect(analyzeReducer(prev, { type: 'ANALYZE_STARTED', url: 'a/b' })).toEqual({
      status: 'loading',
      url: 'a/b',
      data: null,
      error: null,
    });
  });

  it('loading -> success keeps the url and stores data', () => {
    const loading = analyzeReducer(initialAnalyzeState, { type: 'ANALYZE_STARTED', url: 'a/b' });
    const done = analyzeReducer(loading, { type: 'ANALYZE_SUCCEEDED', data: { id: '1' } });
    expect(done).toMatchObject({ status: 'success', url: 'a/b', data: { id: '1' }, error: null });
  });

  it('loading -> error stores the error', () => {
    const err = new Error('boom');
    const state = analyzeReducer(
      { ...initialAnalyzeState, status: 'loading' },
      { type: 'ANALYZE_FAILED', error: err },
    );
    expect(state).toMatchObject({ status: 'error', data: null, error: err });
  });

  it('RESET returns to idle and unknown actions are ignored', () => {
    expect(analyzeReducer({ status: 'success' }, { type: 'RESET' })).toBe(initialAnalyzeState);
    const s = { status: 'success' };
    expect(analyzeReducer(s, { type: 'NOPE' })).toBe(s);
  });
});
