import { ERROR_CODES } from '../constants/errorCodes.js';
import { API_BASE_URL } from '../config.js';
import { ApiError } from '../models/apiError.js';

// Thin fetch wrapper. Always resolves to parsed JSON or throws an ApiError,
// except for aborts, which are rethrown untouched so callers can ignore them.
export async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ApiError({
      code: ERROR_CODES.NETWORK_ERROR,
      message: 'Could not reach the Atlo server.',
      status: 0,
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw ApiError.fromResponse(response.status, payload);
  return payload;
}
