# ATLO — Understanding & Full Build Plan
**Event:** CodeSangam 2026 // Webster (MNNIT Computer Coding Club)
**Problem Statement:** 06 (M3, Medium) — The Astral Cartographer: Interactive Codebase Architecture & AST Explorer
**Project name:** **Atlo** (from "atlas": a map of a codebase)
**Language:** JavaScript (ES modules) everywhere, with JSDoc types

---

## 1. Understand the Problem (in simple words)

Big code projects are confusing. A new developer opens a repo with 500 files and has no idea where to start.

**Atlo is a web app where the user pastes a GitHub link, and the app:**
1. Downloads the repo and reads all source files.
2. Finds which file imports which file.
3. Shows everything as an interactive graph (map).
4. Shows health scores (which files are risky or too complex).
5. Suggests where a newcomer can safely make their first contribution.

Think of it as **Google Maps for a codebase**.

### Key terms

| Term | Simple meaning |
|---|---|
| AST (Abstract Syntax Tree) | A tree form of code. Tools read the tree instead of raw text, so they understand functions, imports, loops |
| Dependency graph | Nodes = files. Edge A → B means "A imports B" |
| Cyclomatic complexity | How many decision paths a function has (`if`, `for`, `while`, `case`, `&&`, `\|\|`, `catch`). Higher = harder to test |
| Circular import | A imports B, B imports A (or a longer loop). Bad design |
| God file | A huge, complex file that many files depend on, and that changes often. Risky |
| Churn | How often a file was changed in git history |
| Blast radius | How many files could break if you change one file |
| Fan-in / Fan-out | Fan-in = how many files import this file. Fan-out = how many files this file imports |

---

## 2. What the Judges Want (from the PS)

### Pass Tier (must finish all)
- [ ] **Repository Ingestion:** public GitHub URL or zip upload, parse folder tree and source files into an index
- [ ] **Interactive Dependency Atlas:** force-directed or hierarchical graph showing imports, links, clusters
- [ ] **Code Exploration Panel:** side-by-side code viewer with file content, token count, cyclomatic complexity, imports
- [ ] **Search & Filter:** find symbols, functions, files; graph centers on result and highlights dependencies

### Victory Tier (bonus, scoring is cumulative)
- [ ] **Deep AST Parsing:** tree-sitter or Babel; call graphs, function dependencies, circular import detection
- [ ] **Architectural Health Scoring:** churn vs complexity heatmap, god files, tech debt hotspots
- [ ] **Smart Onboarding Pathfinder:** good-first-issue path using file change blast radius

### Bonus marks
- Sub-5 second repository parsing
- 60fps graph physics on 500+ nodes

### Deliverables
- [ ] Public GitHub repo with modular parsing pipeline
- [ ] README: AST traversal algorithms and graph rendering optimizations
- [ ] Tool disclosure (every library, framework, AI tool)
- [ ] Large repository benchmarking report

### Event rules to remember
- Max 3 members per team (solo allowed). Final-year students not allowed
- GitHub repo must be created **only after** development period starts
- **No commits after** development period ends (timestamps are audited)
- Clean commit history and a descriptive README
- Zero plagiarism. Plagiarism = disqualification
- Abstract must follow the official website template
- Live viva: you must defend your architecture
- Mentor allotted: ask them, follow their feedback
- Cumulative scoring: be consistent across all rounds

---

## 3. Tech Stack (all JavaScript)

| Part | Tool | Why |
|---|---|---|
| Frontend | React + Vite (JSX) | Fast development |
| Graph view | Cytoscape.js (fcose layout) | Good for clusters, handles 500+ nodes |
| Graph fallback | Sigma.js + graphology (WebGL) | Use if FPS drops below 60 on big graphs |
| Code viewer | Monaco Editor or CodeMirror 6 | Syntax highlighting built in |
| Backend | Node.js + Express (ES modules) | Same language as frontend |
| Parser | tree-sitter (Node bindings) | Required by Victory tier, multi-language |
| Repo download | GitHub zip via codeload | Much faster than `git clone` |
| Churn data | `git clone --filter=blob:none --no-checkout` then `git log --numstat` | Gets history without all file contents |
| Parallelism | `worker_threads` | Parse files in parallel, target < 5s |
| Cache | In-memory Map or SQLite | Same repo loads instantly the second time |
| Testing | Vitest | Unit tests for algorithms |
| Benchmark | Simple Node scripts + browser Performance API | For the report |

**Languages Atlo analyzes:** start with **JavaScript/TypeScript** and **Python** only. Add more only if time remains.

