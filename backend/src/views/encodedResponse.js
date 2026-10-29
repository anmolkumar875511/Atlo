import { gzipSync } from 'node:zlib';
import { renderAnalyze } from './analyze.view.js';

// The analyze answer for a REPEAT request is always the same bytes, but it is large (600 KB for
// Vue core). Serializing and compressing it on every hit costs about 10 ms of CPU each, which adds
// up when many people open the same repository. So the finished JSON and its gzip are kept on the
// snapshot and sent as they are. Only the first answer for a repository (`cached: false`) is built
// the normal way; the repeat answer (`cached: true`) is the one worth keeping.
//
// The two answers differ only in the "cached" flag, so the stored text is the JSON up to that flag.
export function repeatResponse(snapshot) {
    if (!snapshot.repeatResponse) {
        const { cached: _ignored, ...rest } = renderAnalyze({ snapshot, cached: true }).data;
        // {"data":{...}} -> keep everything before the closing braces and add the flag at the end.
        const json = `${JSON.stringify({ data: rest }).slice(0, -2)},"cached":true}}`;
        snapshot.repeatResponse = { json, gzip: gzipSync(json) };
    }
    return snapshot.repeatResponse;
}
