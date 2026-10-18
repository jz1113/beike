import { inferVendorId, getVendorDisplayName } from './modelSorting';

export interface ParsedRawModel {
  modelId: string;
  vendorId: string;
  vendorName: string;
  familyId: string;
  familyName: string;
  generationLabel: string;
  versionKey: string;
  versionLabel: string;
  versionScore: number;
  variantKey: string;
  displayName: string;
  snapshotDate?: string;
  isArchived: boolean;
}

// 常见家族名称美化映射
const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  gpt: 'GPT',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  deepseek: 'DeepSeek',
  doubao: '豆包',
  qwen: '通义千问',
  flux: 'Flux',
  sora: 'Sora',
  veo: 'Veo',
  kling: '可灵',
  vidu: 'Vidu',
  hunyuan: '混元',
  minimax: 'MiniMax',
  seedream: 'Seedream',
  seedance: 'Seedance',
  'gpt-image': 'GPT Image',
  'gpt-video': 'GPT Video',
  'hunyuan-video': '混元视频',
  'hunyuan-image': '混元生图',
  'hunyuan-3d': '混元 3D',
  midjourney: 'Midjourney',
  dall: 'DALL-E',
  tripo: 'Tripo',
  suno: 'Suno',
  elevenlabs: 'ElevenLabs',
  step: '阶跃星辰',
  stepfun: '阶跃星辰',
  kimi: 'Kimi',
  mimo: '小米',
  xiaomi: '小米',
  yi: '零一万物',
  ernie: '文心一言',
  wenxin: '文心一言',
  baidu: '百度文心',
  baichuan: '百川',
  sensenova: '商汤日日新',
  internvl: '书生·万象',
  internlm: '书生·浦语',
  mistral: 'Mistral',
  pixtral: 'Pixtral',
  luma: 'Luma',
  runway: 'Runway',
  pika: 'Pika',
  recraft: 'Recraft',
  wanx: '通义万相',
  wan: '通义万相',
  cosyvoice: 'CosyVoice',
  jimeng: '即梦',
  kolors: '可图',
  meshy: 'Meshy',
};

// 变体规格标签美化
const VARIANT_DISPLAY_NAMES: Record<string, string> = {
  sol: 'Sol',
  luna: 'Luna',
  astra: 'Astra',
  terra: 'Terra',
  sonnet: 'Sonnet',
  opus: 'Opus',
  haiku: 'Haiku',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra',
  plus: 'Plus',
  flash: 'Flash',
  preview: '预览版',
  exp: '实验版',
  mini: 'Mini',
  fast: '极速版',
  nano: 'Nano',
  turbo: 'Turbo',
  schnell: 'Schnell',
  dev: 'Dev',
  lite: 'Lite',
  master: 'Master',
  t2v: 'T2V',
  i2v: 'I2V',
  t2i: 'T2I',
  i2i: 'I2I',
  s2v: 'S2V',
  thinking: '思考版',
  chat: '对话版',
  vision: '视觉版',
  latest: '最新版',
  all: '全能版',
  instruct: '指令版',
  search: '联网版',
  hd: '高清',
  edit: '编辑版',
  high: '高推理',
  medium: '中推理',
  low: '低推理',
  minimal: '极简推理',
  dr: '深度研究',
  default: '标准版',
};

const VARIANT_PHRASES: Array<[string, string]> = [
  ['deep-research', '深度研究'],
  ['computer-use', '电脑操作'],
  ['native-audio', '原生音频'],
];

