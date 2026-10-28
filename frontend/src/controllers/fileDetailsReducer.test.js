import { describe, expect, it } from 'vitest';
import { fileDetailsReducer, initialFileDetailsState } from './fileDetailsReducer.js';

describe('fileDetailsReducer', () => {
  it('starts idle', () => {
    expect(initialFileDetailsState.status).toBe('idle');
  });

  it('idle -> loading -> success', () => {
    const loading = fileDetailsReducer(initialFileDetailsState, { type: 'LOADING', key: 'a:b' });
    expect(loading).toEqual({ status: 'loading', key: 'a:b', data: null, error: null });
    const done = fileDetailsReducer(loading, { type: 'LOADED', key: 'a:b', data: { path: 'b' } });
    expect(done).toMatchObject({ status: 'success', data: { path: 'b' }, error: null });
  });

  it('loading -> error drops old data', () => {
    const err = new Error('x');
    const state = fileDetailsReducer(
      { status: 'success', key: 'k', data: { path: 'p' }, error: null },
      { type: 'FAILED', key: 'k', error: err },
    );
    expect(state).toEqual({ status: 'error', key: 'k', data: null, error: err });
  });

  it('CLEARED resets and unknown actions are ignored', () => {
    expect(fileDetailsReducer({ status: 'success' }, { type: 'CLEARED' })).toBe(
      initialFileDetailsState,
    );
    const s = { status: 'loading' };
    expect(fileDetailsReducer(s, { type: 'NOPE' })).toBe(s);
  });
});
