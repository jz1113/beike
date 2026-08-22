import { jsonResponse } from '../../adapters/http';
import { AVAILABLE_SKILLS, CLEAN_CHAT_SYSTEM_PROMPT } from '@/lib/skills/ecommerce-visual-director';
import { prisma } from '@/lib/prisma';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { convertToStandardJpegDataUrl } from '@/lib/imageConverter';
import { buildComprehensiveProductProps, extractSpecsFromTitle } from '@/lib/props';
import { normalizeVisionModelId } from '@/lib/vision';
import { resolveGatewayCreds } from '@/lib/gatewayCreds';
import {
  ASSISTANT_TOOLS,
  executeAssistantTool,
  toolDisplayName,
  type AssistantDocAttachment,
} from '@/lib/assistantTools';
import { formatUserError } from '../../lib/formatApiError';

const DEFAULT_BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const DEFAULT_API_KEY = process.env.AI_DRAWING_API_KEY || '';
const MAX_TOOL_ROUNDS = 3;

function resolveRequestOrigin(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '127.0.0.1:3000';
  return `${proto}://${host}`;
}

/** 工具规划轮次：去掉 image_url，避免部分网关 tools+vision 不兼容 */
function toTextOnlyMessages(msgs: any[]): any[] {
  return msgs.map((m) => {
    if (typeof m.content === 'string' || m.content == null) return m;
    if (!Array.isArray(m.content)) return m;
    const texts = m.content.filter((p: any) => p?.type === 'text').map((p: any) => p.text || '');
    const imgN = m.content.filter((p: any) => p?.type === 'image_url').length;
    return {
      ...m,
      content:
        texts.join('\n') +
        (imgN > 0 ? `\n[附带 ${imgN} 张图片，最终回复阶段可结合视觉理解]` : ''),
    };
  });
}

function summarizeToolResult(raw: string): string {
  try {
    const j = JSON.parse(raw);
    if (j.success === false) return j.error || '失败';
    if (j.kind === 'social') return `社媒「${j.title || ''}」图${j.imageCount || 0}张`;
    if (j.kind === 'ecommerce') return `商品「${j.title || ''}」`;
    if (j.products) return `商品库 ${j.count || j.products.length} 条`;
    if (j.excerpt) return `文档片段 ${String(j.excerpt).length} 字`;
    return '完成';
  } catch {
    return raw.slice(0, 80);
  }
}

