import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const run=fileURLToPath(new URL('./',import.meta.url)),root=resolve(run,'../..');
const p=JSON.parse(await readFile(resolve(run,'integration-plan.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const old of p.backup){const current=p.appliedFiles.find(f=>f.path===old.path);if(hash(await readFile(resolve(root,old.path)))!==(current?.sha256??old.sha256))throw Error('Later edits found; restore manually: '+old.path);if(hash(await readFile(resolve(run,'originals',old.path)))!==old.sha256)throw Error('Backup hash mismatch: '+old.path);}
if(process.argv.includes('--check'))console.log('Restore checks passed. No files changed.');
else{
  for(const old of p.backup)await writeFile(resolve(root,old.path),await readFile(resolve(run,'originals',old.path)));
  console.log('Original UI entry points restored. Alps assets and QA remain archived.');
}
