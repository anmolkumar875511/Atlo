import { describe, expect, it } from 'vitest';
import { classifyPath, detectLanguage } from '../src/services/ingest/fileFilter.js';

const limits = { maxFileBytes: 1000 };

describe('classifyPath', () => {
  it('keeps normal source and text files', () => {
    expect(classifyPath('src/app.js', 10, limits)).toEqual({ include: true });
    expect(classifyPath('README.md', 10, limits)).toEqual({ include: true });
    expect(classifyPath('.github/workflows/ci.yml', 10, limits)).toEqual({ include: true });
  });

  it.each(['node_modules/x/index.js', 'a/dist/b.js', '.git/config', 'pkg/__pycache__/m.py'])(
    'ignores junk folder %s',
    (path) => expect(classifyPath(path, 10, limits)).toEqual({ include: false, reason: 'ignored' }),
  );

  it.each(['package-lock.json', 'sub/yarn.lock', 'dist.min.js', 'bundle.js.map'])(
    'ignores generated file %s',
    (path) => expect(classifyPath(path, 10, limits)).toEqual({ include: false, reason: 'ignored' }),
  );

  it('flags binaries and oversized files', () => {
    expect(classifyPath('img/logo.PNG', 10, limits)).toEqual({ include: false, reason: 'binary' });
    expect(classifyPath('big.js', 1001, limits)).toEqual({ include: false, reason: 'tooLarge' });
    expect(classifyPath('edge.js', 1000, limits)).toEqual({ include: true });
  });

  it('does not treat a file named like an ignored folder as ignored', () => {
    expect(classifyPath('docs/build', 10, limits)).toEqual({ include: true });
  });
});

describe('detectLanguage', () => {
  it('maps extensions', () => {
    expect(detectLanguage('a.jsx')).toBe('js');
    expect(detectLanguage('a.mjs')).toBe('js');
    expect(detectLanguage('a.TSX')).toBe('ts');
    expect(detectLanguage('x/y.py')).toBe('py');
    expect(detectLanguage('Makefile')).toBe('other');
  });
});
