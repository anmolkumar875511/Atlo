# Atlo backend

Express API (ES modules, MVC). See the root README for the API contract and algorithm notes.

```
src/
├── routes/ validators/ middleware/   HTTP edge
├── controllers/ views/               request -> service -> JSON
├── services/
│   ├── ingest/                       zip download, filter, unzip
│   ├── parser/                       tree-sitter, imports, metrics, calls, worker pool
│   ├── resolver/                     JS/TS and Python import resolution
│   ├── churn/ healthService.js       git history -> health report
│   └── sourceAnalysisService.js      the pipeline
├── models/                           pure algorithms: graph, Tarjan, blast radius, call graph, health, onboarding
├── repositories/ lib/ config/        cache, errors, env
└── container.js                      composition root
```

`npm run dev` · `npm test` · `npm run check`. Settings are in `.env.example`.
