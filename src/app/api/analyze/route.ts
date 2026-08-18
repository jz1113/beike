import { NextResponse } from 'next/server';
import { buildVisionSystemPrompt, buildSocialFaceSwapSystemPrompt, VisionAnalyzeParams } from '@/lib/vision';
import { cleanPromptText } from '@/lib/drawing';

const DEFAULT_BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const DEFAULT_API_KEY = process.env.AI_DRAWING_API_KEY || 'sk-zPD0Umv6ccqJjGoCZ1HJPpFD1wDqU5g66jsDEsj4K86dtXnZ';

// 备选模型重试链
const FALLBACK_MODELS = [
  'gpt-5.6-luna',
  'claude-opus-5',
  'gemini-3.1-pro-preview-thinking-high',
  'grok-4.6',
  'gpt-5.5-pro'
];

async function callVisionModel(
  model: string, 
  promptText: string, 
  imageUrls: string[],
  baseUrl: string = DEFAULT_BASE_URL,
  apiKey: string = DEFAULT_API_KEY || ''
) {
  const contentArray: any[] = [
    { type: 'text', text: promptText }
  ];

  // 附加上传的所有商品素材图 (取前 8 张高质图防止 token 超载)
  imageUrls.slice(0, 8).forEach(url => {
    if (url && typeof url === 'string') {
      contentArray.push({
        type: 'image_url',
        image_url: { url: url }
      });
    }
  });

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
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';
  return rawText;
}

