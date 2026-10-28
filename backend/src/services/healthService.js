import { SnapshotNotFoundError } from '../lib/errors.js';
import { buildHealthReport } from '../models/healthReport.js';

// Code health: churn x complexity x coupling. Reading git history can take seconds, so it is not
// part of /analyze. It runs the first time the Health view is opened and is then kept on the
// snapshot. Concurrent requests for the same repository share one git clone.
export class HealthService {
    constructor({ snapshotRepository, churnClient, logger }) {
        this.snapshots = snapshotRepository;
        this.churnClient = churnClient;
        this.logger = logger;
        this.inFlight = new Map();
    }

    async getReport(id) {
        const snapshot = this.snapshots.findById(id);
        if (!snapshot) throw new SnapshotNotFoundError();
        if (snapshot.health) return snapshot.health;

        let pending = this.inFlight.get(id);
        if (!pending) {
            pending = this.#compute(snapshot).finally(() => this.inFlight.delete(id));
            this.inFlight.set(id, pending);
        }
        return pending;
    }

    async #compute(snapshot) {
        const churn = this.churnClient
            ? await this.churnClient.fetch(snapshot.repo)
            : { available: false, reason: 'disabled' };
        const report = buildHealthReport({ nodes: snapshot.graph.nodes, churn });
        // A failed git run is not cached, so opening the view again retries it.
        if (churn.available) snapshot.health = report;
        this.logger.info(
            {
                repo: `${snapshot.repo.owner}/${snapshot.repo.name}`,
                available: churn.available,
                reason: churn.reason,
                commits: churn.commits,
                ms: churn.ms,
            },
            'health report built'
        );
        return report;
    }
}
