import { normalizeGatewayBaseUrl } from '@beike/shared/gatewayUrl';
import { getHarmonizedStoryboardForScene } from '@beike/shared/drawing';
import { convertToStandardJpegDataUrl } from '@beike/shared/imageConverter';
import { normalizeVisionModelId } from '@beike/shared/vision';
import {
  resolveVisionAnalyzeMaxTokens,
  resolveVisionTimeoutMs,
} from '@beike/shared/visionTimeouts';

import { getDefaultBaseUrl, getDefaultApiKey } from './imageHelpers';
export { getDefaultBaseUrl, getDefaultApiKey };

const ANALYZE_IMAGE_MAX_DIMENSION = 640;
const ANALYZE_IMAGE_QUALITY = 70;
const MAX_VISION_FALLBACKS = 2;

export function isGptFamily(modelId: string) {
  const id = modelId.toLowerCase();
  return id.includes('gpt-') || id.startsWith('gpt') || id.includes('o1') || id.includes('o3') || id.includes('o4');
}

export function isGeminiFamily(modelId: string) {
  return modelId.toLowerCase().includes('gemini');
}

export async function prepareAnalyzeImages(imageUrls: string[], maxImages = 3): Promise<string[]> {
  // 仅截取最具代表性的前 2~3 张核心商品图（主图+细节特写），彻底杜绝 10+ 张高清图导致输入 Token 暴涨至 12,000+ 引发上游并发限流与 450s 严重排队
  const targetImages = imageUrls.slice(0, Math.max(1, Math.min(6, maxImages)));
  const converted = await Promise.all(
    targetImages.map((u) =>
      convertToStandardJpegDataUrl(u, {
        maxDimension: ANALYZE_IMAGE_MAX_DIMENSION,
        quality: ANALYZE_IMAGE_QUALITY,
      })
    )
  );
  return converted.filter((url): url is string => Boolean(url && typeof url === 'string'));
}

export async function prepareAnalyzeSingleImage(imageUrl: string): Promise<string> {
  const [converted] = await prepareAnalyzeImages([imageUrl], 1);
  return converted || imageUrl;
}

export async function prepareAnalyzeProductAndScene(
  productImageUrl: string,
  sceneAnchorUrl?: string
): Promise<{ productDataUrl: string; sceneDataUrl?: string }> {
  const [productDataUrl] = await prepareAnalyzeImages([productImageUrl], 1);
  let sceneDataUrl: string | undefined;
  if (sceneAnchorUrl) {
    const [convertedScene] = await prepareAnalyzeImages([sceneAnchorUrl], 1);
    sceneDataUrl = convertedScene;
  }
  return { productDataUrl: productDataUrl || productImageUrl, sceneDataUrl };
}

export function buildVisionContent(promptText: string, imageDataUrls: string[]) {
  return [
    { type: 'text', text: promptText },
    ...imageDataUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ];
}

export function shotNoOf(prompt: any, fallbackIndex: number) {
  const n = Number(prompt?.shot_no);
  return Number.isFinite(n) && n > 0 ? n : fallbackIndex + 1;
}

export function mergePromptsByShotNo(base: any[], extra: any[], cap: number) {
  const byNo = new Map<number, any>();
  [...base, ...extra].forEach((p, idx) => {
    const no = shotNoOf(p, idx);
    if (no >= 1 && no <= cap && !byNo.has(no)) {
      byNo.set(no, { ...p, shot_no: no });
    }
  });
  return Array.from({ length: cap }, (_, i) => byNo.get(i + 1)).filter(Boolean);
}

export function missingShotNos(prompts: any[], cap: number) {
  const have = new Set(prompts.map((p, i) => shotNoOf(p, i)));
  const missing: number[] = [];
  for (let i = 1; i <= cap; i++) {
    if (!have.has(i)) missing.push(i);
  }
  return missing;
}

