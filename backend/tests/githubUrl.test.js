import { describe, expect, it } from 'vitest';
import { parseGithubUrl } from '../src/services/ingest/githubUrl.js';

describe('parseGithubUrl', () => {
    it.each([
        ['https://github.com/expressjs/express', 'expressjs', 'express', null],
        ['https://github.com/expressjs/express.git', 'expressjs', 'express', null],
        ['https://github.com/expressjs/express/', 'expressjs', 'express', null],
        ['  github.com/expressjs/express?tab=readme#top ', 'expressjs', 'express', null],
        ['http://www.github.com/a/b', 'a', 'b', null],
        ['expressjs/express', 'expressjs', 'express', null],
        ['https://github.com/vuejs/core/tree/v3.4.0', 'vuejs', 'core', 'v3.4.0'],
        ['https://github.com/a/b/issues/5', 'a', 'b', null],
    ])('parses %s', (input, owner, name, ref) => {
        expect(parseGithubUrl(input)).toEqual({
            owner,
            name,
            ref,
            url: `https://github.com/${owner}/${name}`,
        });
    });

    it.each([
        '',
        '   ',
        'https://github.com/onlyowner',
        'https://gitlab.com/a/b',
        'ftp://github.com/a/b',
        'git@github.com:a/b.git',
        'https://github.com/-bad-/repo',
        'https://github.com/a/..',
        'https://github.com/a/b/tree/../../etc',
        'https://github.com/a/b c',
    ])('rejects %j', (input) => {
        expect(() => parseGithubUrl(input)).toThrow(/./);
    });

    it('rejects non-strings with a typed error', () => {
        expect(() => parseGithubUrl(42)).toThrowError(
            expect.objectContaining({ code: 'INVALID_REPO_URL' })
        );
    });
});
