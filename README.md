# ✦ Atlo — The Astral Cartographer

Paste a GitHub URL. Atlo downloads the repository, parses every source file, and draws an interactive map of how the code fits together: dependencies, circular imports, call links, risky files, and where a newcomer should start.

> CodeSangam 2026 · Webster · PS 06 — Interactive Codebase Architecture & AST Explorer · Team Astraeon

**Status: v1.0, all phases built.** Pass tier and Victory tier. Full plan: [`docs/ATLO_PLAN.md`](docs/ATLO_PLAN.md). Architecture diagram: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Benchmarks: [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md).

## Features

**Pass tier**

- [x] Repository ingestion from a public GitHub URL (zip, in memory, safety limits)
- [x] Interactive dependency atlas (Cytoscape.js, fcose layout, clusters by folder)
- [x] Code panel: CodeMirror viewer, tokens, complexity, imports, imported-by, symbols
- [x] Search for files, functions and classes; the graph centres on the result and highlights its neighbours

**Victory tier**

- [x] Deep AST parsing with tree-sitter (JavaScript, TypeScript, **Python**), call graph, circular import detection (Tarjan)
- [x] Architectural health: churn x complexity x coupling heatmap, god files, top-10 hotspots
- [x] Smart onboarding pathfinder: blast radius based "start here" files and an ordered learning path

**Bonus targets:** parse under 5 s (met, see benchmarks) · 60 fps on 500+ nodes (met at idle; measure on your GPU with `?debug`).

## Repository layout

Two independent projects. Each has its own `package.json`, lint config, tests and README. They only talk over HTTP.

```
atlo/
├── backend/      Express API (MVC): ingest, parse, resolve, graph, algorithms
├── frontend/     React + Vite web app (MVC): graph, code panel, insights
├── benchmarks/   run.mjs: cold and cached timings for any repositories
├── docs/         Plan, architecture diagram, benchmark report
├── .github/      CI: separate jobs for backend and frontend
└── package.json  Convenience scripts to run both together
```

Backend MVC map: `routes/` + `validators/` -> `controllers/` -> `services/` -> `models/` (pure algorithms) and `repositories/` (cache), shaped for the client by `views/`. `container.js` is the only place that wires things together.
Frontend MVC map: `views/` (React components) -> `controllers/` (hooks and reducers) -> `models/` (pure functions) and `services/` (fetch).

## Quick start

Needs Node 20 or newer. `git` on the server is optional (only for churn).

```bash
npm install            # root helper (concurrently)
npm run install:all    # installs backend/ and frontend/
npm run dev            # API on :4000, web on :5173
```

Open http://localhost:5173 and paste `https://github.com/expressjs/express`. Add `?debug` to the URL for an FPS counter.

| Command (from root) | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Backend (auto-restart) and frontend together |
| `npm test`          | Backend and frontend tests                   |
| `npm run check`     | Lint + format check + tests for both         |
| `npm run build`     | Production build of the frontend             |
| `node benchmarks/run.mjs owner/repo ...` | Benchmark table for the report  |

## API

`POST /api/analyze` with `{ "url": "https://github.com/owner/repo" }` (also accepts `owner/repo` and `/tree/<tag>`).

```jsonc
{
  "data": {
    "id": "a1b2c3d4e5f60718",
    "repo": { "owner": "vuejs", "name": "core", "ref": null, "url": "https://github.com/vuejs/core" },
    "cached": false,
    "stats": { "files": 697, "dirs": 97, "totalBytes": 5871000, "ingestMs": 510, "truncated": false, "skipped": { } },
    "tree": { "type": "dir", "name": "core", "children": [ ] },
    "graph": {
      "nodes": [{ "id": "packages/runtime-core/src/component.ts", "language": "ts", "lines": 1200, "tokens": 9000,
                  "complexity": 119, "fanIn": 63, "fanOut": 28, "cluster": "packages/runtime-core",
                  "blastRadius": 234, "inCycle": true, "isTest": false }],
      "edges": [{ "source": "a.ts", "target": "b.ts", "type": "import" }],
      "callEdges": [{ "source": "a.ts", "target": "b.ts", "type": "call", "count": 3, "names": ["parse"] }],
      "cycles": [{ "id": "cycle-1", "size": 2, "files": ["a.ts", "b.ts"], "path": ["a.ts", "b.ts"] }],
      "externals": [], "unresolved": [],
      "stats": { "nodes": 528, "edges": 1790, "cycles": 8, "callEdges": 701, "parseMs": 3885, "parseMode": "inline" }
    },
    "onboarding": {
      "starters": [{ "id": "x.js", "score": 0.93, "blastRadius": 0, "complexity": 4, "testFile": "x.test.js", "reasons": [] }],
      "path": [{ "id": "x.js", "stage": "warm-up", "why": "Easy and safe: read it, then try a small change." }]
    }
  }
}
```

