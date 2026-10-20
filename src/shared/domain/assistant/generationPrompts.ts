export type GenerationPromptMedia = 'image' | 'video';

export interface GenerationPromptEntry {
  id: string;
  title: string;
  prompt: string;
  mediaType: GenerationPromptMedia;
  aspect?: string;
  duration?: number;
  issue?: string;
}

export const GENERATION_BATCH_LIMIT = 30;

/** Stable content fingerprint for source versions, never used as an authorization token. */
export function promptFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

function aspectFrom(text: string): string | undefined {
  const ratio = text.match(/(?:--ar\s+|比例\s*[：:]?\s*|画幅\s*[：:]?\s*|^|[\s，,。；;])(\d{1,2})\s*[:：]\s*(\d{1,2})(?!\d)/m);
  if (ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0) return `${Number(ratio[1])}:${Number(ratio[2])}`;
  const pixels = text.match(/\b(\d{3,5})\s*[x×＊*]\s*(\d{3,5})\b/i);
  if (!pixels) return undefined;
  const a = Number(pixels[1]); const b = Number(pixels[2]);
  const gcd = (x: number, y: number): number => y ? gcd(y, x % y) : x;
  const divisor = gcd(a, b);
  return a && b ? `${a / divisor}:${b / divisor}` : undefined;
}

export function isGenerationPrompt(code: string, lang = '', heading = ''): GenerationPromptMedia | undefined {
  if (/^(?:image-prompt|image_prompt|image)$/i.test(lang)) return 'image';
  if (/^(?:video-prompt|video_prompt|video)$/i.test(lang)) return 'video';
  if (!/^(?:text|txt|plaintext|plain|prompt|markdown|md)?$/i.test(lang)) return undefined;
  if (/(?:视频|video)\s*(?:[\d一二三四五六七八九十]+|[：:]|$)/i.test(heading) && !/(?:封面|首帧图|尾帧图)/.test(heading)) return 'video';
  if (/(?:视频|video|运镜|镜头运动|时间轴|口播|首尾帧|镜头\s*\d).*?(?:提示词|prompt)|(?:视频|video)提示词/i.test(heading)
    || /(?:视频时长|总时长|生成.{0,8}视频|镜头从|运镜|推镜|跟拍|时间轴|\d+(?:\.\d+)?\s*[-–—~～]\s*\d+(?:\.\d+)?\s*[秒s])/i.test(code)) return 'video';
  if (/生图|绘图|图片提示词|封面|海报|插画|画面提示词/i.test(heading)
    || /--ar\s+\d+:\d+|特写|抓拍|原相机|实拍|光影|景深|质感|构图|字体|背景色|[@＠]\s*(?:图片|图)\s*\d|\d+\s*[:：]\s*\d+\s*(?:竖版|横版)/i.test(code)) return 'image';
  return undefined;
}

/** Only closed deliverable blocks are executable. Repeated text is intentionally not deduplicated. */
export function extractGenerationPrompts(content: string): GenerationPromptEntry[] {
  const entries: GenerationPromptEntry[] = [];
  let heading = ''; let context = ''; let excluded = false; let excludedDepth = 0;
  let fence: string | undefined; let lang = ''; let lines: string[] = [];
  let blockHeading = ''; let blockContext = ''; let blockExcluded = false;
  for (const line of content.split('\n')) {
    const marker = line.trim().match(/^(`{3,}|~{3,})([^`]*)$/);
    if (marker) {
      if (!fence) {
        fence = marker[1]; lang = marker[2].trim(); lines = [];
        blockHeading = heading; blockContext = context; blockExcluded = excluded;
      } else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        const prompt = lines.join('\n').trim();
        const mediaType = isGenerationPrompt(prompt, lang, `${blockHeading}\n${blockContext}`);
        if (prompt && mediaType && !blockExcluded) {
          const ordinal = entries.length + 1;
          const durationText = prompt.match(/(?:总时长|视频时长|时长|duration)\s*[：:=]?\s*(\d+(?:\.\d+)?)\s*(?:秒|s)?/i);
          const dependent = /(?:使用|引用|基于|等待|采用|以).{0,12}(?:上(?:面|述|一)[^\n]{0,8}(?:生成|成品)|第\s*\d+\s*(?:项|张).{0,8}(?:生成结果|成品))/.test(prompt);
          entries.push({
            id: `prompt-${ordinal}-${promptFingerprint(`${mediaType}\n${prompt}`)}`,
            title: blockHeading || `${mediaType === 'video' ? '视频' : '图片'} ${ordinal}`,
            prompt, mediaType, aspect: aspectFrom(`${prompt}\n${blockHeading}`),
            duration: durationText ? Number(durationText[1]) : undefined,
            issue: dependent ? '此项依赖其他生成结果，请先补齐成品参考素材并移除依赖描述。' : undefined,
          });
        }
        fence = undefined; lines = [];
      } else lines.push(line);
      continue;
    }
    if (fence) { lines.push(line); continue; }
    const label = line.replace(/^\s*#{1,6}\s*|\*\*/g, '').trim();
    if (!label) continue;
    if (/^\s*#{1,6}\s|^\s*(?:[一二三四五六七八九十]+[、.．]|\d{1,2}[、.．)）\s])|第\s*[\d一二三四五六七八九十]+\s*[张页项]/.test(line)) {
      const depth = line.match(/^\s*(#{1,6})\s/)?.[1].length;
      if (depth && depth <= excludedDepth) excludedDepth = 0;
      const excludedLabel = /负面|反例|示例|旧版|不要使用|关键词汇总/.test(label);
      if (excludedLabel && depth) excludedDepth = depth;
      heading = label.slice(0, 160); context = label;
      excluded = excludedDepth > 0 || excludedLabel;
    } else {
      context = label.slice(0, 240);
      if (/^(?:负面提示词|负面词|反例|示例|旧版|不要使用)/.test(label)) excluded = true;
      else if (!excludedDepth && /^(?:生图|绘图|图片|视频|正向).{0,8}提示词|^(?:image|video)[ -]?prompt/i.test(label)) excluded = false;
    }
  }
  return entries;
}