function formatVariantName(variantKey: string): string {
  const direct = VARIANT_DISPLAY_NAMES[variantKey];
  if (direct) return direct;
  let text = variantKey;
  for (const [phrase, label] of VARIANT_PHRASES) {
    text = text.split(phrase).join(label);
  }
  return text
    .split('-')
    .filter(Boolean)
    .map((part) => VARIANT_DISPLAY_NAMES[part] || (part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

export function isLegacyOrDiscontinuedModel(rawModelId: string): boolean {
  const id = rawModelId.toLowerCase().trim();
  if (!id) return false;

  // 1. OpenAI 早期旧代与停运模型（GPT-3.5、早期纯文本补全、2023 早期 GPT-4、DALL-E 2）
  if (
    /^(net-)?(gpt-3\.5|text-davinci|text-curie|text-babbage|text-ada)/i.test(id) ||
    /^net-gpt-4(?:$|-\d)/i.test(id) ||
    /^gpt-oss-/i.test(id) ||
    /gpt-4-(0314|0613|32k)/i.test(id) ||
    /dall-?e-?2/i.test(id)
  ) {
    return true;
  }

  // 2. Anthropic 早期旧代（Claude 1.x、Claude 2.x、Claude Instant）
  if (/(claude-1|claude-2|claude-instant)/i.test(id)) {
    return true;
  }

  // 3. Google 早期旧代（PaLM、Bison、Gemini 1.0）
  if (/(palm|chat-bison|text-bison|gemini-1\.0)/i.test(id)) {
    return true;
  }

  // 4. 生图与视频早期淘汰底模（SD 1.5 / 2.0 / 2.1、Gen-1）
  if (/(stable-diffusion-v?1-5|sd-1\.5|sd-2\.0|sd-2\.1|gen-1\b)/i.test(id)) {
    return true;
  }

  return false;
}

/**
 * 解析单个模型 ID，提取家族、代际版本、变体及快照日期
 */
export function parseModelDetails(modelId: string, kind?: string): ParsedRawModel {
  void kind;
  const trimmed = modelId.trim();
  const lower = trimmed.toLowerCase();
  const vendorId = inferVendorId(trimmed) || 'unknown';
  const vendorName = getVendorDisplayName(vendorId);
  const isArchived = isLegacyOrDiscontinuedModel(trimmed);

  // 1. 提取日期快照（2026-07-09、20250514，以及网关常见的 6 位 YYMMDD，如 260128）
  let cleanId = lower.replace(/\s+/g, '-');
  let snapshotDate: string | undefined;

  const dateHyphenMatch = cleanId.match(/[-_](202[3-9]-[01]\d-[0-3]\d)(?:[-_]|$)/);
  if (dateHyphenMatch) {
    snapshotDate = dateHyphenMatch[1];
    cleanId = cleanId.replace(dateHyphenMatch[0], dateHyphenMatch[0].endsWith('-') || dateHyphenMatch[0].endsWith('_') ? '-' : '');
  } else {
    const dateNumMatch = cleanId.match(/[-_](202[3-9][01]\d[0-3]\d)(?:[-_]|$)/);
    if (dateNumMatch) {
      snapshotDate = dateNumMatch[1];
      cleanId = cleanId.replace(dateNumMatch[0], dateNumMatch[0].endsWith('-') || dateNumMatch[0].endsWith('_') ? '-' : '');
    } else {
      const shortDateMatch = cleanId.match(/[-_](2[4-9])([01]\d)([0-3]\d)(?=[-_]|$)/);
      if (shortDateMatch) {
        const month = Number(shortDateMatch[2]);
        const day = Number(shortDateMatch[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          snapshotDate = `20${shortDateMatch[1]}-${shortDateMatch[2]}-${shortDateMatch[3]}`;
          cleanId = cleanId.replace(shortDateMatch[0], '');
        }
      }
    }
  }
  cleanId = cleanId.replace(/[-_]+$/, '').replace(/[-_]{2,}/g, '-');

  // 2. 识别主家族。复合产品（doubao-seedance、gpt-video）优先于厂商前缀。
  let familyId = 'general';
  let rest = cleanId.replace(/^(?:net-|fal-ai\/|openai\/)/i, '');

  const compoundFamilies: Array<{ match: RegExp; strip: RegExp; familyId: string }> = [
    { match: /^doubao[-_]seedance(?:[-_/]|$)/i, strip: /^doubao[-_]seedance[-_/]?/i, familyId: 'seedance' },
    { match: /^doubao[-_]seedream(?:[-_/]|$)/i, strip: /^doubao[-_]seedream[-_/]?/i, familyId: 'seedream' },
    { match: /^hunyuan[-_]video(?:[-_/]|$)/i, strip: /^hunyuan[-_]video[-_/]?/i, familyId: 'hunyuan-video' },
    { match: /^hunyuan[-_]image(?:[-_/]|$)/i, strip: /^hunyuan[-_]image[-_/]?/i, familyId: 'hunyuan-image' },
    { match: /^hunyuan[-_]3d(?:[-_/]|$)/i, strip: /^hunyuan[-_]3d[-_/]?/i, familyId: 'hunyuan-3d' },
    { match: /^gpt[-_]image(?:[-_/]|$)/i, strip: /^gpt[-_]image[-_/]?/i, familyId: 'gpt-image' },
    { match: /^gpt[-_]video(?:[-_/]|$)/i, strip: /^gpt[-_]video[-_/]?/i, familyId: 'gpt-video' },
  ];

  const compound = compoundFamilies.find((item) => item.match.test(rest));
  if (compound) {
    familyId = compound.familyId;
    rest = rest.replace(compound.strip, '');
  } else if (/^vidu[-_]?q\d/i.test(rest)) {
    familyId = 'vidu';
    rest = rest.replace(/^vidu[-_/]?/i, '');
  } else {
    const knownPrefixes = [
      'dall-e', 'dalle', 'elevenlabs', 'midjourney', 'seedream', 'seedance', 'cosyvoice',
      'deepseek', 'sensenova', 'baichuan', 'stepfun', 'internvl', 'internlm', 'pixtral',
      'recraft', 'minimax', 'hunyuan', 'kling', 'gemini', 'claude', 'doubao', 'qwen',
      'xiaomi', 'jimeng', 'kolors', 'mistral', 'runway', 'sora', 'flux', 'wanx', 'wan',
      'grok', 'vidu', 'step', 'kimi', 'mimo', 'ernie', 'wenxin', 'baidu', 'luma', 'pika',
      'meshy', 'tripo', 'suno', 'gpt', 'veo', 'yi',
    ];

    for (const prefix of knownPrefixes) {
      const regex = new RegExp(`^${prefix}(?=[-_/]|\\d|$)`, 'i');
      if (!regex.test(rest)) continue;
      familyId = prefix.replace(/[-_]/g, '');
      if (familyId === 'dalle') familyId = 'dall';
      if (familyId === 'wanx') familyId = 'wan';
      rest = rest.replace(new RegExp(`^${prefix}[-_/]?`, 'i'), '');
      break;
    }
  }

  if (familyId === 'general') {
    const parts = rest.split(/[-_/]/);
    if (parts.length > 1 && parts[0].length >= 2) {
      familyId = parts[0];
      rest = parts.slice(1).join('-');
    } else if (rest.length >= 2 && !/[-_/]/.test(rest)) {
      familyId = rest;
      rest = '';
    }
  }

  const familyName = familyId === 'general'
    ? '其他'
    : FAMILY_DISPLAY_NAMES[familyId]
    || (familyId.includes('-')
      ? familyId.split('-').map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))).join(' ')
      : (familyId.length <= 4 ? familyId.toUpperCase() : familyId.charAt(0).toUpperCase() + familyId.slice(1)));

  // 3. 提取代际版本（如 6.1, 6, 5.6, 5.5, 3.5, 3.7, 4o, v3, r1 等）
  let versionKey = 'default';
  let versionLabel = '';
  let versionScore = 0;
  let variantKey = '';

  // 3.1 处理倒置格式（如 claude-sonnet-5-5-thinking, claude-opus-5）
  const invertedMatch = rest.match(/^(sonnet|opus|haiku|fable|pro|flash|turbo|chat)[-_]v?(\d+)(?:[-._](\d+))?(?:[-_](.*))?$/i);
  if (invertedMatch) {
    const variantPart1 = invertedMatch[1].toLowerCase();
    const major = parseInt(invertedMatch[2], 10);
    const minor = invertedMatch[3] ? parseInt(invertedMatch[3], 10) : 0;
    const tail = (invertedMatch[4] || '').trim();
    versionKey = invertedMatch[3] ? `${major}.${minor}` : `${major}`;
    versionLabel = versionKey;
    versionScore = major * 100 + minor;
    variantKey = tail ? `${variantPart1}-${tail}` : variantPart1;
    rest = '';
  } else if (rest.startsWith('4o') || cleanId.includes('gpt-4o')) {
    versionKey = '4o';
    versionLabel = '4o';
    versionScore = 45;
    rest = rest.replace(/^4o[-_]?/, '');
  } else if (/^q(\d+(?:\.\d+)?)(?:[-_/]|$)/i.test(rest)) {
    const qMatch = rest.match(/^q(\d+(?:\.\d+)?)(?:[-_/](.*))?$/i)!;
    const numeric = parseFloat(qMatch[1]);
    versionKey = `q${qMatch[1]}`;
    versionLabel = `Q${qMatch[1]}`;
    versionScore = Math.round((Number.isNaN(numeric) ? 0 : numeric) * 100);
    rest = (qMatch[2] || '').replace(/^[-_/]+/, '');
  } else if (/^v?(\d+)(?:[-._](\d+))?(?:[-_/]|$)/.test(rest)) {
    const versionMatch = rest.match(/^v?(\d+)(?:[-._](\d+))?(?:[-_/]|$)/)!;
    const major = parseInt(versionMatch[1], 10);
    let minor = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0;

    if (major >= 1900) {
      if (!snapshotDate) snapshotDate = String(major);
      versionKey = 'default';
      versionLabel = '';
      versionScore = 50;
      rest = rest.replace(/^v?\d+[-._]?/, '');
    } else if (minor >= 100) {
      if (!snapshotDate) snapshotDate = String(minor);
      minor = 0;
      versionKey = `${major}`;
      versionLabel = `${major}`;
      versionScore = major * 100;
      rest = rest.replace(/^v?\d+[-._]\d+[-_]?/, '');
    } else {
      versionKey = versionMatch[2] ? `${major}.${minor}` : `${major}`;
      versionLabel = versionKey;
      versionScore = major * 100 + minor;
      rest = rest.slice(versionMatch[0].length);
    }

    if (familyId === 'gpt' && major === 4 && /^turbo/i.test(rest)) {
      versionKey = '4-turbo';
      versionLabel = '4 Turbo';
      versionScore = 42;
      rest = rest.replace(/^turbo[-_]?/i, '');
    }
  } else if (/^(v3|v4|v2|r1|reasoner|max|plus|pro)/i.test(rest)) {
    const flagMatch = rest.match(/^(v3|v4|v2|r1|reasoner|max|plus|pro)/i)!;
    versionKey = flagMatch[1].toUpperCase();
    versionLabel = versionKey;
    versionScore = versionKey.startsWith('V') ? parseInt(versionKey.slice(1), 10) * 10 : 50;
    rest = rest.slice(flagMatch[0].length).replace(/^[-_]+/, '');
  }

  // 4. 规格变体（如 sol, luna, sonnet, opus, flash, haiku 等）
  // videos / image 这类通道尾缀不是规格，收成标准版，避免「即梦 Videos」
  const noiseVariants = new Set(['video', 'videos', 'image', 'images', 'img', 'model', 'models', 'default', 'standard', 'std']);
  if (!variantKey) {
    variantKey = rest.replace(/^[-_/]+|[-_/]+$/g, '').replace(/\//g, '-').trim();
    if (!variantKey || noiseVariants.has(variantKey)) {
      variantKey = 'default';
    }
  }

  const displayName = formatVariantName(variantKey);

  const generationLabel = versionLabel ? `${familyName} ${versionLabel}`.trim() : familyName;

  return {
    modelId: trimmed,
    vendorId,
    vendorName,
    familyId,
    familyName,
    generationLabel,
    versionKey,
    versionLabel,
    versionScore,
    variantKey,
    displayName,
    snapshotDate,
    isArchived,
  };
}