- `GET /api/repos/:id/files?path=...` one file: `content`, `metrics` (tokens, complexity, commentLines), `functions` (each with `calls` and `calledBy`), `classes`, `imports`, `importedBy`, `blastRadius`.
- `GET /api/repos/:id/search?q=router&limit=20` ranked matches for files, classes and functions.
- `GET /api/repos/:id/health` reads git history (first call only, then cached): per-file `churn` and `godScore` (0..1) and the top-10 `hotspots`. If git is missing, slow or the repo is private it still answers with `basis: "structural"` and says why in `churn.reason`.

`:id` is the `id` from the analyze response. Expired analyses (30 minutes) return `404 SNAPSHOT_NOT_FOUND`. Errors always look like `{ "error": { "code", "message", "requestId", "details?" } }`. Error codes live in `backend/src/constants/errorCodes.js` and are mirrored in `frontend/src/constants/errorCodes.js`. If you change one, change the other.

## How it works

**Phase 1: ingestion**

1. **Parse URL**: strict owner/repo regex, github.com only.
2. **Cache check**: snapshot id = hash of `owner/repo@ref`. A hit returns in about 10 ms. Concurrent requests for the same repo share one download.
3. **Download**: one zip from `codeload.github.com` with a timeout and a size cap checked on the header and while streaming.
4. **Unzip in memory** (`fflate`): its filter runs before decompression, so junk (`node_modules`, lock files, images, files over 1 MB) is never inflated. Zip-slip paths are rejected. File-count and total-size budgets stop zip bombs.
5. **Index**: file text stays in the backend snapshot. Only the tree, graph and stats go to the browser.

**Phase 2: imports and graph**

6. **Parse** each `.js .jsx .mjs .cjs .ts .tsx` file with tree-sitter (native bindings). One compiled query per grammar returns only the import nodes: `import`, `export ... from`, `require()`, `import()` and TypeScript `import x = require()`. Because it reads the syntax tree, imports inside comments and strings are never counted.
7. **Resolve** each import string to a real file (`importResolver.js`): exact file, then missing extensions, then a folder's `index` file. TypeScript's `./a.js` finds `a.ts`. `tsconfig.json` / `jsconfig.json` `baseUrl` and `paths` aliases are supported. Packages are marked external. Anything we cannot place is recorded as unresolved with a reason (`dynamic`, `alias`, `not-found`, `outside-repo`) and the run continues.
8. **Build the graph** (`dependencyGraph.js`): nodes are source files, edges are unique "A imports B" links, with fan-in, fan-out, line count and a folder group. Pure function, easy to test.
9. **Draw it** (frontend): Cytoscape.js with the `fcose` layout run once, then positions stay fixed. Labels hide when zoomed out, edges hide while panning, and big graphs use cheap straight edges.

**Phase 3: metrics, code panel and search**

10. **Metrics in one pass** (`metricsExtractor.js`): one cursor walk over the syntax tree gives tokens, per-function complexity, and the named functions and classes. Each file is parsed once and shared with the import extractor.
    - **Complexity** (McCabe): a function starts at 1 and gains 1 for each `if`, `else if`, `for`, `while`, `do`, `case`, `catch`, `?:`, `&&`, `||` and `??`. A nested function is counted on its own. A file's complexity is 1 plus every decision point in it. Bands for a function: 1–10 simple, 11–20 moderate, 21–50 complex, over 50 very complex.
    - **Tokens** are the parser's syntax tokens (keywords, names, operators, punctuation). Comments are not counted.
    - Functions without a name (callbacks) are counted in the file total but not listed.
11. **Search index** (`searchIndex.js`): built once per analysis from file names, functions and classes. Ranking: exact name, then method name after the dot, then prefix, then substring, then folder path, then fuzzy letter order.
12. **On-demand file endpoint**: the code panel fetches a file only when it is opened, so the main response stays small.
13. **Code panel** (frontend): CodeMirror 6, read-only, loaded only when the first file is opened. Tabs: Code, Imports and Used by, Symbols (sorted by complexity, click to jump to the line).
14. **Search to graph**: picking a result highlights the file and its neighbours, dims the rest, centres the graph on it and scrolls the code to the line.

**Phase 4: speed, Python, caching**

15. **Worker threads** (`workerPool.js`, `analysisRunner.js`, `parseWorker.js`): files are split into byte-balanced chunks (biggest first) and parsed in a small pool. Each worker owns its tree-sitter parsers and returns plain objects. Below 40 files the work stays inline, because starting workers costs more than it saves. If a worker crashes the chunk is parsed inline, so the optimization can never fail a request.
16. **Python** (`pythonResolver.js`): `import a.b`, `from a.b import c`, relative imports (`from ..x import y`), packages and `__init__.py`. Source roots are detected (the folder that contains a top-level package, plus `src/` and `lib/`). `from pkg import name` links to `pkg/name.py` when `name` is a submodule and to the package file only when `name` is something defined inside it, which avoids a false cycle for every package that imports its own submodules. Python metrics use the same single walk with a Python profile (`elif`, `except`, `and`/`or`, comprehensions; docstrings count as documentation).
17. **Cache**: snapshots live in an LRU with a 30 minute TTL; the same repo twice answers in under 1 ms, and concurrent requests share one download.

