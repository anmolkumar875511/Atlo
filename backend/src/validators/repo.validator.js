import { z } from 'zod';

export const repoParamsSchema = z.object({
    id: z.string().regex(/^[a-f0-9]{16}$/, 'invalid analysis id'),
});

export const fileQuerySchema = z.object({
    path: z.string().trim().min(1, 'path is required').max(500, 'path is too long'),
});

export const searchQuerySchema = z.object({
    q: z.string().trim().min(1, 'q is required').max(100, 'q is too long'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});
