// Load test for a running Atlo server.
//   npm run start --prefix backend   (in another terminal)
//   node benchmarks/load.mjs [owner/repo] [baseUrl]
// Measures: (1) many simultaneous COLD requests for one repository (should download and parse
// once), (2) cached analyze, file and search requests at rising concurrency.
const repo = process.argv[2] ?? 'expressjs/express';
const base = process.argv[3] ?? 'http://localhost:4000';

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

async function timed(fn) {
  const t = performance.now();
  const res = await fn();
  return { ms: performance.now() - t, status: res.status };
}

// Runs `total` requests with at most `concurrency` in flight; returns latency percentiles and rps.
async function load(label, concurrency, total, makeRequest) {
  const latencies = [];
  const statuses = new Map();
  let started = 0;
  const wallStart = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (started < total) {
        const n = started++;
        const { ms, status } = await timed(() => makeRequest(n));
        latencies.push(ms);
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
      }
    }),
  );
  const wall = (performance.now() - wallStart) / 1000;
  latencies.sort((a, b) => a - b);
  const codes = [...statuses].map(([s, c]) => `${s}x${c}`).join(' ');
  console.log(
    `| ${label} | ${concurrency} | ${total} | ${(total / wall).toFixed(0)} | ${pct(latencies, 0.5).toFixed(1)} | ${pct(latencies, 0.95).toFixed(1)} | ${pct(latencies, 0.99).toFixed(1)} | ${codes} |`,
  );
}

const analyze = () =>
  fetch(`${base}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: repo }),
  });

console.log(`Target: ${base}, repository: ${repo}\n`);

// 1. Cold stampede: 30 identical requests at once. Expect ONE download (watch the server log).
const t0 = performance.now();
const stampede = await Promise.all(Array.from({ length: 30 }, () => analyze()));
const bodies = await Promise.all(stampede.map((r) => r.json()));
const ids = new Set(bodies.map((b) => b.data?.id));
console.log(
  `Cold stampede: 30 simultaneous analyze requests -> ${(performance.now() - t0).toFixed(0)} ms total, ` +
    `${ids.size} distinct analysis id(s), statuses ${[...new Set(stampede.map((r) => r.status))].join(',')}\n`,
);

const first = bodies[0].data;
const files = first.graph.nodes.map((n) => n.id);
const searchTerms = ['router', 'app', 'util', 'handle', 'parse', 'send'];

console.log('| Endpoint | Concurrency | Requests | req/s | p50 ms | p95 ms | p99 ms | Status codes |');
console.log('|---|---|---|---|---|---|---|---|');
for (const c of [1, 10, 50]) {
  await load('POST /analyze (cached)', c, 300, analyze);
  await load('GET /files', c, 600, (n) =>
    fetch(`${base}/api/repos/${first.id}/files?path=${encodeURIComponent(files[n % files.length])}`),
  );
  await load('GET /search', c, 600, (n) =>
    fetch(`${base}/api/repos/${first.id}/search?q=${searchTerms[n % searchTerms.length]}`),
  );
}
