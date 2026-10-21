import rateLimit from 'express-rate-limit';
import { RateLimitedError } from '../lib/errors.js';

// Protects the expensive endpoints (each call can trigger a GitHub download).
export function createRateLimiter(limitPerMinute) {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new RateLimitedError()),
  });
}
