import { describe, expect, it } from 'vitest';
import { buildFileTree, countDirs } from '../src/models/fileTree.js';

const f = (path, size = 10) => ({ path, name: path.split('/').pop(), size, language: 'other' });

describe('buildFileTree', () => {
    const tree = buildFileTree('demo', [
        f('b.txt', 5),
        f('src/z.js', 20),
        f('src/a.js', 30),
        f('src/deep/x.js', 40),
        f('a.txt', 1),
    ]);

    it('nests files under folders', () => {
        const src = tree.children.find((c) => c.name === 'src');
        expect(src.type).toBe('dir');
        expect(src.children.map((c) => c.name)).toEqual(['deep', 'a.js', 'z.js']);
    });

    it('sorts folders first, then files A-Z', () => {
        expect(tree.children.map((c) => c.name)).toEqual(['src', 'a.txt', 'b.txt']);
    });

    it('totals size and file counts bottom-up', () => {
        expect(tree.fileCount).toBe(5);
        expect(tree.size).toBe(96);
        const src = tree.children[0];
        expect(src.fileCount).toBe(3);
        expect(src.size).toBe(90);
    });

    it('counts folders', () => {
        expect(countDirs(tree)).toBe(2);
    });

    it('handles an empty list', () => {
        const empty = buildFileTree('x', []);
        expect(empty.children).toEqual([]);
        expect(empty.fileCount).toBe(0);
    });
});
