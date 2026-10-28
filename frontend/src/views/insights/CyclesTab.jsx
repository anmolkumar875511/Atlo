import { describeLoop } from '../../models/insights.js';
import { plural } from '../../models/format.js';

export default function CyclesTab({ cycles, activeId, onSelect, onOpen }) {
  if (cycles.length === 0) {
    return (
      <p className="insight__note">
        No circular imports found. Every file can be understood without first reading a file that
        depends back on it.
      </p>
    );
  }

  return (
    <div className="insight">
      <p className="insight__lead">
        <strong>{plural(cycles.length, 'circular import')}.</strong> Files that import each other,
        directly or through a chain. Pick one to light it up in red on the map.
      </p>
      <ul className="insight__list">
        {cycles.map((cycle) => {
          const active = cycle.id === activeId;
          return (
            <li key={cycle.id} className={`cycle${active ? ' cycle--active' : ''}`}>
              <button
                type="button"
                className="cycle__head"
                aria-pressed={active}
                onClick={() => onSelect(cycle.id)}
              >
                <span className="cycle__title">{plural(cycle.size, 'file')}</span>
                <span className="cycle__loop">{describeLoop(cycle)}</span>
                <span className="cycle__action">{active ? 'Hide' : 'Show on map'}</span>
              </button>
              {active && (
                <ul className="list__items">
                  {cycle.files.map((file) => (
                    <li key={file} className="list__row">
                      <button type="button" className="list__link" onClick={() => onOpen(file)}>
                        {file}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
