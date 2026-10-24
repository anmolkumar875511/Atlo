import { renderFile, renderSearch } from '../views/repo.view.js';

export class RepoController {
  constructor({ repoQueryService }) {
    this.service = repoQueryService;
    this.file = this.file.bind(this);
    this.search = this.search.bind(this);
  }

  // GET /api/repos/:id/files?path=src/index.js
  file(req, res) {
    const { id } = req.valid.params;
    const { path } = req.valid.query;
    res.json(renderFile(this.service.getFile(id, path)));
  }

  // GET /api/repos/:id/search?q=router&limit=20
  search(req, res) {
    const { id } = req.valid.params;
    const { q, limit } = req.valid.query;
    res.json(renderSearch(q, this.service.search(id, q, limit)));
  }
}
