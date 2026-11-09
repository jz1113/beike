/** Compile maintained SKILL.md packages into a browser-safe catalog. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFileContent } from '../../../src/shared/domain/assistant/skills/parseSkillFile.ts';
import { OPENAI_TOOLS } from '../../../src/shared/domain/assistant/tools/defs.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = path.join(root, 'src/shared/domain/assistant/skills/packages');
const destination = path.join(source, '../compiledSkillPackages.json');
const apiDestination = path.join(root, 'src/backend/internal/assistant/builtinSkillPackages.json');
const tools = new Set(OPENAI_TOOLS.map(tool => tool.function.name));

function filesIn(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    // Finder view preferences are not part of the upstream package; preserve them on disk.
    if (entry.name === '.DS_Store' && entry.isFile()) return [];
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) throw new Error(`Unexpected skill resource: ${entry.name}`);
    const relative = prefix + entry.name;
    return entry.isDirectory() ? filesIn(path.join(directory, entry.name), `${relative}/`)
      : [{ path: relative, content: fs.readFileSync(path.join(directory, entry.name), 'utf8') }];
  });
}

const catalog = fs.readdirSync(source, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
  const directory = path.join(source, entry.name);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'agents/beike.json'), 'utf8'));
  const markdownDoc = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8');
  const parsed = parseSkillFileContent(markdownDoc, 'SKILL.md').skill;
  if (metadata.id !== entry.name || parsed.name !== entry.name) throw new Error(`Skill identity mismatch: ${entry.name}`);
  if (metadata.description !== parsed.description) throw new Error(`Skill description mismatch: ${entry.name}`);
  if (JSON.stringify(metadata.tools || []) !== JSON.stringify(parsed.tools || [])) throw new Error(`Skill tools mismatch: ${entry.name}`);
  if (metadata.runtimeTools !== undefined) {
    if (!Array.isArray(metadata.runtimeTools) || metadata.runtimeTools.some(tool => typeof tool !== 'string' || !tools.has(tool))) throw new Error(`Unknown runtime tool in ${entry.name}`);
  } else if ((metadata.tools || []).some(tool => !tools.has(tool))) throw new Error(`Unknown tool in ${entry.name}`);
  if (metadata.runtimeInstructions !== undefined && (typeof metadata.runtimeInstructions !== 'string' || !metadata.runtimeInstructions.trim() || metadata.runtimeInstructions.length > 4000)) throw new Error(`Invalid runtime instructions in ${entry.name}`);
  if (!['official', 'community', 'platform', 'local'].includes(metadata.source?.kind)) throw new Error(`Missing verified source: ${entry.name}`);
  const validSourceURL = metadata.source.kind === 'local' ? metadata.source.url === '/skills' : typeof metadata.source.url === 'string' && metadata.source.url.startsWith('https://');
  if (!validSourceURL || !metadata.source.revision || !metadata.source.license) throw new Error(`Incomplete source: ${entry.name}`);
  for (const [relative, digest] of Object.entries(metadata.source.files || {})) {
    if (relative.split('/').some(part => !part || part === '..' || part === '.') || relative.startsWith('/')) throw new Error(`Unsafe source path: ${entry.name}/${relative}`);
    const actual = createHash('sha256').update(fs.readFileSync(path.join(directory, relative))).digest('hex');
    if (actual !== digest) throw new Error(`Upstream file changed: ${entry.name}/${relative}`);
  }
  if (!metadata.source.files?.['SKILL.md']) throw new Error(`Missing upstream SKILL.md digest: ${entry.name}`);
  const files = filesIn(directory).filter(file => file.path !== 'SKILL.md');
  for (const file of files) {
    if (file.path !== 'agents/beike.json' && !metadata.source.files[file.path]) throw new Error(`Unverified upstream resource: ${entry.name}/${file.path}`);
  }
  const paths = new Set(files.map(file => file.path));
  for (const match of parsed.prompt.matchAll(/`((?:references|assets|scripts)\/[^`]+)`/g)) {
    if (/<[a-z-]+>/.test(match[1])) {
      const pattern = new RegExp('^' + match[1].split(/<[a-z-]+>/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+') + '$');
      if (![...paths].some(resource => pattern.test(resource))) throw new Error(`Missing resources for ${entry.name}/${match[1]}`);
      continue;
    }
    if (!paths.has(match[1])) throw new Error(`Missing ${entry.name}/${match[1]}`);
  }
  return { ...metadata, prompt: parsed.prompt, markdownDoc, files };
});
const browserCatalog = catalog.map(item => ({
  ...item,
  files: item.files.filter(file => !file.path.endsWith('.py')),
}));
for (const [output, data] of [[destination, browserCatalog], [apiDestination, catalog]]) {
  const rendered = `${JSON.stringify(data, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    fs.writeFileSync(output, rendered);
  } else if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== rendered) {
    throw new Error('Skill packages changed. Run pnpm skills:build to synchronize the browser and API catalogs.');
  }
}
console.log(`[skill-packages] ${catalog.length} packages verified${process.argv.includes('--write') ? ' and compiled' : ''}.`);
