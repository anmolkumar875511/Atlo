import { Worker } from 'node:worker_threads';

// A small fixed pool of parse workers. Work is handed out in chunks, and a crashed worker is
// replaced, so one bad file can slow a request down but never take the server down.
export class WorkerPool {
  constructor({ size, workerUrl, logger }) {
    this.size = size;
    this.workerUrl = workerUrl;
    this.logger = logger;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.pending = new Map(); // job id -> { resolve, reject, worker }
    this.nextId = 1;
    this.closed = false;
  }

  #spawn() {
    const worker = new Worker(this.workerUrl);
    worker.on('message', ({ id, results }) => {
      const job = this.pending.get(id);
      if (!job) return;
      this.pending.delete(id);
      job.resolve(results);
      this.#release(worker);
    });
    worker.on('error', (err) => this.#fail(worker, err));
    worker.on('exit', (code) => {
      if (code !== 0 && !this.closed) this.#fail(worker, new Error(`worker exited with ${code}`));
    });
    this.workers.push(worker);
    return worker;
  }

  #fail(worker, err) {
    this.logger?.warn({ err: err.message }, 'parse worker failed');
    this.workers = this.workers.filter((w) => w !== worker);
    this.idle = this.idle.filter((w) => w !== worker);
    for (const [id, job] of this.pending) {
      if (job.worker === worker) {
        this.pending.delete(id);
        job.reject(err);
      }
    }
    worker.terminate().catch(() => {});
    if (!this.closed && this.workers.length < this.size) this.idle.push(this.#spawn());
    this.#drain();
  }

  #release(worker) {
    this.idle.push(worker);
    this.#drain();
  }

  #drain() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop();
      const job = this.queue.shift();
      job.worker = worker;
      this.pending.set(job.id, job);
      worker.postMessage({ id: job.id, files: job.files });
    }
  }

  // Resolves to one result per file, in the same order as the chunk.
  run(files) {
    if (this.closed) return Promise.reject(new Error('worker pool is closed'));
    if (this.workers.length === 0) {
      for (let i = 0; i < this.size; i += 1) this.idle.push(this.#spawn());
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, files, resolve, reject, worker: null });
      this.#drain();
    });
  }

  async destroy() {
    this.closed = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
  }
}
