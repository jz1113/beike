import { jsonResponse } from '../../adapters/http';
import {
  buildActionDigestFromShots,
  buildVisionSystemPrompt,
  buildSocialFaceSwapSystemPrompt,
  normalizeVisionModelId,
} from '@/lib/vision';
import {
  assembleOriginalShotPrompt,
  cleanPromptText,
  enforceOriginalShotDiversity,
  ensureSocialPromptSlots,
  normalizeOriginalProductRole,
  sanitizeLookPartsForProductRole,
} from '@/lib/drawing';
import { resolveGatewayCreds } from '@/lib/gatewayCreds';
import { convertToStandardJpegDataUrl } from '@/lib/imageConverter';
import {
  resolveVisionAnalyzeMaxTokens,
  resolveVisionTimeoutMs,
  formatVisionAnalyzeError,
} from '@/lib/visionTimeouts';

const DEFAULT_BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const DEFAULT_API_KEY = process.env.AI_DRAWING_API_KEY || '';
const ANALYZE_IMAGE_MAX_DIMENSION = 640;
const ANALYZE_IMAGE_QUALITY = 70;
const MAX_VISION_FALLBACKS = 2;

function isGptFamily(modelId: string) {
  const id = modelId.toLowerCase();
  return id.includes('gpt-') || id.startsWith('gpt') || id.includes('o1') || id.includes('o3') || id.includes('o4');
}

function isGeminiFamily(modelId: string) {
  return modelId.toLowerCase().includes('gemini');
}

async function prepareAnalyzeImages(imageUrls: string[]): Promise<string[]> {
  const converted = await Promise.all(
    imageUrls.slice(0, 12).map((u) =>
      convertToStandardJpegDataUrl(u, {
        maxDimension: ANALYZE_IMAGE_MAX_DIMENSION,
        quality: ANALYZE_IMAGE_QUALITY,
      })
    )
  );
  return converted.filter((url): url is string => Boolean(url && typeof url === 'string'));
}

function buildVisionContent(promptText: string, imageDataUrls: string[]) {
  return [
    { type: 'text', text: promptText },
    ...imageDataUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ];
}

function shotNoOf(prompt: any, fallbackIndex: number) {
  const n = Number(prompt?.shot_no);
  return Number.isFinite(n) && n > 0 ? n : fallbackIndex + 1;
}

function mergePromptsByShotNo(base: any[], extra: any[], cap: number) {
  const byNo = new Map<number, any>();
  [...base, ...extra].forEach((p, idx) => {
    const no = shotNoOf(p, idx);
    if (no >= 1 && no <= cap && !byNo.has(no)) {
      byNo.set(no, { ...p, shot_no: no });
    }
  });
  return Array.from({ length: cap }, (_, i) => byNo.get(i + 1)).filter(Boolean);
}

function missingShotNos(prompts: any[], cap: number) {
  const have = new Set(prompts.map((p, i) => shotNoOf(p, i)));
  const missing: number[] = [];
  for (let i = 1; i <= cap; i++) {
    if (!have.has(i)) missing.push(i);
  }
  return missing;
}

function padMissingSocialShots(prompts: any[], cap: number) {
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
      scene: `对应爆款参考图 ${no} 的构图与光影`,
      expression: '无（静物）',
      has_human: false,
      shot_type: 'pure_product',
      prompt: `【爆款构图复刻与商品置换实拍】：以 @图片2 为参考图 ${no} 的空间构图与机位基准，忽略 @图片2 中旧商品外观。画面主体精准替换为 @图片1 所示商品实物，完整保留该参考图的景深、置景与光影，对 @图片1 做物理重光照与接触阴影，无鼠标光标、截屏边框或广告文字。`,
      selected: true,
    };
  });
}

