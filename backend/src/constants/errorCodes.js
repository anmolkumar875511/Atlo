// Stable, machine-readable error codes. The server sends them, the web app maps them
// to friendly messages. Keep in sync with frontend/src/constants/errorCodes.js (the API contract).
export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_REPO_URL: 'INVALID_REPO_URL',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  REPO_TOO_LARGE: 'REPO_TOO_LARGE',
  EMPTY_REPO: 'EMPTY_REPO',
  INVALID_ARCHIVE: 'INVALID_ARCHIVE',
  UPSTREAM_RATE_LIMITED: 'UPSTREAM_RATE_LIMITED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
  // Raised by the web app only (no response received).
  NETWORK_ERROR: 'NETWORK_ERROR',
});

// Languages Atlo understands. "other" = text file we only list, never parse.
export const LANGUAGES = Object.freeze(['js', 'ts', 'py', 'other']);
