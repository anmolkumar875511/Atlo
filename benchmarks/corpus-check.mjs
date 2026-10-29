// Compares the fast extractors with the reference (oracle) extractors on every file of a repository
// zip, and times both. Prints the number of mismatches, which must be 0.
//   node benchmarks/corpus-check.mjs /path/to/repo.zip
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { extractSourceFiles } from '../backend/src/services/ingest/archiveExtractor.js';
import { TreeSitterParser, grammarFor } from '../backend/src/services/parser/treeSitterParser.js';
import { MetricsExtractor } from '../backend/src/services/parser/metricsExtractor.js';
import { ScanExtractor } from '../backend/src/services/parser/scanExtractor.js';
import { CallExtractor } from '../backend/tests/reference/callExtractor.js';
import { ImportExtractor } from '../backend/tests/reference/importExtractor.js';
import { MetricsExtractor as RefMetrics } from '../backend/tests/reference/metricsExtractor.js';
const { files } = extractSourceFiles(new Uint8Array(readFileSync(process.argv[2])), { maxZipBytes:1e9,maxUncompressedBytes:3e8,maxFileBytes:1e6,maxFiles:20000 });
const src = files.filter(f=>['js','ts','py'].includes(f.language));
const p = new TreeSitterParser(); const m=new MetricsExtractor(), rm=new RefMetrics(), s=new ScanExtractor({parser:p}), oi=new ImportExtractor({parser:p}), oc=new CallExtractor({parser:p});
let tNew=0,tOld=0,bad=0;
for (const f of src) {
  const g=grammarFor(f.path); const tree=p.parse(f.content,g);
  let t=performance.now(); const mm=m.extract(tree,g); const sc=s.scan(tree,g,mm.functions); tNew+=performance.now()-t;
  t=performance.now(); const rmm=rm.extract(tree,g); const ri=oi.extract(tree,g); const rc=oc.extract(tree,g,rmm.functions); tOld+=performance.now()-t;
  try { assert.deepEqual(mm,rmm); assert.deepEqual(sc.imports,ri.imports); assert.deepEqual(sc.calls,rc); } catch(e){ bad++; if(bad<4) console.log('DIFF',f.path,e.message.slice(0,300)); }
}
console.log(process.argv[2], 'files',src.length,'mismatches',bad,'new ms',Math.round(tNew),'old ms',Math.round(tOld));
