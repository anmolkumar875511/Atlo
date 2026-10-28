# Atlo frontend

React 19 + Vite web app. Paste a repository URL, see stats, an interactive dependency graph (Cytoscape.js), a code panel (CodeMirror 6) with complexity and token counts, search, and a file tree. MVC on the client.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api to http://localhost:4000)
npm run check      # lint + format check + tests
npm run build      # production build in dist/
```

Set `VITE_API_BASE_URL` (see `.env.example`) when the API is on another origin.

## Structure (`src/`)

| Folder         | Layer      | Job                                                                |
| -------------- | ---------- | ------------------------------------------------------------------ |
| `views/`       | View       | Components and their CSS. No fetch, no business logic.             |
| `controllers/` | Controller | `useAnalyze` hook and the pure `analyzeReducer` state machine.     |
| `services/`    | Service    | `http.js` (fetch wrapper) and `atloApi.js` (API calls).            |
| `models/`      | Model      | Tree filter, formatting helpers, `ApiError` and user-facing hints. |
| `constants/`   |            | API prefix and error codes (mirrored from the backend).            |
| `styles/`      |            | `tokens.css` (colour, type, spacing) and `base.css`.               |

Design tokens: edit the raw palette block in `styles/tokens.css` to re-theme the whole app.

Add `?debug` to the URL to show an FPS counter on the graph.