/** 仅在有 URL / 文档 / 商品库查询等明确需求时跑工具规划轮，避免纯文本对话多等一整轮 LLM */
function needsAssistantTools(
  lastUserMsg: string,
  documents: AssistantDocAttachment[],
  enableAgentTools: boolean,
): boolean {
  if (enableAgentTools === false) return false;
  if (documents.length > 0) return true;
  if (/https?:\/\/[^\s"'<>]+/i.test(lastUserMsg)) return true;
  if (/(?:xhslink\.com|xiaohongshu\.com|douyin\.com|kuaishou\.com|weibo\.com|b23\.tv|bilibili\.com)/i.test(lastUserMsg)) {
    return true;
  }
  if (/(?:item\.jd\.com|item\.taobao\.com|detail\.tmall\.com|1688\.com|pinduoduo\.com)/i.test(lastUserMsg)) {
    return true;
  }
  if (/(?:抓取|采集|解析|商品库|我有哪些商品|历史采集|本地商品|万邦|sku)/i.test(lastUserMsg)) {
    return true;
  }
  if (/\b\d{9,16}\b/.test(lastUserMsg) && /(?:抓取|采集|商品|sku|万邦)/i.test(lastUserMsg)) {
    return true;
  }
  return false;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{
    type: 'image' | 'video' | 'document';
    url?: string;
    name?: string;
    extractedText?: string;
  }>;
}



export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch (parseErr: any) {
    console.error('[Chat API] 请求载荷 JSON 解析失败:', parseErr);
    return jsonResponse({
      success: false,
      error: `请求载荷解析失败: ${parseErr?.message || '内容格式异常'}。建议减少上传的附件图片数量后重试。`
    }, 400);
  }

  try {
    const {
      messages = [],
      model = 'gemini-3.1-pro-preview-thinking-high',
      historyLimit = 100,
      customBaseUrl,
      customApiKey,
      systemPrompt,
      skillId,
      enableAgentTools = true,
      fallbackModels = [],
      language = '中字',
    } = body;

    const { baseUrl, apiKey } = resolveGatewayCreds(req, { customBaseUrl, customApiKey }, {
      baseUrl: DEFAULT_BASE_URL,
      apiKey: DEFAULT_API_KEY,
    });

    if (!apiKey) {
      return jsonResponse({ 
        error: '系统未配置 API Key，请在顶部「⚙️ 设置」中配置 API 密钥' 
      }, 400);
    }

    const encoder = new TextEncoder();
    const sseHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };

    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (payload: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };

          try {
            send({ type: 'status', phase: 'preparing', message: '正在处理请求…' });
            const pipelineStart = Date.now();

    const validHistoryLimit = Math.max(1, Math.min(100, Number(historyLimit) > 0 ? Number(historyLimit) : 100));
    const recentMessages: ChatMessage[] = messages.slice(-validHistoryLimit);

    // 🌟 1. 意图识别与智能体工具触发
    // enableAgentTools 开启时跳过内联抓取，统一走 parse_product_or_social_url，避免双计费
    const skipInlineUrlAgent = enableAgentTools !== false;
    const lastUserMsg = recentMessages.filter(m => m.role === 'user').pop()?.content || '';
    let productWidgetData: any = null;
    let productContextPrompt = '';

    // A. 优先检测外站社媒/短视频图集链接 (小红书、抖音、快手、微博、B站等)
    const socialUrlMatch = lastUserMsg.match(/https?:\/\/[^\s"'<>]+/i)
      || (/(?:xhslink\.com|xiaohongshu\.com|douyin\.com|kuaishou\.com|weibo\.com|b23\.tv|bilibili\.com|pipix\.com|toutiao\.com)\/[a-zA-Z0-9_\-\.\/]+/i.exec(lastUserMsg));
    
    const isEcommerceUrl = /(?:item\.jd\.com|item\.taobao\.com|detail\.tmall\.com|1688\.com|pinduoduo\.com)/i.test(lastUserMsg);
    const isSocialMediaRequest = Boolean(socialUrlMatch && !isEcommerceUrl);

    // B. 检测电商商品 URL 或 纯数字 SKU ID (京东、淘宝、天猫)
    const skuMatch = !isSocialMediaRequest && (
      lastUserMsg.match(/(?:item\.jd\.com\/|item\.taobao\.com\/|detail\.tmall\.com\/|[?&]id=|[?&]itemId=|[?&]item_id=)(\d{8,16})/i) 
      || (/(?:抓取|采集|分析|提取|万邦|商品|sku)\D*?(\d{8,16})/i.exec(lastUserMsg))
      || (/^\s*(\d{9,16})\s*$/.exec(lastUserMsg))
    );
    
    if (!skipInlineUrlAgent && skuMatch) {
      const extractedSku = skuMatch[1];
      const platform = /taobao|tmall|淘宝|天猫/i.test(lastUserMsg) ? 'taobao' : 'jd';
      console.log(`[Chat Agent] 识别到商品抓取指令: 平台=${platform}, SKU=${extractedSku}`);

      try {
        // 优先在本地数据库中查询
        const productRecord = await prisma.product.findFirst({
          where: { itemId: extractedSku }
        });

        let title = '';
        let price: any = '';
        let brand = '';
        let category = '';
        let mainImgs: string[] = [];
        let detailImgs: string[] = [];
        let skuImgs: string[] = [];
        let propsDict: Record<string, string> = {};
        let apiUsedStr = '💾 本地商品资产库 (0消耗秒级加载)';
        let shouldFetchLive = !productRecord;

        if (productRecord) {
          title = productRecord.title || '';
          try {
            const parsed = typeof productRecord.detailUrls === 'string' ? JSON.parse(productRecord.detailUrls) : (productRecord.detailUrls || {});
            mainImgs = (Array.isArray(parsed.main) ? parsed.main : (productRecord.picUrl ? [productRecord.picUrl] : [])).map(normalizeImageUrlToStandardJpg).filter(Boolean);
            detailImgs = (Array.isArray(parsed.details) ? parsed.details : []).map(normalizeImageUrlToStandardJpg).filter(Boolean);
            skuImgs = (Array.isArray(parsed.skus) ? parsed.skus : []).map(normalizeImageUrlToStandardJpg).filter(Boolean);
            if (parsed.props && typeof parsed.props === 'object' && Object.keys(parsed.props).length >= 6) {
              propsDict = parsed.props;
            } else {
              shouldFetchLive = true; // 属性不完整，自动触发云端补全升级
            }
            if (parsed.price) price = parsed.price;
            if (parsed.brand) brand = parsed.brand;
            if (parsed.category) category = parsed.category;
          } catch {
            shouldFetchLive = true;
          }
        }

        if (shouldFetchLive) {
          apiUsedStr = '⚡ 万邦官方专线全量抓取 (item_get_pro)';
          const wbKey = process.env.WANBANG_API_KEY || '';
          const wbSecret = process.env.WANBANG_API_SECRET || '';
          const candidateApis = platform === 'jd' 
            ? ['item_get_pro', 'item_get', 'item_get_app']
            : ['item_get', 'item_get_pro', 'item_get_app'];

          let itemData: any = null;
          for (const apiName of candidateApis) {
            try {
              let wbUrl = `https://api-gw.onebound.cn/${platform}/${apiName}/?key=${wbKey}&secret=${wbSecret}&num_iid=${extractedSku}&cache=yes`;
              if (platform === 'jd') {
                wbUrl += '&watermark=1&domain_type=jd';
              } else if (platform === 'taobao' || platform === '1688') {
                wbUrl += '&is_promotion=1';
              }

              const wbRes = await fetch(wbUrl, { 
                signal: AbortSignal.timeout(12000),
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
              });
              if (wbRes.ok) {
                const wbData = await wbRes.json();
                if (wbData?.item && !wbData.error && (!wbData.error_code || wbData.error_code === '0000') && !wbData.item.error) {
                  itemData = wbData.item;
                  break;
                }
              }
            } catch (e) {}
          }

          if (itemData) {
            title = itemData.title || title || `精选商品 (SKU: ${extractedSku})`;
            price = itemData.price || itemData.orginal_price || itemData.promotion_price || price || '3599';
            brand = itemData.brand || itemData.nick || brand || '';
            category = itemData.cat_name || itemData.category_name || itemData.rootCatId || category || '全品类';
            
            // 提取主图
            if (itemData.pic_url) {
              const p = normalizeImageUrlToStandardJpg(itemData.pic_url);
              if (p && !mainImgs.includes(p)) mainImgs.unshift(p);
            }

            if (Array.isArray(itemData.item_imgs)) {
              itemData.item_imgs.forEach((img: any) => {
                const u = typeof img === 'string' ? img : img?.url;
                if (u) {
                  const fullUrl = normalizeImageUrlToStandardJpg(u);
                  if (fullUrl && !mainImgs.includes(fullUrl)) mainImgs.push(fullUrl);
                }
              });
            }

            // 提取详情图
            if (Array.isArray(itemData.desc_img)) {
              itemData.desc_img.forEach((img: any) => {
                const u = typeof img === 'string' ? img : img?.url;
                if (u) {
                  const fullUrl = normalizeImageUrlToStandardJpg(u);
                  if (fullUrl && !detailImgs.includes(fullUrl)) detailImgs.push(fullUrl);
                }
              });
            } else if (typeof itemData.desc === 'string') {
              const imgRegex = /<img[^>]+(?:src|data-original|data-src|data-lazyload)=["']([^"']+)["']/gi;
              let match;
              while ((match = imgRegex.exec(itemData.desc)) !== null) {
                const u = normalizeImageUrlToStandardJpg(match[1]);
                if (u && !detailImgs.includes(u)) detailImgs.push(u);
              }
            }

            // 提取 SKU 规格图
            const rawPropImgs = itemData.prop_imgs?.prop_img || itemData.prop_imgs || itemData.props_img || [];
            if (Array.isArray(rawPropImgs)) {
              rawPropImgs.forEach((img: any) => {
                const u = typeof img === 'string' ? img : img?.url;
                if (u) {
                  const fullUrl = normalizeImageUrlToStandardJpg(u);
                  if (fullUrl && !skuImgs.includes(fullUrl)) skuImgs.push(fullUrl);
                }
              });
            } else if (typeof rawPropImgs === 'object' && rawPropImgs !== null) {
              Object.values(rawPropImgs).forEach((u: any) => {
                if (typeof u === 'string') {
                  const fullUrl = normalizeImageUrlToStandardJpg(u);
                  if (fullUrl && !skuImgs.includes(fullUrl)) skuImgs.push(fullUrl);
                }
              });
            }

            // 深度提取 100% 全量参数 (Props)
            propsDict = buildComprehensiveProductProps({
              title,
              brand,
              category,
              weight: itemData.item_weight,
              rawProps: itemData.props,
              rawPropsList: itemData.props_list,
              rawPropsName: itemData.props_name,
              rawSkus: itemData.skus,
              saleProp: itemData.saleProp,
              salePropSeq: itemData.salePropSeq
            });

            // 确保所有抓取的图片均已去水印并转换为标准 JPG
            mainImgs = Array.from(new Set(mainImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean)));
            detailImgs = Array.from(new Set(detailImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean)));
            skuImgs = Array.from(new Set(skuImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean)));

            // 更新或写入本地数据库
            try {
              const payload = {
                platform,
                itemId: extractedSku,
                title,
                picUrl: mainImgs[0] || '',
                detailUrls: JSON.stringify({
                  main: mainImgs,
                  details: detailImgs,
                  skus: skuImgs,
                  props: propsDict,
                  price,
                  brand,
                  category
                })
              };
              if (productRecord) {
                await prisma.product.update({
                  where: { id: productRecord.id },
                  data: payload
                });
              } else {
                await prisma.product.create({
                  data: payload
                });
              }
            } catch (dbErr) {
              console.warn('[Chat Agent] 写入商品缓存失败:', dbErr);
            }
          }
        }

        if (!title) {
          title = `精选数码3C商品 (SKU: ${extractedSku})`;
        }

        // 深度合并与兜底补全
        propsDict = buildComprehensiveProductProps({
          title,
          brand,
          category,
          rawProps: propsDict
        });

        mainImgs = mainImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean);
        detailImgs = detailImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean);
        skuImgs = skuImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean);
        const allImagesList = Array.from(new Set([...mainImgs, ...detailImgs, ...skuImgs])).filter(Boolean);

        // 构建前端交互卡片对象
        productWidgetData = {
          itemId: extractedSku,
          platform,
          title,
          price: price || '3599',
          category: category || '数码3C',
          picUrl: mainImgs[0] || '',
          mainImages: mainImgs,
          detailImages: detailImgs,
          skuImages: skuImgs,
          allImages: allImagesList,
          props: propsDict,
          apiUsed: apiUsedStr
        };

        // 组装注入大模型上下文的商品深度知识提示
        productContextPrompt = `\n\n【⚡ 系统已自动调用电商接口成功抓取并解析商品数据】：
- 商品全称: ${title}
- 电商平台: ${platform.toUpperCase()} (SKU: ${extractedSku})
- 价格: ￥${price}
- 核心规格参数 (Props):
${Object.entries(propsDict).map(([k, v]) => `  • ${k}: ${v}`).join('\n')}
- 素材图集: 共提取到 ${allImagesList.length} 张高清图片 (主图 ${mainImgs.length} 张, 详情图 ${detailImgs.length} 张)

【视觉总监输出指令】：
请你以顶级电商视觉与方案总监的身份，按以下结构为用户输出深度整理报告：
1. 📊 【商品参数与核心卖点提炼】：将上述 props 参数与核心卖点分类整理为清晰的表格/要点（重点突出外观材质特征、核心性能亮点与种草痛点）；
2. 📸 【高转化电商商拍分镜方案】：结合商品的具体外观特征与卖点，推荐 4~6 组高质感的分镜构思方案；
3. 🖼️ 告知用户已将该商品的全部高清图集加载在下方交互卡片中，用户可直接点击图片设为垫图或一键载入生图工坊。`;

      } catch (agentErr: any) {
        console.warn(`[Chat Agent] 商品抓取工具执行异常:`, agentErr.message);
      }
    }

    // 🌟 2. 外站社媒/短视频图集链接智能解析 Agent (小红书/抖音/快手/微博/B站)
    if (!skipInlineUrlAgent && !productWidgetData && isSocialMediaRequest && socialUrlMatch) {
      const rawTargetUrl = socialUrlMatch[0].startsWith('http') ? socialUrlMatch[0] : `https://${socialUrlMatch[0]}`;
      console.log(`[Chat Agent] 识别到外站社媒图集链接解析请求: url=${rawTargetUrl}`);

      try {
        // URL 智能标准化：小红书保留原始 URL（含 xsec_token），不做路径改写
        // APIA 接口仅支持 /explore/ 格式的原始链接，不支持 /discovery/item/ 格式
        const urlsToTry: string[] = [rawTargetUrl];
        
        // 小红书：如果原 URL 不含 xsec_token，额外尝试 /explore/ 格式
        const xhsMatch = rawTargetUrl.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
        if (xhsMatch) {
          const exploreUrl = `https://www.xiaohongshu.com/explore/${xhsMatch[1]}`;
          if (!urlsToTry.includes(exploreUrl)) urlsToTry.push(exploreUrl);
        }

        const scraperSecret = process.env.EXTERNAL_SCRAPER_SECRET || '';
        const scraperId = process.env.EXTERNAL_SCRAPER_ID || '';

        if (scraperSecret && scraperId) {
          for (const candidateUrl of urlsToTry) {
          if (productWidgetData) break;
          try {
            const apiaUrl = `https://apia.vip/api/dsp/${scraperSecret}/${scraperId}/?url=${encodeURIComponent(candidateUrl)}`;
            console.log(`[Chat Agent] 请求社媒 APIA 接口: ${candidateUrl}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const apiaRes = await fetch(apiaUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
              },
              signal: controller.signal
            }).catch(() => null);
            clearTimeout(timeoutId);

            if (apiaRes && apiaRes.ok) {
              const apiaData = await apiaRes.json().catch(() => null);
              if (apiaData && (apiaData.code === 200 || apiaData.code === '200' || apiaData.data)) {
                const root = apiaData.data && typeof apiaData.data === 'object' ? apiaData.data : apiaData;
                
                let rawTitle = root.title || apiaData.title || '';
                let rawDesc = root.desc || root.text || apiaData.desc || apiaData.text || '';
                const author = root.author?.nickname || root.user_name || root.nickname || root.author || apiaData.author || '社媒创作者';

                if (rawTitle.includes('|||')) {
                  const parts = rawTitle.split('|||').map((p: string) => p.trim()).filter(Boolean);
                  rawTitle = parts[0] || '社媒精选图集';
                  rawDesc = parts.slice(1).join('\n\n') || rawDesc;
                } else if (rawTitle.includes('||')) {
                  const parts = rawTitle.split('||').map((p: string) => p.trim()).filter(Boolean);
                  rawTitle = parts[0] || '社媒精选图集';
                  rawDesc = parts.slice(1).join('\n\n') || rawDesc;
                }

                let cover = root.cover || root.download_image || root.image || root.cover_url || root.video_cover || apiaData.cover || '';
                if (typeof cover === 'object' && cover !== null) {
                  cover = cover.url || cover.url_list?.[0] || '';
                }

                // 收集所有候选图片字段
                const rawCandidateList: any[] = [];
                if (Array.isArray(root.images)) rawCandidateList.push(...root.images);
                if (Array.isArray(root.pics)) rawCandidateList.push(...root.pics);
                if (Array.isArray(root.img_list)) rawCandidateList.push(...root.img_list);
                if (Array.isArray(root.live_photos)) rawCandidateList.push(...root.live_photos.map((l: any) => l?.image || l));
                if (Array.isArray(root.live)) rawCandidateList.push(...root.live.map((l: any) => l?.image || l));
                
                if (Array.isArray(root.photo)) {
                  rawCandidateList.push(...root.photo);
                } else if (typeof root.photo === 'string' && root.photo.trim()) {
                  const photoUrls = root.photo.split(/[\n\r,;\s]+/).filter((u: string) => u.startsWith('http') || u.startsWith('//'));
                  rawCandidateList.push(...photoUrls);
                }

                if (root.download_image) rawCandidateList.push(root.download_image);
                if (root.image) rawCandidateList.push(root.image);

                // 严格去重
                const seenFingerprints = new Set<string>();
                const extractedImages: string[] = [];

                for (const item of rawCandidateList) {
                  if (!item) continue;
                  let u = typeof item === 'string' ? item.trim() : (item.url || item.url_list?.[0] || item.download_url || item.pic || item.image);
                  if (!u || typeof u !== 'string') continue;
                  if (u.startsWith('//')) u = 'https:' + u;
                  if (!u.startsWith('http')) continue;

                  let canonicalKey = u;
                  try {
                    const parsed = new URL(u);
                    const cleanPath = parsed.pathname.replace(/~tplv-[^/]+$/, '');
                    canonicalKey = `${parsed.hostname}${cleanPath}`.toLowerCase();
                  } catch {
                    canonicalKey = u.split('?')[0].replace(/^https?:\/\//i, '').toLowerCase();
                  }

                  if (!seenFingerprints.has(canonicalKey)) {
                    seenFingerprints.add(canonicalKey);
                    extractedImages.push(u);
                  }
                }

                if (extractedImages.length === 0 && cover) {
                  const cleanCover = typeof cover === 'string' ? cover : (cover.url || '');
                  if (cleanCover) extractedImages.push(cleanCover.startsWith('//') ? 'https:' + cleanCover : cleanCover);
                }

                if (extractedImages.length > 0) {
                  const video = root.video || root.url || root.down || root.download_video || (Array.isArray(root.live) && root.live[0]?.video) || apiaData.video || null;
                  const videoUrl = typeof video === 'string' && (video.includes('.mp4') || video.includes('video') || video.includes('xhscdn') || video.startsWith('http')) ? video : null;

                  const platformName = /xiaohongshu|xhs/i.test(rawTargetUrl) ? 'xiaohongshu' 
                    : (/douyin/i.test(rawTargetUrl) ? 'douyin' 
                    : (/kuaishou/i.test(rawTargetUrl) ? 'kuaishou' 
                    : (/weibo/i.test(rawTargetUrl) ? 'weibo' 
                    : 'social')));

                  const platformLabel = platformName === 'xiaohongshu' ? '小红书 (Xiaohongshu)'
                    : platformName === 'douyin' ? '抖音 (Douyin)'
                    : platformName === 'kuaishou' ? '快手 (Kuaishou)'
                    : platformName === 'weibo' ? '微博 (Weibo)'
                    : '外站社媒图集';

                  productWidgetData = {
                    itemId: root.id || root.note_id || Date.now().toString(),
                    platform: platformName,
                    title: rawTitle || `${platformLabel}精选作品图集`,
                    author,
                    picUrl: cover || extractedImages[0] || '',
                    mainImages: extractedImages.slice(0, 4),
                    detailImages: extractedImages.slice(4),
                    skuImages: [],
                    allImages: extractedImages,
                    videoUrl,
                    props: {
                      '来源平台': platformLabel,
                      '创作者': author,
                      '图集数量': `${extractedImages.length} 张无水印原图`,
                      '视频状态': videoUrl ? '🎬 包含无水印高清视频' : '📷 纯图文素材',
                      '文案摘要': rawDesc ? (rawDesc.slice(0, 100) + '...') : '无文案'
                    },
                    apiUsed: '⚡ APIA 社媒全网无水印解析专线'
                  };

                  productContextPrompt = `\n\n【⚡ 系统已自动调用社媒解析专线成功提取外站图集数据】：
- 作品标题: ${rawTitle || '社媒精选图集'}
- 发布平台: ${platformLabel}
- 创作者: ${author}
- 素材图集: 共提取到 ${extractedImages.length} 张高清无水印图片${videoUrl ? '，并提取到高清原视频' : ''}
- 附带文案: ${rawDesc || '无'}

【视觉总监输出指令】：
请你以顶级电商与小红书爆款视觉总监的身份：
1. 🎨 深度解构并点评该作品的视觉美学、色彩搭配、光影布局与爆款构图法则；
2. 💡 提炼出 3~4 组可直接用于 AI 生图仿制的高清商业摄影提示词（Prompt）；
3. 🖼️ 告知用户已将该作品的全部无水印高清图集提取并呈现在下方交互卡片中，用户可直接点击任意图片设为生图垫图，或一键导入生图工坊进行同款制作！`;
                }
              }
            }
          } catch (tryErr: any) {
            console.warn(`[Chat Agent] 尝试解析 ${candidateUrl} 失败:`, tryErr.message);
          }
        }
        }

        // 🌟 核心防御：如果所有解析链路均未能提取到图片素材，防止大模型发生“幻觉式成功解析”
        if (!productWidgetData) {
          productContextPrompt = `\n\n【⚠️ 外站社媒图集解析提示】：
系统尝试自动拉取用户提供的链接（${rawTargetUrl}），但由于平台反爬登录保护、接口风控或网络超时，未能直接抓取到高清图片素材。
【回复要求】：
1. 严禁声称“已成功解析您提供的图集”或假装看到了图片！
2. 请如实礼貌地告知用户：“由于平台反爬保护与防盗链限制，未能直接自动提取到该笔记的原图。”
3. 明确提示用户最快捷的方案：“您可以直接在下方输入框点击【📎 上传图片】按钮，或者直接按【Ctrl+V / Command+V 截图粘贴】将图片发给我，我将立即为您深度分析构图并生成同款生图提示词！”`;
        }
      } catch (socialErr: any) {
        console.warn(`[Chat Agent] 外站社媒解析异常:`, socialErr.message);
      }
    }

    // 组装 OpenAI / OneAPI 兼容的 Multi-modal Payload
    const formattedMessages: any[] = [];

    // 根据选择的 Skill 动态决定系统提示词
    let finalSystemPrompt = systemPrompt || CLEAN_CHAT_SYSTEM_PROMPT;

    if (productContextPrompt) {
      finalSystemPrompt += productContextPrompt;
    }

    // 🌟 智能检测套图与场景人物一致性意图并定向增强
    const isConsistencyRequested = /保持一致|一组图|套图|连续分镜|同场景|同人物|同模特|同一个人物|同一个场景|统一人物|统一场景|同一组/i.test(lastUserMsg);
    if (isConsistencyRequested) {
      finalSystemPrompt += `\n\n【⚡ 场景与人物强一致性套图指令 (Consistency Protocol)】：
检测到用户要求生成【一组保持场景和人物强一致性的分镜套图】。
请务必严格执行以下规则：
1. 🔒【统一人物 DNA】：在全部各分镜中锁定完全相同的模特人物（具体固定：年龄段、东亚面孔、发型款式、妆容风格以及统一的服装款式和色系，如“同一位25岁东亚职场女性，黑色内扣锁骨发，浅灰色修身西装外套内搭白T恤”）；
2. 🔒【统一场景 DNA】：在全部各分镜中锁定完全相同的空间环境与光影（如“同一个明亮极简的现代原木风办公书房，原木质感工作台，背景有白色百叶窗透入柔和自然光与绿植”），严禁在不同分镜间随意切换场景（如办公室切换到咖啡厅或客厅）；
3. 🎬【仅变动作与景别】：各分镜仅在相同的场景和人物下切换不同的机位景别与商品交互动作（如：第1张全景正面桌面开箱；第2张中近景手持展示后摄细节；第3张侧面坐姿看屏幕；第4张手部特写握持质感）；
4. 🖼️【多图引用语法】：提示词中统一使用 @图片1 指代商品实物，若涉及模特或首图请使用 @图片2 指代人物与场景基准参考图。`;
    }

    // 语言兜底：即使客户端未拼 langInstruction，也按 language 约束生图提示词语言
    const langKey = String(language || '中字').trim();
    if (langKey === 'English') {
      finalSystemPrompt += `\n\n【输出语言·服务端兜底】Please reply entirely in English. Storyboard titles and image-generation prompts (\`\`\`prompt blocks and \`>\` prompt lines) must also be in English. Keep flags like --ar unchanged.`;
    } else if (langKey === '双语') {
      finalSystemPrompt += `\n\n【输出语言·服务端兜底】请使用中英双语对照输出说明（中文为主）。每条生图提示词必须先给完整简体中文正文；可另起一行 EN: 附英文对照。复制/去生图以中文段为准。画面内外文可放中文引号内；--ar 等参数保留。`;
    } else {
      finalSystemPrompt += `\n\n【输出语言·服务端兜底】请使用简体中文回复。分镜标题、说明，以及 \`\`\`prompt / \`>\` 生图提示词正文必须用简体中文；禁止整段英文生图提示词。画面内需显示的外文可放在中文引号内；--ar、--v、--style 等参数保留。`;
    }

    formattedMessages.push({
      role: 'system',
      content: finalSystemPrompt
    });

    // 格式化每一条用户与助手消息 (支持异步图片转码与历史载荷精简)
    const lastUserMessageObj = recentMessages.filter(m => m.role === 'user').pop();

    for (const msg of recentMessages) {
      if (msg.role === 'assistant') {
        formattedMessages.push({
          role: 'assistant',
          content: msg.content
        });
      } else {
        const isLatestUserMessage = (msg === lastUserMessageObj);
        const autoExtractedImages: string[] = (isLatestUserMessage && productWidgetData?.allImages?.length)
          ? productWidgetData.allImages.slice(0, 8)
          : [];

        const hasManualAttachments = Boolean(msg.attachments && msg.attachments.length > 0);

        if (!isLatestUserMessage) {
          // 历史用户消息：保留文本上下文，不重复发送巨型 Base64 / 文档全文
          const docs = (msg.attachments || []).filter(a => a.type === 'document').length;
          const medias = (msg.attachments || []).length - docs;
          let attSummary = '';
          if (hasManualAttachments) {
            const parts: string[] = [];
            if (medias > 0) parts.push(`${medias} 张参考图/视频`);
            if (docs > 0) parts.push(`${docs} 个文档`);
            attSummary = `\n[历史附件: 用户此前已上传 ${parts.join('、')}]`;
          }
          formattedMessages.push({
            role: 'user',
            content: `${msg.content || ''}${attSummary}`
          });
        } else if (!hasManualAttachments && autoExtractedImages.length === 0) {
          formattedMessages.push({
            role: 'user',
            content: msg.content
          });
        } else {
          // 当前轮次最新用户消息：文档注入文本 + 图片视觉
          const effectiveAttachments = hasManualAttachments
            ? msg.attachments!
            : autoExtractedImages.map((u, i) => ({ type: 'image' as const, url: u, name: `提取素材图${i + 1}` }));

          const docAtts = effectiveAttachments.filter((a): a is { type: 'document'; name?: string; extractedText: string; url?: string } => a.type === 'document' && Boolean((a as any).extractedText));
          const visionAtts = effectiveAttachments.filter(a => a.type !== 'document');
          const imgCount = visionAtts.length;
          const docCount = docAtts.length;
          const hasVideoFrames = visionAtts.some(a =>
            a.type === 'video' || /视频帧|视频封面|原视频/.test(a.name || '')
          );
          const hasDocs = docCount > 0;
          const materialLabel = hasDocs
            ? (hasVideoFrames ? '份素材（含视频抽帧与文档）' : '份素材（含文档）')
            : (hasVideoFrames ? '张素材（含视频抽帧）' : '张图片');
          const totalCount = imgCount + docCount;
          const labelPrefix = hasManualAttachments
            ? `【系统提醒：用户本轮共上传了 ${totalCount} ${materialLabel}。视觉素材 ${imgCount} 项、文档 ${docCount} 份。若用户要求进行分镜、买家秀或图文规划，请结合全部视觉素材规划，并充分利用文档中的卖点/规格信息】\n\n`
            : `【系统提醒：已通过外站专线自动载入用户提供链接提取的 ${imgCount} 张高清图片素材。请基于图片实际画面（主体外观、人物特征、色彩构图与光影）进行专业视觉拆解与商业生图 Prompt 编写】\n\n`;

          let textBody = `${labelPrefix}${msg.content || '请分析附带素材：'}`;
          for (const doc of docAtts) {
            textBody += `\n\n【文档: ${doc.name || '未命名'}】\n${doc.extractedText}`;
          }

          const contentArray: any[] = [
            { type: 'text', text: textBody }
          ];

          const isLikelyVideoUrl = (url: string) =>
            /^data:video\//i.test(url)
            || /\.(mp4|webm|mov|m4v|avi)(\?|#|$)/i.test(url)
            || /\/video\//i.test(url)
            || /snssdk\.com|bytecdn\.cn|v\.kuaishou/i.test(url);

          // 🚀 并发安全转码：跳过文档与残留视频 URL
          const convertedImages = await Promise.all(
            visionAtts.map(async (att) => {
              if (!att.url) return null;
              if (att.type === 'video' || isLikelyVideoUrl(att.url)) {
                return null;
              }
              return await convertToStandardJpegDataUrl(att.url);
            })
          );

          let skippedVideo = 0;
          for (let i = 0; i < visionAtts.length; i++) {
            const att = visionAtts[i];
            if (!att.url) continue;
            if (att.type === 'video' || isLikelyVideoUrl(att.url)) {
              skippedVideo += 1;
              continue;
            }
            const safeUrl = convertedImages[i] || att.url;
            if (safeUrl) {
              contentArray.push({
                type: 'image_url',
                image_url: { url: safeUrl }
              });
            }
          }

          if (skippedVideo > 0) {
            contentArray[0] = {
              type: 'text',
              text: `${contentArray[0].text}\n【注意：有 ${skippedVideo} 个视频直链未能作为图片转码，请结合文字描述分析；正常情况客户端应已抽帧为图片。】`
            };
          }

          formattedMessages.push({
            role: 'user',
            content: contentArray.length > 1 || docCount > 0 ? contentArray : textBody
          });
        }
      }
    }

    console.log(`[Chat API] 消息组装完成 (${Date.now() - pipelineStart}ms)`);
    send({ type: 'status', phase: 'ready', message: '消息已就绪，正在连接模型…' });

    // 🚀 轻量智能体：可选 tools 规划轮 + SSE 流式最终回复
    console.log(`[Chat API] 正在调用用户指定模型: ${model}`);

    const normalizedReqModel = normalizeVisionModelId(model);
    const CHAT_FALLBACK_MODELS = [
      'gpt-5.6-luna',
      'gemini-3.7-flash',
      'gemini-3.1-pro-preview-thinking-high',
      'gpt-4o',
      'gpt-5.5-pro'
    ];
    const clientFallbacks = Array.isArray(fallbackModels)
      ? fallbackModels.filter((m: unknown) => typeof m === 'string' && m.trim()).map((m: string) => m.trim())
      : [];
    const modelsToTry = Array.from(
      new Set([normalizedReqModel, model, ...clientFallbacks, ...CHAT_FALLBACK_MODELS])
    ).filter(Boolean) as string[];
    const requestedModelId = (normalizedReqModel || model || '').trim();

    const origin = resolveRequestOrigin(req);
    const lastUserForDocs = (messages as ChatMessage[]).filter((m) => m.role === 'user').pop();
    const documents: AssistantDocAttachment[] = (lastUserForDocs?.attachments || [])
      .filter((a) => a.type === 'document' && a.extractedText)
      .map((a) => ({ name: a.name, extractedText: a.extractedText }));

    const toolCtx = { origin, documents };

    let workingMessages: any[] = [...formattedMessages];
    let actualModel = normalizedReqModel || model;
    let toolsWereUsed = false;

    const runToolPlanning = needsAssistantTools(lastUserMsg, documents, enableAgentTools !== false);

    // —— 工具调用循环（非流式，最多 MAX_TOOL_ROUNDS 轮）——
    if (runToolPlanning) {
      send({ type: 'status', phase: 'planning', message: '正在规划工具调用…' });
      const plannerMessages = toTextOnlyMessages(workingMessages);
      // 注入工具使用提示
      if (plannerMessages[0]?.role === 'system') {
        plannerMessages[0] = {
          ...plannerMessages[0],
          content:
            String(plannerMessages[0].content || '') +
            `\n\n【智能体工具】你可以使用函数工具：parse_product_or_social_url（解析商品/社媒链接）、read_attached_document（精读已上传文档片段）、list_user_products（查询本地商品库）。需要外部数据或核对文档细节时主动调用；不需要时直接回答。`,
        };
      }

      const roundMessages = [...plannerMessages];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let toolRoundResp: any = null;
        let usedModel = actualModel;

        for (let i = 0; i < modelsToTry.length; i++) {
          const tryModel = modelsToTry[i];
          const isLast = i === modelsToTry.length - 1;
          try {
            const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: tryModel,
                messages: roundMessages,
                tools: ASSISTANT_TOOLS,
                tool_choice: 'auto',
                temperature: 0.3,
                stream: false,
              }),
              signal: AbortSignal.timeout(90000),
            });

            if (resp.status === 429 && !isLast) continue;
            if (!resp.ok) {
              const errText = await resp.text();
              // 不支持 tools 时跳过工具环
              if (/tool|function|unsupported|not support/i.test(errText) && resp.status >= 400) {
                console.warn(`[Chat API] 模型 ${tryModel} 可能不支持 tools: ${errText.slice(0, 120)}`);
                toolRoundResp = null;
                usedModel = tryModel;
                break;
              }
              if (!isLast) continue;
              console.warn(`[Chat API] 工具轮失败 ${tryModel}: ${errText.slice(0, 120)}`);
              toolRoundResp = null;
              break;
            }

            toolRoundResp = await resp.json();
            usedModel = tryModel;
            actualModel = tryModel;
            break;
          } catch (err: any) {
            if (!isLast) continue;
            console.warn(`[Chat API] 工具轮异常: ${err.message}`);
            toolRoundResp = null;
          }
        }

        const choiceMsg = toolRoundResp?.choices?.[0]?.message;
        const toolCalls = choiceMsg?.tool_calls;
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
          // 模型直接给出文本答案：若有 content，后续流式可再生成；此处把非流式答案暂存到 working 供流式参考
          if (choiceMsg?.content && typeof choiceMsg.content === 'string') {
            // 不提前结束：仍走流式以保持 SSE UX；仅记录已无更多工具
          }
          break;
        }

        roundMessages.push({
          role: 'assistant',
          content: choiceMsg.content || null,
          tool_calls: toolCalls,
        });
        // 同步进 workingMessages（文本版），便于流式前上下文包含工具结果
        workingMessages = [...roundMessages];
        toolsWereUsed = true;

        for (const call of toolCalls) {
          const fnName = call?.function?.name || call?.name || '';
          const argsStr = call?.function?.arguments || call?.arguments || '{}';
          const callId = call?.id || `call_${Date.now()}`;
          const displayName = toolDisplayName(fnName);

          send({
            type: 'tool_call',
            name: fnName,
            displayName,
            status: 'running',
            detail: String(argsStr).slice(0, 120),
          });

          const result = await executeAssistantTool(fnName, argsStr, toolCtx);

          // 工具解析商品/社媒成功时写入 productWidget，与前端卡片一致
          if (fnName === 'parse_product_or_social_url' && !productWidgetData) {
            try {
              const j = JSON.parse(result);
              if (j?.success) {
                if (j.kind === 'ecommerce') {
                  const imgs = Array.isArray(j.sampleImages) ? j.sampleImages : [];
                  productWidgetData = {
                    itemId: j.skuId,
                    platform: j.platform,
                    title: j.title,
                    price: j.price,
                    category: j.category,
                    picUrl: j.cover || imgs[0] || '',
                    mainImages: imgs,
                    detailImages: [],
                    skuImages: [],
                    allImages: imgs,
                    props: j.props || {},
                    apiUsed: 'tool:parse_product_or_social_url',
                  };
                } else if (j.kind === 'social') {
                  const imgs = Array.isArray(j.images) ? j.images : [];
                  productWidgetData = {
                    itemId: undefined,
                    platform: 'social',
                    title: j.title,
                    price: '',
                    category: '社媒图集',
                    picUrl: j.cover || imgs[0] || '',
                    mainImages: imgs,
                    detailImages: [],
                    skuImages: [],
                    allImages: imgs,
                    props: {
                      作者: j.author || '',
                      图集数量: String(j.imageCount || imgs.length),
                      ...(j.video ? { 原视频: '已提取' } : {}),
                    },
                    apiUsed: 'tool:parse_product_or_social_url',
                    video: j.video || null,
                  };
                }
              }
            } catch {}
          }

          send({
            type: 'tool_result',
            name: fnName,
            displayName,
            status: /"success"\s*:\s*false/.test(result) ? 'error' : 'done',
            detail: summarizeToolResult(result),
          });

          roundMessages.push({
            role: 'tool',
            tool_call_id: callId,
            content: result,
          });
        }

        workingMessages = [...roundMessages];
      }
      console.log(`[Chat API] 工具规划完成 (${Date.now() - pipelineStart}ms)`);
    } else {
      console.log('[Chat API] 跳过工具规划轮（无 URL/文档/商品库意图）');
    }

    send({ type: 'status', phase: 'generating', message: '正在生成回复…' });

    // —— 最终流式回复 ——
    let streamMessages = formattedMessages;
    if (toolsWereUsed) {
      streamMessages = [...workingMessages];
      const lastVisionUserIdx = [...formattedMessages].map((m, i) => ({ m, i })).reverse().find(
        (x) => x.m.role === 'user' && Array.isArray(x.m.content)
      )?.i;
      const lastWorkUserIdx = [...workingMessages].map((m, i) => ({ m, i })).reverse().find(
        (x) => x.m.role === 'user'
      )?.i;
      if (lastVisionUserIdx != null && lastWorkUserIdx != null) {
        streamMessages[lastWorkUserIdx] = formattedMessages[lastVisionUserIdx];
      }
    }

    let streamResponse: Response | null = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const tryModel = modelsToTry[i];
      const isLast = i === modelsToTry.length - 1;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      try {
        const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: tryModel,
            messages: streamMessages,
            temperature: 0.7,
            stream: true,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (resp.status === 429 && !isLast) {
          console.warn(`[Chat API] 模型 ${tryModel} 返回 429 限流，准备尝试下一个候选模型...`);
          continue;
        }

        if (!resp.ok) {
          const errText = await resp.text();
          if (!isLast) {
            console.warn(`[Chat API] 模型 ${tryModel} 返回 HTTP ${resp.status}: ${errText.slice(0, 100)}，准备尝试下一个候选模型...`);
            continue;
          }
          throw new Error(`模型 [${tryModel}] 调用失败 (HTTP ${resp.status}): ${errText}`);
        }

        streamResponse = resp;
        actualModel = tryModel;
        break;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (!isLast && !err.message?.includes('abort')) {
          console.warn(`[Chat API] 模型 ${tryModel} 调用异常 (${err.message})，自动尝试下一个候选模型...`);
          continue;
        }
        throw err;
      }
    }

    if (!streamResponse || !streamResponse.body) {
      throw new Error('未能获取到模型流式响应');
    }

    console.log(`[Chat API] 模型流已连接 (${Date.now() - pipelineStart}ms)`);

    const decoder = new TextDecoder();
    const upstreamReader = streamResponse.body.getReader();

    send({
      type: 'meta',
      modelUsed: actualModel,
      modelSwitched: Boolean(requestedModelId && actualModel && actualModel !== requestedModelId && actualModel !== model),
      requestedModel: requestedModelId || model,
      productWidget: productWidgetData || undefined,
    });

    let buffer = '';
    let doneEmitted = false;

    while (true) {
      const { done, value } = await upstreamReader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);

        if (payload === '[DONE]') {
          if (!doneEmitted) {
            send({ type: 'done' });
            doneEmitted = true;
          }
          continue;
        }

        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            send({ type: 'delta', content: delta.content });
          }
          if (delta?.reasoning_content) {
            send({ type: 'thinking', content: delta.reasoning_content });
          }
          if (chunk.usage) {
            send({ type: 'usage', usage: chunk.usage });
          }
        } catch {}
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
        try {
          const chunk = JSON.parse(trimmed.slice(6));
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            send({ type: 'delta', content: delta.content });
          }
        } catch {}
      }
    }

    if (!doneEmitted) {
      send({ type: 'done' });
    }

    console.log(`[Chat API] 对话完成，总耗时 ${Date.now() - pipelineStart}ms`);
          } catch (error: any) {
            console.error('[Chat API] 异常:', error);
            send({ type: 'error', error: formatUserError(error, '请求大模型服务异常') });
          } finally {
            controller.close();
          }
        },
      }),
      { headers: sseHeaders },
    );
  } catch (error: any) {
    console.error('[Chat API] 异常:', error);
    return jsonResponse({
      success: false,
      error: formatUserError(error, '请求大模型服务异常')
    }, 500);
  }
}
