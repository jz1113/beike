import { chatCompletionBody } from '@shared/domain/models/deepseek';
import { gatewayFetch } from '../../../gateways/http';
import { readJsonBody } from '../../../core/validate';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { jsonResponse } from '../../../core/http';
import { convertToStandardJpegDataUrl } from '@server/infrastructure/media/imageConverter';
import { buildVisionModelsToTry } from '@shared/domain/prompts/vision';
import { resolveGatewayCreds } from '@shared/domain/models/gatewayCreds';
import {
  resolveVisionTimeoutMs,
  VISION_EXTRACT_MASTER_TIMEOUT_MS,
  VISION_EXTRACT_SHARD_TIMEOUT_MS,
} from '@shared/domain/prompts/visionTimeouts';
import {
  formatUserError,
  isRetryableUpstreamError,
  isRetryableUpstreamStatus,
} from '@shared/domain/models/upstreamErrors';
import { getDefaultBaseUrl, getDefaultApiKey } from '../../../services/models/gatewayCredentials';

export async function POST(req: Request) {
  try {
    req.signal.throwIfAborted();
    let body: Record<string, any>;
    try { body = await readJsonBody(req); }
    catch {
      if (req.signal.aborted) return jsonResponse({ success: false, error: '风格提炼已取消' }, 499);
      return jsonResponse({ success: false, error: '请求体必须为有效的 JSON' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ success: false, error: '请求体必须为 JSON 对象' }, 400);
    }
    req.signal.throwIfAborted();
    const { 
      imageUrls = [], 
      userHint = '', 
      model,
      fallbackOrder: fallbackModels,
      customBaseUrl,
      customApiKey
    } = body;

    const { baseUrl: targetBaseUrl, apiKey: targetApiKey } = resolveGatewayCreds(
      req,
      { model, customBaseUrl, customApiKey },
      { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() }
    );

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return jsonResponse({ error: '请至少提供 1 张参考风格图片' }, 400);
    }

    if (!targetApiKey) {
      return jsonResponse({ error: '系统尚未配置 AI 视觉接口密钥，请在顶部设置中填入' }, 500);
    }

    const modelsToTry = buildVisionModelsToTry(
      typeof model === 'string' ? model : undefined,
      Array.isArray(fallbackModels) ? fallbackModels : undefined,
    );
    if (modelsToTry.length === 0) {
      return jsonResponse({ error: '请先在设置中配置多模态模型' }, 400);
    }

    console.log(`[StyleExtract] 收到全量逆向请求: 总图片数=${imageUrls.length}`);

    // 🌟 1. 全量多图分片并发感知理解 (支持 10~100+ 张图片，彻底吃透整批图集的多样性)
    const shardSummaries: string[] = [];
    const SHARD_SIZE = 15;
    
    if (imageUrls.length > 8) {
      const shards: string[][] = [];
      for (let i = 0; i < imageUrls.length; i += SHARD_SIZE) {
        shards.push(imageUrls.slice(i, i + SHARD_SIZE));
      }

      console.log(`[StyleExtract] 启动全量分片并发分析: 共 ${shards.length} 个分片（总图数 ${imageUrls.length}）`);

      const runShard = async (shardImgs: string[], shardIdx: number) => {
        req.signal.throwIfAborted();
        const shardPrompt = `你是一位顶级商业视觉美学总监与摄影置景架构师。请仔细观察本批次包含的 ${shardImgs.length} 张参考图片，深度解构该图集所属品类的视觉风格与拍摄置景特征：
1. 【品类与画面主体定位】：识别图集中展示的商品品类（如：数码3C、服饰穿搭、美妆个护、家居日用、美食饮品、鞋包配饰等）及主体呈现方式；
2. 【空间置景与材质美感】：空间环境调性（如极简微水泥/温暖原木阳光角/轻奢大理石/现代奶油风/清透飘窗/户外自然等）、台面或背景材质质感；
3. 【光影系统与色温氛围】：主光源类型（自然窗光/斜射暖阳/柔光箱漫射/侧逆轮廓光）、色温倾向（暖色调/冷白调/自然日光）、光影层次与反差；
4. 【高品味道具生态池】：画面中出现的具有生活气息的高审美道具清单与搭配逻辑；
5. 【镜头语言与去AI真实感】：拍摄景别、摄影机位角度、光学焦段与浅景深、真实生活买家秀呼吸感。
请输出 200 字以内的精炼、专业且具体的品类视觉特征分析要点。`;

        const safeShardImgs = await Promise.all(shardImgs.map(u => convertToStandardJpegDataUrl(u, { maxDimension: 800, quality: 75 })));
        req.signal.throwIfAborted();
        const contentArray: any[] = [{ type: 'text', text: shardPrompt }];
        safeShardImgs.forEach(url => {
          if (url && typeof url === 'string') {
            contentArray.push({ type: 'image_url', image_url: { url } });
          }
        });

        for (const targetModel of modelsToTry) {
          req.signal.throwIfAborted();
          try {
            const shardTimeoutMs = Math.max(
              resolveVisionTimeoutMs(targetModel, true),
              VISION_EXTRACT_SHARD_TIMEOUT_MS,
            );
            const resp = await gatewayFetch(`${normalizeGatewayBaseUrl(targetBaseUrl)}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${targetApiKey}`
              },
              body: chatCompletionBody({
                model: targetModel,
                messages: [{ role: 'user', content: contentArray }],
                temperature: 0.4
              }),
              signal: AbortSignal.any([req.signal, AbortSignal.timeout(shardTimeoutMs)])
            });
            if (!resp.ok) {
              const error = new Error(`分片模型调用失败（HTTP ${resp.status}）`) as Error & { status?: number };
              error.status = resp.status;
              if (!isRetryableUpstreamStatus(resp.status)) throw error;
              continue;
            }
            const data = await resp.json();
            req.signal.throwIfAborted();
            const text = data.choices?.[0]?.message?.content || '';
            if (text) {
              console.log(`[StyleExtract] 分片 ${shardIdx + 1}/${shards.length} 分析成功 (${targetModel})`);
              return `【分片 ${shardIdx + 1}/${shards.length}（包含 ${shardImgs.length} 张图）视觉特征分析】：\n${text}`;
            }
          } catch (e: any) {
            if (req.signal.aborted) throw req.signal.reason;
            if (!isRetryableUpstreamError(e)) throw e;
            console.warn(`[StyleExtract] 分片 ${shardIdx + 1} 模型 ${targetModel} 异常:`, e.message);
          }
        }
        return '';
      };

      // Stop launching new paid shards when one request has an uncertain result.
      for (const [shardIdx, shardImgs] of shards.entries()) {
        const summary = await runShard(shardImgs, shardIdx);
        if (summary) shardSummaries.push(summary);
      }
      
      console.log(`[StyleExtract] 全部分片处理完毕: 成功汇总 ${shardSummaries.length}/${shards.length} 个分片分析报告`);
    }

    // 🌟 2. 深度品类架构推理 Prompt (提炼特定品类专属的提示词生成架构指南，直接赋能产出高质感新提示词)
    const masterSystemPrompt = `# Role: 顶级商业视觉导演 & 品类专属摄影提示词架构解构大师

你的核心任务是：深度分析用户提供的全量参考图片（共 ${imageUrls.length} 张）以及各分片分析报告，**为该特定品类提炼出一套精准复刻该图集美学风格的【品类专属提示词生成架构指南（Prompt Architecture Recipe）】**！

---
## 🎯 核心原则与提炼法则：
1. **【精准绑定品类，严禁泛化乱套】**：必须准确识别该图集的核心商品品类（如：数码电脑、服饰穿搭、美妆个护、家居家装、美食饮品等），提炼的架构必须高度契合该品类的拍摄场景与置景逻辑！
2. **【空间与光影高审美自由发挥，拒绝刻板硬编码】**：
   - 总结出该风格的核心美学调性（如：极简清透、温暖治愈、轻奢高级、自然松弛、高级复古等）；
   - 空间环境和道具生态池**不要写死单一固定物品**，而是提炼出一套**高审美、高自由度的置景与光影法则**；
3. **【绝对去广告化与去商业包装】**：明确规定严禁出现任何包装盒、物流纸箱、价格标签、促销贴纸与电商网页；
4. **【产出能直接指导生成新提示词的完整指南】**：输出的 promptSnippet 必须是一套结构清晰、逻辑严密、可以直接赋能多模态大模型为该品类新商品编写出高质感分镜提示词的完整指令！
${userHint ? `\n【用户额外定制要求】：\n${userHint}\n` : ''}

${shardSummaries.length > 0 ? `\n【全量图片（共 ${imageUrls.length} 张）分片深度分析汇总报告】：\n${shardSummaries.join('\n\n')}\n` : ''}

---
## 必须严格输出合法 JSON 格式，严禁包含 Markdown 前言或多余废话：
\`\`\`json
{
  "name": "提炼出的品类风格架构名称 (例如：极简清透数码桌搭架构 / 法式复古服饰买家秀架构 / 奶油风美妆护肤置景架构)",
  "category": "digital_3c | beauty_care | fashion_apparel | home_living | food_beverage | mother_pets | jewelry_luxury | general",
  "tag": "核心美学标签 (例如：柔和自然光 · 空间通透 · 高级生活感)",
  "desc": "一段精炼的美学架构总结，阐述该架构的核心视觉语言、采光物理与空间哲学",
  "architecture": {
    "role_definition": "摄影师角色与调性定位",
    "spatial": "空间环境与台面/背景材质的具体规则与美学调性",
    "lighting": "采光系统、色温与光影反差具体规则",
    "props": "高品味生活道具生态池清单与搭配方式",
    "screen_or_material": "带屏设备屏幕壁纸风格或无屏商品材质微质感交互",
    "optics": "镜头焦段、大光圈景深、物理接触阴影与真实摄影质感规范"
  },
  "promptSnippet": "【在此输出完整的提示词生成架构指南，包含角色定义、空间置景规则、采光光影规范、道具生态池建议与摄影参数，格式工整详细，可直接作为分镜策划引擎输入】"
}
\`\`\`
`;

    // 选取代表性样本图（最多 10 张，分布在开头、中间与结尾）挂载在元架构合成请求中
    const rawSampleImages = imageUrls.length <= 10 
      ? imageUrls 
      : [
          imageUrls[0],
          imageUrls[Math.floor(imageUrls.length * 0.12)],
          imageUrls[Math.floor(imageUrls.length * 0.25)],
          imageUrls[Math.floor(imageUrls.length * 0.38)],
          imageUrls[Math.floor(imageUrls.length * 0.5)],
          imageUrls[Math.floor(imageUrls.length * 0.62)],
          imageUrls[Math.floor(imageUrls.length * 0.75)],
          imageUrls[Math.floor(imageUrls.length * 0.88)],
          imageUrls[imageUrls.length - 1]
        ].filter(Boolean);

    req.signal.throwIfAborted();
    const safeSampleImages = await Promise.all(
      rawSampleImages.map(u => convertToStandardJpegDataUrl(u, { maxDimension: 960, quality: 80 }))
    );

    req.signal.throwIfAborted();
    const masterContentArray: any[] = [
      { type: 'text', text: masterSystemPrompt }
    ];
    safeSampleImages.forEach(url => {
      if (url && typeof url === 'string') {
        masterContentArray.push({
          type: 'image_url',
          image_url: { url }
        });
      }
    });

    console.log(`[StyleExtract] 正在调用大模型生成最终风格架构: 挂载样本数=${safeSampleImages.length}`);

    let rawText = '';
    let lastError: any = null;

    for (const targetModel of modelsToTry) {
      req.signal.throwIfAborted();
      try {
        const masterTimeoutMs = resolveVisionTimeoutMs(targetModel, true);
        const response = await gatewayFetch(`${normalizeGatewayBaseUrl(targetBaseUrl)}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${targetApiKey}`
          },
          body: chatCompletionBody({
            model: targetModel,
            messages: [{ role: 'user', content: masterContentArray }],
            temperature: 0.6,
            max_tokens: 8192,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.any([req.signal, AbortSignal.timeout(Math.max(masterTimeoutMs, VISION_EXTRACT_MASTER_TIMEOUT_MS))])
        });

        if (!response.ok) {
          await response.text();
          const error = new Error(`模型调用失败（HTTP ${response.status}）`) as Error & { status?: number };
          error.status = response.status;
          throw error;
        }

        const data = await response.json();
        req.signal.throwIfAborted();
        rawText = data.choices?.[0]?.message?.content || '';
        if (rawText) {
          console.log(`[StyleExtract] 成功通过模型 [${targetModel}] 完成元架构提炼`);
          break;
        }
      } catch (err: any) {
        if (req.signal.aborted) throw req.signal.reason;
        if (!isRetryableUpstreamError(err)) throw err;
        lastError = err;
        console.warn(`[StyleExtract] 模型 ${targetModel} 响应异常，尝试备选模型:`, err.message);
      }
    }

    if (!rawText) {
      throw lastError || new Error('所有视觉解构模型响应超时，请检查网络或重试');
    }

    // 解析 JSON
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const cleanStr = (jsonMatch ? jsonMatch[1] : rawText).trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    
    let result: any = {};
    try {
      result = JSON.parse(cleanStr);
    } catch (e) {
      console.warn('[StyleExtract] JSON 解析降级:', e);
      result = {
        name: '自定义品类摄影架构',
        category: 'digital_3c',
        tag: '真实光影 · 架构生成',
        desc: '小红书/抖音爆款生活实拍提示词生成元架构。',
        promptSnippet: rawText
      };
    }

    // 若大模型未输出完整的 promptSnippet，则根据 architecture 自动组装标准的提示词架构指南
    let finalPromptSnippet = result.promptSnippet;
    if (!finalPromptSnippet || finalPromptSnippet.length < 50) {
      const arch = result.architecture;
      const roleText = arch?.role_definition || '你是一位在社媒拥有百万粉丝的“种草级”商业摄影大师，精通真实生活化置景与光学质感。';
      const spatialText = arch?.spatial ? `- 【空间置景与材质】：${arch.spatial}` : '- 【空间置景与材质】：根据图集风格还原真实空间层次与质感台面';
      const lightingText = arch?.lighting ? `- 【采光系统与色温】：${arch.lighting}` : '- 【采光系统与色温】：自然柔和光影，物理接触阴影，去死白平光';
      const propsText = arch?.props ? `- 【高颜值道具生态】：${arch.props}` : '- 【高颜值道具生态】：自然搭配高品味生活道具，点缀日常呼吸感';
      const screenText = arch?.screen ? `- 【画中画壁纸/交互】：${arch.screen}` : '- 【画中画壁纸/交互】：搭配高审美艺术壁纸或清透水波纹画面';
      const opticsText = arch?.optics ? `- 【摄影参数与去AI】：${arch.optics}` : '- 【摄影参数与去AI】：35mm/50mm 手机后置主摄实拍，自然浅景深，无负面词';

      finalPromptSnippet = `${roleText}\n\n【核心视觉置景架构规则】：\n${spatialText}\n${lightingText}\n${propsText}\n${screenText}\n${opticsText}\n\n【分镜策划指令】：\n请以【参考图1所示商品】为主体（严禁文字描写商品几何外观），严格按照上述空间、光线、道具与壁纸风格，为目标商品规划 4 组机位不同、质感高级的真实买家秀分镜！`;
    }

    req.signal.throwIfAborted();
    return jsonResponse({
      success: true,
      recipe: {
        name: result.name || '自定义电商爆款风格架构',
        category: result.category || 'digital_3c',
        tag: result.tag || '自然光影 · 动态架构',
        desc: result.desc || '真实买家秀提示词生成元架构。',
        architecture: result.architecture || null,
        promptSnippet: finalPromptSnippet,
        coverUrl: imageUrls[0] || '',
        sampleImages: JSON.stringify(imageUrls.slice(0, 10))
      }
    });
  } catch (error: unknown) {
    if (req.signal.aborted) return jsonResponse({ success: false, error: '风格提炼已取消' }, 499);
    console.error('[StyleExtract] 异常:', error);
    return jsonResponse({ error: formatUserError(error, '风格架构提炼失败，请重试') }, 500);
  }
}
