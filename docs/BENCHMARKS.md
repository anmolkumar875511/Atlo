# Atlo benchmark report

Reproduce everything below with the scripts in `benchmarks/` (see "How to re-run" at the end).

## Machine used

Intel Xeon 2.8 GHz, **1 thread**, 3.9 GB RAM, Node 22, Linux, headless Chromium with software rendering. A small shared cloud box; a modern laptop is roughly 2x faster. **Re-run on your own machine and replace the numbers you quote.** Download time depends on the network and varied between runs (Vue core: 0.5 s to 1.8 s), so the tables below separate it from the parse time, which is stable.

## Summary: what changed in the latency pass

| Area | Before | After | How |
| --- | --- | --- | --- |
| Parse + analyze, Vue core (528 files) | 3.9 s | **2.4 s** (-38%) | One combined query for imports and calls instead of two; numeric node-type ids in the metrics walk |
| Parse + analyze, Express (142 files) | 754 ms | **~470 ms** | same |
| Blast radius, 20,000 files | 15.3 s | **68 ms** (225x faster) | Condense circular groups, then bitset unions on the DAG instead of one BFS per file |
| Blast radius, 5,000 files | 939 ms | **20 ms** | same |
| Re-analysis of unchanged files (snapshot expired, other branch, fork) | full parse, 4 s | **0.8 s**, 528 of 528 files from cache | Per-file analysis cache keyed by content hash |
| Click to usable graph, Vue core, cached server | 4.4 to 4.8 s | **2.5 to 2.7 s** | Measured with an experimental draft-first mode (not shipped, see the note under the Browser table) |
| Longest main-thread block while drawing | 2.4 s | **0.7 to 0.8 s** | same (the page no longer freezes) |
| Cold server, click to usable graph | 7.8 s | **7.2 s** | Graph code and layout worker preloaded while the server analyses |
| Repeat `/analyze` response, Vue core | about 9 ms CPU (serialize + gzip) | **about 0 ms** | Encoded response stored on the snapshot |
| `/files` and `/search` | no HTTP caching | `Cache-Control: private, max-age=600` | Only on success, so a 404 is never cached |

All results were checked for correctness against reference implementations (see "Correctness guards").

## Pipeline timings (Vue core, single thread, `node benchmarks/stages.mjs vuejs/core`)

| Stage | Cold | Second analysis (file cache warm) |
| --- | --- | --- |
| Extract (parse + metrics + imports + calls) | 2.56 s | 7 ms (528 / 528 files cached) |
| Resolve imports | 21 ms | 26 ms |
| Build graph | 16 ms | 18 ms |
| Tarjan cycles + blast radius | 7 ms | 7 ms |
| Call linking | 35 ms | 24 ms |
| Onboarding | 5 ms | 10 ms |
| Download + unzip (network, not in the table above) | 0.5 to 1.8 s | same |

Everything except tree-sitter extraction takes under 100 ms in total. These timings are also sent to the browser in a `Server-Timing` header, so they show in the Network tab.

## Extraction, before and after (528 Vue files, same machine)

| Stage | Before | After |
| --- | --- | --- |
| Tree-sitter parse | 1.06 s | 1.06 s |
| Imports + calls | 0.78 s + 0.77 s (two queries) | **~0.6 s** (one query, no JS predicates) |
| Metrics walk | 1.59 s | **~1.0 s** (numeric node-type ids) |

Things that were tried and rejected: `descendantsOfType` for decision points and tokens (slower than the cursor walk and not exact), and a fully fused single-walk extractor (the bare cursor walk alone costs about 0.5 s, so the gain was too small for the risk).

## Results by repository (single thread, cold)

| Repo | Code files | Import edges | Cycles | Parse + analyze | Cached `/analyze` | Heap |
| --- | --- | --- | --- | --- | --- | --- |
| `expressjs/express` | 142 | 154 | 0 | 475 ms | under 1 ms | 18 MB |
| `pallets/flask` (Python) | 83 | 190 | 2 | 357 ms | under 1 ms | 21 MB |
| `vuejs/core` | 528 | 1,790 | 8 | 2.5 s | under 1 ms | 35 MB |

Total cold time adds the download (0.3 to 1.8 s). All three stay under the 5 s target on this slow single core.

## Worker threads

Not measurable here: one CPU, so threads only add overhead (Vue core: 4.3 s inline vs 5.8 s with 2 workers). They help on 2+ cores. Run `WORKER_THREADS=0 node benchmarks/run.mjs ...` and `WORKER_THREADS=auto node benchmarks/run.mjs ...` on your machine and record both.

