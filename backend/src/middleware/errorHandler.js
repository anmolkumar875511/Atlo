import { ERROR_CODES } from '../constants/errorCodes.js';
import { AppError } from '../lib/errors.js';

// Single place where every error becomes a JSON response with a stable shape:
//   { error: { code, message, requestId, details? } }
// Unexpected errors are logged in full but never leak internals to the client.
export function errorHandler(logger) {
  return (err, req, res, _next) => {
    let status = 500;
    let code = ERROR_CODES.INTERNAL;
    let message = 'Something went wrong on our side.';
    let details;

    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      code = ERROR_CODES.INVALID_JSON;
      message = 'Request body is not valid JSON.';
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      code = ERROR_CODES.INVALID_INPUT;
      message = 'Request body is too large.';
    }

    if (status >= 500) logger.error({ err, requestId: req.id }, 'unhandled error');

    res.status(status).json({ error: { code, message, requestId: req.id, details } });
  };
}
