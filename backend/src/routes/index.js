import { Router } from 'express';
import { analyzeBodySchema } from '../validators/analyze.validator.js';
import {
  fileQuerySchema,
  repoParamsSchema,
  searchQuerySchema,
} from '../validators/repo.validator.js';
import { validateBody, validateRequest } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

// Maps URLs to controller methods. No logic lives here.
export function createApiRouter({ controllers, rateLimitPerMinute, readRateLimitPerMinute }) {
  const router = Router();
  // Analyzing can trigger a GitHub download, so it gets a strict limit. Reading a file or
  // searching is cheap and happens on every keystroke, so it gets a generous one.
  const readLimiter = createRateLimiter(readRateLimitPerMinute);

  router.get('/health', controllers.health.check);

  router.post(
    '/analyze',
    createRateLimiter(rateLimitPerMinute),
    validateBody(analyzeBodySchema),
    controllers.analyze.analyze,
  );

  router.get(
    '/repos/:id/files',
    readLimiter,
    validateRequest({ params: repoParamsSchema, query: fileQuerySchema }),
    controllers.repo.file,
  );

  router.get(
    '/repos/:id/search',
    readLimiter,
    validateRequest({ params: repoParamsSchema, query: searchQuerySchema }),
    controllers.repo.search,
  );

  return router;
}
