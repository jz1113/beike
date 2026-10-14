/** Fail only when unused bindings exceed the reviewed baseline. No baseline auto-update. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'tools/configs/unused-baseline.json'),'utf8'));
const allowed=new Map(baseline.entries.map(entry=>[`${entry.file}\0${entry.message}`,entry.count]));
const eslint=new ESLint({cwd:root,overrideConfigFile:path.join(root,'tools/configs/eslint.config.mjs')});
const results=await eslint.lintFiles(['src/client','src/shared','tools']);const added=[];let remaining=0;
for(const result of results) for(const message of result.messages) {
  if(message.ruleId!=='@typescript-eslint/no-unused-vars')continue;
  remaining++;
  const file=path.relative(root,result.filePath).replace(/\\/g, '/'),key=`${file}\0${message.message}`,left=allowed.get(key)||0;
  if(left>0) allowed.set(key,left-1);else added.push(`${file}:${message.line} ${message.message}`);
}
if(added.length){console.error('New unused bindings:\n'+added.join('\n'));process.exitCode=1;}
else console.log(`Unused gate passed; ${remaining} reviewed warnings remain. Removed warnings never require baseline expansion.`);
