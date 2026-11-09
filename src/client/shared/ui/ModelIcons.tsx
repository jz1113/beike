import React from 'react';
import { canonicalModelId } from '@shared/domain/models/modelCatalog';

/**
 * 官方 AI 模型厂商 Logo：Vite 构建期内联 SVG（避免 Tauri/WKWebView 对
 * <img src="/logo/*.svg"> 加载失败导致问号占位）。
 */
const logoRawModules = import.meta.glob('../../assets/model-logos/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const logoRawByFile: Record<string, string> = {};
for (const [path, raw] of Object.entries(logoRawModules)) {
  const file = path.split('/').pop();
  if (file && typeof raw === 'string') {
    logoRawByFile[file] = raw;
  }
}

function logoFileFromPath(logoPath: string): string {
  const file = logoPath.split('/').pop() || '';
  return file.endsWith('.svg') ? file : `${file}.svg`;
}

/**
 * 允许的内联 SVG 模型 Logo 白名单（与 logoRawByFile 的 key 一致）。
 * 任何不在此集合中的文件一律拒绝内联，杜绝 XSS。
 */
const ALLOWED_LOGO_FILES = new Set(Object.keys(logoRawByFile));

/**
 * 在深色模式下需自适应转为纯白高对比度的厂商 Logo 集合
 */
const ADAPTIVE_DARK_LOGOS = new Set([
  'openai.svg',
  'grok.svg',
  'midjourney.svg',
  'flux.svg',
  'runway.svg',
  'ideogram.svg',
  'replicate.svg',
  'recraft.svg',
  'suno.svg',
  'pika.svg',
  'moonshot.svg',
  'tripo.svg',
  'viggle.svg',
  'baai.svg',
  'kimi.svg',
  'luma.svg',
  'yi.svg',
  'topaz.svg',
  'elevenlabs.svg',
  'groq.svg',
]);

function makeDarkSvg(raw: string): string {
  return raw
    .replace(/fill="currentColor"/g, 'fill="#FFFFFF"')
    .replace(/fill="#000000"/gi, 'fill="#FFFFFF"')
    .replace(/fill="#000"/gi, 'fill="#FFFFFF"')
    .replace(/fill="#111111"/gi, 'fill="#FFFFFF"')
    .replace(/fill="#111"/gi, 'fill="#FFFFFF"');
}

const logoRawByFileDark: Record<string, string> = {};
for (const [file, raw] of Object.entries(logoRawByFile)) {
  if (ADAPTIVE_DARK_LOGOS.has(file)) {
    logoRawByFileDark[file] = makeDarkSvg(raw);
  }
}

/**
 * 将内联 SVG 字符串转成 `<img src="data:image/svg+xml;base64,...">` 可直接消费的 base64 URI。
 * 任何 modelId 不在白名单内都会被拒绝（返回 null），上层走 LetterBadgeIcon。
 */
function svgRawToDataUri(raw: string): string {
  // 仅允许 svg 根标签，避免任意 HTML 注入（防御性二次校验）
  const trimmed = raw.trim();
  if (!trimmed.startsWith('<svg')) return '';
  // 移除可能的 <script>、on* 属性
  if (/<script|on[a-z]+\s*=/i.test(trimmed)) return '';
  const encoded = typeof window !== 'undefined' && typeof window.btoa === 'function'
    ? window.btoa(unescape(encodeURIComponent(trimmed)))
    : Buffer.from(trimmed, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

export function getModelLogoDataUri(modelId: string, isDark = false): string | null {
  const file = logoFileFromPath(getModelLogoPath(modelId));
  // 严格白名单：不在构建期内联资源表中的 file 一律拒绝
  if (!ALLOWED_LOGO_FILES.has(file)) return null;
  const raw = isDark && logoRawByFileDark[file]
    ? logoRawByFileDark[file]
    : (logoRawByFile[file] || logoRawByFile['unknown.svg'] || null);
  if (!raw) return null;
  return svgRawToDataUri(raw);
}

/**
 * 官方 AI 模型厂商 Logo 路径映射器（返回逻辑路径，供文件名解析；不再用于 <img src>）
 */
export function getModelLogoPath(modelId: string = ''): string {
  const canonical = canonicalModelId(modelId).toLowerCase();
  const m = canonical === 'image2-4k' ? 'gpt-image-2-4k' : canonical;
  // Require a complete name token; fragments such as default/fal and metadata/meta are unrelated.
  const has = (token: string): boolean => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const end = /[-_]$/.test(token) ? '' : '(?=$|[^a-z0-9]|[0-9])';
    return new RegExp(`^${escaped}${end}`).test(m);
  };

  if (m === 'google') {
    return '/logo/google.svg';
  }

  // 1. Gemini / Imagen / Veo / Omni Flash / Gemma / PaLM / Banana / NanoBanana
  if (has('gemini') || has('google') || has('gemma') || has('imagen') || has('veo') || has('omni_flash') || has('omni-flash') || has('palm') || has('bard') || has('banana') || has('nanobanana') || has('nano-banana')) {
    return '/logo/gemini.svg';
  }

  // 2. OpenAI Sora (专门的视频世界模型)
  if (has('sora')) {
    return '/logo/sora.svg';
  }

  // 3. OpenAI (ChatGPT / GPT-4o / GPT-5 / DALL-E / o1 / o3 / o4 / text-embedding / voice / avatar)
  if (has('gpt') || has('openai') || has('dall') || /^o[134]([^a-z0-9]|$)/.test(m) || has('text-embedding') || has('whisper') || has('advanced-voice')) {
    return '/logo/openai.svg';
  }

  // 4. Mistral AI (Mistral / Mixtral / Pixtral / Codestral / Ministral)
  if (has('mistral') || has('mixtral') || has('pixtral') || has('codestral') || has('ministral')) {
    return '/logo/mistral.svg';
  }

  if (m === 'bytedance' || has('bytedance')) {
    return '/logo/bytedance.svg';
  }

  // 5. 即梦 / 豆包 (Seedream / Seedance / Jimeng / Doubao / Volcengine)
  if (has('seedream') || has('seededit') || has('seed-tts') || has('omnihuman') || has('omni-human') || has('seedance') || has('jimeng') || has('doubao') || has('volc') || has('skylark')) {
    return '/logo/jimeng.svg';
  }

  // 6. Black Forest Labs / FLUX (FLUX.1 Schnell / Dev / Pro / Ultra)
  if (has('flux') || has('bfl') || has('black forest') || has('schnell')) {
    return '/logo/flux.svg';
  }

  // 7. Midjourney (Midjourney v6 / v7 / Niji)
  if (has('midjourney') || /(^|[^a-z0-9])mj(?=$|[^a-z0-9]|v\d)/.test(m) || has('niji')) {
    return '/logo/midjourney.svg';
  }

  // 8. 快手可灵 Kling AI (Kling 1.5 / Kling 2.0 / Kling Video / Kolors)
  if (has('kling') || has('kuaishou') || has('keling') || has('kolors') || has('可灵') || has('可图')) {
    return '/logo/kling.svg';
  }

  // 9. Runway (Gen-2 / Gen-3 Alpha / Gen-3 Turbo / Act-One)
  if (has('runway') || has('gen-2') || has('gen-3') || has('gen2') || has('gen3')) {
    return '/logo/runway.svg';
  }

  // 10. Luma AI (Dream Machine / Photon)
  if (has('luma') || has('dream-machine') || has('photon')) {
    return '/logo/luma.svg';
  }

  // 11. MiniMax / 海螺 AI (Hailuo Video / T2V / I2V / abab)
  if (has('minimax') || has('hailuo') || has('abab') || has('海螺')) {
    return '/logo/minimax.svg';
  }

  // 12. DeepSeek (DeepSeek-V3 / DeepSeek-R1 / DeepSeek-Coder)
  if (has('deepseek')) {
    return '/logo/deepseek.svg';
  }

  // 13. Anthropic Claude (Claude 3.7 / 3.5 Sonnet / Opus / Haiku)
  if (has('claude') || has('anthropic')) {
    return '/logo/claude.svg';
  }

  // 14. Stability AI / Stable Diffusion (SD 3.5 / SDXL / Cascade)
  if (has('sd-') || has('sdxl') || has('sd3') || has('stable-diffusion') || has('stability') || has('stable-audio') || has('cascade')) {
    return '/logo/stability.svg';
  }

  // 15. 阿里通义千问 Qwen / Z-Image / 万相 Wanx / Wan 视频 / Animate Anyone
  if (has('qwen') || has('cosyvoice') || has('qwq') || has('z-image') || has('tongyi') || has('wanx') || has('wan2') || has('wan-') || /^wan[\d.-]/.test(m) || has('alibaba') || has('aliyun') || has('dashscope') || has('animate-anyone') || has('通义') || has('万相')) {
    return '/logo/qwen.svg';
  }

  // 15b. 生数科技 Vidu
  if (has('vidu') || has('viduq') || has('shengshu')) {
    return '/logo/vidu.svg';
  }

  // 16. xAI Grok (Grok-2 / Grok Vision / Aurora)
  if (has('grok') || has('xai') || has('aurora')) {
    return '/logo/grok.svg';
  }

  // 17. 智谱 AI / GLM / CogView / CogVideo
  if (has('zhipu') || has('chatglm') || has('glm') || has('cogview') || has('cogvideox') || has('cogvideo') || has('智谱')) {
    return '/logo/zhipu.svg';
  }

  // 18. 腾讯混元 Hunyuan (Hunyuan3D / HunyuanVideo)
  if (has('hunyuan') || has('tencent') || has('混元')) {
    return '/logo/hunyuan.svg';
  }

  // 19. 百度文心 Baidu (Ernie 4.0 / 文心一言)
  if (has('baidu') || has('ernie') || has('wenxin') || has('文心')) {
    return '/logo/baidu.svg';
  }

  // 20. 北京智源 BAAI (BGE / BAAI)
  if (has('baai') || has('bge')) {
    return '/logo/baai.svg';
  }

  // 21. Pika (Pika 2.0 / Pika Effects)
  if (has('pika')) {
    return '/logo/pika.svg';
  }

  // 22. Ideogram (Ideogram 2.0 / Text in Image)
  if (has('ideogram')) {
    return '/logo/ideogram.svg';
  }

  if (m === 'moonshot' || has('moonshot')) {
    return '/logo/moonshot.svg';
  }

  // 23. Kimi
  if (has('kimi')) {
    return '/logo/kimi.svg';
  }

  // 24. Meta / LLaMA / Muse（网关通常只返回不带 meta/ 前缀的模型名）
  if (has('meta') || has('llama') || has('muse') || /^muse[-_](wonder|spark|image|voice|glimmer)(?=$|[-_\d.])/.test(m)) {
    return '/logo/meta.svg';
  }

  // 25. Suno (Music)
  if (has('suno')) {
    return '/logo/suno.svg';
  }

  // 26. Stepfun / 阶跃星辰
  if (has('stepfun') || has('step')) {
    return '/logo/stepfun.svg';
  }

  // 27. 零一万物 Yi (01.AI)
  if (/(^|[^a-z0-9])yi($|[^a-z0-9])/.test(m) || has('01.ai') || has('01ai')) {
    return '/logo/yi.svg';
  }

  // 28. 商汤日日新 SenseNova
  if (has('sensenova') || has('sensechat') || has('商汤')) {
    return '/logo/sensenova.svg';
  }

  // 29. 百川智能 Baichuan
  if (has('baichuan') || has('百川')) {
    return '/logo/baichuan.svg';
  }

  // 30. Recraft AI
  if (has('recraft')) {
    return '/logo/recraft.svg';
  }

  // 31. Tripo 3D
  if (has('tripo')) {
    return '/logo/tripo.svg';
  }

  // 32. Viggle AI
  if (has('viggle')) {
    return '/logo/viggle.svg';
  }

  // 33. Replicate
  if (has('replicate')) {
    return '/logo/replicate.svg';
  }

  if (has('xiaomi') || has('mimo')) {
    return '/logo/xiaomi.svg';
  }
  if (has('topaz')) {
    return '/logo/topaz.svg';
  }
  if (has('eleven') || has('elevenlabs')) {
    return '/logo/elevenlabs.svg';
  }
  if (has('meshy')) {
    return '/logo/meshy.svg';
  }
  if (has('fal') || has('fal-ai')) {
    return '/logo/fal.svg';
  }
  if (has('siliconflow') || has('siliconcloud') || has('silicon')) {
    return '/logo/siliconflow.svg';
  }
  if (has('together')) {
    return '/logo/together.svg';
  }
  if (has('openrouter')) {
    return '/logo/openrouter.svg';
  }
  if (has('groq')) {
    return '/logo/groq.svg';
  }
  if (has('cohere') || has('command-r') || has('command-a')) {
    return '/logo/cohere.svg';
  }
  if (has('comfly')) {
    return '/logo/comfly.svg';
  }

  // 34. 仅显式 Hugging Face 名称使用其标志
  if (has('huggingface')) {
    return '/logo/huggingface.svg';
  }

  // 未知归属使用中性图标，不能冒用厂商或社区平台标志。
  return '/logo/unknown.svg';
}

/**
 * 官方 AI 模型矢量图标组件（内联 SVG，内置深浅色自适应反白）
 */
export function ModelIcon({
  modelId,
  className = 'w-6 h-6',
}: {
  modelId: string;
  className?: string;
}) {
  const file = logoFileFromPath(getModelLogoPath(modelId));
  const isAdaptive = ADAPTIVE_DARK_LOGOS.has(file);
  const dataUri = getModelLogoDataUri(modelId, false);

  if (!dataUri) {
    return <LetterBadgeIcon name={modelId || 'A'} className={className} />;
  }

  if (isAdaptive) {
    const darkDataUri = getModelLogoDataUri(modelId, true) || dataUri;
    return (
      <>
        <img
          src={dataUri}
          alt={modelId || 'AI Model'}
          role="img"
          draggable={false}
          className={`${className} dark:hidden inline-flex items-center justify-center flex-shrink-0 select-none pointer-events-none object-contain`}
        />
        <img
          src={darkDataUri}
          alt={modelId || 'AI Model'}
          role="img"
          draggable={false}
          className={`${className} hidden dark:inline-flex items-center justify-center flex-shrink-0 select-none pointer-events-none object-contain`}
        />
      </>
    );
  }

  return (
    <img
      src={dataUri}
      alt={modelId || 'AI Model'}
      role="img"
      draggable={false}
      className={`${className} inline-flex items-center justify-center flex-shrink-0 select-none pointer-events-none object-contain`}
    />
  );
}

/**
 * 官方 AI 模型矢量图标（兼容既有调用方）
 */
export function getModelIcon(modelId: string, className = 'w-6 h-6') {
  return <ModelIcon modelId={modelId} className={className} />;
}

/** 动态字母徽标兜底 */
export function LetterBadgeIcon({
  name,
  className = 'w-6 h-6',
}: {
  name: string;
  className?: string;
}) {
  const firstLetter = (name.replace(/[^a-zA-Z0-9]/g, '')[0] || 'A').toUpperCase();
  return (
    <div className={`${className} rounded-full bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200 font-mono font-bold text-xs shadow-2xs flex-shrink-0 select-none`}>
      {firstLetter}
    </div>
  );
}
