import type { AssistantSkill, AssistantSkillInputRequirement, ParsedSkillFile } from './types';

function slugifyId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return base || `skill-${Date.now()}`;
}

function parseYamlFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function parseStringArray(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const items = raw.map((v) => String(v).trim()).filter(Boolean);
    return items;
  }
  if (typeof raw === 'string') {
    if (raw.trim() === '[]') return [];
    const items = raw
      .split(/[,，\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

function parseRequires(raw: unknown): AssistantSkillInputRequirement[] | undefined {
  const items = parseStringArray(raw);
  if (!items) return undefined;
  const allowed = new Set<AssistantSkillInputRequirement>(['image', 'document', 'url']);
  const filtered = items.filter((v): v is AssistantSkillInputRequirement =>
    allowed.has(v as AssistantSkillInputRequirement),
  );
  return filtered.length > 0 ? filtered : undefined;
}

function parseSteps(raw: unknown): AssistantSkill['steps'] {
  if (!Array.isArray(raw)) return undefined;
  const steps = raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const step = item as Record<string, unknown>;
      const label = String(step.label || step.name || '').trim();
      if (!label) return null;
      const id = String(step.id || `step-${index + 1}`).trim();
      const hint = step.hint ? String(step.hint).trim() : undefined;
      return { id, label, hint };
    })
    .filter(Boolean) as NonNullable<AssistantSkill['steps']>;
  return steps.length > 0 ? steps : undefined;
}

function parseReferences(raw: unknown): AssistantSkill['references'] {
  if (!Array.isArray(raw)) return undefined;
  const refs = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const ref = item as Record<string, unknown>;
      const path = String(ref.path || '').trim();
      if (!path) return null;
      const label = ref.label ? String(ref.label).trim() : undefined;
      return { path, label };
    })
    .filter(Boolean) as NonNullable<AssistantSkill['references']>;
  return refs.length > 0 ? refs : undefined;
}

function normalizeSkillFields(
  parsed: Partial<AssistantSkill> & { name: string; prompt: string },
  now: number,
): AssistantSkill {
  return {
    id: String(parsed.id || slugifyId(parsed.name)).trim(),
    name: parsed.name,
    description: String(parsed.description || '').trim() || parsed.name,
    prompt: parsed.prompt,
    icon: parsed.icon,
    tools: parseStringArray(parsed.tools),
    requires: parseRequires(parsed.requires),
    steps: parseSteps(parsed.steps),
    references: parseReferences(parsed.references),
    outputFormat: parsed.outputFormat,
    isBuiltin: false,
    version: parsed.version,
    createdAt: parsed.createdAt || now,
    updatedAt: now,
  };
}

export function parseSkillFileContent(
  content: string,
  filename: string,
): ParsedSkillFile {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'json') {
    const parsed = JSON.parse(content) as Partial<AssistantSkill>;
    const name = String(parsed.name || '').trim();
    if (!name) throw new Error('技能 JSON 缺少 name 字段');
    const prompt = String(parsed.prompt || '').trim();
    if (!prompt) throw new Error('技能 JSON 缺少 prompt 字段');
    const now = Date.now();
    return {
      format: 'json',
      skill: normalizeSkillFields({ ...parsed, name, prompt }, now),
    };
  }

  const { meta, body } = parseYamlFrontmatter(content);
  const name = (meta.name || meta.title || '').trim();
  if (!name) throw new Error('技能文件缺少 name/title（YAML frontmatter 或正文标题）');
  const prompt = body.trim();
  if (!prompt) throw new Error('技能正文为空');
  const now = Date.now();

  let steps: AssistantSkill['steps'];
  let references: AssistantSkill['references'];
  try {
    if (meta.steps) steps = parseSteps(JSON.parse(meta.steps));
    if (meta.references) references = parseReferences(JSON.parse(meta.references));
  } catch {
    // frontmatter 中 steps/references 可为逗号分隔的简单格式
  }

  return {
    format: 'markdown',
    skill: normalizeSkillFields(
      {
        id: (meta.id || slugifyId(name)).trim(),
        name,
        description: (meta.description || meta.desc || name).trim(),
        prompt,
        icon: meta.icon,
        tools: parseStringArray(meta.tools),
        requires: parseRequires(meta.requires),
        steps,
        references,
        outputFormat: meta.outputFormat as AssistantSkill['outputFormat'],
        version: meta.version,
      },
      now,
    ),
  };
}

export function mergeAssistantSkills(
  customSkills: AssistantSkill[],
  builtinSkills: AssistantSkill[],
): AssistantSkill[] {
  const byId = new Map<string, AssistantSkill>();
  for (const skill of builtinSkills) byId.set(skill.id, skill);
  for (const skill of customSkills) {
    if (!skill.isBuiltin) byId.set(skill.id, skill);
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (Boolean(a.isBuiltin) !== Boolean(b.isBuiltin)) return a.isBuiltin ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}
