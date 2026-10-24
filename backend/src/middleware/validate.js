import { ValidationError } from '../lib/errors.js';

function issuesOf(error) {
  return error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

// Validates req.body against a zod schema and replaces it with the parsed value,
// so controllers only ever see clean, typed input.
export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const details = issuesOf(parsed.error);
      return next(new ValidationError(details[0]?.message ?? 'Invalid request body.', details));
    }
    req.body = parsed.data;
    return next();
  };
}

// Validates route params and query string. Express 5 makes req.query read-only,
// so the clean values are put on req.valid instead.
export function validateRequest({ params, query }) {
  return (req, _res, next) => {
    const valid = {};
    for (const [key, schema] of [
      ['params', params],
      ['query', query],
    ]) {
      if (!schema) continue;
      const parsed = schema.safeParse(req[key] ?? {});
      if (!parsed.success) {
        const details = issuesOf(parsed.error);
        return next(new ValidationError(details[0]?.message ?? `Invalid ${key}.`, details));
      }
      valid[key] = parsed.data;
    }
    req.valid = valid;
    return next();
  };
}
