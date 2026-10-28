import { useMemo, useState } from 'react';
import { complexityLevel } from '../../models/complexity.js';

const SORTS = {
  complexity: (a, b) => b.complexity - a.complexity || a.line - b.line,
  line: (a, b) => a.line - b.line,
};

function CallLinks({ fn, onOpenFile }) {
  const [open, setOpen] = useState(false);
  if (fn.calls.length === 0 && fn.calledBy.length === 0) return null;
  return (
    <div className="calls">
      <button
        type="button"
        className="calls__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} {fn.calls.length} calls · {fn.calledBy.length} callers
      </button>
      {open && (
        <div className="calls__body">
          {fn.calls.length > 0 && <p className="calls__label">Calls</p>}
          {fn.calls.map((c) => (
            <button
              key={`${c.file}:${c.name}`}
              type="button"
              className="list__link calls__link"
              onClick={() => onOpenFile(c.file, c.line)}
            >
              {c.name}{' '}
              <span className="list__meta">
                {c.file}:{c.line}
              </span>
            </button>
          ))}
          {fn.calledBy.length > 0 && <p className="calls__label">Called by</p>}
          {fn.calledBy.map((c) => (
            <button
              key={`${c.file}:${c.caller}:${c.line}`}
              type="button"
              className="list__link calls__link"
              onClick={() => onOpenFile(c.file, c.line)}
            >
              {c.caller ?? '(module level)'}{' '}
              <span className="list__meta">
                {c.file}:{c.line}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SymbolsTab({ file, onJump, onOpenFile }) {
  const [sort, setSort] = useState('complexity');
  const functions = useMemo(() => [...file.functions].sort(SORTS[sort]), [file.functions, sort]);

  if (file.functions.length === 0 && file.classes.length === 0) {
    return (
      <p className="list__none list__none--pad">No named functions or classes in this file.</p>
    );
  }

  return (
    <div className="list">
      {file.classes.length > 0 && (
        <>
          <h3 className="list__heading">
            Classes <span className="list__count">{file.classes.length}</span>
          </h3>
          <ul className="list__items">
            {file.classes.map((cls) => (
              <li key={`${cls.name}:${cls.line}`} className="list__row">
                <button type="button" className="list__link" onClick={() => onJump(cls.line)}>
                  {cls.name}
                </button>
                <span className="list__meta">line {cls.line}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="list__headrow">
        <h3 className="list__heading">
          Functions <span className="list__count">{file.functions.length}</span>
        </h3>
        <div className="list__sort" role="group" aria-label="Sort functions">
          {Object.keys(SORTS).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={sort === key}
              className={`list__sortbtn${sort === key ? ' list__sortbtn--on' : ''}`}
              onClick={() => setSort(key)}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
      <ul className="list__items">
        {functions.map((fn) => (
          <li key={`${fn.name}:${fn.line}`} className="list__row">
            <button type="button" className="list__link" onClick={() => onJump(fn.line)}>
              {fn.name}
            </button>
            <span className="list__meta">line {fn.line}</span>
            <span
              className={`cx cx--${complexityLevel(fn.complexity)}`}
              title={`Cyclomatic complexity ${fn.complexity}`}
            >
              {fn.complexity}
            </span>
            <CallLinks fn={fn} onOpenFile={onOpenFile} />
          </li>
        ))}
      </ul>
    </div>
  );
}
