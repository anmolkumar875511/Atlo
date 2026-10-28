import { zipSync, strToU8 } from 'fflate';
import { loadConfig } from '../src/config/env.js';
import { createApp } from '../app.js';
import { createContainer } from '../src/container.js';
import { createLogger } from '../src/lib/logger.js';

// Builds a GitHub-style zip: everything lives under one "repo-main/" root folder.
export function makeZip(files, root = 'repo-main') {
  const entries = {};
  for (const [path, content] of Object.entries(files)) {
    entries[`${root}/${path}`] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(entries);
}

export const SAMPLE_FILES = {
  'README.md': '# demo',
  'package.json': '{"name":"demo"}',
  'src/index.js': "import { add } from './utils/math.js';\nadd(1, 2);\n",
  'src/utils/math.js':
    'export const add = (a, b) => a + b;\nexport function clamp(x, lo, hi) {\n  if (x < lo) return lo;\n  if (x > hi) return hi;\n  return x;\n}\n',
  'tests/math.test.js': "import { add } from '../src/utils/math.js';\n",
  'scripts/tool.py': 'print("hi")\n',
  'node_modules/lodash/index.js': 'module.exports = {};',
  'package-lock.json': '{}',
  'logo.png': new Uint8Array([137, 80, 78, 71]),
};

export function buildTestApp({
  download,
  churnClient,
  rateLimitPerMinute = 1000,
  readRateLimitPerMinute = 1000,
} = {}) {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  const logger = createLogger({ level: 'silent', env: 'test' });
  const archiveClient = { download: download ?? (async () => makeZip(SAMPLE_FILES)) };
  const container = createContainer({ config, logger, overrides: { archiveClient, churnClient } });
  return createApp({
    config: { ...config, rateLimitPerMinute, readRateLimitPerMinute },
    logger,
    container,
  });
}

export const LIMITS = {
  maxZipBytes: 1024 * 1024,
  maxUncompressedBytes: 10 * 1024 * 1024,
  maxFileBytes: 1024,
  maxFiles: 100,
};
