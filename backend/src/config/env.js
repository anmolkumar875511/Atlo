import { z } from 'zod';

const MB = 1024 * 1024;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  GITHUB_TOKEN: z.string().optional(),
  MAX_ZIP_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * MB),
  MAX_UNCOMPRESSED_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(300 * MB),
  MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1 * MB),
  MAX_FILES: z.coerce.number().int().positive().default(20_000),
  DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(20),
  CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60 * 1000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_READ_PER_MINUTE: z.coerce.number().int().positive().default(300),
});

// Validates environment variables once, at startup, and returns a typed, frozen config.
// Fails fast with a readable message instead of crashing later with `undefined`.
export function loadConfig(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  const e = parsed.data;
  return Object.freeze({
    env: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    corsOrigins: e.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    githubToken: e.GITHUB_TOKEN || undefined,
    downloadTimeoutMs: e.DOWNLOAD_TIMEOUT_MS,
    limits: Object.freeze({
      maxZipBytes: e.MAX_ZIP_BYTES,
      maxUncompressedBytes: e.MAX_UNCOMPRESSED_BYTES,
      maxFileBytes: e.MAX_FILE_BYTES,
      maxFiles: e.MAX_FILES,
    }),
    cache: Object.freeze({ maxEntries: e.CACHE_MAX_ENTRIES, ttlMs: e.CACHE_TTL_MS }),
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    readRateLimitPerMinute: e.RATE_LIMIT_READ_PER_MINUTE,
  });
}
