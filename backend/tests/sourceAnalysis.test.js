import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
import { AnalysisRunner } from '../src/services/parser/analysisRunner.js';
import { FileAnalyzer } from '../src/services/parser/fileAnalyzer.js';
import { SourceAnalysisService } from '../src/services/sourceAnalysisService.js';

const logger = createLogger({ level: 'silent', env: 'test' });
const service = new SourceAnalysisService({
  runner: new AnalysisRunner({ analyzer: new FileAnalyzer(), logger }),
  logger,
});

const f = (
  path,
  content,
  language = path.endsWith('.ts') || path.endsWith('.tsx') ? 'ts' : 'js',
) => ({
  path,
  name: path.split('/').pop(),
  size: content.length,
  language,
  content,
});

describe('SourceAnalysisService (fixture repo)', () => {
  const files = [
    f(
      'src/index.js',
      "import { add } from './utils/math';\nimport express from 'express';\nconst cfg = require('../config.json');\n",
    ),
    f('src/utils/math.js', "export const add = (a, b) => a + b;\nimport('./lazy');\n"),
    f('src/utils/lazy.ts', "import type { T } from '../types.js';\nexport const x = 1;\n"),
    f('src/types.ts', 'export type T = number;\n'),
    f('src/broken.js', "import ok from './types';\nconst = = ;\n"),
    f('src/dyn.js', "const name = 'a';\nrequire(name);\nimport('@/nope');\n"),
    f('config.json', '{}', 'other'),
    f('README.md', '# hi', 'other'),
    f('tool.py', 'print(1)', 'py'),
  ];

  it('builds the expected graph', async () => {
    const { graph: g } = await service.analyze(files);

    expect(g.nodes.map((n) => n.id).sort()).toEqual([
      'src/broken.js',
      'src/dyn.js',
      'src/index.js',
      'src/types.ts',
      'src/utils/lazy.ts',
      'src/utils/math.js',
      'tool.py',
    ]);

    const edge = (s, t) => g.edges.some((e) => e.source === s && e.target === t);
    expect(edge('src/index.js', 'src/utils/math.js')).toBe(true); // missing extension
    expect(edge('src/utils/math.js', 'src/utils/lazy.ts')).toBe(true); // dynamic import
    expect(edge('src/utils/lazy.ts', 'src/types.ts')).toBe(true); // ./types.js -> types.ts
    expect(edge('src/broken.js', 'src/types.ts')).toBe(true); // survives a syntax error
    expect(g.edges).toHaveLength(4);
  });

  it('reports externals, unresolved imports, assets and parse errors', async () => {
    const { graph: g } = await service.analyze(files);
    expect(g.externals).toEqual([{ name: 'express', importedBy: 1 }]);
    expect(g.stats).toMatchObject({
      externalPackages: 1,
      unresolved: 2, // require(name) is dynamic, import('@/nope') is an unknown alias
      assetImports: 1, // config.json
      parseErrors: 1, // broken.js
    });
    expect(g.unresolved.map((u) => u.reason).sort()).toEqual(['alias', 'dynamic']);
  });

  it('returns per-file analyses with metrics and resolved imports', async () => {
    const { fileAnalyses, graph } = await service.analyze(files);
    const index = fileAnalyses.get('src/index.js');
    expect(index.tokens).toBeGreaterThan(0);
    expect(index.complexity).toBe(1);
    expect(index.imports.map((i) => i.resolution.kind)).toEqual([
      'internal',
      'external',
      'internal',
    ]);
    expect(fileAnalyses.has('README.md')).toBe(false);
    expect(graph.nodes.find((n) => n.id === 'src/index.js')).toMatchObject({
      tokens: index.tokens,
      complexity: 1,
      functionCount: 0,
    });
  });

  it('handles a repository with no source files', async () => {
    const { graph: g } = await service.analyze([f('README.md', '# x', 'other')]);
    expect(g.nodes).toEqual([]);
    expect(g.stats.nodes).toBe(0);
  });
});
