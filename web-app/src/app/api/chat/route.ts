import { NextResponse } from 'next/server';
import { AVAILABLE_SKILLS, CLEAN_CHAT_SYSTEM_PROMPT } from '@/lib/skills/ecommerce-visual-director';
import { prisma } from '@/lib/prisma';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';

const DEFAULT_BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const DEFAULT_API_KEY = process.env.AI_DRAWING_API_KEY || 'sk-zPD0Umv6ccqJjGoCZ1HJPpFD1wDqU5g66jsDEsj4K86dtXnZ';

// 备选视觉模型重试链
const FALLBACK_MODELS = [
  'gemini-3.1-pro-preview-thinking-high',
  'grok-4.6',
  'gpt-5.5-pro'
];

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{
    type: 'image' | 'video';
    url: string;
    name?: string;
  }>;
}

// 从商品标题智能解析核心参数字典 (Props)
function extractSpecsFromTitle(title: string): Record<string, string> {
  const specs: Record<string, string> = {};
  if (!title) return specs;
  
  if (/iQOO|vivo/i.test(title)) specs['品牌'] = 'vivo / iQOO';
  else if (/Apple|iPhone|iPad/i.test(title)) specs['品牌'] = 'Apple 苹果';
  else if (/小米|Redmi|K80/i.test(title)) specs['品牌'] = '小米 / Redmi';
  else if (/华为|HUAWEI|Mate|Pura/i.test(title)) specs['品牌'] = '华为 HUAWEI';
  else if (/OPPO|一加|OnePlus/i.test(title)) specs['品牌'] = 'OPPO / 一加';
  else if (/荣耀|HONOR/i.test(title)) specs['品牌'] = '荣耀 HONOR';
  else if (/AOC/i.test(title)) specs['品牌'] = 'AOC';
  else if (/ROG|华硕|ASUS/i.test(title)) specs['品牌'] = '华硕 ROG';

  const chipMatch = title.match(/(骁龙\s*[\w\d至尊版]+|天玑\s*[\w\d+]+|A\d+\s*Bionic|A\d+\s*Pro|M\d+|Q\d+|电竞芯片\w*)/i);
  if (chipMatch) specs['核心处理器/芯片'] = chipMatch[0];

  const screenMatch = title.match(/(\d+(?:\.\d+)?英寸(?:[\w\s\dK]+)?|2K[\w\s\dHz]+|144Hz[\w\s\d]+|240Hz[\w\s\d]+|280Hz[\w\s\d]+|OLED|IPS|珠峰屏|直屏|曲面屏)/i);
  if (screenMatch) specs['屏幕规格'] = screenMatch[0];

  const batteryMatch = title.match(/(\d{4,5}mAh(?:[\w\s]+)?|\d+W(?:[\w\s]+快充|闪充)?|超薄蓝海电池)/i);
  if (batteryMatch) specs['电池与续航'] = batteryMatch[0];

  const featureMatch = title.match(/(壁挂防撕裂|快速液晶|1MS|真10bit|FAST-IPS|微距|超薄)/i);
  if (featureMatch) specs['特色工艺/卖点'] = featureMatch[0];

  return specs;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages = [],
      model = 'gemini-3.1-pro-preview-thinking-high',
      historyLimit = 100,
      customBaseUrl,
      customApiKey,
      systemPrompt,
      skillId
    } = body;

    const baseUrl = customBaseUrl || DEFAULT_BASE_URL;
    const apiKey = customApiKey || DEFAULT_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ 
        error: '系统未配置 API Key，请在顶部「⚙️ 设置」中配置 API 密钥' 
      }, { status: 400 });
    }

    // 截取指定「回读条数」的上下文历史 (最后 N 条，默认 100 条)
    const validHistoryLimit = Math.max(1, Math.min(200, Number(historyLimit) || 100));
    const recentMessages: ChatMessage[] = messages.slice(-validHistoryLimit);

    // 🌟 1. 意图识别与智能体工具触发 (外站社媒图集解析 vs 电商商品抓取)
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
    
    if (skuMatch) {
      const extractedSku = skuMatch[1];
      const platform = /taobao|tmall|淘宝|天猫/i.test(lastUserMsg) ? 'taobao' : 'jd';
      console.log(`[Chat Agent] 识别到商品抓取指令: 平台=${platform}, SKU=${extractedSku}`);

      try {
        // 优先在本地数据库中查询
        let productRecord = await prisma.product.findFirst({
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
          const wbKey = process.env.WANBANG_API_KEY || 't3661731514';
          const wbSecret = process.env.WANBANG_API_SECRET || 'jz123456';
          const candidateApis = ['item_get_pro', 'item_get', 'item_get_app'];

          let itemData: any = null;
          for (const apiName of candidateApis) {
            try {
              const wbUrl = `https://api-gw.onebound.cn/${platform}/${apiName}/?key=${wbKey}&secret=${wbSecret}&num_iid=${extractedSku}&cache=yes`;
              const wbRes = await fetch(wbUrl, { signal: AbortSignal.timeout(10000) });
              if (wbRes.ok) {
                const wbData = await wbRes.json();
                if (wbData?.item && !wbData.error && (!wbData.item.error || wbData.item.title)) {
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
            category = itemData.cat_name || itemData.category_name || itemData.rootCatId || category || '数码3C';
            
            if (itemData.pic_url) {
              const p = normalizeImageUrlToStandardJpg(itemData.pic_url);
              if (p && !mainImgs.includes(p)) mainImgs.unshift(p);
            }

            if (Array.isArray(itemData.item_imgs)) {
              itemData.item_imgs.forEach((img: any) => {
                const u = typeof img === 'string' ? img : img.url;
                if (u) {
                  const fullUrl = normalizeImageUrlToStandardJpg(u);
                  if (fullUrl && !mainImgs.includes(fullUrl)) mainImgs.push(fullUrl);
                }
              });
            }

            // 深度提取 100% 全量参数 (Props)
            if (Array.isArray(itemData.props)) {
              itemData.props.forEach((p: any) => {
                if (p && p.name && p.value) {
                  propsDict[p.name.trim()] = p.value.trim();
                }
              });
            }

            if (itemData.props_list && typeof itemData.props_list === 'object') {
              const skuSpecs = Object.values(itemData.props_list).filter(Boolean);
              if (skuSpecs.length) {
                propsDict['可选配置/规格 (SKU)'] = skuSpecs.join(' | ');
              }
            }

            if (itemData.brand && !propsDict['品牌']) {
              propsDict['品牌'] = itemData.brand;
            }
            if (itemData.item_weight && !propsDict['商品毛重']) {
              propsDict['商品毛重'] = itemData.item_weight;
            }

            // 确保所有抓取的图片均已转换为标准 JPG
            mainImgs = mainImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean);
            detailImgs = detailImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean);
            skuImgs = skuImgs.map(normalizeImageUrlToStandardJpg).filter(Boolean);

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

        // 如果 props 依然为空，使用 extractSpecsFromTitle 补底
        if (Object.keys(propsDict).length === 0) {
          propsDict = extractSpecsFromTitle(title);
        }

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
    if (!productWidgetData && isSocialMediaRequest && socialUrlMatch) {
      const rawTargetUrl = socialUrlMatch[0].startsWith('http') ? socialUrlMatch[0] : `https://${socialUrlMatch[0]}`;
      console.log(`[Chat Agent] 识别到外站社媒图集链接解析请求: url=${rawTargetUrl}`);

      try {
        // URL 智能标准化与纯净提取
        let cleanTargetUrl = rawTargetUrl;
        const xhsMatch = rawTargetUrl.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
        if (xhsMatch) {
          cleanTargetUrl = `https://www.xiaohongshu.com/discovery/item/${xhsMatch[1]}`;
        }

        // 尝试多种形式 URL (优先完整原链接包括 token，若失败再试 cleanTargetUrl)
        const urlsToTry = Array.from(new Set([rawTargetUrl, cleanTargetUrl]));
        const scraperSecret = process.env.EXTERNAL_SCRAPER_SECRET || '32843381450B00510784B97CBD53A7CDCD70844F87652F97FE';
        const scraperId = process.env.EXTERNAL_SCRAPER_ID || '202037331';

        for (const candidateUrl of urlsToTry) {
          if (productWidgetData) break;
          try {
            const apiaUrl = `https://apia.vip/api/dsp/${scraperSecret}/${scraperId}/?url=${encodeURIComponent(candidateUrl)}`;
            console.log(`[Chat Agent] 请求社媒 APIA 接口: ${candidateUrl}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

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
                let author = root.author?.nickname || root.user_name || root.nickname || root.author || apiaData.author || '社媒创作者';

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

    formattedMessages.push({
      role: 'system',
      content: finalSystemPrompt
    });

    // 格式化每一条用户与助手消息
    recentMessages.forEach((msg) => {
      if (msg.role === 'assistant') {
        formattedMessages.push({
          role: 'assistant',
          content: msg.content
        });
      } else {
        // 用户消息（可能携带图片、视频关键帧等附件）
        if (!msg.attachments || msg.attachments.length === 0) {
          formattedMessages.push({
            role: 'user',
            content: msg.content
          });
        } else {
          const imgCount = msg.attachments.length;
          const labelPrefix = `【系统提醒：用户本轮共上传了 ${imgCount} 张图片，按顺序依次对应为：${msg.attachments.map((_, i) => `图${i + 1}`).join('、')}。若用户要求进行分镜、买家秀或图文规划，请严格按全部 ${imgCount} 张图分别规划对应数量的 ${imgCount} 组分镜，输出每张分镜的生图提示词代码块，严禁遗漏任何一张】\n\n`;

          const contentArray: any[] = [
            { type: 'text', text: `${labelPrefix}${msg.content || '请分析我上传的图片素材：'}` }
          ];

          msg.attachments.forEach(att => {
            if (att.url) {
              contentArray.push({
                type: 'image_url',
                image_url: { url: att.url }
              });
            }
          });

          formattedMessages.push({
            role: 'user',
            content: contentArray
          });
        }
      }
    });

    // 尝试调用指定模型，若失败按降级链自动重试
    const modelsToTry = [model, ...FALLBACK_MODELS.filter(m => m !== model)];
    let lastError: any = null;

    for (const targetModel of modelsToTry) {
      try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages: formattedMessages,
            temperature: 0.7
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Model [${targetModel}] HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const replyText = data.choices?.[0]?.message?.content || '';

        return NextResponse.json({
          success: true,
          reply: replyText,
          modelUsed: targetModel,
          usage: data.usage || null,
          productWidget: productWidgetData || undefined
        });
      } catch (err: any) {
        lastError = err;
        console.warn(`[Chat API] 调用模型 ${targetModel} 失败，尝试降级:`, err.message);
      }
    }

    throw lastError || new Error('所有视觉与多模态模型均响应异常');
  } catch (error: any) {
    console.error('[Chat API] 异常:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '请求大模型服务异常'
    }, { status: 500 });
  }
}
