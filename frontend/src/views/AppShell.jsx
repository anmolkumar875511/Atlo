import './AppShell.css';

export default function AppShell({ children }) {
  return (
    <div className="shell">
      <header className="shell__header">
        <a className="shell__brand" href="/" aria-label="ATLO home">
          <span className="shell__mark" aria-hidden="true">
            ✧
          </span>
          <span className="shell__brand-copy">
            <span className="shell__title">ATLO</span>
            <span className="shell__tagline">The Astral Cartographer</span>
          </span>
        </a>
        <div className="shell__edition">
          <span className="shell__edition-dot" aria-hidden="true" />
          <span>Codebase observatory</span>
          <span className="shell__phase">v1.0</span>
        </div>
      </header>
      <main className="shell__main">
        <section className="shell__intro" aria-label="Introduction">
          <p className="shell__eyebrow">
            <span /> A map of the unseen <span />
          </p>
          <h1 className="shell__headline">
            Every codebase has a <em>cosmos.</em>
          </h1>
          <p className="shell__description">
            Trace the connections, discover the hidden patterns, and explore the architecture of
            your repository.
          </p>
          <div className="shell__ornament" aria-hidden="true">
            <span>✦</span>
          </div>
        </section>
        {children}
      </main>
      <footer className="shell__footer">
        <span>✧</span> Made for curious minds <span className="shell__footer-sep">·</span> Map any
        codebase. Paste a GitHub URL to begin.
      </footer>
    </div>
  );
}
