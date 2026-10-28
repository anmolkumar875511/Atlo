import './LoadingState.css';

export default function LoadingState({ url }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__bar" aria-hidden="true">
        <div className="loading__bar-fill" />
      </div>
      <p className="loading__text">Downloading and indexing {url}…</p>
    </div>
  );
}
