import { hintFor } from '../models/apiError.js';
import './ErrorBanner.css';

export default function ErrorBanner({ error, onDismiss }) {
  const hint = hintFor(error);
  return (
    <div className="error-banner" role="alert">
      <div className="error-banner__body">
        <strong className="error-banner__message">{error.message}</strong>
        {hint && <p className="error-banner__hint">{hint}</p>}
        {error.requestId && <p className="error-banner__id">Request ID: {error.requestId}</p>}
      </div>
      <button
        type="button"
        className="error-banner__close"
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  );
}
