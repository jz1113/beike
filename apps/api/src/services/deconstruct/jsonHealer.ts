import type { PerImageResult } from '@beike/domain/assetDeconstruct/prompts';
import {
  normalizePerImageResult,
  ensurePerImageQuality,
} from '@beike/domain/assetDeconstruct/validate';

export function sanitizeJsonControlChars(str: string): string {
  let inString = false;
  let escaped = false;
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '\\' && inString) {
      escaped = !escaped;
      out += char;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = !inString;
      out += char;
      continue;
    }
    if (inString && !escaped) {
      if (char === '\n') {
        out += '\\n';
        continue;
      }
      if (char === '\r') {
        out += '\\r';
        continue;
      }
      if (char === '\t') {
        out += '\\t';
        continue;
      }
      const code = char.charCodeAt(0);
      if (code < 32) {
        out += '\\u' + code.toString(16).padStart(4, '0');
        continue;
      }
    }
    escaped = false;
    out += char;
  }
  return out;
}

/**
 * 修复并闭合单个非完整/截断的 JSON 对象文本
 */
export function repairSingleObjectJson(raw: string): string {
  let sanitized = sanitizeJsonControlChars(raw.trim());
  sanitized = sanitized
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1');

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < sanitized.length; i++) {
    const c = sanitized[i];
    if (c === '\\' && inString) {
      escaped = !escaped;
      continue;
    }
    if (c === '"' && !escaped) {
      inString = !inString;
    } else if (!inString) {
      if (c === '{' || c === '[') stack.push(c);
      else if (c === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
      } else if (c === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
      }
    }
    escaped = false;
  }

  if (inString) sanitized += '"';
  sanitized = sanitized.replace(/:\s*([}\]])/g, ': null$1');
  sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');
  sanitized = sanitized.replace(/,\s*$/g, '');

  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') sanitized += '}';
    else if (last === '[') sanitized += ']';
  }

  sanitized = sanitized
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1');
  return sanitized;
}

/**
 * 深度多模态 JSON 提取、清洗、截断自愈与正则容错解析器
 */
export function repairAndParseDeconstructJson(text: string): any {
  if (!text || !text.trim()) return {};

  let raw = text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    raw = codeBlockMatch[1].trim();
  }

  const firstBrace = raw.indexOf('{');
  if (firstBrace !== -1) {
    raw = raw.slice(firstBrace);
  }

  const cleanJson = (str: string) => {
    return str
      .replace(/\/\/[^\n\r]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,\s*([}\]])/g, '$1');
  };

  // 尝试 1：清洗字符串内部裸控制字符后直接标准解析
  try {
    const sanitized = sanitizeJsonControlChars(raw);
    return JSON.parse(cleanJson(sanitized));
  } catch {}

  // 尝试 2：括号栈自愈与截断修复解析
  try {
    const repaired = repairSingleObjectJson(raw);
    return JSON.parse(repaired);
  } catch {}

  // 尝试 3：正则与流式块容错提取
  console.warn('[AssetDeconstruct] 标准与自愈 JSON 解析失败，启动正则容错字段提取');
  const result: any = {
    theme_category: 'general',
    persona: null,
    per_image: [],
    scenes: [],
    outfits: [],
    actions: [],
  };

  const themeMatch = raw.match(/"theme_category"\s*:\s*"([^"]+)"/);
  if (themeMatch) result.theme_category = themeMatch[1];

  const personaMatch = raw.match(/"persona"\s*:\s*(\{[\s\S]*?\n\s*\})/);
  if (personaMatch) {
    try {
      result.persona = JSON.parse(repairSingleObjectJson(personaMatch[1]));
    } catch {}
  }

  const perImageBlockRegex = /\{[\s\r\n]*"image_index"[\s\S]*?(?=\}(?:\s*,?\s*\{[\s\r\n]*"image_index"|\s*\]|\s*,\s*"(?:persona|scenes|outfits|actions)")|\}\s*$)/g;
  const perImageBlocks = raw.match(perImageBlockRegex);
  if (perImageBlocks) {
    for (const block of perImageBlocks) {
      try {
        const item = JSON.parse(repairSingleObjectJson(block.endsWith('}') ? block : block + '}'));
        if (item && (typeof item.image_index === 'number' || item.reverse_prompt_zh || item.title)) {
          result.per_image.push(item);
        }
      } catch {}
    }
  }

  const sceneBlocks = raw.match(/\{\s*"title"\s*:\s*"[^"]+"[\s\S]*?(?=\}\s*,\s*\{|\}\s*\])/g);
  if (sceneBlocks) {
    for (const sb of sceneBlocks) {
      try {
        const item = JSON.parse(repairSingleObjectJson(sb.endsWith('}') ? sb : sb + '}'));
        if (item && item.title) result.scenes.push(item);
      } catch {}
    }
  }

  const outfitBlocks = raw.match(/\{\s*"title"\s*:\s*"[^"]+"[\s\S]*?"top"[\s\S]*?(?=\}\s*,\s*\{|\}\s*\])/g);
  if (outfitBlocks) {
    for (const ob of outfitBlocks) {
      try {
        const item = JSON.parse(repairSingleObjectJson(ob.endsWith('}') ? ob : ob + '}'));
        if (item && item.title) result.outfits.push(item);
      } catch {}
    }
  }

  const actionBlocks = raw.match(/\{\s*"shot_type"\s*:\s*"[^"]+"[\s\S]*?(?=\}\s*,\s*\{|\}\s*\])/g);
  if (actionBlocks) {
    for (const ab of actionBlocks) {
      try {
        const item = JSON.parse(repairSingleObjectJson(ab.endsWith('}') ? ab : ab + '}'));
        if (item && (item.title || item.action)) result.actions.push(item);
      } catch {}
    }
  }

  return result;
}

export function parseUnifiedFromResponse(
  rawJsonText: string,
  totalImages: number
): {
  perImageResults: PerImageResult[];
  failedIndices: number[];
  parsedResult: Record<string, unknown>;
} {
  const parsed = repairAndParseDeconstructJson(rawJsonText);
  const perImageRaw = Array.isArray(parsed.per_image) ? parsed.per_image : [];
  const perImageResults: PerImageResult[] = [];
  const succeededIndices = new Set<number>();

  for (let i = 0; i < perImageRaw.length; i++) {
    const raw = perImageRaw[i] as Record<string, unknown>;
    const idx =
      typeof raw.image_index === 'number'
        ? raw.image_index
        : typeof raw.source_image_index === 'number'
          ? raw.source_image_index
          : i + 1;
    if (succeededIndices.has(idx)) continue;
    const normalized = ensurePerImageQuality(normalizePerImageResult(raw, idx));
    perImageResults.push(normalized);
    succeededIndices.add(idx);
  }

  const failedIndices: number[] = [];
  for (let i = 1; i <= totalImages; i++) {
    if (!succeededIndices.has(i)) failedIndices.push(i);
  }

  perImageResults.sort((a, b) => a.image_index - b.image_index);

  const { per_image: _omit, ...topLevel } = parsed as Record<string, unknown>;
  return { perImageResults, failedIndices, parsedResult: topLevel };
}
