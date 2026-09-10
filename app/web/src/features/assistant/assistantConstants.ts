import { VISION_MODELS } from '@beike/domain/vision';
import {
  getModelProviderName,
  isPlaceholderModelMeta,
} from '@/features/home/utils/modelDisplayHelpers';

export const DOC_EXT_RE = /\.(pdf|docx|pptx|xlsx|xls|md|txt|csv|json)$/i;
export const LEGACY_OFFICE_EXT_RE = /\.(doc|ppt)$/i;
export const PLAIN_TEXT_EXT_RE = /\.(txt|md|csv|json)$/i;
export const MAX_DOC_CHARS = 80000;
export const SUPPORTED_DOC_FORMATS = 'pdf、docx、pptx、xlsx、txt、md、csv、json';
export const FILE_ACCEPT =
  'image/*,video/*,.pdf,.docx,.pptx,.xlsx,.xls,.md,.txt,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/markdown,text/csv,application/json';

export function truncateDocText(text: string): { text: string; truncated: boolean } {
  // eslint-disable-next-line no-control-regex
  const cleaned = (text || '').replace(/\u0000/g, '').trim();
  if (cleaned.length <= MAX_DOC_CHARS) return { text: cleaned, truncated: false };
  return {
    text: `【已截断：原文约 ${cleaned.length} 字，仅保留前 ${MAX_DOC_CHARS} 字】\n\n` + cleaned.slice(0, MAX_DOC_CHARS),
    truncated: true,
  };
}

export function isDocumentFile(file: File): boolean {
  if (DOC_EXT_RE.test(file.name)) return true;
  const t = (file.type || '').toLowerCase();
  return (
    t === 'application/pdf'
    || t.includes('wordprocessingml')
    || t.includes('presentationml')
    || t.includes('spreadsheetml')
    || t === 'application/vnd.ms-excel'
    || t === 'text/plain'
    || t === 'text/markdown'
    || t === 'text/csv'
    || t === 'application/json'
  );
}

export const HISTORY_LIMIT_OPTIONS = [
  { value: 3, label: '回读3条' },
  { value: 5, label: '回读5条' },
  { value: 10, label: '回读10条' },
  { value: 20, label: '回读20条' },
  { value: 50, label: '回读50条' },
  { value: 100, label: '回读100条' },
  { value: 150, label: '回读150条' },
  { value: 200, label: '回读200条' }
];

export const DEFAULT_ASSISTANT_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (极速思考)', shortName: 'Gemini 3.7 Flash', badge: '首选推荐', provider: 'Google' },
  { id: 'gemini-3.1-pro-preview-thinking-high', name: 'Gemini 3.1 Pro (深度思考)', shortName: 'Gemini 3.1 Pro', badge: '视觉旗舰', provider: 'Google' },
  { id: 'gpt-5.5-pro', name: 'GPT 5.5 Pro (综合多模态)', shortName: 'GPT 5.5 Pro', badge: '旗舰', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o (官方多模态)', shortName: 'GPT-4o', badge: '全能', provider: 'OpenAI' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (最强逻辑)', shortName: 'Claude 3.7', badge: '最强推理', provider: 'Anthropic' },
  { id: 'grok-4.6', name: 'Grok 4.6 (反AI实拍)', shortName: 'Grok 4.6', badge: '反AI纪实', provider: 'xAI' },
  { id: 'deepseek-chat', name: 'DeepSeek V3 (全能电商)', shortName: 'DeepSeek V3', badge: '国产旗舰', provider: 'DeepSeek' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1 (深度思考)', shortName: 'DeepSeek R1', badge: '深度推理', provider: 'DeepSeek' },
  { id: 'qwen-max', name: '通义千问 Qwen Max', shortName: 'Qwen Max', badge: '阿里电商', provider: 'Alibaba' },
];

export type AssistantModelDisplay = {
  id: string;
  name: string;
  shortName: string;
  badge?: string;
  provider?: string;
};

/** API slug / 无空格技术 ID → 可读短名（去掉日期后缀，轻量 Title Case） */
export function humanizeModelSlug(id: string): string {
  const cleaned = String(id || '')
    .trim()
    .replace(/-\d{8}$/, '')
    .replace(/_/g, '-');
  const withVersions = cleaned.replace(/(\d+)-(\d+)(?=-|$)/g, '$1.$2');
  return withVersions
    .split('-')
    .filter(Boolean)
    .map((seg) => {
      if (/^\d+(\.\d+)*$/.test(seg)) return seg;
      if (/^gpt$/i.test(seg)) return 'GPT';
      if (/^(pro|flash|sonnet|haiku|opus|preview|thinking|high|luna|terra)$/i.test(seg)) {
        return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
      }
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .join(' ');
}

function looksLikeApiSlug(label?: string, id?: string): boolean {
  if (!label || !label.trim()) return true;
  if (id && label === id) return true;
  return !/\s/.test(label) && /^[a-z0-9][a-z0-9._-]*$/i.test(label);
}

function stripParenSuffix(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

/** 列表与胶囊统一用的展示短名 */
export function resolveAssistantModelLabel(m: {
  id: string;
  name?: string;
  shortName?: string;
}): string {
  if (m.shortName && !looksLikeApiSlug(m.shortName, m.id)) return m.shortName;
  if (m.name && !looksLikeApiSlug(m.name, m.id)) {
    const stripped = stripParenSuffix(m.name);
    if (!looksLikeApiSlug(stripped, m.id)) return stripped;
  }
  return humanizeModelSlug(m.id);
}

/** 合并内置展示字段；纯 slug 时可读化 name/shortName */
export function enrichAssistantModelDisplay(m: {
  id: string;
  name?: string;
  shortName?: string;
  badge?: string;
  provider?: string;
}): AssistantModelDisplay {
  const builtin =
    DEFAULT_ASSISTANT_MODELS.find((x) => x.id === m.id)
    || VISION_MODELS.find((x) => x.id === m.id);
  const rawName = m.name || m.id;
  const nameLooksSlug = looksLikeApiSlug(rawName, m.id);
  const name = !nameLooksSlug
    ? rawName
    : builtin?.name || humanizeModelSlug(m.id);

  const rawShort = m.shortName || '';
  const shortLooksSlug = looksLikeApiSlug(rawShort, m.id);
  const builtinShort = builtin?.shortName;
  const shortName = !shortLooksSlug
    ? rawShort
    : (builtinShort && !looksLikeApiSlug(builtinShort, m.id)
        ? builtinShort
        : resolveAssistantModelLabel({ id: m.id, name, shortName: rawShort }));

  const providerCandidate = [m.provider, builtin?.provider].find(
    (v) => v && !isPlaceholderModelMeta(v)
  );
  const provider =
    providerCandidate?.trim()
    || getModelProviderName(m.id, name, undefined);

  const badgeCandidate = [m.badge, builtin?.badge].find(
    (v) => v && !isPlaceholderModelMeta(v)
  );

  return {
    id: m.id,
    name,
    shortName,
    badge: badgeCandidate?.trim(),
    provider,
  };
}

export const SUGGESTION_CHIPS = [
  '📱 帮我写一组复古胶片风咖啡机买家秀生图提示词',
  '🔍 分析上传图片中的商品材质与核心光影',
  '🎬 根据上传视频解析镜头运镜与爆款脚本',
  '💡 如何在提示词中避免塑料感并增强真实手机质感？'
];
