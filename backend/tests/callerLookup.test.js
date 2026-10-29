import { describe, expect, it } from 'vitest';
import { callerLookup } from '../src/services/parser/scanExtractor.js';

const fn = (name, line, endLine) => ({ name, line, endLine });

describe('callerLookup', () => {
    const functions = [
        fn('inner', 6, 8), // closes first, so it is listed first
        fn('outer', 3, 12),
        fn('later', 20, 25),
    ];

    it('returns the innermost function that contains the line', () => {
        const at = callerLookup(functions);
        expect(at(1)).toBeNull(); // module level, before any function
        expect(at(3)).toBe('outer');
        expect(at(7)).toBe('inner');
        expect(at(10)).toBe('outer'); // back in the outer one after inner ended
        expect(at(15)).toBeNull(); // between functions
        expect(at(22)).toBe('later');
        expect(at(30)).toBeNull();
    });

    it('prefers the inner function when two share the same single line', () => {
        const at = callerLookup([fn('inner', 5, 5), fn('outer', 5, 5)]);
        expect(at(5)).toBe('inner');
    });

    it('still answers correctly if asked for an earlier line again', () => {
        const at = callerLookup(functions);
        expect(at(22)).toBe('later');
        expect(at(7)).toBe('inner');
        expect(at(10)).toBe('outer');
    });

    it('handles no functions at all', () => {
        expect(callerLookup([])(4)).toBeNull();
    });

    it('agrees with a plain search over every function, on random nested layouts', () => {
        let s = 7;
        const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
        for (let round = 0; round < 100; round += 1) {
            // Properly nested ranges, like real code: build a random tree.
            const list = [];
            let id = 0;
            const build = (start, end, depth) => {
                let line = start;
                while (line < end && r() < 0.8) {
                    const len = 1 + Math.floor(r() * (end - line));
                    const f = fn(`f${id++}`, line, line + len - 1);
                    if (depth < 4 && len > 2) build(line + 1, line + len - 1, depth + 1);
                    list.push(f); // children are pushed first, like a parser closing inner functions first
                    line += len + Math.floor(r() * 3);
                }
            };
            build(1, 80, 0);
            const brute = (line) => {
                let best = null;
                for (const f of list) {
                    if (
                        f.line <= line &&
                        line <= f.endLine &&
                        (!best || f.endLine - f.line < best.endLine - best.line)
                    )
                        best = f;
                }
                return best ? best.name : null;
            };
            const at = callerLookup(list);
            for (let line = 1; line <= 85; line += 1)
                expect(at(line), `round ${round} line ${line}`).toBe(brute(line));
        }
    });
});