**Latency pass** (numbers in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md))

17a. **One query for imports and calls** (`scanExtractor.js`): every query walks the whole tree, so the two separate queries were merged and the `#eq?` predicate (which runs in JavaScript for every call) was removed: `require()` is spotted from the call name instead. The metrics walk asks the cursor for the numeric node-type id instead of the type name. Together: Vue core 3.9 s to 2.4 s.
17b. **Content-hash analysis cache** (`analysisRunner.js`): a file's analysis is stored by hash of its text, so re-analyzing a repository (snapshot expired, another branch, a fork) only parses files that changed. Repeat `/analyze` responses are stored already gzipped, and file and search responses carry `Cache-Control`. `Server-Timing` shows where each request's time went. Set `ANALYSIS_CACHE_ENTRIES=0` to turn the cache off.
17c. **Blast radius in O(E x V / 32)**: see item 23. 20,000 files: 15.3 s to 68 ms.
17d. **Layout in a Web Worker** (`workers/layout.worker.js`, `layoutClient.js`, `layoutPlan.js`): the force layout runs on a background thread, so the page no longer freezes while it is computed, and it looks exactly as before. The graph code and the worker are preloaded while the server analyses. If workers are unavailable, layout falls back to the main thread.

**Phase 5: call graph and cycles**

18. **Call sites** (`scanExtractor.js`, in the same query as imports, see 17a): one tree-sitter query finds `f()`, `obj.f()` and `new F()`. Each call is attributed to the smallest named function that contains its line.
19. **Call linking** (`callGraph.js`): a call is matched by name, first in its own file, then in the files it imports. A plain call can reach a function or class; a member call `x.f()` can reach a method (or any function through an imported module). This is **approximate**: there is no type information, so two functions with the same name can be mixed up, and calls through variables or `this` chains are not followed.
20. **Circular imports, Tarjan SCC** (`graphAlgorithms.js`): one depth-first search keeps, for each node, its discovery order and the lowest order reachable from its subtree. When they are equal the node roots a strongly connected component, popped from a stack. Components with more than one file (or a self-import) are cycles. **O(V + E).** The recursion is replaced by an explicit stack, so a 60,000-file import chain does not overflow (there is a test for it). A breadth-first search inside the component finds one concrete loop (`a -> b -> c -> a`) to show.

**Phase 6: health**

21. **Churn**: `git clone --filter=blob:none --no-checkout --shallow-since=365.days.ago` fetches commits and trees but no file contents, then `git log --name-only` counts commits per file. It runs in a separate lazy request so `/analyze` stays fast, and the oldest (parentless) commit of a shallow clone is skipped because it would list every file as changed.
22. **God file score**: `raw = churn x complexity x (fanIn + fanOut)`, turned into a 0..1 **percentile rank** (ties share their average rank). Raw products are extremely lopsided, and min-max scaling would paint nearly everything green. A file scores high only if all three are high. Without git history, churn counts as 1 and the report says `basis: "structural"`.

**Phase 7: blast radius and onboarding**

23. **Blast radius**: how many files could break if this file changes (everything that depends on it, directly or through other files; the file itself is not counted). Files in the same circular group all share one answer, and on the condensed graph (a DAG) "who depends on me" is a bitset union, so the cost is O(E x V / 32) instead of one breadth-first search per file, O(V (V + E)). Selecting a file with the "Blast radius" toggle lights up exactly that set. The original search is kept in `backend/tests/reference/` and compared on random graphs.
24. **Onboarding score** (0..1): 40% small blast radius, 30% low complexity, 20% has a test (a file named after it, or a test that imports it), 10% documented (comment and docstring lines). Files under 8 lines are down-weighted. The **learning path** has three stages: warm-up (best starters), connect (what those files import, least used first) and core (the hubs most files depend on, chosen first so the path always ends there).

**Graph rendering optimizations** (frontend)

- fcose layout runs **once**; positions are then fixed, so panning never restarts physics.
- Labels hide when zoomed out (`min-zoomed-font-size`); `textureOnViewport` and `hideEdgesOnViewport` draw a cached image while panning and zooming.
- Graphs over 600 edges use straight haystack edges instead of curved arrows; over 600 nodes the layout uses the `draft` quality.
- Heat colour, cycle rings, call links and blast radius are **style changes only**: no layout re-run. Call edges are created once and toggled with a class.
- Cytoscape, CodeMirror and the graph screen are lazy-loaded.
- Fallback if 60 fps ever fails on a very large graph: Sigma.js (WebGL). It was not needed for the repositories tested.

