/** Compile maintained SKILL.md packages into a browser-safe catalog. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFileContent } from '../../../src/shared/domain/assistant/skills/parseSkillFile.ts';
import { OPENAI_TOOLS } from '../../../src/shared/domain/assistant/tools/defs.ts';
import { compileSalesSkill } from './build-sales-skill.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = path.join(root, 'src/shared/domain/assistant/skills/packages');
const destination = path.join(source, '../compiledSkillPackages.json');
const tools = new Set(OPENAI_TOOLS.map(tool => tool.function.name));

function filesIn(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
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
  if ((metadata.tools || []).some(tool => !tools.has(tool))) throw new Error(`Unknown tool in ${entry.name}`);
  if (parsed.prompt.length > 10_000) throw new Error(`Move conditional detail into references: ${entry.name}`);
  const files = filesIn(directory).filter(file => file.path !== 'SKILL.md');
  const paths = new Set(files.map(file => file.path));
  for (const match of parsed.prompt.matchAll(/`((?:references|assets|scripts)\/[^`]+)`/g)) {
    if (!paths.has(match[1])) throw new Error(`Missing ${entry.name}/${match[1]}`);
  }
  return { ...metadata, prompt: parsed.prompt, markdownDoc, files };
});
const rendered = `${JSON.stringify(catalog, null, 2)}\n`;
compileSalesSkill(root, catalog, process.argv.includes('--write'));
if (process.argv.includes('--write')) {
  fs.writeFileSync(destination, rendered);
} else if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== rendered) {
  throw new Error('Skill packages changed. Run pnpm skills:build to synchronize the runtime catalog.');
}
console.log(`[skill-packages] ${catalog.length} packages verified${process.argv.includes('--write') ? ' and compiled' : ''}.`);
