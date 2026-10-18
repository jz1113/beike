import type { AssistantSkill, AssistantSkillFile } from '@shared/domain/assistant/skills/types';
import { parseSkillFileContent } from '@shared/domain/assistant/skills';
import type { SkillDraftData, SkillOutputGenre } from './skillTypes';
import { SKILL_GENRES } from './skillTypes';
import {
  buildTreeFromPaths,
  getMainSkillContent,
  type SkillFileNode,
} from './skillFileTree';
import { extractYamlFrontmatter } from './skillPackageParser';

export interface SkillStudioPayload {
  title: string;
  description: string;
  genres: SkillOutputGenre[];
  tags: string[];
  defaultVideoModel: string;
  defaultImageModel: string;
  coverUrl: string;
  showcaseUrls: string[];
  promptGuide: string;
  assetGuide: string;
  isPublic: boolean;
  files: SkillFileNode[];
}

export interface BuildSkillOptions {
  id?: string;
  createdAt?: number;
}

export function slugifySkillName(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return base || `skill-${Date.now()}`;
}

export function formatYamlScalar(value: string): string {
  if (value === '' || value !== value.trim() || /[:#\n"'\\]/.test(value)) return JSON.stringify(value);
  return value;
}

/** 用表单里的名称和介绍覆盖前言，并保留用户自己写的其他字段。 */
export function applySkillFrontmatter(
  content: string,
  name: string,
  description: string,
): { markdownDoc: string; body: string } {
  const { frontmatter, body } = extractYamlFrontmatter(content);
  const keys = Object.keys(frontmatter);
  if (!keys.includes('name')) keys.unshift('name');
  if (!keys.includes('description')) keys.splice(keys.indexOf('name') + 1, 0, 'description');
  frontmatter.name = name;
  frontmatter.description = description;
  const yaml = keys
    .filter((key) => frontmatter[key]?.trim())
    .map((key) => `${key}: ${formatYamlScalar(frontmatter[key])}`)
    .join('\n');
  const trimmedBody = body.trim();
  const markdownDoc = trimmedBody ? `---\n${yaml}\n---\n\n${trimmedBody}\n` : `---\n${yaml}\n---\n`;
  return { markdownDoc, body: trimmedBody };
}

function flattenFiles(nodes: SkillFileNode[], prefix = ''): AssistantSkillFile[] {
  const files: AssistantSkillFile[] = [];
  for (const node of nodes) {
    const path = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'folder') {
      if (node.children) files.push(...flattenFiles(node.children, path));
      continue;
    }
    if (path.toLowerCase() === 'skill.md') continue;
    files.push({ path, content: node.content || '' });
  }
  return files;
}

export function buildSkillFromStudio(payload: SkillStudioPayload, options: BuildSkillOptions = {}): AssistantSkill {
  const title = payload.title.trim();
  const description = payload.description.trim();
  const slug = slugifySkillName(title);
  const { markdownDoc, body } = applySkillFrontmatter(getMainSkillContent(payload.files), slug, description);
  if (!body) throw new Error('请在 SKILL.md 中写下技能指令');
  const parsed = parseSkillFileContent(markdownDoc, 'SKILL.md').skill;
  const now = Date.now();
  const files = flattenFiles(payload.files).filter((file) => file.content.trim());
  return {
    ...parsed,
    id: options.id || `custom_skill_${now}`,
    name: slug,
    displayName: title,
    description,
    prompt: body,
    markdownDoc,
    author: '自定义',
    isBuiltin: false,
    createdAt: options.createdAt || now,
    updatedAt: now,
    files: files.length > 0 ? files : undefined,
    meta: {
      genres: payload.genres,
      tags: payload.tags,
      defaultVideoModel: payload.defaultVideoModel,
      defaultImageModel: payload.defaultImageModel,
      coverUrl: payload.coverUrl,
      showcaseUrls: payload.showcaseUrls,
      promptGuide: payload.promptGuide.trim(),
      assetGuide: payload.assetGuide.trim(),
      isPublic: payload.isPublic,
    },
  };
}

function isOutputGenre(value: string): value is SkillOutputGenre {
  return (SKILL_GENRES as readonly string[]).includes(value);
}

/** 把已保存的技能还原成工作室里的文件树和表单，供再次编辑。 */
export function studioStateFromSkill(skill: AssistantSkill): { files: SkillFileNode[]; draft: SkillDraftData } {
  const entries = new Map<string, string>();
  entries.set('SKILL.md', skill.markdownDoc || skill.prompt || '');
  for (const file of skill.files || []) {
    if (!file.path || file.path.toLowerCase() === 'skill.md') continue;
    entries.set(file.path, file.content);
  }
  const genres = (skill.meta?.genres || []).filter(isOutputGenre);
  return {
    files: buildTreeFromPaths(entries),
    draft: {
      title: (skill.displayName || skill.name || '').slice(0, 20),
      description: (skill.description || '').slice(0, 50),
      genres: genres.length > 0 ? genres : ['图片'],
      tags: (skill.meta?.tags || []).slice(0, 3),
      defaultVideoModel: skill.meta?.defaultVideoModel || '',
      defaultImageModel: skill.meta?.defaultImageModel || '',
      coverUrl: skill.meta?.coverUrl || '',
      showcaseUrls: skill.meta?.showcaseUrls ? [...skill.meta.showcaseUrls] : [],
      promptGuide: skill.meta?.promptGuide || '',
      assetGuide: skill.meta?.assetGuide || '',
      isPublic: skill.meta?.isPublic === true,
    },
  };
}
