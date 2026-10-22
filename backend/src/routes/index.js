import { Router } from 'express';
import { analyzeBodySchema } from '../validators/analyze.validator.js';
import { validateBody } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

export function createApiRouter({ controllers, rateLimitPerMinute }) {
  const router = Router();

  router.get('/health', controllers.health.check);
  router.post(
    '/analyze',
    createRateLimiter(rateLimitPerMinute),
    validateBody(analyzeBodySchema),
    controllers.analyze.analyze,
  );

  return router;
}