### Using JavaScript safely (no TypeScript)
- Set `"type": "module"` in every `package.json` and use `import` / `export`.
- Describe data shapes with **JSDoc** (see Section 4) and add `// @ts-check` at the top of core files (parser, graph, metrics). VS Code then shows type warnings with zero TypeScript setup.
- Use ESLint to catch typos and unused variables.
- Write unit tests for the data shapes your modules pass to each other. This replaces the safety TypeScript would give.

---

## 4. System Architecture

```
 ┌────────────┐   GitHub URL    ┌─────────────────────────────────────┐
 │  React UI  │ ──────────────► │           Express API               │
 │            │                 │                                     │
 │ - Input    │                 │  1. Ingest (download + unzip)       │
 │ - Graph    │                 │  2. Filter files (ignore junk)      │
 │ - Code     │                 │  3. Parse (tree-sitter, workers)    │
 │ - Search   │ ◄────────────── │  4. Resolve imports → real paths    │
 │ - Heatmap  │   Graph JSON    │  5. Build graph                     │
 └────────────┘                 │  6. Metrics (complexity, tokens)    │
                                │  7. Algorithms (Tarjan, BFS, score) │
                                │  8. Cache result                    │
                                └─────────────────────────────────────┘
```

### Backend pipeline in detail

1. **Ingest:** download zip, unzip in memory (no disk writes). Skip `node_modules`, `dist`, `build`, `.git`, images, lock files, files larger than ~1 MB.
2. **Detect language** by file extension (`.js .jsx .ts .tsx .py`).
3. **Parse** each file with tree-sitter. Extract:
   - imports / requires / `from x import y`
   - function and class definitions
   - function calls (for call graph)
4. **Resolve imports** into real file paths. Example: `./utils` in `src/app.js` becomes `src/utils.js` or `src/utils/index.js`. Handle:
   - relative paths
   - missing file extensions
   - `index` files
   - path aliases from `tsconfig` / `jsconfig` (stretch goal)
   - external packages: mark as "external", do not graph them
5. **Build graph:** nodes = files, edges = imports.
6. **Compute metrics:** lines, tokens, cyclomatic complexity per function and per file, fan-in, fan-out.
7. **Run algorithms** (Section 5).
8. **Return JSON** to the frontend.

### Data shapes (JSDoc, in `shared/types.js`)

```js
// @ts-check

/**
 * @typedef {Object} FuncInfo
 * @property {string} name
 * @property {number} line
 * @property {number} complexity
 */

/**
 * @typedef {Object} FileNode
 * @property {string} id            Path, e.g. "src/utils/helpers.js"
 * @property {"js"|"ts"|"py"} language
 * @property {number} lines
 * @property {number} tokens
 * @property {number} complexity    Total cyclomatic complexity
 * @property {number} fanIn
 * @property {number} fanOut
 * @property {number} [churn]       Commits touching this file
 * @property {number} [godScore]    0..1
 * @property {number} [blastRadius]
 * @property {string} cluster       Top-level folder
 * @property {FuncInfo[]} functions
 */

/**
 * @typedef {Object} Edge
 * @property {string} source
 * @property {string} target
 * @property {"import"|"call"} type
 */

/**
 * @typedef {Object} Analysis
 * @property {FileNode[]} nodes
 * @property {Edge[]} edges
 * @property {string[][]} cycles    Each is a list of file ids
 * @property {{files:number, parseMs:number}} stats
 */

export {};
```

---

## 5. Algorithms (know these for the viva)

### 5.1 Circular import detection: Tarjan's SCC
- Run Tarjan's Strongly Connected Components on the file graph.
- Any component with **more than 1 node** (or a self-loop) is a cycle.
- Time: **O(V + E)**.
- Show cycles in red on the graph and list them in a side panel.

### 5.2 Cyclomatic complexity
- Start at 1 for each function.
- Add 1 for each: `if`, `else if`, `for`, `while`, `case`, `catch`, `&&`, `||`, `?:`.
- Walk the AST once. Time: **O(N)** where N = number of tree nodes.

### 5.3 Call graph
- During the AST walk, record function definitions and call expressions.
- Link calls to definitions by name within the same file or through resolved imports.
- This is approximate (no type info). Say so honestly in the README.

### 5.4 God file score
```
raw   = churn × complexity × (fanIn + fanOut)
score = normalize(raw) to 0..1   (min-max or percentile rank)
```
- Show as a color heatmap on nodes (green → yellow → red).
- Top 10 list as "tech debt hotspots".

### 5.5 Blast radius
- Reverse the graph (dependents instead of dependencies).
- Run BFS from the changed file. Count files reached.
- More files reached = riskier change. Time: **O(V + E)**.

### 5.6 Onboarding pathfinder ("good first file")
A file is a good first contribution if it has:
- low blast radius
- low complexity
- a test file nearby (e.g. `x.test.js` or `tests/test_x.py`)
- some documentation or comments

