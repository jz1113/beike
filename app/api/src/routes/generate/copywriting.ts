import { normalizeGatewayBaseUrl } from '@beike/shared/gatewayUrl';
import { jsonResponse } from '../../core/http';
import { resolveGatewayCreds } from '@beike/shared/gatewayCreds';
import { formatUserError } from '@beike/shared/upstreamErrors';
import { convertToStandardJpegDataUrl } from '@beike/shared/imageConverter';
import { getDefaultBaseUrl, getDefaultApiKey } from '../../services/imageHelpers';

interface CopywritingRequest {
  model?: string;
  productTitle?: string;
  productCategory?: string;
  productRole?: string;
  imageUrls?: string[];
  shotPrompts?: string[];
  style?: 'authentic' | 'review' | 'unboxing' | 'story';
  extraRequirements?: string;
  existingTitles?: string[];
  customBaseUrl?: string;
  customApiKey?: string;
}

const SYSTEM_PROMPT = `你是一位拥有丰富真实自用经验的小红书生活买家秀博主。
你的任务是：根据用户提供的商品信息、实拍/买家秀成套分镜描述，为该商品撰写一篇高质量的小红书爆款买家秀种草图文笔记。

【核心硬性规范（必须严格遵守）】：
1. 标题（title）：
   - 长度严格控制在 5 到 20 个字之间。
   - 【严禁使用任何表情包或 Emoji 图标符号】（纯中文汉字与常规标点符号，绝对不要出现任何表情符号！）。
   - 必须极具生活感、原生抓人、自然吸引点击（例如：“实测两周这件单品真超出预期”、“被问了好多次的高质感自用好物”、“实拍无滤镜关于它的做工细节”）。
   - 【严禁与已有标题重复】。

2. 正文（content）：
   - 字数必须【大于 100 字】（建议 150-350 字），禁止偷工减料。
   - 语气口吻：必须偏真实话口吻（第一人称真实生活自用体验，像朋友日常真诚交流，不要生硬刻板的广告腔，严禁虚假浮夸词汇）。
   - 排版分段：【分段必须清晰规范，段落之间必须使用双换行分段】，层次分明，严禁挤成一大段不换行！
   - 内容结构：
     ① 【初见开箱/真实上身体验】：真实自然的自用第一印象；
     ② 【核心做工与日常搭配】：结合面料、版型、质感与实用场景细节；
     ③ 【真诚建议与避坑贴士】：尺码、保养或注意事项。

3. 话题标签（tags）：
   - 提供 3~6 个小红书高流量种草标签（如：#小红书买家秀 #真实好物推荐 #日常穿搭 #自用好物分享 等）。

【返回格式】：
请严格以 JSON 格式输出：
{
  "title": "5-20字的纯汉字吸睛标题（绝无任何表情包）",
  "content": "大于100字、真实话口吻、双换行分段清晰的小红书买家秀正文",
  "tags": ["#小红书买家秀", "#好物推荐", "#真实测评"]
}`;

/**
 * 彻底过滤字符串中的所有 Emoji 表情符号与装饰图形符
 */
export function stripEmojis(text: string): string {
  if (!text) return '';
  return text
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}]/gu, '')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[✨📸💎🌿👗💡📌🌸🔥👍❤️🎉💯👏👇👀⭐️⭐💫🌟🎈🕶️☕️🍵]/gu, '')
    .trim();
}

function sanitizeProductTitle(raw: string): string {
  if (!raw) return '宝藏单品';
  const stripped = raw
    .replace(/【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)/g, ' ')
    .replace(/(?:202\d|2026|新款|爆款|老坑|a货|A货|正品|专柜|同款|顶级|天然|高品质|包邮|特价|原石|定制|现货|热卖|推荐|旗舰店|男女款|女款|男款|秋冬|春夏|女装|男装)/gi, ' ')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
    .trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const core = tokens.slice(0, 2).join('') || stripped;
  return core.slice(0, 6) || '这件好物';
}

/**
 * 规范化标题：5-20 字，无任何表情包，且全批次自动排重
 */
export function formatCleanTitle(rawT: string, defaultName: string, existingTitles: string[] = []): string {
  let t = stripEmojis(rawT)
    .replace(/^[“"「『【]+|[”"」』】]+$/g, '')
    .replace(/\s+/g, '')
    .replace(/(?:老坑|a货|A货|正品|专柜|包邮|特价|现货|热卖|男女款)/gi, '')
    .trim();

  if (!t || t.length < 5) {
    t = `实测这件${defaultName}质感超出预期`;
  }
  if (t.length > 20) {
    t = t.slice(0, 20);
  }

  // 标题去重：如果已有相同标题，注入差异化生活切入词
  if (existingTitles.length > 0 && existingTitles.includes(t)) {
    const hooks = [
      '真实自用分享',
      '实穿细节复盘',
      '无滤镜开箱实测',
      '日常搭配心得',
      '做工质感实测',
      '私服出镜记录',
      '真诚选购建议'
    ];
    for (const hook of hooks) {
      const candidate = `${hook}关于${defaultName}`.slice(0, 20);
      if (!existingTitles.includes(candidate)) {
        t = candidate;
        break;
      }
    }
  }

  return t;
}

