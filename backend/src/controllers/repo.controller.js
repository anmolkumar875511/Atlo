import { renderFile, renderHealth, renderSearch } from '../views/repo.view.js';

// Matches the snapshot TTL (30 minutes); after that the server answers 404 anyway.
const IMMUTABLE_SECONDS = 600;

// An analysis never changes once made, so the browser may reuse an answer until it expires.
const cacheable = (res) => res.set('Cache-Control', `private, max-age=${IMMUTABLE_SECONDS}`);

export class RepoController {
    constructor({ repoQueryService, healthService }) {
        this.service = repoQueryService;
        this.healthService = healthService;
        this.file = this.file.bind(this);
        this.search = this.search.bind(this);
        this.health = this.health.bind(this);
    }

    // GET /api/repos/:id/files?path=src/index.js
    file(req, res) {
        const { id } = req.valid.params;
        const { path } = req.valid.query;
        const details = this.service.getFile(id, path);
        cacheable(res); // set only after success: a cached 404 would outlive a fresh analysis
        res.json(renderFile(details));
    }

    // GET /api/repos/:id/search?q=router&limit=20
    search(req, res) {
        const { id } = req.valid.params;
        const { q, limit } = req.valid.query;
        const results = this.service.search(id, q, limit);
        cacheable(res);
        res.json(renderSearch(q, results));
    }

    // GET /api/repos/:id/health   (reads git history the first time, so it can take a few seconds)
    async health(req, res) {
        const { id } = req.valid.params;
        res.json(renderHealth(await this.healthService.getReport(id)));
    }
}
