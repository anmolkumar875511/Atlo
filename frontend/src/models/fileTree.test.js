import { describe, expect, it } from 'vitest';
import { filterTree } from './fileTree.js';

const file = (path, size = 10) => ({
  type: 'file',
  name: path.split('/').pop(),
  path,
  size,
  fileCount: 1,
  language: 'js',
});

const tree = {
  type: 'dir',
  name: 'demo',
  path: '',
  size: 60,
  fileCount: 4,
  children: [
    {
      type: 'dir',
      name: 'src',
      path: 'src',
      size: 40,
      fileCount: 3,
      children: [file('src/app.js', 10), file('src/util.js', 10), file('src/App.test.js', 20)],
    },
    file('README.md', 20),
  ],
};

describe('filterTree', () => {
  it('returns the same tree for an empty or blank query', () => {
    expect(filterTree(tree, '')).toBe(tree);
    expect(filterTree(tree, '   ')).toBe(tree);
  });

  it('keeps matching files and their folders, case-insensitively', () => {
    const result = filterTree(tree, 'APP');
    expect(result.children).toHaveLength(1);
    expect(result.children[0].children.map((c) => c.name)).toEqual(['app.js', 'App.test.js']);
  });

  it('recomputes counts and sizes for pruned folders', () => {
    const result = filterTree(tree, 'app');
    expect(result.fileCount).toBe(2);
    expect(result.size).toBe(30);
  });

  it('matches on the folder part of the path too', () => {
    expect(filterTree(tree, 'src/').children[0].fileCount).toBe(3);
  });

  it('returns null when nothing matches and does not mutate the input', () => {
    expect(filterTree(tree, 'zzz')).toBeNull();
    expect(tree.fileCount).toBe(4);
  });
});
