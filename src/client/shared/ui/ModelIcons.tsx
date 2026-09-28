import React from 'react';

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
 * 任何不在此集合中的 modelId 一律走 LetterBadgeIcon 兜底，杜绝 XSS。
 */
const ALLOWED_LOGO_FILES = new Set(Object.keys(logoRawByFile));

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

function getModelLogoDataUri(modelId: string): string | null {
  const file = logoFileFromPath(getModelLogoPath(modelId));
  // 严格白名单：不在构建期内联资源表中的 file 一律拒绝
  if (!ALLOWED_LOGO_FILES.has(file)) return null;
  const raw = logoRawByFile[file] || logoRawByFile['huggingface.svg'] || null;
  if (!raw) return null;
  return svgRawToDataUri(raw);
}

/**
 * 官方 AI 模型厂商 Logo 路径映射器（返回逻辑路径，供文件名解析；不再用于 <img src>）
 */
export function getModelLogoPath(modelId: string = ''): string {
  const m = (modelId || '').toLowerCase();

  // 1. Google (Gemini / Imagen / Veo / Omni Flash / Gemma / PaLM / Banana / NanoBanana)
  if (m.includes('gemini') || m.includes('google') || m.includes('gemma') || m.includes('imagen') || m.includes('veo') || m.includes('omni_flash') || m.includes('omni-flash') || m.includes('palm') || m.includes('bard') || m.includes('banana') || m.includes('nanobanana')) {
    return '/logo/gemini.svg';
  }

  // 2. OpenAI Sora (专门的视频世界模型)
  if (m.includes('sora')) {
    return '/logo/sora.svg';
  }

  // 3. OpenAI (ChatGPT / GPT-4o / GPT-5 / DALL-E / o1 / o3 / o4 / text-embedding / voice / avatar)
  if (m.includes('gpt') || m.includes('openai') || m.includes('dall') || m.includes('o1') || m.includes('o3') || m.includes('o4') || m.includes('text-embedding') || m.includes('whisper') || m.includes('advanced-voice') || m.includes('avatar-')) {
    return '/logo/openai.svg';
  }

  // 4. Mistral AI (Mistral / Mixtral / Pixtral / Codestral / Ministral)
  if (m.includes('mistral') || m.includes('mixtral') || m.includes('pixtral') || m.includes('codestral') || m.includes('ministral')) {
    return '/logo/mistral.svg';
  }

  // 5. 字节跳动 / 即梦 / 豆包 (Seedream / Seedance / Jimeng / Doubao / Volcengine)
  if (m.includes('seedream') || m.includes('seedance') || m.includes('jimeng') || m.includes('doubao') || m.includes('bytedance') || m.includes('volc') || m.includes('skylark')) {
    return '/logo/jimeng.svg';
  }

  // 6. Black Forest Labs / FLUX (FLUX.1 Schnell / Dev / Pro / Ultra)
  if (m.includes('flux') || m.includes('bfl') || m.includes('black forest') || m.includes('schnell')) {
    return '/logo/flux.svg';
  }

  // 7. Midjourney (Midjourney v6 / v7 / Niji)
  if (m.includes('midjourney') || m.includes('mj') || m.includes('niji')) {
    return '/logo/midjourney.svg';
  }

  // 8. 快手可灵 Kling AI (Kling 1.5 / Kling 2.0 / Kling Video / Kolors)
  if (m.includes('kling') || m.includes('kuaishou') || m.includes('keling') || m.includes('kolors') || m.includes('可灵') || m.includes('可图')) {
    return '/logo/kling.svg';
  }

  // 9. Runway (Gen-2 / Gen-3 Alpha / Gen-3 Turbo / Act-One)
  if (m.includes('runway') || m.includes('gen-2') || m.includes('gen-3') || m.includes('gen2') || m.includes('gen3')) {
    return '/logo/runway.svg';
  }

  // 10. Luma AI (Dream Machine / Photon)
  if (m.includes('luma') || m.includes('dream-machine') || m.includes('photon')) {
    return '/logo/luma.svg';
  }

  // 11. MiniMax / 海螺 AI (Hailuo Video / T2V / I2V / abab)
  if (m.includes('minimax') || m.includes('hailuo') || m.includes('abab') || m.includes('海螺')) {
    return '/logo/minimax.svg';
  }

  // 12. DeepSeek (DeepSeek-V3 / DeepSeek-R1 / DeepSeek-Coder)
  if (m.includes('deepseek')) {
    return '/logo/deepseek.svg';
  }

  // 13. Anthropic Claude (Claude 3.7 / 3.5 Sonnet / Opus / Haiku)
  if (m.includes('claude') || m.includes('anthropic')) {
    return '/logo/claude.svg';
  }

  // 14. Stability AI / Stable Diffusion (SD 3.5 / SDXL / Cascade)
  if (m.includes('sd-') || m.includes('sdxl') || m.includes('sd3') || m.includes('stable-diffusion') || m.includes('stability') || m.includes('cascade')) {
    return '/logo/stability.svg';
  }

  // 15. 阿里通义千问 Qwen / Z-Image / 万相 Wanx / Wan 视频 / Animate Anyone
  if (m.includes('qwen') || m.includes('z-image') || m.includes('tongyi') || m.includes('wanx') || m.includes('wan2') || m.includes('wan-') || /^wan[\d.-]/.test(m) || m.startsWith('wan') || m.includes('alibaba') || m.includes('aliyun') || m.includes('dashscope') || m.includes('animate-anyone') || m.includes('通义') || m.includes('万相')) {
    return '/logo/qwen.svg';
  }

  // 15b. 生数科技 Vidu
  if (m.includes('vidu') || m.includes('shengshu')) {
    return '/logo/vidu.svg';
  }

  // 16. xAI Grok (Grok-2 / Grok Vision / Aurora)
  if (m.includes('grok') || m.includes('xai') || m.includes('aurora')) {
    return '/logo/grok.svg';
  }

  // 17. 智谱 AI / GLM / CogView / CogVideo
  if (m.includes('zhipu') || m.includes('chatglm') || m.includes('glm') || m.includes('cogview') || m.includes('cogvideox') || m.includes('智谱')) {
    return '/logo/zhipu.svg';
  }

  // 18. 腾讯混元 Hunyuan (Hunyuan3D / HunyuanVideo)
  if (m.includes('hunyuan') || m.includes('tencent') || m.includes('混元')) {
    return '/logo/hunyuan.svg';
  }

  // 19. 百度文心 Baidu (Ernie 4.0 / 文心一言)
  if (m.includes('baidu') || m.includes('ernie') || m.includes('wenxin') || m.includes('文心')) {
    return '/logo/baidu.svg';
  }

  // 20. 北京智源 BAAI (BGE / BAAI)
  if (m.includes('baai') || m.includes('bge')) {
    return '/logo/baai.svg';
  }

  // 21. Pika (Pika 2.0 / Pika Effects)
  if (m.includes('pika')) {
    return '/logo/pika.svg';
  }

  // 22. Ideogram (Ideogram 2.0 / Text in Image)
  if (m.includes('ideogram')) {
    return '/logo/ideogram.svg';
  }

  // 23. Kimi / Moonshot
  if (m.includes('kimi') || m.includes('moonshot')) {
    return '/logo/kimi.svg';
  }

  // 24. Meta / LLaMA
  if (m.includes('meta') || m.includes('llama')) {
    return '/logo/meta.svg';
  }

  // 25. Suno (Music)
  if (m.includes('suno')) {
    return '/logo/suno.svg';
  }

  // 26. Stepfun / 阶跃星辰
  if (m.includes('stepfun') || m.includes('step')) {
    return '/logo/stepfun.svg';
  }

  // 27. 零一万物 Yi (01.AI)
  if (m.includes('yi') || m.includes('01.ai') || m.includes('01ai')) {
    return '/logo/yi.svg';
  }

  // 28. 商汤日日新 SenseNova
  if (m.includes('sensenova') || m.includes('sense') || m.includes('商汤')) {
    return '/logo/sensenova.svg';
  }

  // 29. 百川智能 Baichuan
  if (m.includes('baichuan') || m.includes('百川')) {
    return '/logo/baichuan.svg';
  }

  // 30. Recraft AI
  if (m.includes('recraft')) {
    return '/logo/recraft.svg';
  }

  // 31. Tripo 3D
  if (m.includes('tripo')) {
    return '/logo/tripo.svg';
  }

  // 32. Viggle AI
  if (m.includes('viggle')) {
    return '/logo/viggle.svg';
  }

  // 33. Replicate
  if (m.includes('replicate')) {
    return '/logo/replicate.svg';
  }

  // 34. 其他厂商 / 社区开源模型 (HuggingFace 开放模型图标)
  if (m === 'other' || m.includes('other') || m.includes('community') || m.includes('huggingface')) {
    return '/logo/huggingface.svg';
  }

  // 默认开源/社区模型兜底 (不再错赋为 OpenAI)
  return '/logo/huggingface.svg';
}

/**
 * 官方 AI 模型矢量图标组件（内联 SVG）
 */
export function ModelIcon({
  modelId,
  className = 'w-6 h-6',
}: {
  modelId: string;
  className?: string;
}) {
  const dataUri = getModelLogoDataUri(modelId);
  if (!dataUri) {
    return <LetterBadgeIcon name={modelId || 'A'} className={className} />;
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
    <div className={`${className} rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-mono font-bold text-xs shadow-2xs flex-shrink-0 select-none`}>
      {firstLetter}
    </div>
  );
}
