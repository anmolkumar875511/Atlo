import { ERROR_CODES } from '../constants/errorCodes.js';

// Error thrown by the service layer. Views never see raw fetch errors.
export class ApiError extends Error {
  constructor({ code, message, status, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }

  // Builds an ApiError from the server's `{ error: {...} }` body (or a missing body).
  static fromResponse(status, body) {
    const e = body?.error;
    return new ApiError({
      code: e?.code ?? ERROR_CODES.INTERNAL,
      message: e?.message ?? 'Unexpected response from the server.',
      status,
      requestId: e?.requestId,
    });
  }
}

// Optional hint shown under the error message, keyed by error code.
const HINTS = {
  [ERROR_CODES.REPO_NOT_FOUND]: 'Check the spelling. Private repositories are not supported yet.',
  [ERROR_CODES.REPO_TOO_LARGE]: 'Try a smaller repository or a specific tag.',
  [ERROR_CODES.UPSTREAM_RATE_LIMITED]: 'Wait a minute and try again.',
  [ERROR_CODES.UPSTREAM_TIMEOUT]: 'GitHub was slow to respond. Try again.',
  [ERROR_CODES.RATE_LIMITED]: 'Wait a moment before analyzing again.',
  [ERROR_CODES.NETWORK_ERROR]: 'Is the Atlo server running? Start it with `npm run dev`.',
  [ERROR_CODES.INVALID_REPO_URL]: 'Example: https://github.com/expressjs/express',
  [ERROR_CODES.SNAPSHOT_NOT_FOUND]:
    'The analysis is kept for 30 minutes. Paste the URL and analyze again.',
  [ERROR_CODES.EMPTY_REPO]: 'The repository may only contain binaries or ignored folders.',
};

export function hintFor(error) {
  return HINTS[error.code] ?? null;
}

// Anything that is not already an ApiError becomes one, so views only handle one kind of error.
export function toApiError(error) {
  if (error instanceof ApiError) return error;
  return new ApiError({ code: ERROR_CODES.INTERNAL, message: 'Unexpected error.', status: 0 });
}
