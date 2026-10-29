// Talks to the layout worker. The page asks for a layout and is called back once per stage.
// If a Web Worker cannot be created (very old browser, strict policy), `requestLayout` returns
// null and the caller lays out on the main thread instead.
let worker = null;
let nextId = 1;
const listeners = new Map(); // request id -> callback

function defaultFactory() {
  return new Worker(new URL('../workers/layout.worker.js', import.meta.url), { type: 'module' });
}

function ensureWorker(factory) {
  if (worker) return worker;
  worker = factory();
  worker.onmessage = ({ data }) => listeners.get(data.id)?.(data);
  worker.onerror = () => {
    // The worker died: tell everyone waiting and start fresh next time.
    for (const callback of listeners.values()) callback({ error: true });
    listeners.clear();
    worker = null;
  };
  return worker;
}

// Returns { cancel } or null when workers are unavailable.
// Cancelling ends the worker: a force layout cannot be interrupted, and a new request must not
// queue up behind a stale one that is still running.
export function requestLayout(input, stages, onStage, factory = defaultFactory) {
  let active;
  try {
    active = ensureWorker(factory);
  } catch {
    return null;
  }
  const id = nextId++;
  listeners.set(id, onStage);
  active.postMessage({ id, nodes: input.nodes, edges: input.edges, stages });

  return {
    cancel() {
      if (!listeners.delete(id)) return;
      if (worker === active) {
        active.terminate();
        worker = null;
      }
    },
    done() {
      listeners.delete(id);
    },
  };
}

// Starts the worker early (it has to download and parse a large script) so the first layout
// request does not pay for that. Safe to call any time; does nothing if workers are unavailable.
export function warmUpLayoutWorker(factory = defaultFactory) {
  try {
    ensureWorker(factory);
  } catch {
    // The fallback path in the graph view handles a missing worker.
  }
}

// For tests.
export function resetLayoutClient() {
  worker?.terminate?.();
  worker = null;
  listeners.clear();
  nextId = 1;
}
