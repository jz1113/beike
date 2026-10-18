import JSZip from 'jszip';
import type { SkillDraftData, SkillOutputGenre } from './skillTypes';
import { SKILL_TAG_OPTIONS } from './skillTypes';
import { buildTreeFromPaths, type SkillFileNode } from './skillFileTree';

const TEXT_EXTENSIONS = new Set(['md', 'txt', 'json', 'yaml', 'yml', 'py', 'js', 'ts', 'sh', 'csv']);
const MAX_FILE_BYTES = 256 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024;

export interface ParsedSkillPackage {
  files: SkillFileNode[];
  draft: SkillDraftData;
  warnings: string[];
}

export function extractYamlFrontmatter(content: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const rawYaml = match[1];
  const body = content.replace(frontmatterRegex, '').trim();
  const frontmatter: Record<string, string> = {};

  const lines = rawYaml.split(/\r?\n/);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

export function extractSkillDraftFromContent(
  mainMdContent: string,
  fallbackTitle: string
): SkillDraftData {
  const { frontmatter, body } = extractYamlFrontmatter(mainMdContent);

  let title = frontmatter.title || frontmatter.name || fallbackTitle;
  title = title.replace(/\.md$/i, '').trim();
  if (title.length > 20) title = title.slice(0, 20);

  let description = frontmatter.description || '';
  if (!description) {
    const firstLine = body.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#')) || '';
    description = firstLine.trim();
  }
  if (!description) {
    description = `面向 ${title} 的专属创作技能`;
  }
  if (description.length > 50) description = description.slice(0, 48) + '。';

  const fullText = (mainMdContent + ' ' + title).toLowerCase();
  const genres: SkillOutputGenre[] = [];
  if (/视频|video|分镜|帧|动态/i.test(fullText)) genres.push('视频');
  if (/图片|image|画风|海报|插画|壁纸|人像/i.test(fullText)) genres.push('图片');
  if (/音频|audio|声音|tts|音乐/i.test(fullText)) genres.push('音频');
  if (/文本|text|文案|代码|脚本|提示词/i.test(fullText)) genres.push('文本');
  if (genres.length === 0) genres.push('图片');

  const matchedTags: string[] = [];
  for (const tag of SKILL_TAG_OPTIONS) {
    if (fullText.includes(tag.toLowerCase())) {
      matchedTags.push(tag);
      if (matchedTags.length >= 3) break;
    }
  }
  if (matchedTags.length === 0) {
    matchedTags.push(genres.includes('视频') ? '专业影视' : '创意发散');
  }

  return {
    title,
    description,
    genres,
    tags: matchedTags,
    defaultVideoModel: genres.includes('视频') ? 'seedance-2.5' : '',
    defaultImageModel: genres.includes('图片') ? 'seedream-3.0' : '',
    coverUrl: '',
    showcaseUrls: [],
    promptGuide: '输入贴合场景的主题与细节描述',
    assetGuide: '可上传素材或参考原图',
    isPublic: false,
  };
}

function fileExtension(path: string): string {
  const name = path.split('/').pop() || path;
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isTextSkillPath(path: string): boolean {
  return TEXT_EXTENSIONS.has(fileExtension(path));
}

function cleanRelativePath(raw: string): string | null {
  if (!raw || raw.includes('__MACOSX')) return null;
  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) return null;
  return parts.join('/');
}

/** 只有全部文件都在同一个顶层目录里时，才去掉这一层。根目录已有文件时保持原路径。 */
export function stripSharedZipRoot(files: Map<string, string>): Map<string, string> {
  const paths = Array.from(files.keys());
  if (paths.length === 0 || paths.some((path) => !path.includes('/'))) return files;
  const root = paths[0].split('/')[0];
  if (!root || paths.some((path) => path.split('/')[0] !== root)) return files;
  const next = new Map<string, string>();
  for (const [path, content] of files) next.set(path.slice(root.length + 1), content);
  return next;
}

function shallowestSkillMd(paths: string[]): string | undefined {
  return paths
    .filter((path) => /(^|\/)skill\.md$/i.test(path))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
}

/** 把包含 SKILL.md 的目录当作技能包根，避免再复制出一份根目录 SKILL.md。 */
export function rebaseToSkillMarkdown(files: Map<string, string>): Map<string, string> {
  const skillKey = shallowestSkillMd(Array.from(files.keys()));
  if (!skillKey || !skillKey.includes('/')) return files;
  const dir = skillKey.slice(0, skillKey.lastIndexOf('/') + 1);
  const next = new Map<string, string>();
  for (const [path, content] of files) {
    if (path.startsWith(dir)) next.set(path.slice(dir.length), content);
  }
  return next;
}

function ensureRootSkillMd(files: Map<string, string>): Map<string, string> {
  const next = new Map(files);
  const skillKey = Array.from(next.keys()).find((path) => path.toLowerCase() === 'skill.md');
  if (skillKey && skillKey !== 'SKILL.md') {
    next.set('SKILL.md', next.get(skillKey) || '');
    next.delete(skillKey);
    return next;
  }
  if (skillKey) return next;

  const keys = Array.from(next.keys()).sort((a, b) => a.localeCompare(b));
  const promote = keys.length === 1
    ? keys[0]
    : keys.find((path) => path.toLowerCase().endsWith('.md') && !path.includes('/'));
  if (!promote) {
    const fallback = keys.find((path) => path.toLowerCase().endsWith('.md')) || keys[0];
    next.set('SKILL.md', fallback ? next.get(fallback) || '' : '');
    return next;
  }
  next.set('SKILL.md', next.get(promote) || '');
  if (promote !== 'SKILL.md') next.delete(promote);
  return next;
}

export function normalizeSkillPackagePaths(files: Map<string, string>): Map<string, string> {
  return ensureRootSkillMd(rebaseToSkillMarkdown(stripSharedZipRoot(files)));
}

function assertTextByteLength(name: string, size: number, total: { bytes: number }) {
  if (size > MAX_FILE_BYTES) throw new Error(`「${name}」超过 256 KB，无法导入`);
  total.bytes += size;
  if (total.bytes > MAX_PACKAGE_BYTES) throw new Error('技能包超过 1 MB，无法导入');
}

export async function parseLocalSkillFiles(files: FileList | File[]): Promise<ParsedSkillPackage> {
  const filesList = Array.from(files);
  if (filesList.length === 0) throw new Error('未选择任何文件');

  const filesMap = new Map<string, string>();
  const warnings: string[] = [];
  const total = { bytes: 0 };

  if (filesList.length === 1 && filesList[0].name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(await filesList[0].arrayBuffer());
    for (const entryPath of Object.keys(zip.files)) {
      const zipEntry = zip.files[entryPath];
      const cleanPath = cleanRelativePath(entryPath);
      if (zipEntry.dir || !cleanPath) continue;
      if (!isTextSkillPath(cleanPath)) {
        warnings.push(`「${cleanPath.split('/').pop()}」不是文本技能文件，已跳过`);
        continue;
      }
      const bytes = await zipEntry.async('uint8array');
      assertTextByteLength(cleanPath.split('/').pop() || cleanPath, bytes.byteLength, total);
      filesMap.set(cleanPath, new TextDecoder().decode(bytes));
    }
  } else {
    for (const file of filesList) {
      const relativePath = cleanRelativePath(file.webkitRelativePath || file.name);
      if (!relativePath) continue;
      if (!isTextSkillPath(relativePath)) {
        warnings.push(`「${file.name}」不是文本技能文件，已跳过`);
        continue;
      }
      assertTextByteLength(file.name, file.size, total);
      filesMap.set(relativePath, await file.text());
    }
  }

  if (filesMap.size === 0) throw new Error('没有可导入的文本技能文件');

  const normalized = normalizeSkillPackagePaths(filesMap);
  const mainContent = normalized.get('SKILL.md') || '';
  const fallbackTitle = filesList[0].name.replace(/\.(zip|md|txt)$/i, '');

  return {
    files: buildTreeFromPaths(normalized),
    draft: extractSkillDraftFromContent(mainContent, fallbackTitle),
    warnings,
  };
}
