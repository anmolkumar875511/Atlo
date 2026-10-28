import { basisLabel, churnReason, heatColor } from '../../models/heat.js';

export default function HotspotsTab({ health, onOpen }) {
  if (health.status === 'idle' || health.status === 'loading') {
    return (
      <p className="insight__note" role="status">
        Reading git history for the last year… the first time can take a few seconds.
      </p>
    );
  }
  if (health.status === 'error') {
    return (
      <div className="insight__note" role="alert">
        <p>{health.error.message}</p>
        <button type="button" className="insight__button" onClick={health.retry}>
          Try again
        </button>
      </div>
    );
  }

  const report = health.data;
  return (
    <div className="insight">
      <p className="insight__lead">
        <strong>{basisLabel(report)}.</strong> A file ranks high when it changes often, is hard to
        read, and many files are tied to it.
      </p>
      {report.churn.available ? (
        <p className="insight__meta">
          {report.churn.commits.toLocaleString('en-US')} commits
          {report.churn.windowDays
            ? ` in the last ${report.churn.windowDays} days`
            : ' (recent history)'}
          .
        </p>
      ) : (
        <p className="insight__warn" role="note">
          Scores use structure only: {churnReason(report.churn.reason)}.{' '}
          <button type="button" className="insight__link" onClick={health.retry}>
            Retry
          </button>
        </p>
      )}

      {report.hotspots.length === 0 ? (
        <p className="insight__note">
          No hotspots: nothing here is both busy and tightly connected.
        </p>
      ) : (
        <ol className="insight__list">
          {report.hotspots.map((spot, i) => (
            <li key={spot.id} className="insight__row">
              <span className="insight__rank">{i + 1}</span>
              <div className="insight__main">
                <button type="button" className="list__link" onClick={() => onOpen(spot.id)}>
                  {spot.id}
                </button>
                <div className="insight__bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.round(spot.godScore * 100)}%`,
                      background: heatColor(spot.godScore),
                    }}
                  />
                </div>
                <p className="insight__facts">
                  {spot.churn !== null && <span>churn {spot.churn}</span>}
                  <span>complexity {spot.complexity}</span>
                  <span>
                    fan-in {spot.fanIn} · fan-out {spot.fanOut}
                  </span>
                  {spot.blastRadius !== null && <span>blast {spot.blastRadius}</span>}
                </p>
              </div>
              <span className="insight__score" title="Percentile rank, 0 to 100">
                {Math.round(spot.godScore * 100)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
