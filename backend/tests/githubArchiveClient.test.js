import { describe, expect, it, vi } from 'vitest';
import { GithubArchiveClient } from '../src/services/ingest/githubArchiveClient.js';

const repo = { owner: 'o', name: 'r', ref: null, url: 'https://github.com/o/r' };
const make = (fetchImpl, extra = {}) =>
    new GithubArchiveClient({ maxZipBytes: 100, timeoutMs: 1000, fetchImpl, ...extra });

const respond = (body, init = {}) => vi.fn(async () => new Response(body, init));

describe('GithubArchiveClient', () => {
    it('downloads from codeload using HEAD when no ref is given', async () => {
        const fetchImpl = respond(new Uint8Array([1, 2, 3]));
        const bytes = await make(fetchImpl).download(repo);
        expect([...bytes]).toEqual([1, 2, 3]);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://codeload.github.com/o/r/zip/HEAD');
    });

    it('uses the ref and sends the token when provided', async () => {
        const fetchImpl = respond(new Uint8Array([1]));
        await make(fetchImpl, { token: 'tkn' }).download({ ...repo, ref: 'v1.0' });
        expect(fetchImpl.mock.calls[0][0]).toContain('/zip/v1.0');
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tkn');
    });

    it.each([
        [404, 'REPO_NOT_FOUND'],
        [403, 'UPSTREAM_RATE_LIMITED'],
        [429, 'UPSTREAM_RATE_LIMITED'],
        [500, 'UPSTREAM_ERROR'],
    ])('maps HTTP %i to %s', async (status, code) => {
        await expect(make(respond('', { status })).download(repo)).rejects.toMatchObject({ code });
    });

    it('rejects when content-length is over the limit', async () => {
        const fetchImpl = respond(new Uint8Array(10), { headers: { 'content-length': '5000' } });
        await expect(make(fetchImpl).download(repo)).rejects.toMatchObject({
            code: 'REPO_TOO_LARGE',
        });
    });

    it('cuts off a streamed body that grows past the limit', async () => {
        await expect(make(respond(new Uint8Array(500))).download(repo)).rejects.toMatchObject({
            code: 'REPO_TOO_LARGE',
        });
    });

    it('maps network failures and timeouts', async () => {
        const down = vi.fn(async () => {
            throw new TypeError('fetch failed');
        });
        await expect(make(down).download(repo)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });

        const slow = vi.fn(async () => {
            throw new DOMException('timed out', 'TimeoutError');
        });
        await expect(make(slow).download(repo)).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
    });
});
