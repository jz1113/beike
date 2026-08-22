export const DOC_EXT_RE = /\.(pdf|docx|pptx|xlsx|xls|md|txt|csv|json)$/i;
export const LEGACY_OFFICE_EXT_RE = /\.(doc|ppt)$/i;
export const PLAIN_TEXT_EXT_RE = /\.(txt|md|csv|json)$/i;
export const MAX_DOC_CHARS = 80000;
export const SUPPORTED_DOC_FORMATS = 'pdf、docx、pptx、xlsx、txt、md、csv、json';
export const FILE_ACCEPT =
  'image/*,video/*,.pdf,.docx,.pptx,.xlsx,.xls,.md,.txt,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/markdown,text/csv,application/json';

export function truncateDocText(text: string): { text: string; truncated: boolean } {
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
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (极速思考)', shortName: 'gemini-3.7-flash', badge: '首选推荐', provider: 'Google' },
  { id: 'gemini-3.1-pro-preview-thinking-high', name: 'Gemini 3.1 Pro (深度思考)', shortName: 'Gemini 3.1 Pro', badge: '视觉旗舰', provider: 'Google' },
  { id: 'gpt-5.5-pro', name: 'GPT 5.5 Pro (综合多模态)', shortName: 'GPT 5.5 Pro', badge: '旗舰', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o (官方多模态)', shortName: 'GPT-4o', badge: '全能', provider: 'OpenAI' },
  { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (最强逻辑)', shortName: 'Claude 3.7', badge: '最强推理', provider: 'Anthropic' },
  { id: 'grok-4.6', name: 'Grok 4.6 (反AI实拍)', shortName: 'Grok 4.6', badge: '反AI纪实', provider: 'xAI' },
  { id: 'deepseek-chat', name: 'DeepSeek V3 (全能电商)', shortName: 'DeepSeek V3', badge: '国产旗舰', provider: 'DeepSeek' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1 (深度思考)', shortName: 'DeepSeek R1', badge: '深度推理', provider: 'DeepSeek' },
  { id: 'qwen-max', name: '通义千问 Qwen Max', shortName: 'Qwen Max', badge: '阿里电商', provider: 'Alibaba' }
];

export const SUGGESTION_CHIPS = [
  '📱 帮我规划一组复古胶片风咖啡机买家秀分镜',
  '🔍 分析上传图片中的商品材质与核心光影',
  '🎬 根据上传视频解析镜头运镜与爆款脚本',
  '💡 如何在提示词中避免塑料感并增强真实手机质感？'
];