async function callVisionModel(
  requestedModel: string,
  contentArray: any[],
  baseUrl: string = DEFAULT_BASE_URL,
  apiKey: string = DEFAULT_API_KEY || '',
  fallbackModels: string[] = [],
  shotCount: number = 4,
): Promise<{ rawText: string; actualModel: string; triedModels: string[] }> {
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

      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
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
        return { rawText, actualModel: model, triedModels };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || /aborted/i.test(String(e?.message || ''))) {
        const timeoutSec = Math.round(timeoutMs / 1000);
        console.warn(`[Vision API] 模型 [${model}] 响应超时（${timeoutSec}s），不再切换备用模型以免重复扣费`);
        throw new Error(`视觉模型响应超时（已等待约 ${timeoutSec} 秒），请稍后重试或换用 Flash 极速模型`);
      }
      console.warn(`[Vision API] 模型 [${model}] 请求异常: ${e.message}，准备尝试下一个...`);
      lastError = e;
    }
  }

  throw lastError || new Error(`您配置的多模态模型均调用失败（已尝试: ${triedModels.join(', ')}）。请稍后重试或在设置中更换模型。`);
}

// 提取与解析 JSON 结构，并确保彻底分离全局元数据与纯净提示词
function parseResponseJson(text: string): {
  product_fingerprint?: string;
  master_scene?: string;
  look_bible?: string;
  identity_bible?: string;
  model_anchor_features?: string;
  prompts: any[];
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
    if (parsed.prompt) {
      return {
        prompts: [parsed],
        product_fingerprint: parsed.product_fingerprint,
        master_scene: parsed.master_scene,
        look_bible: parsed.look_bible,
        identity_bible: parsed.identity_bible,
        model_anchor_features: parsed.model_anchor_features,
      };
    }
  } catch (e1) {
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
    } catch (e2) {}
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
    if (line.includes('Shot') || line.includes('分镜') || line.includes('Prompt') || /^\d+[\.、]/.test(line)) {
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

export async function POST(req: Request) {
  try {
    const body: any = await req.json();
    const { 
      mode = 'storyboard_generate',
      productTitle, 
      productProps,
      imageUrls = [], 
      referenceImageUrls = [],
      anchorFaceImageUrl,
      modelPersona,
      productFingerprint,
      templateStyle = 'auto', 
      shotCount = 4, 
      extraRequirements = '', 
      model = 'gpt-5.6-luna',
      fallbackModels = [],
      customBaseUrl,
      customApiKey,
      previousMasterScenes = [],
      previousGroupSignatures = [],
    } = body;

    const { baseUrl: targetBaseUrl, apiKey: targetApiKey, ignoredClientBase } = resolveGatewayCreds(
      req,
      { customBaseUrl, customApiKey },
      { baseUrl: DEFAULT_BASE_URL, apiKey: DEFAULT_API_KEY }
    );

    if (!targetApiKey) {
      return jsonResponse({ error: '系统尚未配置 AI 视觉接口密钥 (AI_DRAWING_API_KEY)，请在顶部设置中填入' }, 500);
    }

    let systemPrompt = '';
    let imagesToInspect: string[] = [];
    const hasAnchorFace = Boolean(anchorFaceImageUrl);

    if (mode === 'social_face_product_swap') {
      const refCount = referenceImageUrls.length > 0 ? referenceImageUrls.length : (imageUrls.length || shotCount);
      const baseSysPrompt = buildSocialFaceSwapSystemPrompt({
        productTitle: productTitle || '指定商品',
        productProps,
        referenceImageCount: refCount,
        modelPersona: modelPersona || '',
        hasAnchorFace,
        productFingerprint,
        extraRequirements
      });
      
      const hasTargetProduct = imageUrls.length > 0;

      const imageRoleDescriptions: string[] = [];
      let currentImgIndex = 1;

      if (hasTargetProduct) {
        imageRoleDescriptions.push(`- 🌟【第 ${currentImgIndex} 张图片】是【目标新商品实物素材图】（生图时对应 @图片1，用户指定要替换进画面的全新商品，请深度识别其工业外观、后摄镜头排列、机身材质与配色）！
  🚨 【最高铁律 1】：你提炼的 "product_fingerprint" 必须 100% 严格基于【第 ${currentImgIndex} 张实物图】进行提取！绝对禁止提取后续参考图中的旧商品（例如原图里的其他品牌手机、旧款配件等）！
  🚨 【最高铁律 2】：在所有分镜 prompt 中，画面主体必须指定为 @图片1，严禁描述具体机身细节文字，交由垫图控形！`);
        currentImgIndex += imageUrls.length;
      }

      if (hasAnchorFace) {
        imageRoleDescriptions.push(`- 👑【第 ${currentImgIndex} 张图片】是【用户上传的专属真实模特正脸照（Anchor Face）】（生图时对应 @图片3，仅五官 ID）！
  🚨 【专属模特人脸定型规则（身份 / 姿势 / 表情三路解耦）】：
  1. 专属模特正脸照【仅用于五官骨相定型与身份特征（ID 定型）】；生图提示词中写 @图片3！
  2. 🚨 【严禁照搬正脸参考图上的死板表情、固定姿势与背景场景】：肢体动作、手势、头部朝向与嘴开合程度可继承【对应分镜的 @图片2】；眉眼笑意/嘟嘴/眨眼等神态必须用自然语言 expression，禁止抄 @图片2 或 @图片3 整脸表情！
  3. 🚨 【严禁对无人物静物图脑补模特】：纯商品/微距/桌面静物参考图必须 "has_human": false, "shot_type": "pure_product"！`);
        currentImgIndex += 1;
      }

      const refStart = currentImgIndex;
      const refEnd = currentImgIndex + referenceImageUrls.length - 1;
      imageRoleDescriptions.push(`- 📸【第 ${refStart} 到第 ${refEnd} 张图片】依次是【爆款参考图 1 到 参考图 ${referenceImageUrls.length}】（生图时每镜对应 @图片2：机位、构图、场景、肢体动作；仅头朝向与嘴开合可参考）！
  🚨 【创意构图复刻与防穿帮原则】：
  - 必须对每一张参考图独立鉴别！无人物 → "has_human": false / "pure_product"；有人物 → "has_human": true / "model_shot"；
  - 忽略参考图中的旧商品外观，主体一律 @图片1；忽略参考图旧模特五官，${hasAnchorFace ? '五官用 @图片3' : '五官按人设文字'}；表情用各镜文字关键词，禁止整脸抄参考图；
  - 彻底排斥鼠标光标与截屏边框；让 @图片1 融入 @图片2 现场光影做物理重光照！`);

      if (!hasAnchorFace) {
        imageRoleDescriptions.push(`- 👤【新模特面容与发型彻底换脸（仅应用于有人物分镜）】：原参考图中有出现人物模特的分镜，面部五官与发型必须被【彻底替换】为指定的全新模特人设：【${modelPersona || '新模特'}】！在分镜 prompt 中必须描摹新模特的五官与发型，严禁照抄原参考图人物的五官与发饰！若原参考图无人物则保持纯静物！`);
      }

      systemPrompt = `${baseSysPrompt}\n\n【🚨 极其关键：传入图片顺序与角色严格定义】：
在本次传入的多模态图片中：
${imageRoleDescriptions.join('\n')}`;

      // 目标商品实物图置于首位，专属人脸图置于次位，后续为参考图
      imagesToInspect = [
        ...(hasTargetProduct ? imageUrls : []),
        ...(hasAnchorFace ? [anchorFaceImageUrl] : []),
        ...referenceImageUrls
      ].filter(Boolean);
    } else {
      if (!productTitle && imageUrls.length === 0) {
        return jsonResponse({ error: '缺少商品标题或商品图片素材' }, 400);
      }
      const personaText = modelPersona || '';
      const isNoModel =
        !personaText ||
        personaText === 'none' ||
        personaText.includes('无人物') ||
        personaText.includes('无需模特') ||
        personaText.includes('纯商品') ||
        personaText.includes('纯静物');

      systemPrompt = buildVisionSystemPrompt({
        productTitle: productTitle || '指定商品',
        productProps,
        templateStyle,
        shotCount,
        extraRequirements,
        modelPersona: personaText,
        hasAnchorFace: hasAnchorFace && !isNoModel,
        architectureMode: isNoModel ? 'pure_product' : 'seed_portrait',
        previousMasterScenes: Array.isArray(previousMasterScenes)
          ? previousMasterScenes.filter((s: unknown) => typeof s === 'string' && s.trim()).slice(0, 2)
          : [],
        previousGroupSignatures: Array.isArray(previousGroupSignatures)
          ? previousGroupSignatures
              .filter((s: any) => s && (typeof s.scene === 'string' || typeof s.actionDigest === 'string'))
              .map((s: any) => ({
                scene: String(s.scene || '').trim(),
                actionDigest: String(s.actionDigest || '').trim(),
              }))
              .filter((s: { scene: string; actionDigest: string }) => s.scene || s.actionDigest)
              .slice(0, 3)
          : [],
      });

      // 原创：商品图 +（有人物时）正脸 ID 图一并送入多模态
      imagesToInspect = [
        ...imageUrls,
        ...(hasAnchorFace && !isNoModel ? [anchorFaceImageUrl] : []),
      ].filter(Boolean);

      if (hasAnchorFace && !isNoModel) {
        systemPrompt += `\n\n【传入图片顺序】：第 1 张起为商品实物图（@图片1）；最后一张为专属正脸 ID（生图 @图片2，仅五官）。`;
      }
    }

    const preparedImages = await prepareAnalyzeImages(imagesToInspect);

    let rawOutput = '';
    let actualModelUsed = model;
    let triedModels: string[] = [];

    console.log(`[Vision Analyze] 正在使用用户指定模型 ${model} 进行视觉提示词提炼...`);
    const effectiveShotCap =
      mode === 'social_face_product_swap' && referenceImageUrls.length > 0
        ? referenceImageUrls.length
        : shotCount;

    const visionResult = await callVisionModel(
      model,
      buildVisionContent(systemPrompt, preparedImages),
      targetBaseUrl,
      targetApiKey,
      Array.isArray(fallbackModels) ? fallbackModels : [],
      effectiveShotCap,
    );
    rawOutput = visionResult.rawText;
    actualModelUsed = visionResult.actualModel;
    triedModels = visionResult.triedModels;

    if (!rawOutput) {
      throw new Error(`视觉模型 [${actualModelUsed}] 未返回任何内容，请检查模型可用性或切换其他模型`);
    }

    const parsedResult = parseResponseJson(rawOutput);

    // 爆款复刻：分镜必须 1:1 对齐参考图数量（截长、补缺、仍不足则垫槽）
    let rawPrompts = parsedResult.prompts || [];
    if (mode === 'social_face_product_swap' && referenceImageUrls.length > 0) {
      const refCount = referenceImageUrls.length;
      rawPrompts = mergePromptsByShotNo(rawPrompts, [], refCount);
      const missing = missingShotNos(rawPrompts, refCount);
      if (missing.length > 0) {
        const refillPrompt = `你刚才输出的分镜数量不足。必须只补齐缺失的 shot_no：${missing.join('、')}（共 ${refCount} 张参考图，1:1 对应）。
只输出 JSON：{"prompts":[...]}，数组里仅包含这 ${missing.length} 条，不要重复已有分镜。
每条含 shot_no、title、scene、expression、has_human、shot_type、prompt。prompt 用简体中文；构图以对应 @图片2 为准，商品外观只认 @图片1。`;
        try {
          const refillResult = await callVisionModel(
            actualModelUsed,
            buildVisionContent(refillPrompt, preparedImages),
            targetBaseUrl,
            targetApiKey,
            Array.isArray(fallbackModels) ? fallbackModels : [],
            refCount,
          );
          const extra = parseResponseJson(refillResult.rawText).prompts || [];
          rawPrompts = mergePromptsByShotNo(rawPrompts, extra, refCount);
          if (refillResult.actualModel && !triedModels.includes(refillResult.actualModel)) {
            triedModels = [...triedModels, ...refillResult.triedModels];
          }
        } catch (refillErr) {
          console.warn('[Vision Analyze] 缺镜补全失败，将按槽位垫齐:', refillErr);
        }
      }
      rawPrompts = padMissingSocialShots(rawPrompts, refCount);
    }

    // 标准化每个 prompt 对象 (精准推断并赋予 has_human 与 shot_type)
    const isSocialMode = mode === 'social_face_product_swap';
    const lookBible = (parsedResult as any).look_bible || '';
    const lookParts = (parsedResult as any).look_parts || undefined;
    const styleBible = (parsedResult as any).style_bible || '';
    const identityBible =
      (parsedResult as any).identity_bible ||
      parsedResult.model_anchor_features ||
      '';
    const masterScene = parsedResult.master_scene || '';
    const productFingerprintRaw = parsedResult.product_fingerprint || '';
    const productRole = isSocialMode
      ? undefined
      : normalizeOriginalProductRole(
          (parsedResult as any).product_role || (parsedResult as any).productRole,
          productFingerprintRaw
        );
    const sanitizedLookParts =
      !isSocialMode && lookParts && typeof lookParts === 'object'
        ? sanitizeLookPartsForProductRole(
            {
              top: lookParts.top,
              bottom: lookParts.bottom,
              shoes: lookParts.shoes,
              accessory: lookParts.accessory,
              summary: lookBible,
            },
            lookBible,
            productRole || 'held_object'
          )
        : lookParts && typeof lookParts === 'object'
          ? {
              top: lookParts.top,
              bottom: lookParts.bottom,
              shoes: lookParts.shoes,
              accessory: lookParts.accessory,
              summary: lookBible,
            }
          : undefined;

    const draftPrompts = rawPrompts.map((p, idx) => {
      const promptText = (p.prompt || p.description || (typeof p === 'string' ? p : '')).toString();
      const hasHumanExplicit = p.has_human !== undefined ? Boolean(p.has_human) : undefined;
      const isPureStillLife = promptText.includes('无人物') || promptText.includes('无模特') || promptText.includes('纯静物') || promptText.includes('纯商品');
      const mentionsModelFace = !isPureStillLife && (
        promptText.includes('模特') || 
        promptText.includes('女生') || 
        promptText.includes('女性') || 
        promptText.includes('面容') || 
        promptText.includes('人脸') || 
        promptText.includes('五官') || 
        promptText.includes('自拍') || 
        promptText.includes('穿搭买家秀') || 
        promptText.includes('OOTD')
      );
      const isHandHeldOnly = !mentionsModelFace && (promptText.includes('手持') || promptText.includes('手部操作') || promptText.includes('双手'));

      const finalHasHuman = hasHumanExplicit !== undefined 
        ? hasHumanExplicit 
        : (isPureStillLife ? false : (isSocialMode ? mentionsModelFace : true));

      const finalShotType = p.shot_type || (finalHasHuman ? 'model_shot' : (isHandHeldOnly ? 'hand_held_only' : 'pure_product'));

      return {
        shot_no: p.shot_no || (idx + 1),
        title: p.title || `分镜 ${idx + 1}`,
        scene: p.scene || masterScene || '',
        expression: p.expression || '',
        action: p.action || '',
        prop: p.prop || '',
        optics: p.optics || '',
        camera_focal_length: p.camera_focal_length || '',
        angle: p.angle || '',
        lighting_type: p.lighting_type || styleBible || '',
        has_human: finalHasHuman,
        shot_type: finalShotType,
        promptFallback: cleanPromptText(promptText),
        selected: true,
      };
    });

    const groupHasHuman = draftPrompts.some((p) => p.has_human !== false);
    const diversified = isSocialMode
      ? draftPrompts
      : enforceOriginalShotDiversity(draftPrompts, groupHasHuman);

    const formattedPrompts = diversified.map((p) => {
      if (isSocialMode) {
        const slotted = ensureSocialPromptSlots(p.promptFallback || '', {
          hasHuman: p.has_human,
          hasFace: hasAnchorFace,
          socialMode: true,
          expression: p.expression,
        });
        return {
          shot_no: p.shot_no,
          title: p.title,
          scene: p.scene,
          expression: p.expression,
          action: p.action,
          camera_focal_length: p.camera_focal_length || '85mm f/1.8 特写',
          angle: p.angle || '45° 沉浸视角',
          lighting_type: p.lighting_type || '自然日光漫反射',
          has_human: p.has_human,
          shot_type: p.shot_type,
          prompt: slotted,
          selected: true,
        };
      }

      const assembled = assembleOriginalShotPrompt(
        {
          identityBible,
          lookBible,
          lookParts: sanitizedLookParts,
          masterScene,
          styleBible,
          productRole,
          productFingerprint: productFingerprintRaw,
        },
        {
          shot_no: p.shot_no,
          expression: p.expression,
          action: p.action,
          prop: p.prop,
          optics: p.optics,
          camera_focal_length: p.camera_focal_length,
          angle: p.angle,
          lighting_type: p.lighting_type,
          scene: p.scene,
          title: p.title,
          has_human: p.has_human,
          promptFallback: p.promptFallback,
        },
        { hasFace: hasAnchorFace && p.has_human !== false }
      );

      return {
        shot_no: p.shot_no,
        title: p.title,
        scene: p.scene || masterScene || '',
        expression: p.expression,
        action: p.action,
        prop: p.prop,
        optics: p.optics,
        camera_focal_length: p.camera_focal_length || '85mm f/1.8 特写',
        angle: p.angle || '45° 沉浸视角',
        lighting_type: p.lighting_type || '自然日光漫反射',
        has_human: p.has_human,
        shot_type: p.shot_type,
        prompt: assembled,
        selected: true,
      };
    });

    const actionDigest = buildActionDigestFromShots(formattedPrompts);

    // 自动持久化保存到本地数据库
    try {
      const { prisma } = await import('@/lib/prisma');
      await prisma.promptRecord.create({
        data: {
          productTitle: productTitle || '未命名商品',
          productFingerprint: productFingerprintRaw,
          modelUsed: actualModelUsed,
          styleName: templateStyle || '📱 真实手机买家秀',
          promptsJson: JSON.stringify(formattedPrompts)
        }
      });
    } catch (dbErr) {
      console.warn('保存提示词到数据库时忽略轻微异常:', dbErr);
    }

    return jsonResponse({
      success: true,
      product_fingerprint: productFingerprintRaw,
      productFingerprint: productFingerprintRaw,
      product_role: productRole || null,
      productRole: productRole || null,
      master_scene: masterScene,
      masterScene,
      look_bible: lookBible,
      lookBible,
      look_parts: sanitizedLookParts || lookParts || null,
      lookParts: sanitizedLookParts || lookParts || null,
      style_bible: styleBible,
      styleBible,
      identity_bible: identityBible,
      identityBible,
      actionDigest,
      groupSignature: masterScene
        ? { scene: masterScene, actionDigest }
        : null,
      prompts: formattedPrompts,
      modelUsed: actualModelUsed,
      requestedModel: model,
      modelSwitched: actualModelUsed !== model && actualModelUsed !== normalizeVisionModelId(model),
      triedModels,
      rawOutput
    });

  } catch (error: any) {
    console.error('Vision Analyze API Error:', error);
    return jsonResponse({ error: formatVisionAnalyzeError(error) }, 500);
  }
}
