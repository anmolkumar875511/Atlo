import { unzipSync } from 'fflate';
import { EmptyRepoError, InvalidArchiveError } from '../../lib/errors.js';
import { classifyPath, detectLanguage } from './fileFilter.js';

const decoder = new TextDecoder('utf-8');

// GitHub zips wrap everything in one root folder ("repo-main/"). Strip it, and reject
// anything that tries to escape with ".." (zip-slip).
export function normalizeEntryPath(entryName) {
    const parts = entryName.split('/');
    parts.shift();
    if (parts.length === 0 || parts.some((p) => p === '' || p === '.' || p === '..')) return null;
    return parts.join('/');
}

// Unzips in memory (no disk writes) and keeps only files worth indexing.
// The `filter` callback runs before decompression, so skipped files cost almost nothing.
export function extractSourceFiles(zipBytes, limits) {
    const skipped = { ignored: 0, binary: 0, tooLarge: 0, overBudget: 0 };
    let keptCount = 0;
    let keptBytes = 0;
    let truncated = false;

    let entries;
    try {
        entries = unzipSync(zipBytes, {
            filter(file) {
                if (file.name.endsWith('/')) return false; // directory entry
                const path = normalizeEntryPath(file.name);
                if (path === null) return false;

                const verdict = classifyPath(path, file.originalSize, limits);
                if (!verdict.include) {
                    skipped[verdict.reason] += 1;
                    return false;
                }
                if (
                    keptCount >= limits.maxFiles ||
                    keptBytes + file.originalSize > limits.maxUncompressedBytes
                ) {
                    skipped.overBudget += 1;
                    truncated = true;
                    return false;
                }
                keptCount += 1;
                keptBytes += file.originalSize;
                return true;
            },
        });
    } catch {
        throw new InvalidArchiveError();
    }

    const files = [];
    for (const [entryName, data] of Object.entries(entries)) {
        const path = normalizeEntryPath(entryName);
        if (path === null) continue;

        // Headers can lie about size, and some text-looking extensions hide binary data.
        if (data.byteLength > limits.maxFileBytes) {
            skipped.tooLarge += 1;
            continue;
        }
        if (data.subarray(0, 8000).includes(0)) {
            skipped.binary += 1;
            continue;
        }

        files.push({
            path,
            name: path.slice(path.lastIndexOf('/') + 1),
            size: data.byteLength,
            language: detectLanguage(path),
            content: decoder.decode(data),
        });
    }

    if (files.length === 0) throw new EmptyRepoError();

    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { files, skipped, truncated };
}
