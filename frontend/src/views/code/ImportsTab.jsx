const REASONS = {
  dynamic: 'The path is computed at run time',
  alias: 'An alias that is not in tsconfig/jsconfig',
  'not-found': 'No matching file in the repository',
  'outside-repo': 'Points outside the repository',
  absolute: 'Absolute path',
};

function ImportRow({ imp, onOpenFile }) {
  if (imp.status === 'internal') {
    return (
      <li className="list__row">
        <button type="button" className="list__link" onClick={() => onOpenFile(imp.target)}>
          {imp.target}
        </button>
        <span className="list__meta">line {imp.line}</span>
      </li>
    );
  }
  if (imp.status === 'external') {
    return (
      <li className="list__row">
        <span className="list__text">{imp.package}</span>
        <span className="list__badge">package</span>
        <span className="list__meta">line {imp.line}</span>
      </li>
    );
  }
  return (
    <li className="list__row" title={REASONS[imp.reason] ?? imp.reason}>
      <span className="list__text list__text--warn">{imp.specifier ?? '(computed)'}</span>
      <span className="list__badge list__badge--warn">{imp.reason}</span>
      <span className="list__meta">line {imp.line}</span>
    </li>
  );
}

export default function ImportsTab({ file, onOpenFile }) {
  return (
    <div className="list">
      <h3 className="list__heading">
        Imports <span className="list__count">{file.imports.length}</span>
      </h3>
      {file.imports.length === 0 ? (
        <p className="list__none">This file imports nothing.</p>
      ) : (
        <ul className="list__items">
          {file.imports.map((imp) => (
            <ImportRow
              key={`${imp.line}:${imp.specifier}:${imp.kind}`}
              imp={imp}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      )}

      <h3 className="list__heading">
        Imported by <span className="list__count">{file.importedBy.length}</span>
      </h3>
      {file.importedBy.length === 0 ? (
        <p className="list__none">No file imports this one.</p>
      ) : (
        <ul className="list__items">
          {file.importedBy.map((path) => (
            <li key={path} className="list__row">
              <button type="button" className="list__link" onClick={() => onOpenFile(path)}>
                {path}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
