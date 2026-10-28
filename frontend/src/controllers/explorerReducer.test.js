import { describe, expect, it } from 'vitest';
import { explorerReducer as reduce, initialExplorerState as init } from './explorerReducer.js';

describe('explorerReducer', () => {
  it('opening a file selects it, shows the File tab and clears the cycle highlight', () => {
    const before = { ...init, tab: 'cycles', activeCycleId: 'cycle-1' };
    const after = reduce(before, { type: 'OPEN', path: 'src/a.js', line: 7, inGraph: true });
    expect(after).toMatchObject({
      selectedId: 'src/a.js',
      tab: 'file',
      activeCycleId: null,
      target: { path: 'src/a.js', line: 7, id: 1 },
    });
  });

  it('does not select a file that is not in the graph', () => {
    expect(reduce(init, { type: 'OPEN', path: 'README.md', inGraph: false }).selectedId).toBeNull();
  });

  it('asking for the same line twice still produces a new request id', () => {
    const a = reduce(init, { type: 'OPEN', path: 'a.js', line: 3, inGraph: true });
    const b = reduce(a, { type: 'JUMP', line: 3 });
    expect(b.target.id).toBe(a.target.id + 1);
  });

  it('picking a cycle clears the selection; picking it again turns it off', () => {
    const selected = reduce(init, { type: 'OPEN', path: 'a.js', inGraph: true });
    const on = reduce(selected, { type: 'SELECT_CYCLE', id: 'cycle-1' });
    expect(on).toMatchObject({ activeCycleId: 'cycle-1', selectedId: null });
    expect(reduce(on, { type: 'SELECT_CYCLE', id: 'cycle-1' }).activeCycleId).toBeNull();
  });

  it('leaving the Cycles tab turns the cycle highlight off', () => {
    const on = reduce({ ...init, tab: 'cycles' }, { type: 'SELECT_CYCLE', id: 'cycle-2' });
    expect(reduce(on, { type: 'SET_TAB', tab: 'cycles' }).activeCycleId).toBe('cycle-2');
    expect(reduce(on, { type: 'SET_TAB', tab: 'hotspots' }).activeCycleId).toBeNull();
  });

  it('toggles only known switches', () => {
    expect(reduce(init, { type: 'TOGGLE', key: 'showCalls' }).showCalls).toBe(true);
    expect(reduce(init, { type: 'TOGGLE', key: 'evil' })).toBe(init);
  });

  it('ignores unknown tabs and colour modes', () => {
    expect(reduce(init, { type: 'SET_TAB', tab: 'nope' })).toBe(init);
    expect(reduce(init, { type: 'SET_COLOR_MODE', mode: 'rainbow' })).toBe(init);
    expect(reduce(init, { type: 'SET_COLOR_MODE', mode: 'heat' }).colorMode).toBe('heat');
  });
});
