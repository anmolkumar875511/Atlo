import { z } from 'zod';

export const analyzeBodySchema = z.object({
  url: z
    .string({ required_error: 'url is required', invalid_type_error: 'url must be a string' })
    .trim()
    .min(1, 'url is required')
    .max(300, 'url is too long'),
});