Rank files by this score. Output an ordered **learning path**: start with simple leaf files, then move toward the core.

### 5.7 Search
- Build an index (Map) of file names and symbols (functions, classes) after parsing.
- On select: `cy.animate({ center })`, highlight the node and its neighbors, dim the rest.

---

## 6. Frontend Plan

### Screens and components
| Component | What it does |
|---|---|
| `RepoInput.jsx` | URL box, "Analyze" button, progress bar, error messages |
| `GraphView.jsx` | Cytoscape graph, zoom/pan, click and hover, cluster colors |
| `CodePanel.jsx` | Monaco viewer, shows tokens, complexity, imports, imported-by |
| `SearchBar.jsx` | Fuzzy search for files and symbols with instant graph centering |
| `HealthView.jsx` | Toggle: churn vs complexity heatmap and top hotspots list |
| `CyclesPanel.jsx` | List of circular import chains, click to highlight |
| `OnboardingPath.jsx` | Ordered list of "start here" files with reasons |
| `StatsBar.jsx` | Files count, parse time, FPS (good for demo and benchmark) |

### Graph performance tips (for 60fps on 500+ nodes)
- Use `fcose` layout once, then fix positions (do not run physics constantly).
- Hide labels when zoomed out.
- Use `textureOnViewport: true` and `hideEdgesOnViewport: true` in Cytoscape during pan and zoom.
- Collapse folders into compound nodes for big repos.
- Fall back to Sigma.js (WebGL) if needed.
- Measure FPS with `requestAnimationFrame` and show it in a debug overlay.

### Design
Dark "blueprint" look with a monospace font, thin lines, and one accent color. Optionally add a Webster-style red and gold accent. Keep it clear and readable first, pretty second.

---

## 7. Folder Structure

```
atlo/
├── README.md
├── package.json              (workspaces, "type": "module")
├── eslint.config.js
├── shared/
│   └── types.js              (JSDoc typedefs)
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── index.js
│   │       ├── routes/analyze.js
│   │       ├── ingest/       (download, unzip, filter)
│   │       ├── parser/       (tree-sitter, per-language extractors)
│   │       ├── resolver/     (import path resolution)
│   │       ├── graph/        (build graph, Tarjan, BFS)
│   │       ├── metrics/      (complexity, tokens, churn, god score)
│   │       ├── onboarding/   (pathfinder)
│   │       └── cache/
│   └── web/
│       └── src/
│           ├── components/
│           ├── hooks/
│           ├── store/
│           └── App.jsx
├── tests/                    (tarjan, resolver, complexity, bfs)
├── benchmarks/               (scripts + results)
└── docs/                     (architecture diagram, screenshots)
```

---

## 8. Phased Build Plan

Finish each phase fully before the next. **Complete the Pass tier first.**

| Phase | Goal | Tier | Done when |
|---|---|---|---|
| 0 | Read abstract template, write abstract, create repo (after dev starts) | Setup | Abstract submitted, empty monorepo with first commit |
| 1 | URL input, zip download, unzip, file tree JSON | Pass | Paste URL, see list of files |
| 2 | Parse JS/TS imports, resolve paths, build graph, render in Cytoscape | Pass | Graph appears for a small repo |
| 3 | Code panel, tokens, complexity, search with zoom-to-node | Pass | All 4 Pass features working |
| 4 | Worker threads, caching, error handling, Python support | Pass+ | Medium repo parses in < 5s |
| 5 | tree-sitter call graph, Tarjan cycles | Victory | Cycles listed and highlighted |
| 6 | Git churn, god score, heatmap | Victory | Heatmap toggle works |
| 7 | Blast radius and onboarding pathfinder | Victory | "Start here" path shown |
| 8 | Tests, benchmarks, README, 3 failure cases, UI polish | Final | All deliverables ready |
| 9 | Viva prep | Final | You can explain every algorithm without notes |

### If you have less time
Cut in this order (first item is cut first): Python support, call graph depth, fancy UI, onboarding path details. **Never cut** the Pass tier, README, tests, or benchmarks.

### Sample timeline (adjust to your real days)
| Days | Focus |
|---|---|
| 1 | Phase 0 and 1 |
| 2–3 | Phase 2 and 3 |
| 4 | Phase 4 |
| 5–6 | Phase 5 and 6 |
| 7 | Phase 7 |
| 8 | Phase 8 |
| Last day | Phase 9 and a final check, no new features |

### Team split (if 3 members)
- **Member A (backend):** ingest, parser, resolver, metrics
- **Member B (graph/algorithms):** graph building, Tarjan, BFS, scoring, tests
- **Member C (frontend):** graph UI, code panel, search, design

If solo, follow the phases in order.

---

## 9. Testing Plan

