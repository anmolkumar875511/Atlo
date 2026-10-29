import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLayout, resetLayoutClient, warmUpLayoutWorker } from './layoutClient.js';

// A stand-in for the browser Worker that we can drive by hand.
function fakeWorker() {
  const worker = {
    posted: [],
    terminated: false,
    postMessage: (msg) => worker.posted.push(msg),
    terminate: () => {
      worker.terminated = true;
    },
    reply: (data) => worker.onmessage({ data }),
  };
  return worker;
}

const input = { nodes: [{ id: 'a', size: 5 }], edges: [] };
afterEach(resetLayoutClient);

describe('requestLayout', () => {
  it('sends the graph and the stages to the worker', () => {
    const worker = fakeWorker();
    requestLayout(
      input,
      ['draft', 'default'],
      () => {},
      () => worker,
    );
    expect(worker.posted).toEqual([
      { id: 1, nodes: input.nodes, edges: [], stages: ['draft', 'default'] },
    ]);
  });

  it('calls back once per stage, and only for its own request', () => {
    const worker = fakeWorker();
    const first = vi.fn();
    const second = vi.fn();
    requestLayout(input, ['draft'], first, () => worker);
    requestLayout(input, ['draft'], second, () => worker);
    worker.reply({ id: 2, stage: 'draft', last: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ id: 2, stage: 'draft', last: true });
  });

  it('shares one worker between requests', () => {
    const factory = vi.fn(fakeWorker);
    requestLayout(input, ['default'], () => {}, factory);
    requestLayout(input, ['default'], () => {}, factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('cancel ends the worker, so a stale layout cannot block the next one', () => {
    const worker = fakeWorker();
    const callback = vi.fn();
    const request = requestLayout(input, ['default'], callback, () => worker);
    request.cancel();
    expect(worker.terminated).toBe(true);

    worker.reply({ id: 1, stage: 'default', last: true }); // a late answer is ignored
    expect(callback).not.toHaveBeenCalled();

    const next = fakeWorker();
    requestLayout(
      input,
      ['default'],
      () => {},
      () => next,
    ); // a fresh worker is created
    expect(next.posted).toHaveLength(1);
  });

  it('does not end the worker when a finished request is "cancelled" afterwards', () => {
    const worker = fakeWorker();
    const request = requestLayout(
      input,
      ['default'],
      () => {},
      () => worker,
    );
    request.done();
    request.cancel();
    expect(worker.terminated).toBe(false);
  });

  it('returns null when a worker cannot be created, so the caller can lay out itself', () => {
    expect(
      requestLayout(
        input,
        ['default'],
        () => {},
        () => {
          throw new Error('no workers here');
        },
      ),
    ).toBeNull();
  });

  it('reports a crashed worker to everyone waiting, then starts fresh', () => {
    const worker = fakeWorker();
    const callback = vi.fn();
    requestLayout(input, ['default'], callback, () => worker);
    worker.onerror();
    expect(callback).toHaveBeenCalledWith({ error: true });
    const next = fakeWorker();
    requestLayout(
      input,
      ['default'],
      () => {},
      () => next,
    );
    expect(next.posted).toHaveLength(1);
  });
});

describe('warmUpLayoutWorker', () => {
  it('starts the worker once, and the first request reuses it', () => {
    const factory = vi.fn(fakeWorker);
    warmUpLayoutWorker(factory);
    warmUpLayoutWorker(factory);
    requestLayout(input, ['default'], () => {}, factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('ignores a failure to start', () => {
    expect(() =>
      warmUpLayoutWorker(() => {
        throw new Error('nope');
      }),
    ).not.toThrow();
  });
});