export function padMissingSocialShots(prompts: any[], cap: number) {
  const byNo = new Map<number, any>();
  prompts.forEach((p, i) => {
    const no = shotNoOf(p, i);
    if (no >= 1 && no <= cap && !byNo.has(no)) byNo.set(no, { ...p, shot_no: no });
  });
  return Array.from({ length: cap }, (_, i) => {
    const no = i + 1;
    if (byNo.has(no)) return byNo.get(no);
    return {
      shot_no: no,
      title: `分镜 ${no}`,
      scene: `对应爆款参考图 ${no} 的场景结构与光影`,
      expression: '无（静物）',
      has_human: false,
      shot_type: 'pure_product',
      prompt: `【爆款复刻实拍】：主体为 @图片1 所示商品实物，按参考图 ${no} 反推所得的场景结构、景深、置景与光影生成真实生活实拍，对商品做物理重光照与接触阴影，无鼠标光标、截屏边框或广告文字。`,
      selected: true,
    };
  });
}

export function padMissingOriginalShots(
  prompts: any[],
  cap: number,
  context: {
    productTitle?: string;
    isNoModel?: boolean;
    masterScene?: string;
    lookBible?: string;
    identityBible?: string;
  }
) {
  const byNo = new Map<number, any>();
  prompts.forEach((p, i) => {
    const no = shotNoOf(p, i);
    if (no >= 1 && no <= cap && !byNo.has(no)) byNo.set(no, { ...p, shot_no: no });
  });

  const title = context.productTitle || '商品';
  const isJewelry = /手镯|手链|手串|项链|吊坠|锁骨链|戒指|指环|耳环|耳钉|耳饰|珠宝|翡翠|黄金|足金|银饰|首饰/i.test(title);
  const harmonizedTemplates = getHarmonizedStoryboardForScene(
    context.masterScene || '',
    isJewelry,
    Boolean(context.isNoModel)
  );

  const result: any[] = [];
  for (let i = 1; i <= cap; i++) {
    if (byNo.has(i)) {
      result.push(byNo.get(i));
    } else {
      const template = harmonizedTemplates[(i - 1) % harmonizedTemplates.length];
      result.push({
        shot_no: i,
        title: template.title,
        scene: template.sceneSuffix,
        action: template.action,
        expression: template.expression,
        camera_focal_length: template.camera,
        angle: template.angle,
        has_human: template.hasHuman,
        shot_type: template.shotType,
        selected: true
      });
    }
  }
  return result;
}