Measured results are in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md).

## Failure cases and recovery

1. **Private or missing repo, GitHub rate limit:** a clear error with a code (`REPO_NOT_FOUND`, `UPSTREAM_RATE_LIMITED`); set `GITHUB_TOKEN` to raise limits.
2. **Very large repo:** file-count, file-size, zip-size and total-size budgets stop zip bombs; partial results are shown with a warning banner.
3. **Unresolvable imports** (aliases, computed paths, `import()` of a variable): recorded as `unresolved` with a reason, never graphed, never a crash.
4. **Parse error in one file:** tree-sitter returns a partial tree; imports found are kept and the file is counted in "syntax errors". A thrown error skips only that file.
5. **Git unavailable** (not installed, timeout, private repo): the Health view still works with a structural score and explains why; the failure is not cached, so it retries.
6. **Worker crash:** the chunk is re-parsed on the main thread.
7. **Unsupported language:** shown in the tree and code viewer, no edges.

## Testing

```bash
npm test          # backend (Vitest + supertest) and frontend (Vitest)
npm run check     # lint + format + tests
npm run coverage --prefix backend    # coverage with enforced thresholds (also frontend)
```

About 390 tests. Beyond example-based tests the suite has:

- **Differential tests:** each optimized component is compared with the slow original kept in `backend/tests/reference/` (extractors, metrics, blast radius), on samples, on this repository's own source files, and on whole repositories via `benchmarks/corpus-check.mjs` (0 mismatches over 528 Vue files).
- **Property tests:** 900 random graphs for blast radius and 300 for Tarjan against brute-force oracles; random nested layouts for the caller lookup.
- **Fuzzing:** truncated, damaged, binary, deeply nested (3,000 levels) and huge inputs must never throw; the resolvers must never throw or point outside the repository.
- **Scale tests:** a generated 1,500-file repository through the real HTTP pipeline with exact expected counts; 20,000-node graphs with time budgets.
- **Load test** (`benchmarks/load.mjs`) and a **browser run** (`benchmarks/ui_latency.py`) for latency, long tasks and fps.
- **Real git:** the churn client is tested against a real local repository.
- **CI:** `.github/workflows/ci.yml` runs lint, the full suite and the coverage floors on every push and pull request.

Covered: Tarjan (no cycle, 2-cycle, longer loop, self-loop, separate cycles, 60k-node chain), blast radius (chain, diamond, disconnected, cycle), god score and percentile ranks, onboarding, call linking, Python imports, metrics and resolver, worker pool equals inline results, git log parsing and a real local git repository, the API end to end on a fixture with a cycle, and the frontend reducers and models.

## Known limits

- Public repositories only. Zip upload is not implemented.
- `/tree/<ref>` uses the first path segment as the ref, so branch names with `/` are not supported.
- Call graph is name based (see above). Dynamic dispatch is invisible.
- Python: no `sys.path` tricks, `importlib` or `__import__`; namespace packages without `__init__.py` resolve as plain folders only when a `.py` file matches.
- Alias support reads the root `tsconfig.json` / `jsconfig.json` only (no `extends`, no per-package configs).
- Churn needs `git` on the server and a clone of the repo (public only); it covers the last 365 days.
- Tokens are parser tokens, not LLM tokens. Complexity is syntax only.
- The cache is in memory and clears on restart. The file tree is not virtualized.
- Native tree-sitter ships prebuilt binaries for Windows, macOS and Linux x64; other platforms need a C++ toolchain.

## Tool disclosure

| Tool | Used for |
| --- | --- |
| Node.js, npm | Runtime and package manager |
| Express 5, helmet, cors, compression, express-rate-limit | HTTP server and hardening |
| zod | Request and env validation |
| fflate | In-memory zip extraction |
| tree-sitter, tree-sitter-javascript, tree-sitter-typescript, tree-sitter-python | Parsing |
| `worker_threads`, `child_process` (Node built-ins) | Parallel parsing; running `git` for churn |
| git | Churn from history |
| pino, pino-http, pino-pretty, dotenv | Logging and env loading |
| React 19, Vite | Web app and dev server |
| Cytoscape.js, cytoscape-fcose | Graph drawing and layout |
| CodeMirror 6 | Read-only code viewer |
| Vitest, supertest | Unit and API tests |
| ESLint, Prettier, concurrently | Code quality and dev workflow |
| Claude (Anthropic) | Assisted with scaffolding and code for Phases 1 to 7, tests and docs. **Before submission, replace this row with exactly what you wrote and can explain yourself.** |

## Team

Astraeon — Krishan Kumar, Rahul Kumar, Anmol Kumar.
