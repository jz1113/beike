/**
 * GPT Image 2 @mention 解析与规范化：将自定义主体名映射为上游认可的 @图片N 槽位。
 */

export const PROMPT_MENTION_REGEX =
  /(@(?:insp_\d+|图片\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;

export function mentionTokenToName(token: string): string {
  return token.replace(/^@/, '').replace(/[{}]/g, '').trim();
}

export function extractPromptMentions(prompt: string): string[] {
  if (!prompt) return [];
  const regex = new RegExp(PROMPT_MENTION_REGEX.source, 'gi');
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

export function isStandardImageMention(name: string): boolean {
  return /^(?:图片|图)\d+$/i.test(name.trim());
}

export function isGenericSubjectMention(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return ['主体', '模特', '参考图', '商品图', '主图', '人物', '商品', '图片', '图'].includes(lower);
}

function isResolvableSeqMention(name: string, imageCount: number): boolean {
  const match = name.match(/^(?:主体|模特|参考图|商品图|主图|图片|图|insp_|insp)(\d+)$/i);
  if (!match) return false;
  const idx = parseInt(match[1], 10) - 1;
  return idx >= 0 && idx < imageCount;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMentionName(text: string, name: string, slot: string): string {
  if (!name || isStandardImageMention(name)) return text;
  const escaped = escapeRegExp(name);
  const pattern = new RegExp(`@${escaped}(?![a-zA-Z0-9_\\u4e00-\\u9fa5.-])`, 'gi');
  let next = text.replace(pattern, slot);
  const nameNoExt = name.replace(/\.[^/.]+$/, '');
  if (nameNoExt && nameNoExt !== name) {
    const patternNoExt = new RegExp(
      `@${escapeRegExp(nameNoExt)}(?![a-zA-Z0-9_\\u4e00-\\u9fa5.-])`,
      'gi',
    );
    next = next.replace(patternNoExt, slot);
  }
  return next;
}

/**
 * 将 orderedMentionNames[i] 对应的 @ 名改写为 @图片{i+1}，保留已有 @图片N 不变。
 */
export function normalizeReferenceMentions(
  prompt: string,
  orderedMentionNames: string[],
): string {
  if (!prompt || orderedMentionNames.length === 0) return prompt;
  let text = prompt;
  orderedMentionNames.forEach((name, idx) => {
    if (!name) return;
    const slot = `@图片${idx + 1}`;
    text = replaceMentionName(text, name, slot);
  });
  return text;
}

/** 提取 prompt 中非标准槽位的自定义 @ 名（按首次出现顺序去重） */
export function extractCustomMentionNames(prompt: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of extractPromptMentions(prompt)) {
    const name = mentionTokenToName(token);
    if (!name || isStandardImageMention(name) || isGenericSubjectMention(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/**
 * 无客户端主体名时，按自定义 @ 出现顺序推断与参考图顺序的映射。
 */
export function inferReferenceMentionNames(prompt: string, imageCount: number): string[] {
  if (imageCount <= 0) return [];
  const customs = extractCustomMentionNames(prompt);
  if (customs.length === imageCount) return customs;
  if (imageCount === 1) {
    return [customs[0] || '图片1'];
  }
  const names: string[] = [];
  for (let i = 0; i < imageCount; i += 1) {
    names.push(customs[i] || `图片${i + 1}`);
  }
  return names;
}

export function resolveReferenceMentionNames(
  prompt: string,
  imageCount: number,
  explicitNames?: string[] | null,
): string[] {
  if (imageCount <= 0) return [];
  if (Array.isArray(explicitNames) && explicitNames.length > 0) {
    const names = explicitNames.slice(0, imageCount);
    while (names.length < imageCount) {
      names.push(`图片${names.length + 1}`);
    }
    return names;
  }
  return inferReferenceMentionNames(prompt, imageCount);
}

/**
 * 找出 prompt 中无法映射到参考图列表的 @mention（用于提交前校验）。
 */
export function findUnresolvedMentions(
  prompt: string,
  orderedMentionNames: string[],
): string[] {
  if (!prompt) return [];
  const resolved = new Set<string>();
  orderedMentionNames.forEach((name, idx) => {
    if (name) {
      resolved.add(name.toLowerCase());
      resolved.add(name.replace(/\.[^/.]+$/, '').toLowerCase());
    }
    resolved.add(`图片${idx + 1}`);
    resolved.add(`图${idx + 1}`);
  });

  const unresolved: string[] = [];
  for (const token of extractPromptMentions(prompt)) {
    const name = mentionTokenToName(token);
    if (!name) continue;
    if (isStandardImageMention(name)) continue;
    if (isGenericSubjectMention(name)) continue;
    if (isResolvableSeqMention(name, orderedMentionNames.length)) continue;
    const key = name.toLowerCase();
    const keyNoExt = name.replace(/\.[^/.]+$/, '').toLowerCase();
    if (!resolved.has(key) && !resolved.has(keyNoExt)) {
      unresolved.push(name);
    }
  }
  return [...new Set(unresolved)];
}
