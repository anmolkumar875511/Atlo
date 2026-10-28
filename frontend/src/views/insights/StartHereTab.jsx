const STAGES = {
  'warm-up': 'Warm-up',
  connect: 'Connect',
  core: 'Core',
};

export default function StartHereTab({ onboarding, onOpen }) {
  if (!onboarding || onboarding.starters.length === 0) {
    return <p className="insight__note">Not enough source files to suggest a starting point.</p>;
  }

  return (
    <div className="insight">
      <p className="insight__lead">
        <strong>A path for a new contributor.</strong> Start with small, well-tested files that few
        others depend on, follow what they import, and finish at the core.
      </p>

      <h3 className="list__heading">Learning path</h3>
      <ol className="insight__list">
        {onboarding.path.map((step, i) => (
          <li key={step.id} className="insight__row">
            <span className="insight__rank">{i + 1}</span>
            <div className="insight__main">
              <button type="button" className="list__link" onClick={() => onOpen(step.id)}>
                {step.id}
              </button>
              <p className="insight__facts">{step.why}</p>
            </div>
            <span className={`stage stage--${step.stage}`}>{STAGES[step.stage]}</span>
          </li>
        ))}
      </ol>

      <h3 className="list__heading">Best first files</h3>
      <ul className="insight__list">
        {onboarding.starters.map((s) => (
          <li key={s.id} className="insight__row">
            <div className="insight__main">
              <button type="button" className="list__link" onClick={() => onOpen(s.id)}>
                {s.id}
              </button>
              <ul className="insight__reasons">
                {s.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <span className="insight__score" title="Suitability for a first change, 0 to 100">
              {Math.round(s.score * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
