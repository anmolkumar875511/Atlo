import { describe, expect, it } from 'vitest';
import { extractSourceFiles, normalizeEntryPath } from '../src/services/ingest/archiveExtractor.js';
import { LIMITS, SAMPLE_FILES, makeZip } from './helpers.js';

describe('normalizeEntryPath', () => {
    it('strips the root folder', () => {
        expect(normalizeEntryPath('repo-main/src/a.js')).toBe('src/a.js');
    });
    it('rejects traversal and bare root entries', () => {
        expect(normalizeEntryPath('repo-main/')).toBeNull();
        expect(normalizeEntryPath('repo-main/../evil.js')).toBeNull();
        expect(normalizeEntryPath('repo-main/a//b.js')).toBeNull();
    });
});

describe('extractSourceFiles', () => {
    it('indexes source files and skips junk, with counts', () => {
        const { files, skipped, truncated } = extractSourceFiles(makeZip(SAMPLE_FILES), LIMITS);
        expect(files.map((f) => f.path)).toEqual([
            'README.md',
            'package.json',
            'scripts/tool.py',
            'src/index.js',
            'src/utils/math.js',
            'tests/math.test.js',
        ]);
        expect(skipped).toEqual({ ignored: 2, binary: 1, tooLarge: 0, overBudget: 0 });
        expect(truncated).toBe(false);
    });

    it('attaches language, size and content', () => {
        const { files } = extractSourceFiles(makeZip(SAMPLE_FILES), LIMITS);
        const math = files.find((f) => f.path === 'src/utils/math.js');
        expect(math).toMatchObject({ name: 'math.js', language: 'js' });
        expect(math.content).toContain('export const add');
        expect(math.size).toBe(Buffer.byteLength(math.content));
    });

    it('drops oversized files and files containing NUL bytes', () => {
        const zip = makeZip({
            'ok.js': 'x',
            'big.js': 'y'.repeat(2000),
            'sneaky.txt': new Uint8Array([65, 0, 66]),
        });
        const { files, skipped } = extractSourceFiles(zip, LIMITS);
        expect(files.map((f) => f.path)).toEqual(['ok.js']);
        expect(skipped.tooLarge).toBe(1);
        expect(skipped.binary).toBe(1);
    });

    it('truncates when the file budget runs out', () => {
        const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.js`, 'x']));
        const { files, skipped, truncated } = extractSourceFiles(makeZip(many), {
            ...LIMITS,
            maxFiles: 3,
        });
        expect(files).toHaveLength(3);
        expect(skipped.overBudget).toBe(2);
        expect(truncated).toBe(true);
    });

    it('throws a typed error for corrupt archives', () => {
        expect(() => extractSourceFiles(new Uint8Array([1, 2, 3, 4]), LIMITS)).toThrowError(
            expect.objectContaining({ code: 'INVALID_ARCHIVE' })
        );
    });

    it('throws EMPTY_REPO when nothing is indexable', () => {
        const zip = makeZip({ 'node_modules/a.js': 'x', 'logo.png': new Uint8Array([1]) });
        expect(() => extractSourceFiles(zip, LIMITS)).toThrowError(
            expect.objectContaining({ code: 'EMPTY_REPO' })
        );
    });
});