## Load test (`node benchmarks/load.mjs expressjs/express`, server and load generator on the same single core)

30 simultaneous cold requests for one repository: **1 analysis id, 1 download**, 1.6 s total (the stampede is collapsed into one job).

| Endpoint | Concurrency | req/s | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- | --- |
| POST /analyze (cached) | 1 | 128 | 6.7 | 14.0 | 29.4 |
| GET /files | 1 | 250 | 3.1 | 8.7 | 17.6 |
| GET /search | 1 | 357 | 1.9 | 8.5 | 17.9 |
| GET /files | 10 | 405 | 21.6 | 45.3 | 77.2 |
| GET /search | 10 | 446 | 18.2 | 47.7 | 92.2 |
| GET /files | 50 | 424 | 89.3 | 248.9 | 420.4 |
| GET /search | 50 | 588 | 69.1 | 141.8 | 628.2 |

These were measured before the stored repeat response was added, and with the load generator competing for the one core. Re-run on separate machines for real capacity numbers. No request failed at any concurrency.

## Git churn (separate lazy request)

| Repo | Time | Commits in window |
| --- | --- | --- |
| `expressjs/express` | about 0.8 s | 95 (365 days) |
| `vuejs/core` | a few seconds | 428 (365 days) |

## Browser (production build, headless Chromium, `benchmarks/ui_latency.py`)

| Graph | Idle | While interacting | Interactive after click | Fully refined |
| --- | --- | --- | --- | --- |
| Vue core, 528 nodes / 1,790 edges | 60 fps | 32 to 56 fps (software rendering) | 2.5 to 2.7 s (cached server) | about 5 s |

The layout is the slow part of drawing: fcose's full-quality mode takes 3 to 4.5 s on this graph whatever its options (iteration count, component packing and tiling were all tried), and its fast "draft" mode is 8x quicker but leaves 15x more overlapping nodes. So the page shows the draft first and glides to the refined layout when the worker finishes. Add `?debug` to the URL for an fps counter and record the low value on your own machine.

> **Note on what ships.** These browser numbers were measured with an experimental mode that showed a quick draft layout first and then glided into the refined one. That mode is not in this version, to keep the interface exactly as designed. The layout still runs in a Web Worker, so the page does not freeze, but it appears once at the same quality as before. For graphs over 600 nodes that is the `draft` quality, as it always was. Re-run `benchmarks/ui_latency.py` to get numbers for this build.

## Correctness guards

Every optimization above is checked against an obviously correct slower version:

- **Extraction:** `tests/reference/` keeps the original two-query extractors and metrics walk. `tests/differential.test.js` compares them with the fast ones on sample code and on 100+ real files, and `node benchmarks/corpus-check.mjs vue.zip` does it for a whole repository: **0 mismatches over 528 Vue files**.
- **Blast radius:** 900 random graphs compared with the per-file BFS (`tests/graphProperties.test.js`), including word boundaries of the bitsets, self-loops, duplicate and unknown edges.
- **Cycles:** 300 random graphs compared with "each file can reach the other", plus a check that every reported loop is a real chain of edges.
- **Caller lookup:** compared with a plain search on 100 random nested layouts.
- **Analysis cache:** identical results with and without it; different languages and edited files never share an entry.
- **Fuzzing:** truncated, damaged, binary and 3,000-deep inputs never throw (`tests/robustness.test.js`).

## Coverage

Backend: 98% statements, 93% branches, 98% functions (floor enforced in CI). Frontend logic (models, services, reducers): 97% statements. Views and hooks are covered by the browser run rather than unit tests.

## How to re-run

```bash
node benchmarks/run.mjs expressjs/express vuejs/core pallets/flask   # table of timings
node benchmarks/stages.mjs vuejs/core                                  # per-stage timings
node benchmarks/corpus-check.mjs /path/to/repo.zip                     # fast vs reference extractors
RATE_LIMIT_PER_MINUTE=100000 RATE_LIMIT_READ_PER_MINUTE=100000 npm run start --prefix backend
node benchmarks/load.mjs expressjs/express                             # load test (other terminal)
npm run build --prefix frontend && npm run preview --prefix frontend   # then:
python3 benchmarks/ui_latency.py vuejs/core                            # browser latency (needs playwright)
npm run coverage --prefix backend                                      # coverage with thresholds
```
