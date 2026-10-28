import { formatBytes, formatDuration, plural } from '../models/format.js';
import './StatsBar.css';

export default function StatsBar({ repo, stats, graph, cached }) {
  const skippedTotal = Object.values(stats.skipped).reduce((a, b) => a + b, 0);
  const { ignored, binary, tooLarge, overBudget } = stats.skipped;
  const skippedTitle = `Ignored: ${ignored} · Binary: ${binary} · Too large: ${tooLarge} · Over budget: ${overBudget}`;

  return (
    <section className="stats" aria-label="Repository summary">
      <div className="stats__head">
        <a className="stats__repo" href={repo.url} target="_blank" rel="noopener noreferrer">
          {repo.owner}/{repo.name}
        </a>
        {cached && <span className="stats__badge">cached</span>}
      </div>
      <dl className="stats__grid">
        <Stat label="Files" value={stats.files.toLocaleString('en-US')} />
        <Stat label="Folders" value={stats.dirs.toLocaleString('en-US')} />
        <Stat label="Size" value={formatBytes(stats.totalBytes)} />
        <Stat label="Skipped" value={skippedTotal.toLocaleString('en-US')} title={skippedTitle} />
        <Stat label="Ingest time" value={formatDuration(stats.ingestMs)} />
        {graph && (
          <>
            <Stat label="Code files" value={graph.stats.nodes.toLocaleString('en-US')} />
            <Stat label="Import links" value={graph.stats.edges.toLocaleString('en-US')} />
            <Stat
              label="Packages"
              value={graph.stats.externalPackages.toLocaleString('en-US')}
              title="External packages (npm, Node built-ins)"
            />
            <Stat
              label="Unplaced"
              value={graph.stats.unresolved.toLocaleString('en-US')}
              title="Imports we could not match to a file: aliases, computed paths"
            />
            <Stat
              label="Circular imports"
              value={graph.stats.cycles.toLocaleString('en-US')}
              title="Groups of files that import each other (Tarjan strongly connected components)"
            />
            <Stat
              label="Call links"
              value={graph.stats.callEdges.toLocaleString('en-US')}
              title="Pairs of files where one calls a function of the other (name based, approximate)"
            />
            <Stat
              label="Parse time"
              value={formatDuration(graph.stats.parseMs)}
              title={`Parsed ${graph.stats.parseMode === 'workers' ? 'in worker threads' : 'on the main thread'}`}
            />
          </>
        )}
      </dl>
      {graph && graph.stats.parseErrors > 0 && (
        <p className="stats__warning" role="note">
          {plural(graph.stats.parseErrors, 'file')} had syntax errors. Their imports may be
          incomplete.
        </p>
      )}
      {stats.truncated && (
        <p className="stats__warning" role="note">
          This repository exceeded the size budget, so {plural(overBudget, 'file')} were left out.
          Results are partial.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, title }) {
  return (
    <div className="stats__item" title={title}>
      <dt className="stats__label">{label}</dt>
      <dd className="stats__value">{value}</dd>
    </div>
  );
}