// 提取与解析 JSON 结构，并确保彻底分离全局元数据与纯净提示词
function parseResponseJson(text: string): { product_fingerprint?: string; master_scene?: string; model_anchor_features?: string; prompts: any[] } {
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
      return { prompts: [parsed], product_fingerprint: parsed.product_fingerprint, master_scene: parsed.master_scene, model_anchor_features: parsed.model_anchor_features };
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
  const fpMatch = jsonStr.match(/"product_fingerprint"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const sceneMatch = jsonStr.match(/"master_scene"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const modelFeatMatch = jsonStr.match(/"model_anchor_features"\s*:\s*"((?:[^"\\]|\\.)*)"/);

  const product_fingerprint = fpMatch ? fpMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : undefined;
  const master_scene = sceneMatch ? sceneMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : undefined;
  const model_anchor_features = modelFeatMatch ? modelFeatMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') : undefined;

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
      model_anchor_features,
      prompts
    };
  }

  // 5. 极端降级：纯文本按行拆分
  const fallbackPrompts: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let currentPrompt = '';
  let shotNo = 1;

  for (const line of lines) {
    // 忽略所有 JSON 键值对行
    if (/^"(?:product_fingerprint|model_anchor_features|master_scene|prompts|shot_no|title|scene|camera_focal_length|angle|lighting_type|shot_type|has_human)"\s*:/.test(line)) {
      continue;
    }
    if (line.startsWith('{') || line.startsWith('}') || line.startsWith('[') || line.startsWith(']') || line.startsWith('```')) {
      continue;
    }
    if (line.includes('Shot') || line.includes('分镜') || line.includes('Prompt') || /^\d+[\.、]/.test(line)) {
      if (currentPrompt) {
        fallbackPrompts.push({ shot_no: shotNo++, prompt: currentPrompt.trim() });
        currentPrompt = '';
      }
    }
    currentPrompt += line + ' ';
  }
  if (currentPrompt) {
    fallbackPrompts.push({ shot_no: shotNo, prompt: currentPrompt.trim() });
  }

  return {
    product_fingerprint,
    master_scene,
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
      imageUrls = [], 
      referenceImageUrls = [],
      anchorFaceImageUrl,
      modelPersona,
      productFingerprint,
      templateStyle = 'auto', 
      shotCount = 4, 
      extraRequirements = '', 
      model = 'gpt-5.6-luna',
      customBaseUrl,
      customApiKey
    } = body;

    const targetBaseUrl = customBaseUrl || DEFAULT_BASE_URL;
    const targetApiKey = customApiKey || DEFAULT_API_KEY;

    if (!targetApiKey) {
      return NextResponse.json({ error: '系统尚未配置 AI 视觉接口密钥 (AI_DRAWING_API_KEY)，请在顶部设置中填入' }, { status: 500 });
    }

    let systemPrompt = '';
    let imagesToInspect: string[] = [];

    if (mode === 'social_face_product_swap') {
      const refCount = referenceImageUrls.length > 0 ? referenceImageUrls.length : (imageUrls.length || shotCount);
      const hasAnchorFace = Boolean(anchorFaceImageUrl);
      const baseSysPrompt = buildSocialFaceSwapSystemPrompt({
        productTitle: productTitle || '指定商品',
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
        imageRoleDescriptions.push(`- 👑【第 ${currentImgIndex} 张图片】是【用户上传的专属真实模特正脸照（Anchor Face）】！
  🚨 【专属模特换脸规则（仅在原参考图本身确实包含真人模特时生效）】：
  1. 仅当某张爆款参考图【原本确实包含真人模特出镜/自拍】时，才将该分镜的人物面容替换为该专属模特的真实五官特征、发型发色与肤质！
  2. 🚨 【严禁对无人物静物图脑补模特】：如果某张参考图是纯商品、手机后盖特写、配件微距、桌面静物摆拍或无脸特写，绝对禁止凭空添加模特或人脸！必须严格保持纯静物并标记 "has_human": false, "shot_type": "pure_product"！`);
        currentImgIndex += 1;
      }

      const refStart = currentImgIndex;
      const refEnd = currentImgIndex + referenceImageUrls.length - 1;
      imageRoleDescriptions.push(`- 📸【第 ${refStart} 到第 ${refEnd} 张图片】依次是【爆款参考图 1 到 参考图 ${referenceImageUrls.length}】（生图时对应 @图片2，仅供参考其黄金机位、构图角度、空间层次与自然光影）！
  🚨 【创意构图复刻与去截屏工件原则】：
  - 必须对每一张参考图进行独立鉴别！无人物参考图 100% 保持无人物纯静物（"has_human": false, "shot_type": "pure_product"）；有人物参考图才输出 "has_human": true, "shot_type": "model_shot"；
  - 彻底排斥鼠标光标与截屏边框：若参考图带有鼠标指针（光标箭头/手形指针）或系统UI水印，必须在提示词中排斥，严禁画入画面；
  - 汲取黄金机位与光影精髓，让 @图片1 真实自然地融入现场光影，进行物理重光照与阴影贴合！`);

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
        return NextResponse.json({ error: '缺少商品标题或商品图片素材' }, { status: 400 });
      }
      systemPrompt = buildVisionSystemPrompt({
        productTitle: productTitle || '指定商品',
        templateStyle,
        shotCount,
        extraRequirements
      });
      imagesToInspect = imageUrls;
    }

    let rawOutput = '';
    let actualModelUsed = model;
    let lastError: any = null;

    // 优先使用用户选择的模型，若失败则自动回退备选模型
    const candidateModels = [model, ...FALLBACK_MODELS.filter(m => m !== model)];

    for (const curModel of candidateModels) {
      try {
        console.log(`[Vision Analyze] 正在使用模型 ${curModel} 进行视觉提示词提炼...`);
        rawOutput = await callVisionModel(curModel, systemPrompt, imagesToInspect, targetBaseUrl, targetApiKey);
        actualModelUsed = curModel;
        if (rawOutput) break;
      } catch (err: any) {
        console.warn(`[Vision Analyze] 模型 ${curModel} 调用失败，尝试下一个备选模型:`, err.message);
        lastError = err;
      }
    }

    if (!rawOutput) {
      throw lastError || new Error('所有视觉分析模型调用均失败，请检查网络或密钥配额');
    }

    const parsedResult = parseResponseJson(rawOutput);

    // 标准化每个 prompt 对象 (精准推断并赋予 has_human 与 shot_type)
    const formattedPrompts = (parsedResult.prompts || []).map((p, idx) => {
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
        : (isPureStillLife ? false : mentionsModelFace);

      const finalShotType = p.shot_type || (finalHasHuman ? 'model_shot' : (isHandHeldOnly ? 'hand_held_only' : 'pure_product'));

      return {
        shot_no: p.shot_no || (idx + 1),
        title: p.title || `分镜 ${idx + 1}`,
        scene: p.scene || parsedResult.master_scene || '',
        camera_focal_length: p.camera_focal_length || '85mm f/1.8 特写',
        angle: p.angle || '45° 沉浸视角',
        lighting_type: p.lighting_type || '自然日光漫反射',
        has_human: finalHasHuman,
        shot_type: finalShotType,
        prompt: cleanPromptText(promptText),
        selected: true
      };
    });

    // 自动持久化保存到本地数据库
    try {
      const { prisma } = await import('@/lib/prisma');
      await prisma.promptRecord.create({
        data: {
          productTitle: productTitle || '未命名商品',
          productFingerprint: parsedResult.product_fingerprint || '',
          modelUsed: actualModelUsed,
          styleName: templateStyle || '📱 真实手机买家秀',
          promptsJson: JSON.stringify(formattedPrompts)
        }
      });
    } catch (dbErr) {
      console.warn('保存提示词到数据库时忽略轻微异常:', dbErr);
    }

    return NextResponse.json({
      success: true,
      product_fingerprint: parsedResult.product_fingerprint || '',
      master_scene: parsedResult.master_scene || '',
      prompts: formattedPrompts,
      modelUsed: actualModelUsed,
      rawOutput
    });

  } catch (error: any) {
    console.error('Vision Analyze API Error:', error);
    return NextResponse.json({ error: error.message || '视觉模型分析失败' }, { status: 500 });
  }
}
