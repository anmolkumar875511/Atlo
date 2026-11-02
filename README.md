# ✦ Atlo — The Astral Cartographer

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Node >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)

Paste a GitHub URL. Atlo downloads the repository, parses every source file, and draws an interactive map of how the code fits together: dependencies, circular imports, call links, risky files, and where a newcomer should start.

<!-- Add a screenshot or GIF here: docs/images/atlo-demo.gif -->

**Docs:** [How it works](docs/HOW_IT_WORKS.md) · [Architecture](docs/ARCHITECTURE.md) · [Benchmarks](docs/BENCHMARKS.md)

## Features

**Core**

- [x] Repository ingestion from a public GitHub URL (zip, in memory, safety limits)
- [x] Interactive dependency atlas (Cytoscape.js, fcose layout, clusters by folder)
- [x] Code panel: CodeMirror viewer, tokens, complexity, imports, imported-by, symbols
- [x] Search for files, functions and classes; the graph centres on the result and highlights its neighbours

**Advanced analysis**

- [x] Deep AST parsing with tree-sitter (JavaScript, TypeScript, **Python**), call graph, circular import detection (Tarjan)
- [x] Architectural health: churn x complexity x coupling heatmap, god files, top-10 hotspots
- [x] Smart onboarding pathfinder: blast radius based "start here" files and an ordered learning path

**Performance:** a large repository (Vue core) parses in under 5 s; the graph stays at 60 fps on 500+ nodes at idle (add `?debug` to the URL to measure on your machine). See [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md).

## Repository layout

Two independent projects. Each has its own `package.json`, lint config, tests and README. They only talk over HTTP.

```
atlo/
├── backend/      Express API (MVC): ingest, parse, resolve, graph, algorithms
├── frontend/     React + Vite web app (MVC): graph, code panel, insights
├── benchmarks/   run.mjs: cold and cached timings for any repositories
├── docs/         Architecture, pipeline notes, benchmark report
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

## Built with

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
| Claude (Anthropic) | Assisted with scaffolding, code, tests and documentation. |

## Team

Astraeon — Krishan Kumar, Rahul Kumar, Anmol Kumar.

Built for CodeSangam 2026 (Webster, MNNIT Computer Coding Club).

## License

[MIT](LICENSE). See also the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).
