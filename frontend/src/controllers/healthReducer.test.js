import { describe, expect, it } from 'vitest';
import { healthReducer, initialHealthState } from './healthReducer.js';

describe('healthReducer', () => {
  it('goes idle -> loading -> success', () => {
    const loading = healthReducer(initialHealthState, { type: 'LOADING' });
    expect(loading.status).toBe('loading');
    const done = healthReducer(loading, { type: 'LOADED', data: { basis: 'churn' } });
    expect(done).toEqual({ status: 'success', data: { basis: 'churn' }, error: null });
  });

  it('records a failure and can reset', () => {
    const failed = healthReducer(initialHealthState, { type: 'FAILED', error: { code: 'X' } });
    expect(failed).toMatchObject({ status: 'error', error: { code: 'X' } });
    expect(healthReducer(failed, { type: 'RESET' })).toBe(initialHealthState);
  });
});
