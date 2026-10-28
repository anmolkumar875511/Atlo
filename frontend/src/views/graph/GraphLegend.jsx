import { HEAT_GRADIENT } from '../../models/heat.js';

const SHOWN = 8;

export default function GraphLegend({ summary, colorMode, heatReady, showCalls, showCycles }) {
  if (colorMode === 'heat') {
    return (
      <div className="legend legend--heat" aria-label="Heat legend">
        <div className="legend__bar" style={{ background: HEAT_GRADIENT }} />
        <div className="legend__scale">
          <span>healthy</span>
          <span>hotspot</span>
        </div>
        {!heatReady && <p className="legend__note">Reading git history…</p>}
        <Keys showCalls={showCalls} showCycles={showCycles} />
      </div>
    );
  }

  const shown = summary.slice(0, SHOWN);
  const rest = summary.length - shown.length;
  return (
    <div className="legend" aria-label="Folder groups">
      <ul className="legend__list">
        {shown.map((item) => (
          <li key={item.cluster} className="legend__item">
            <span className="legend__dot" style={{ background: item.color }} />
            <span className="legend__name">{item.cluster}</span>
            <span className="legend__count">{item.count}</span>
          </li>
        ))}
        {rest > 0 && <li className="legend__more">+{rest} more groups</li>}
      </ul>
      <Keys showCalls={showCalls} showCycles={showCycles} />
    </div>
  );
}

// Explains the overlays that are currently switched on.
function Keys({ showCalls, showCycles }) {
  if (!showCalls && !showCycles) return null;
  return (
    <ul className="legend__keys">
      {showCycles && (
        <li>
          <span className="legend__ring" /> in a circular import
        </li>
      )}
      {showCalls && (
        <li>
          <span className="legend__dash" /> calls another file
        </li>
      )}
    </ul>
  );
}
