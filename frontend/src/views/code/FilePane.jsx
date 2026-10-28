import { lazy, Suspense, useEffect, useState } from 'react';
import { useFileDetails } from '../../controllers/useFileDetails.js';
import { complexityLevel, LEVEL_LABELS } from '../../models/complexity.js';
import { formatBytes, plural } from '../../models/format.js';
import Tabs from '../Tabs.jsx';
import ImportsTab from './ImportsTab.jsx';
import SymbolsTab from './SymbolsTab.jsx';
import './filepane.css';

// CodeMirror is only downloaded the first time a file is opened.
const CodeViewer = lazy(() => import('./CodeViewer.jsx'));

function Chip({ label, value, title, level }) {
  return (
    <div className={`chip${level ? ` chip--${level}` : ''}`} title={title}>
      <span className="chip__label">{label}</span>
      <span className="chip__value">{value}</span>
    </div>
  );
}

function Metrics({ file }) {
  const { metrics } = file;
  if (!metrics) {
    return (
      <div className="filepane__chips">
        <Chip label="Lines" value={file.lines.toLocaleString('en-US')} />
        <Chip label="Size" value={formatBytes(file.size)} />
        <p className="filepane__note">
          Not analyzed: only JavaScript, TypeScript and Python files are parsed.
        </p>
      </div>
    );
  }

  const level = complexityLevel(metrics.maxFunctionComplexity);
  return (
    <div className="filepane__chips">
      <Chip label="Lines" value={file.lines.toLocaleString('en-US')} />
      <Chip
        label="Tokens"
        value={metrics.tokens.toLocaleString('en-US')}
        title="Syntax tokens from the parser. Comments are not counted."
      />
      <Chip
        label="Complexity"
        value={metrics.complexity.toLocaleString('en-US')}
        level={level}
        title={`1 + every decision point in the file. Most complex function: ${metrics.maxFunctionComplexity} (${LEVEL_LABELS[level]}).`}
      />
      <Chip label="Functions" value={metrics.functionCount.toLocaleString('en-US')} />
      {file.blastRadius !== null && (
        <Chip
          label="Blast radius"
          value={file.blastRadius.toLocaleString('en-US')}
          title="Files that could break if this file changes, directly or through other files."
        />
      )}
      <Chip label="Size" value={formatBytes(file.size)} />
    </div>
  );
}

export default function FilePane({ snapshotId, target, onOpenFile, onJump }) {
  const { status, data, error } = useFileDetails(snapshotId, target.path);
  const [tab, setTab] = useState('code');

  // Any new request to open something (a search result, a link, a graph click) shows the code.
  useEffect(() => {
    setTab('code');
  }, [target.id]);

  if (!target.path) {
    return (
      <aside className="filepane filepane--empty">
        <p>Click a file in the graph, or search above, to read its code.</p>
        <p>Larger dots are files that many others import.</p>
      </aside>
    );
  }

  if (status === 'error') {
    return (
      <aside className="filepane filepane--empty" role="alert">
        <p>{error.message}</p>
      </aside>
    );
  }

  if (status !== 'success') {
    return (
      <aside className="filepane filepane--empty" role="status">
        <p>Loading {target.path}…</p>
      </aside>
    );
  }

  const tabs = [
    { id: 'code', label: 'Code' },
    {
      id: 'imports',
      label: `Imports (${data.imports.length}) · Used by (${data.importedBy.length})`,
    },
    { id: 'symbols', label: `Symbols (${data.functions.length + data.classes.length})` },
  ];

  return (
    <aside className="filepane" aria-label="Selected file">
      <header className="filepane__head">
        <h2 className="filepane__path">{data.path}</h2>
        <Metrics file={data} />
      </header>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="filepane__body">
        {tab === 'code' && (
          <Suspense fallback={<p className="filepane__note">Loading viewer…</p>}>
            <CodeViewer
              content={data.content}
              path={data.path}
              line={target.line}
              jumpId={target.id}
            />
          </Suspense>
        )}
        {tab === 'imports' && <ImportsTab file={data} onOpenFile={onOpenFile} />}
        {tab === 'symbols' && <SymbolsTab file={data} onJump={onJump} onOpenFile={onOpenFile} />}
      </div>
      {data.metrics && data.metrics.functionCount === 0 && tab === 'code' && (
        <p className="filepane__foot">{plural(0, 'named function')} in this file.</p>
      )}
    </aside>
  );
}
