import { ValidationError } from '../lib/errors.js';

// Validates req.body against a zod schema and replaces it with the parsed value,
// so controllers only ever see clean, typed input.
export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new ValidationError(details[0]?.message ?? 'Invalid request body.', details));
    }
    req.body = parsed.data;
    return next();
  };
}
