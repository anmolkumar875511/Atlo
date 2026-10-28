import { renderAnalyze } from '../views/analyze.view.js';

export class AnalyzeController {
    constructor({ repoAnalysisService }) {
        this.service = repoAnalysisService;
        this.analyze = this.analyze.bind(this);
    }

    async analyze(req, res) {
        const result = await this.service.analyze(req.body.url);
        res.status(200).json(renderAnalyze(result));
    }
}