export async function callVisionModel(
  requestedModel: string,
  contentArray: any[],
  baseUrl?: string,
  apiKey?: string,
  fallbackModels: string[] = [],
  shotCount: number = 4,
): Promise<{ 
  rawText: string; 
  actualModel: string; 
  triedModels: string[]; 
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  const effectiveBaseUrl = (baseUrl && baseUrl.trim()) ? baseUrl.trim() : getDefaultBaseUrl();
  const effectiveApiKey = (apiKey && apiKey.trim()) ? apiKey.trim() : getDefaultApiKey();
  const normalized = normalizeVisionModelId(requestedModel);
  const userFallbacks = (Array.isArray(fallbackModels) ? fallbackModels : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .map((id) => normalizeVisionModelId(id))
    .filter((id) => id && id !== normalized && id !== requestedModel)
    .slice(0, MAX_VISION_FALLBACKS);

  const modelsToTry = Array.from(
    new Set([normalized, requestedModel, ...userFallbacks].filter(Boolean))
  ).slice(0, 1 + MAX_VISION_FALLBACKS);
  const triedModels: string[] = [];
  let lastError: any = null;
  let skipGptFamily = false;
  let skipGeminiFamily = false;

  if (modelsToTry.length === 0) {
    throw new Error('未指定可用的视觉模型');
  }

  for (let index = 0; index < modelsToTry.length; index++) {
    const model = modelsToTry[index];
    if (skipGptFamily && isGptFamily(model)) continue;
    if (skipGeminiFamily && isGeminiFamily(model)) continue;

    triedModels.push(model);
    const isPrimary = index === 0;
    const timeoutMs = resolveVisionTimeoutMs(model, isPrimary);
    try {
      console.log(`[Vision API] 尝试视觉模型: ${model}（超时 ${Math.round(timeoutMs / 1000)}s）...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${normalizeGatewayBaseUrl(effectiveBaseUrl)}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: contentArray
            }
          ],
          temperature: 0.7,
          max_tokens: resolveVisionAnalyzeMaxTokens(shotCount),
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Vision API] 模型 [${model}] 返回 HTTP ${response.status}: ${errText.slice(0, 150)}，准备尝试下一用户模型...`);
        lastError = new Error(`视觉模型 [${model}] 调用失败 (HTTP ${response.status}): ${errText}`);
        if ([429, 502, 503, 520].includes(response.status) && isGptFamily(model)) {
          skipGptFamily = true;
        }
        if (response.status === 400 && /PROHIBITED_CONTENT/i.test(errText) && isGeminiFamily(model)) {
          skipGeminiFamily = true;
        }
        continue;
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      if (rawText && rawText.trim()) {
        if (model !== normalized && model !== requestedModel) {
          console.log(`[Vision API] 主模型不可用，已切换至用户列表内模型: ${model}`);
        }

        let promptTokens = Number(data.usage?.prompt_tokens || data.usage?.promptTokens || 0);
        let completionTokens = Number(data.usage?.completion_tokens || data.usage?.completionTokens || 0);
        let totalTokens = Number(data.usage?.total_tokens || data.usage?.totalTokens || 0);

        if (totalTokens === 0) {
          const contentText = Array.isArray(contentArray)
            ? contentArray.map(c => typeof c === 'string' ? c : (c.text || '')).join(' ')
            : '';
          const imageCount = Array.isArray(contentArray)
            ? contentArray.filter(c => c.type === 'image_url' || (c.image_url && c.image_url.url)).length
            : 0;
          promptTokens = Math.max(50, Math.round(contentText.length * 0.8) + (imageCount * 258));
          completionTokens = Math.max(30, Math.round(rawText.length * 0.8));
          totalTokens = promptTokens + completionTokens;
        }

        return { 
          rawText, 
          actualModel: model, 
          triedModels,
          usage: { promptTokens, completionTokens, totalTokens }
        };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || /aborted/i.test(String(e?.message || ''))) {
        const timeoutSec = Math.round(timeoutMs / 1000);
        console.warn(`[Vision API] 模型 [${model}] 响应超时（${timeoutSec}s），不再切换备用模型以免重复扣费`);
        throw new Error(
          `视觉模型响应超时（已等待约 ${timeoutSec} 秒），请稍后重试或换用 Flash 极速模型。上游可能仍会计费，请勿立刻重复提交`,
        );
      }
      console.warn(`[Vision API] 模型 [${model}] 请求异常: ${e.message}，准备尝试下一个...`);
      lastError = e;
    }
  }

  throw lastError || new Error(`您配置的多模态模型均调用失败（已尝试: ${triedModels.join(', ')}）。请稍后重试或在设置中更换模型。`);
}

// 提取与解析 JSON 结构，并确保彻底分离全局元数据与纯净提示词
export function parseResponseJson(text: string): {
  product_fingerprint?: string;
  master_scene?: string;
  look_bible?: string;
  identity_bible?: string;
  model_anchor_features?: string;
  title?: string;
  content?: string;
  tags?: string[];
  prompts: any[];
  [key: string]: any;
} {
  // 1. 提取可能包裹在 ```json 代码块中的内容
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonStr = (jsonMatch ? jsonMatch[1] : text).trim();

  // 2. 尝试标准 JSON.parse
  try {
    const cleanStr = jsonStr.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
    const parsed = JSON.parse(cleanStr);
    
    if (Array.isArray(parsed)) {
      return { prompts: parsed };
    }
    if (parsed.prompts && Array.isArray(parsed.prompts)) {
      return parsed;
    }
    if (parsed.title || parsed.content) {
      return {
        prompts: [],
        title: parsed.title,
        content: parsed.content,
        tags: parsed.tags,
        ...parsed,
      };
    }
    if (parsed.prompt) {
      return {
        prompts: [parsed],
        product_fingerprint: parsed.product_fingerprint,
        master_scene: parsed.master_scene,
        look_bible: parsed.look_bible,
        identity_bible: parsed.identity_bible,
        model_anchor_features: parsed.model_anchor_features,
        ...parsed,
      };
    }
    return { prompts: [], ...parsed };
  } catch {
    // 3. 尝试修复常见 JSON 语法问题（如结尾逗号）再次解析
    try {
      const repaired = jsonStr
        .replace(/^[^{[]*/, '')
        .replace(/[^}\]]*$/, '')
        .replace(/,\s*([}\]])/g, '$1');
      const parsed2 = JSON.parse(repaired);
      if (parsed2.prompts && Array.isArray(parsed2.prompts)) {
        return parsed2;
      }
      if (Array.isArray(parsed2)) {
        return { prompts: parsed2 };
      }
    } catch {}
  }

  // 4. 高鲁棒性正则精准提取各字段，彻底杜绝把整段 JSON 误塞进提示词
  const extractStr = (key: string) => {
    const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : undefined;
  };
  const product_fingerprint = extractStr('product_fingerprint');
  const master_scene = extractStr('master_scene');
  const look_bible = extractStr('look_bible');
  const identity_bible = extractStr('identity_bible');
  const model_anchor_features = extractStr('model_anchor_features');

  // 正则寻找所有的 {"shot_no": ..., "prompt": "..."} 或独立的 "prompt": "..." 块
  const prompts: any[] = [];
  const promptRegex = /"prompt"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  let count = 1;

  while ((match = promptRegex.exec(jsonStr)) !== null) {
    const rawP = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    prompts.push({
      shot_no: count++,
      prompt: rawP
    });
  }

  if (prompts.length > 0) {
    return {
      product_fingerprint,
      master_scene,
      look_bible,
      identity_bible,
      model_anchor_features,
      prompts
    };
  }

  // 5. 极端降级：纯文本按行拆分 (过滤无效自然语言闲聊)
  const fallbackPrompts: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let currentPrompt = '';
  let shotNo = 1;

  for (const line of lines) {
    // 忽略所有 JSON 键值对行
    if (/^"(?:product_fingerprint|model_anchor_features|master_scene|look_bible|identity_bible|prompts|shot_no|title|scene|expression|action|camera_focal_length|angle|lighting_type|shot_type|has_human)"\s*:/.test(line)) {
      continue;
    }
    if (line.startsWith('{') || line.startsWith('}') || line.startsWith('[') || line.startsWith(']') || line.startsWith('```')) {
      continue;
    }
    // 忽略大模型开场白与客套话
    if (/^(?:好的|当然|作为|根据|以下是|我已|请查收|为你规划)/i.test(line) && line.length < 30) {
      continue;
    }
    if (line.includes('Shot') || line.includes('分镜') || line.includes('Prompt') || /^\d+[.、]/.test(line)) {
      if (currentPrompt && currentPrompt.trim().length >= 15) {
        fallbackPrompts.push({ shot_no: shotNo++, prompt: currentPrompt.trim() });
        currentPrompt = '';
      }
    }
    currentPrompt += line + ' ';
  }
  if (currentPrompt && currentPrompt.trim().length >= 15) {
    fallbackPrompts.push({ shot_no: shotNo, prompt: currentPrompt.trim() });
  }

  return {
    product_fingerprint,
    master_scene,
    look_bible,
    identity_bible,
    model_anchor_features,
    prompts: fallbackPrompts
  };
}

