import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import process from 'node:process';

const root=fileURLToPath(new URL('../',import.meta.url));
const params=JSON.parse(readFileSync(resolve(root,'art-source/parameters/island_cottage_v2.json'),'utf8'));
const digest=()=>createHash('sha256').update(readFileSync(resolve(root,params.outputs.model))).digest('hex');
const runs=[];
for(let n=0;n<2;n++) {
  const run=spawnSync(process.execPath,[resolve(root,'scripts/run_blender.mjs'),'--skip-renders'],{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024});
  if(run.status!==0)throw new Error(run.stderr || run.stdout || String(run.error));
  runs.push({run:n+1,sha256:digest()});
}
assert.equal(runs[0].sha256,runs[1].sha256,'Two deterministic GLB exports must match');
writeFileSync(resolve(root,'docs/m2.1-v1/reproducibility.json'),JSON.stringify({passed:true,command:'npm run assets:reproduce',parameters:'art-source/parameters/island_cottage_v2.json',runs,blendByteEqualityClaimed:false},null,2)+'\n');
process.stdout.write(`Two Blender exports match: ${runs[0].sha256}\n`);