| What | How |
|---|---|
| Tarjan SCC | Small graphs with known cycles, a self-loop, and no cycles |
| Import resolver | Relative paths, missing extensions, `index` files, external packages |
| Complexity | Tiny code snippets with known expected numbers |
| Blast radius | Chain, diamond and disconnected graphs |
| Ingest filter | Confirm `node_modules` and binaries are skipped |
| Data shapes | Check each module's output has the expected fields (replaces TypeScript's safety) |
| Integration | Run the full pipeline on one small fixture repo and assert on the JSON |
| Error cases | Invalid URL, private repo, huge repo, empty repo, rate limit |

---

## 10. Benchmark Plan (required deliverable)

Test on at least 3 repos of different sizes:

| Size | Example repos |
|---|---|
| Small (< 100 files) | a small personal or demo project |
| Medium (100–500 files) | `expressjs/express` |
| Large (500+ files) | `facebook/react`, `vuejs/core` or similar |

Record in a table:

| Repo | Files | Parse time (cold) | Parse time (cached) | Graph FPS (pan/zoom) | Memory |
|---|---|---|---|---|---|

Also record:
- before/after numbers for your optimizations (worker threads, caching, zip vs clone)
- machine specs used

Targets: **parse < 5s**, **graph 60fps on 500+ nodes**.

---

## 11. Failure Cases (write these in the README)

Pick 3 or more edge cases and explain how Atlo recovers:
1. **Private or missing repo / GitHub rate limit:** show a clear error and suggest zip upload.
2. **Very large repo (timeout, memory):** file-count and file-size limits, partial results with a warning.
3. **Unresolvable imports (aliases, dynamic imports):** mark as "unresolved" and keep going, never crash.
4. **Parse error in one file:** skip that file, log it, continue.
5. **Unsupported language:** show the file in the tree but with no edges.

---

## 12. README Outline

1. **Atlo**: one-line pitch, screenshot or GIF
2. Problem and target users
3. Features (Pass and Victory, with checkmarks)
4. Architecture diagram
5. **AST traversal algorithms** (how you walk the tree, what you extract)
6. **Graph rendering optimizations** (layout, hiding labels, WebGL fallback)
7. Algorithms: Tarjan, blast radius, god score, with complexity
8. Benchmark results
9. 3 failure cases and recovery
10. Tests: how to run
11. **Tool disclosure:** every library, framework, and any AI tool used and for what
12. Setup and run instructions (one command if possible)
13. Team and mentor

---

## 13. Viva Preparation

Be ready to answer:
- Why tree-sitter and not regex? *(Regex breaks on comments, strings, and multiline imports. AST is accurate.)*
- Why JavaScript and not TypeScript? *(One language across frontend and backend, faster setup. JSDoc with `@ts-check` gives type warnings in the editor, and tests check the data shapes.)*
- How does Tarjan's algorithm work, and why O(V + E)?
- How do you resolve `./utils` to a real file?
- How is the god score defined, and why those inputs?
- What does blast radius mean and how is it computed?
- How did you reach 60fps with 500+ nodes?
- What are the limits of your call graph? *(No type info, so it is approximate.)*
- What was your hardest technical decision? *(Prepare one real story.)*
- What AI tools did you use and which parts did you write yourself?

**Rule for yourself:** do not keep any code you cannot explain line by line.

---

## 14. Rules Checklist (do not lose marks here)

- [ ] Repo created **after** development period starts
- [ ] No commits after development period ends
- [ ] Small, meaningful commits (not one giant commit)
- [ ] README complete, tool disclosure honest
- [ ] Abstract follows the website template exactly
- [ ] Talked to the mentor and applied feedback
- [ ] Original code only, no copied projects
- [ ] Demo works on a fresh machine (`npm install && npm run dev`)
- [ ] Demo repo URLs tested in advance, plus a backup zip
- [ ] Checked that the name "Atlo" is not already a well-known project on GitHub or npm

---

## 15. Demo Script (for judges)

1. Paste a medium repo URL into Atlo, show the progress and the parse time.
2. Show the graph, zoom and pan smoothly, show the FPS counter.
3. Click a file, show the code, complexity and imports.
4. Search a function, watch the graph center on it.
5. Show a circular import in red.
6. Toggle the heatmap, point to the top god file.
7. Open the onboarding path, explain the first suggested file.
8. Show the benchmark table and the test results.

---

## 16. Quick Start (first 2 hours)

1. Create the repo `atlo` (only after the dev period starts) and add the monorepo skeleton with `"type": "module"`.
2. Build `POST /analyze` that takes a URL and returns the list of files from the zip.
3. Add `apps/web` with an input box that calls it and prints the file list.
4. Commit. Then begin the JS/TS import parser (Phase 2).