/**
 * 规范正文：字数必须 > 100，段落之间双换行分段清晰
 */
export function formatCleanContent(rawContent: string, fallbackContent: string): string {
  let c = stripEmojis(rawContent || '').trim();
  if (c.length < 100) {
    c = fallbackContent.trim();
  }
  // 规范化双换行分段
  c = c.replace(/\r\n/g, '\n')
       .replace(/\n{3,}/g, '\n\n')
       .trim();
  return c;
}

/** 本地模板降级兜底生成器（确保在离线或大模型不可用时稳定产出符合规范的文案） */
function generateLocalFallbackCopy(data: CopywritingRequest): { title: string; content: string; tags: string[] } {
  const cleanName = sanitizeProductTitle(data.productTitle || '');
  const isJewelry = /手镯|手链|玉|翡翠|项链|戒指|耳环|首饰|饰品|手表|腕表/i.test(String(data.productTitle || '') + ' ' + (data.productRole || ''));
  const isApparel = /裙|衣|裤|外套|衬衫|西装|毛衣|针织|卫衣|背心|风衣/i.test(String(data.productTitle || '') + ' ' + (data.productRole || ''));
  const existingTitles = data.existingTitles || [];

  let title = '';
  let content = '';

  if (isJewelry) {
    title = formatCleanTitle(`原图直出关于这只${cleanName}的真实体验`, cleanName, existingTitles);
    content = `收到特意实测佩戴了一周才来写这篇分享，无滤镜自然光实拍，给大家整理了一份真实的自用体验。

水头温润清亮，边缘打磨平整顺滑，没有任何粗糙割手的毛刺。在自然漫反射光线下有自然的弱光泽，圈口尺寸标准，贴合手腕曲线。

日常上班搭配深色西装或者浅色针织衫都很出片，上手特别显白提气色，而且轻盈完全不压手。

日常运动或者洗澡时建议摘下妥善存放，避免剧烈磕碰。对于注重质感和百搭性的朋友来说确实很值得入手。`;
  } else if (isApparel) {
    title = formatCleanTitle(`实穿一周这件${cleanName}做工版型自用实测`, cleanName, existingTitles);
    content = `收到洗过也实穿了一周，原图直出无美颜滤镜，给姐妹们做个真诚的自用实测分享。

面料摸上去细腻顺滑，亲肤透气，洗后悬挂晾干垂感依然在线，不容易起静电或起球，领口和下摆走线做工工整。

版型剪裁立体，对假胯宽和手臂线条包容度极好，腰线位置恰到好处，视觉上能很好地修饰身材比例。

尺码很正，按日常正常码入手即可；建议轻柔手洗或套洗衣袋机洗，能更好地延长挺括寿命。`;
  } else {
    title = formatCleanTitle(`实测这件${cleanName}整体质感真的超预期`, cleanName, existingTitles);
    content = `收到开箱实测了一段时间才来分享真实体验，做工和质感确实超出预期。

表面是细腻的哑光质感，边缘接缝处理严丝合缝，握持手感非常扎实轻便，完全没有廉价塑料感，外观极简耐看。

日常通勤、办公或随身携带都很顺手，放在桌面上也很利落，极大提升了日常生活的便利与幸福感。

实物质感比网图还要耐看，对于注重便携与品质感的朋友来说非常值得推荐，性价比很扎实。`;
  }

  const tags = [
    '#小红书买家秀',
    '#真实好物分享',
    '#自用好物推荐',
    '#我的日常穿搭',
    '#真实测评'
  ];

  return { title, content, tags };
}

