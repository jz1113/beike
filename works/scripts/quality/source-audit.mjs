/** Read-only source inventory and static import reachability. Never deletes candidates. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ignored = new Set(['.git','node_modules','target','resources','binaries','dist','.azhuo_storage','.agents','.cursor','.local','test-results']);
function walk(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return [];
    const absolute = path.join(directory,entry.name);
    return entry.isDirectory() ? walk(absolute) : [path.relative(root,absolute)];
  });
}
const files = walk(root).filter(file => /\.(ts|tsx|js|jsx|mjs|cjs|rs|py|css|scss|html|prisma|sql|sh|command|bat)$/.test(file) && !file.startsWith('docs/')).sort();
const records = files.map(file => {
  const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/); if(lines.at(-1)==='') lines.pop();
  return {file,lines:lines.length,nonblank:lines.filter(line=>line.trim()).length,test:/(?:__tests__|\.test\.|\.spec\.|works\/e2e)/.test(file)};
});
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
if(config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
const sourceFiles=new Set(files.filter(file=>/\.[cm]?[jt]sx?$/.test(file)));
const edges={};
for(const file of sourceFiles) {
  const absolute=path.join(root,file), source=ts.createSourceFile(absolute,fs.readFileSync(absolute,'utf8'),ts.ScriptTarget.Latest,true),imports=[];
  function visit(node) {
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if(ts.isCallExpression(node)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||node.expression.getText(source)==='require')) imports.push(node.arguments[0].text);
    ts.forEachChild(node,visit);
  }
  visit(source);
  edges[file]=imports.map(name=>ts.resolveModuleName(name,absolute,options,ts.sys).resolvedModule?.resolvedFileName)
    .filter(Boolean).map(target=>path.relative(root,target)).filter(target=>sourceFiles.has(target));
}
// Package entry points and ambient types are not runtime dead-file candidates.
const roots=['app/web/src/main.tsx','app/api/src/index.ts'];
for(const directory of ['app/shared','app/contracts']) {
  const pkg=JSON.parse(fs.readFileSync(path.join(root,directory,'package.json'),'utf8'));
  for(const entry of [pkg.main,pkg.types,...Object.values(pkg.exports||{})]) {
    if(typeof entry==='string'&&!entry.includes('*')) roots.push(path.normalize(path.join(directory,entry)));
  }
}
const reached=new Set();
function visit(file) {if(reached.has(file))return;reached.add(file);(edges[file]||[]).forEach(visit);}
roots.forEach(visit);
const candidates=records.filter(item=>item.file.startsWith('app/')&&item.file.includes('/src/')&&sourceFiles.has(item.file)&&!item.test&&!item.file.endsWith('.d.ts')&&!reached.has(item.file));
const sum=rows=>({files:rows.length,lines:rows.reduce((total,item)=>total+item.lines,0)});
const report={schemaVersion:1,method:'Physical source lines including comments; dependencies, generated output, media, and docs excluded. Static candidates require manual review of nonliteral imports and external consumers.',totals:sum(records),production:sum(records.filter(item=>!item.test)),tests:sum(records.filter(item=>item.test)),roots,candidates,files:records};
const output=path.join(root,'.local/source-audit.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({totals:report.totals,production:report.production,tests:report.tests,candidates:candidates.length,report:output},null,2));
