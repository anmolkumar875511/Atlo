import { NotFoundError } from '../lib/errors.js';

export function notFound(req, _res, next) {
  next(new NotFoundError(req.path));
}