export async function POST(req: Request) {
  try {
    const body: CopywritingRequest = await req.json().catch(() => ({}));
    const {
      productTitle = '',
      productCategory = '',
      productRole = '',
      shotPrompts = [],
      style = 'authentic',
      extraRequirements = '',
      existingTitles = [],
    } = body;

    const { baseUrl, apiKey } = resolveGatewayCreds(req, body, {
      baseUrl: getDefaultBaseUrl(),
      apiKey: getDefaultApiKey(),
    });

    if (!apiKey) {
      const fallback = generateLocalFallbackCopy(body);
      return jsonResponse({
        success: true,
        data: fallback,
        fromFallback: true,
      });
    }

    const cleanProductName = sanitizeProductTitle(productTitle);
    const existingTitlesText = existingTitles && existingTitles.length > 0
      ? `\n- 【标题排重禁忌】：前序商品已使用以下标题，本次标题【绝对不可重复】：\n${existingTitles.slice(-15).map(t => `  * ${t}`).join('\n')}`
      : '';

    const userPrompt = `【待种草商品信息】：
- 商品名称：${productTitle || '优质精选商品'}
- 品类类别：${productCategory || '时尚生活/美妆穿搭/数码百货'}
- 商品角色：${productRole || '主体实物'}
${shotPrompts && shotPrompts.length > 0 ? `- 成套买家秀各分镜场景与细节：\n${shotPrompts.map((p, i) => `  [机位 ${i + 1}]: ${p}`).join('\n')}` : ''}
- 偏好风格：${style === 'review' ? '专业深度测评风' : style === 'unboxing' ? '沉浸式拆箱风' : '日常随性真实生活风'}${existingTitlesText}
${extraRequirements ? `- 补充要求：${extraRequirements}` : ''}

【核心硬性要求】：
1. 标题必须在 5 到 20 个字之间，【严禁出现任何表情包或 Emoji 图标】；
2. 正文字数必须大于 100 字，口吻真实自然，【必须使用双换行清晰分段】；
3. 输出纯 JSON 格式。`;

    // 构建提示词内容（支持图文多模态与纯文本优雅降级）
    const hasImages = Array.isArray(body.imageUrls) && body.imageUrls.length > 0;
    let userMessageContent: any = userPrompt;
    let safeDataUrls: string[] = [];

    if (hasImages) {
      try {
        const converted = await Promise.all(
          body.imageUrls!.slice(0, 2).map((u: string) => convertToStandardJpegDataUrl(u, { maxDimension: 512, quality: 65 }))
        );
        safeDataUrls = converted.filter(Boolean) as string[];
        if (safeDataUrls.length > 0) {
          userMessageContent = [
            { type: 'text', text: userPrompt },
            ...safeDataUrls.map((url) => ({ type: 'image_url', image_url: { url } }))
          ];
        }
      } catch {
        /* fallback to text */
      }
    }

    const modelsToTry = Array.from(new Set([
      body.model || '',
      'gpt-4o-mini',
      'gpt-4o',
      'deepseek-chat',
      'qwen-plus',
      'gemini-1.5-flash'
    ].filter(Boolean)));

    let lastError: any = null;
    let resultJson: any = null;
    let usedModel = '';
    let copyUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;

    for (const model of modelsToTry) {
      // 尝试调用模型（先尝试多模态，若因模型不支持 image_url 报 400 则自动降级为纯文本）
      for (const attemptContent of [userMessageContent, userPrompt]) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 18000);

          const upstreamRes = await fetch(`${normalizeGatewayBaseUrl(baseUrl)}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: attemptContent }
              ],
              temperature: 0.7,
              response_format: { type: 'json_object' }
            }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!upstreamRes.ok) {
            const errText = await upstreamRes.text().catch(() => '');
            lastError = new Error(`Model ${model} failed with HTTP ${upstreamRes.status}: ${errText.slice(0, 120)}`);
            // 若包含 image_url 报错 400，进入内层循环降级为纯文本
            if (attemptContent !== userPrompt && upstreamRes.status === 400) {
              continue;
            }
            break;
          }

          const data = await upstreamRes.json();
          const contentStr = data.choices?.[0]?.message?.content;
          if (contentStr) {
            const parsed = JSON.parse(contentStr);
            if (parsed && typeof parsed.title === 'string' && typeof parsed.content === 'string') {
              resultJson = parsed;
              usedModel = model;
              copyUsage = {
                promptTokens: Number(data.usage?.prompt_tokens || data.usage?.promptTokens || 150),
                completionTokens: Number(data.usage?.completion_tokens || data.usage?.completionTokens || 350),
                totalTokens: Number(data.usage?.total_tokens || data.usage?.totalTokens || 500),
              };
              break;
            }
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (resultJson) break;
    }

    if (resultJson) {
      const fallback = generateLocalFallbackCopy(body);
      const finalTitle = formatCleanTitle(resultJson.title, cleanProductName, existingTitles);
      const finalContent = formatCleanContent(resultJson.content, fallback.content);
      const tagsList = Array.isArray(resultJson.tags) && resultJson.tags.length > 0
        ? resultJson.tags
        : ['#小红书买家秀', '#好物分享', '#实测推荐'];

      return jsonResponse({
        success: true,
        data: {
          title: finalTitle,
          content: finalContent,
          tags: tagsList,
        },
        model: usedModel || 'gpt-4o-mini',
        usage: copyUsage,
      });
    }

    // 降级模版兜底
    console.warn('[Copywriting API] Upstream failed, using fallback generator:', lastError?.message);
    const fallback = generateLocalFallbackCopy(body);
    return jsonResponse({
      success: true,
      data: fallback,
      fromFallback: true,
    });

  } catch (error: any) {
    console.error('[Copywriting API] Fatal error:', error);
    return jsonResponse({
      success: false,
      error: formatUserError(error, '生成种草文案失败')
    }, 500);
  }
}
