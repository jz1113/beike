import { resolveSkillReferenceContent } from '@shared/domain/assistant/skills/references';
import type { AssistantSkill, AssistantSkillFile } from '@shared/domain/assistant/skills/types';
import { applySkillFrontmatter } from './buildSkillFromStudio';
import { extractYamlFrontmatter } from './skillPackageParser';

/** The reader and ZIP export expose the same complete package, including resolved references. */
export function skillPackageFiles(skill: AssistantSkill): AssistantSkillFile[] {
  const main = skill.markdownDoc || applySkillFrontmatter(skill.prompt, skill.name, skill.description, skill.meta?.kind || 'agent').markdownDoc;
  const files = new Map<string, string>([['SKILL.md', main]]);
  for (const file of skill.files || []) {
    if (file.path.toLowerCase() !== 'skill.md') files.set(file.path, file.content);
  }
  for (const ref of skill.references || []) {
    const content = resolveSkillReferenceContent(ref.path);
    if (content && !files.has(ref.path)) files.set(ref.path, content);
  }
  return Array.from(files, ([path, content]) => ({ path, content }));
}

export function skillFilePreview(file: AssistantSkillFile): { markdown: boolean; body: string } {
  const markdown = /\.md$/i.test(file.path) || file.path.startsWith('assetDeconstruct/');
  return { markdown, body: markdown ? extractYamlFrontmatter(file.content).body : file.content };
}

export function skillSourceLocation(skill: AssistantSkill): string {
  return skill.isBuiltin && skill.meta?.kind === 'agent'
    ? `src/shared/domain/assistant/skills/packages/${skill.id}/`
    : '当前工作区的技能库';
}

export async function exportSkillPackage(skill: AssistantSkill): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const safeName = skill.id.replace(/[^a-zA-Z0-9_-]/g, '-') || 'skill';
  for (const file of skillPackageFiles(skill)) {
    const parts = file.path.replace(/\\/g, '/').split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error(`无法导出不安全的文件路径：${file.path}`);
    zip.file(`${safeName}/${parts.join('/')}`, file.content);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
