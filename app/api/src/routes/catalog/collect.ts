import { jsonResponse } from '../../core/http';
import { prisma } from '@beike/shared/prisma';
import { normalizeImageUrlToStandardJpg, isProductImageUrl } from '@beike/shared/drawing';
import { buildComprehensiveProductProps } from '@beike/shared/props';
import { formatUserError } from '@beike/shared/upstreamErrors';
import { parseJsonBody, collectBodySchema } from '../../core/validate';

// 辅助函数：带智能错误识别和快速失败机制的 fetch（默认最多重试 1 次，超时 7s，快速跳过不存在的商品）
// 安全：API Key/Secret 通过 Authorization header 传递，避免出现在 URL query 中
async function fetchWithRetry(
  url: string,
  apiKey: string,
  apiSecret: string,
  retries = 1,
  timeoutMs = 7000,
): Promise<any> {
  const auth = `key=${encodeURIComponent(apiKey)} secret=${encodeURIComponent(apiSecret)}`;
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Authorization: auth,
        },
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`万邦网关请求失败（HTTP ${res.status}）`);
      }
      const json = await res.json();

      // 1. 永久性错误（商品不存在、已下架、ID无效、缺少Key等）-> 立即返回失败，绝对不浪费时间重试！
      const errMsg = `${json?.error || ''} ${json?.reason || ''} ${json?.error_code || ''}`.toLowerCase();
      const isPermanentError = (
        errMsg.includes('not-found') ||
        errMsg.includes('不存在') ||
        errMsg.includes('下架') ||
        errMsg.includes('invalid') ||
        errMsg.includes('empty') ||
        errMsg.includes('apikey') ||
        json?.error_code === '4000'
      );
      if (isPermanentError) {
        return json; // 秒级直接返回，绝不挂起
      }

      // 2. 临时性网络/网关限流错误（4001 限流、5000 繁忙、2000 超时）-> 允许重试 1 次
      const isTemporaryWbError = json && (
        json.error_code === '4001' || // 访问频率受限 / API Call limit
        json.error_code === '5000' || // 服务商网关繁忙
        json.error_code === '2000'    // 上游数据拉取超时
      );
      if (isTemporaryWbError && i < retries) {
        throw new Error(`万邦网关临时限流/繁忙(${json.reason || json.error_code})`);
      }

      return json;
    } catch (err: any) {
      if (i === retries) throw err;
      console.warn(`[Collect] 第 ${i + 1} 次请求万邦接口抖动(${err.message})，将在 1000ms 后进行最后一次快速重试...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// 通用图片提取器：递归穿透所有万邦可能返回的复杂数组/对象/HTML结构，并彻底去水印大图化
function extractUrls(source: any): string[] {
  const urls: string[] = [];
  if (!source) return urls;

  if (typeof source === 'string') {
    let clean = source.trim();
    if (!clean) return urls;

    // 如果包含 HTML 标签 (例如 desc 或 desc_img 为 HTML 片段)
    if (clean.includes('<img') || clean.includes('&lt;img')) {
      const imgRegex = /<img[^>]+(?:src|data-original|data-src|data-lazyload|data-ks-lazyload)=["']([^"']+)["']/gi;
      let match;
      while ((match = imgRegex.exec(clean)) !== null) {
        const u = match[1]?.trim();
        if (u) {
          const normalized = normalizeImageUrlToStandardJpg(u);
          if (normalized && !urls.includes(normalized)) urls.push(normalized);
        }
      }
      return urls;
    }

    if (clean.startsWith('//')) clean = 'https:' + clean;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      const normalized = normalizeImageUrlToStandardJpg(clean);
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
    }
    return urls;
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const subUrls = extractUrls(item);
      for (const u of subUrls) {
        if (u && !urls.includes(u)) urls.push(u);
      }
    }
    return urls;
  }

  if (typeof source === 'object') {
    // 优先提取直接 url 属性
    if (source.url) {
      const sub = extractUrls(source.url);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.pic_url) {
      const sub = extractUrls(source.pic_url);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    // 提取 item_img、prop_img、sku_img 嵌套
    if (source.item_img) {
      const sub = extractUrls(source.item_img);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.prop_img) {
      const sub = extractUrls(source.prop_img);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }
    if (source.sku) {
      const sub = extractUrls(source.sku);
      for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
    }

    for (const [key, val] of Object.entries(source)) {
      if (!['url', 'pic_url', 'item_img', 'prop_img', 'sku', 'sku_url', 'detail_url'].includes(key)) {
        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('//') || val.includes('<img'))) {
          const sub = extractUrls(val);
          for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
        } else if (typeof val === 'object' && val !== null) {
          const sub = extractUrls(val);
          for (const u of sub) { if (u && !urls.includes(u)) urls.push(u); }
        }
      }
    }
  }

  return urls;
}

export async function POST(req: Request) {
  try {
    const rawBody: unknown = await req.json();
    const parsed = parseJsonBody(rawBody, collectBodySchema);
    if (!parsed.success) {
      return jsonResponse({ success: false, error: parsed.error }, 400);
    }
    const body: any = parsed.data;
    let platform = (body.platform || 'auto').toLowerCase();
    const rawInput = (body.url || body.num_iid || body.itemId || body.id || '').toString().trim();
    const force_refresh = body.force_refresh ?? body.forceRefresh ?? false;

    // 1. 智能平台自动识别
    if (platform === 'auto' || !['jd', 'taobao', 'tmall', '1688', 'pinduoduo'].includes(platform)) {
      if (/jd\.com|360buy/i.test(rawInput)) {
        platform = 'jd';
      } else if (/taobao\.com|tmall\.com/i.test(rawInput)) {
        platform = 'taobao';
      } else if (/1688\.com/i.test(rawInput)) {
        platform = '1688';
      } else if (/yangkeduo\.com|pinduoduo\.com|pdd/i.test(rawInput)) {
        platform = 'pinduoduo';
      } else {
        platform = 'jd'; // 默认回退平台
      }
    }

    // 2. 智能提取数字 SKU / 商品 ID
    let itemIdStr = rawInput;
    const numMatch = 
      rawInput.match(/(?:item\.jd\.com\/|item\.htm\?.*id=|detail\.tmall\.com\/item\.htm\?.*id=|detail\.1688\.com\/offer\/|goods_id=|itemId=|item_id=|\/)(\d+)/i) ||
      rawInput.match(/\b\d{7,16}\b/) ||
      rawInput.match(/\d+/);

    if (numMatch) {
      itemIdStr = numMatch[1] || numMatch[0];
    }

    if (!itemIdStr) {
      return jsonResponse({ error: '请输入有效的商品 ID 或商品详情链接' }, 400);
    }

    // 3. 优先检查本地数据库中是否已存在该商品数据 (避免重复调用接口产生扣费)
    if (!force_refresh) {
      const cachedProduct = await prisma.product.findFirst({
        where: {
          platform,
          itemId: itemIdStr
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (cachedProduct && cachedProduct.detailUrls) {
        try {
          const cachedImages = JSON.parse(cachedProduct.detailUrls);
          const rawMain = Array.isArray(cachedImages.main) ? cachedImages.main : (cachedProduct.picUrl ? [cachedProduct.picUrl] : []);
          const rawDetails = Array.isArray(cachedImages.details) ? cachedImages.details : [];
          const rawSkus = Array.isArray(cachedImages.skus) ? cachedImages.skus : [];

          // 如果数据库缓存包含有效的素材，直接返回并统一标准化为无水印大图
          if (rawSkus.length > 0 || rawDetails.length > 0 || rawMain.length > 0) {
            const normalizedMain = rawMain.map(normalizeImageUrlToStandardJpg).filter(isProductImageUrl);
            const normalizedDetails = rawDetails.map(normalizeImageUrlToStandardJpg).filter(isProductImageUrl);
            const normalizedSkus = rawSkus.map(normalizeImageUrlToStandardJpg).filter(isProductImageUrl);
            const cleanPicUrl = normalizeImageUrlToStandardJpg(cachedProduct.picUrl || '') || normalizedMain[0] || '';

            const combinedAllCached = Array.from(new Set([...normalizedMain, ...normalizedSkus, ...normalizedDetails])).filter(Boolean);
            const cachedReturnProduct = {
              id: cachedProduct.id,
              platform: cachedProduct.platform,
              itemId: itemIdStr,
              num_iid: itemIdStr,
              skuId: itemIdStr,
              title: cachedProduct.title,
              price: cachedImages.price || 0,
              brand: cachedImages.brand || '',
              category: cachedImages.category || '全品类',
              picUrl: cleanPicUrl,
              coverImage: cleanPicUrl,
              images: combinedAllCached,
              mainImages: normalizedMain,
              detailImages: normalizedDetails,
              descImages: normalizedDetails,
              skuImages: normalizedSkus,
              props: cachedImages.props || {},
              createdAt: cachedProduct.createdAt
            };

            return jsonResponse({
              success: true,
              product: cachedReturnProduct,
              images: {
                main: normalizedMain,
                details: normalizedDetails,
                skus: normalizedSkus,
                props: cachedImages.props || {},
                price: cachedImages.price || 0,
                brand: cachedImages.brand || '',
                category: cachedImages.category || '全品类'
              },
              apiUsed: '💾 本地数据库已存 (0次扣费/瞬时加载)',
              fromCache: true
            });
          }
        } catch (parseErr) {
          console.warn('[Collect] 解析数据库缓存失败，将重新采集:', parseErr);
        }
      }
    }

    let title = '';
    let picUrl = '';
    let priceNum = 0;
    let categoryStr = '全品类';
    let brandStr = '';
    let itemImgs: string[] = [];
    const descImgs: string[] = [];
    let skuImgs: string[] = [];
    let actualApiUsed = `万邦 OneBound 官方接口 (${platform.toUpperCase()})`;
    let propsDict: Record<string, string> = {};

    // 4.1 🌟 全网调用万邦 (OneBound) 官方开放接口（京东仅走 item_get_pro 专线）
    // ⚠️ 安全（PR1-fix/security）：密钥不再从请求体读取，避免凭证随日志/Referer/浏览器历史泄露。
    // 优先级：x-wanbang-key / x-wanbang-secret header > 环境变量。
    const apiKey = (
      req.headers.get('x-wanbang-key') ||
      process.env.WANBANG_API_KEY ||
      ''
    ).trim();
    const apiSecret = (
      req.headers.get('x-wanbang-secret') ||
      process.env.WANBANG_API_SECRET ||
      ''
    ).trim();

    if (!apiKey || !apiSecret) {
      return jsonResponse({
        error: '未配置万邦 (OneBound) 电商数据采集接口凭证。请在「设置 -> 服务接口配置」中填入您的万邦 API Key 和 Secret 后再使用。',
        missingConfig: 'wanbang'
      }, 400);
    }

    // 京东只走 item_get_pro，绝不走 item_get、app 口及非官方爬虫通道
    const candidateApis = platform === 'jd'
      ? ['item_get_pro']
      : ['item_get_pro', 'item_get'];

    let wanbangData: any = null;

    for (const apiName of candidateApis) {
      try {
        actualApiUsed = `万邦 OneBound 官方专线 (${platform}.${apiName})`;
        // ⚠️ 安全：密钥不再从请求体读取，仅接受 header 或服务端环境变量，
        // 避免凭证随请求体进入日志/Referer/浏览器历史记录。
        let apiUrl = `https://api-gw.onebound.cn/${platform}/${apiName}/?key=${encodeURIComponent(apiKey)}&secret=${encodeURIComponent(apiSecret)}&num_iid=${encodeURIComponent(itemIdStr)}&cache=yes`;

        if (platform === 'jd') {
          apiUrl += '&domain_type=jd';
        } else if (platform === 'taobao' || platform === '1688') {
          apiUrl += '&is_promotion=1';
        }

        // 日志脱敏：仅打印路径 + SKU，绝不打印 query 中的 key/secret
        const logSafeUrl = `https://api-gw.onebound.cn/${platform}/${apiName}/?num_iid=${encodeURIComponent(itemIdStr)}`;
        console.log(`[Collect] 发起万邦接口请求: ${actualApiUsed} (SKU: ${itemIdStr})`);
        console.log(`[Collect] 实际请求路径(脱敏): ${logSafeUrl}`);
        const data = await fetchWithRetry(apiUrl, apiKey, apiSecret, 1, 10000);

        if (data && !data.error && data.item && (!data.error_code || data.error_code === '0000') && !data.item.error) {
          wanbangData = data;
          break;
        } else if (data?.reason || data?.error) {
          console.warn(`[Collect] 万邦接口返回提示:`, data.reason || data.error);
        }
      } catch (err: any) {
        console.warn(`[Collect] ${actualApiUsed} 请求异常:`, err.message);
      }
    }

    if (wanbangData && wanbangData.item) {
      const item = wanbangData.item;
      title = item.title || `精选商品 (SKU: ${itemIdStr})`;
      priceNum = parseFloat(item.price || item.orginal_price || item.promotion_price || '0') || 0;
      categoryStr = item.cat_name || item.category_name || item.rootCatId || '全品类';
      brandStr = item.brand || item.nick || '';
      picUrl = item.pic_url || '';
      if (picUrl && picUrl.startsWith('//')) picUrl = 'https:' + picUrl;

      // 提取主图
      itemImgs = extractUrls(item.item_imgs);
      if (picUrl) {
        const cleanPic = normalizeImageUrlToStandardJpg(picUrl);
        if (cleanPic && !itemImgs.includes(cleanPic)) itemImgs.unshift(cleanPic);
      }

      // 提取详情图 (仅收录万邦结构化 desc_img 数组，杜绝 HTML 营销切片)
      if (Array.isArray(item.desc_img)) {
        descImgs.push(...extractUrls(item.desc_img));
      }

      // 提取 SKU 规格图
      skuImgs = [
        ...extractUrls(item.prop_imgs),
        ...extractUrls(item.props_img),
        ...extractUrls(item.skus)
      ];

      // 提取商品参数与规格 (调用全能规格解析引擎)
      propsDict = buildComprehensiveProductProps({
        title,
        brand: brandStr,
        category: categoryStr,
        weight: item.item_weight,
        rawProps: item.props,
        rawPropsList: item.props_list,
        rawPropsName: item.props_name,
        rawSkus: item.skus
      });
    }

    // 4.2 终极校验：如果未获取到有效商品数据，立即返回明确的失败提示（绝不写入数据库）
    if (!title && itemImgs.length === 0) {
      return jsonResponse({
        error: `未能获取到 ${platform.toUpperCase()} 商品 (${itemIdStr}) 的有效数据，请检查链接或 SKU 是否正确（万邦 Pro 接口未返回）`,
        status: 404
      }, 404);
    }

    // 拦截频控与风控提示（严禁将上游报错当成商品写入数据库）
    if (/请求次数频繁|请勿使用盗版|操作过于频繁|请稍后再试|验证码|安全验证|风控拦截/i.test(title)) {
      return jsonResponse({
        error: `小红书解析接口触发上游频控/风控拦截（提示：${title}），请降低采集并发或稍后再试`,
        status: 429
      }, 429);
    }

    const dedupe = (arr: string[]) => Array.from(new Set(arr.map(normalizeImageUrlToStandardJpg).filter(Boolean)));

    const cleanMain = dedupe(itemImgs);
    const cleanDetails = dedupe(descImgs);
    const cleanSkus = dedupe(skuImgs);
    picUrl = normalizeImageUrlToStandardJpg(picUrl) || cleanMain[0] || '';

    const allImages = {
      main: cleanMain,
      details: cleanDetails,
      skus: cleanSkus,
      props: propsDict,
      price: priceNum,
      brand: brandStr,
      category: categoryStr
    };

    if (allImages.main.length === 0 && picUrl) {
      allImages.main = [picUrl];
    }

    // 保存到本地数据库
    const primarySelectedImg = picUrl || allImages.main[0] || '';
    const existing = await prisma.product.findFirst({
      where: { platform, itemId: itemIdStr }
    });

    const dbPayload = {
      title,
      picUrl: primarySelectedImg,
      detailUrls: JSON.stringify({
        main: allImages.main,
        details: allImages.details,
        skus: allImages.skus,
        props: propsDict,
        price: priceNum,
        brand: brandStr,
        category: categoryStr
      })
    };

    let product;
    if (existing) {
      product = await prisma.product.update({
        where: { id: existing.id },
        data: dbPayload
      });
    } else {
      product = await prisma.product.create({
        data: {
          platform,
          itemId: itemIdStr,
          ...dbPayload
        }
      });
    }

    // 格式化输出完整的商品对象，确保包含所有前端所需的数组与元数据 (100% 字段兼容)
    const combinedAllFresh = Array.from(new Set([...allImages.main, ...allImages.skus, ...allImages.details])).filter(Boolean);
    const normalizedProduct = {
      id: product.id,
      platform: product.platform,
      itemId: product.itemId || itemIdStr,
      num_iid: product.itemId || itemIdStr,
      skuId: product.itemId || itemIdStr,
      title: product.title || title,
      price: priceNum,
      category: categoryStr,
      brand: brandStr,
      picUrl: product.picUrl || allImages.main[0] || '',
      coverImage: product.picUrl || allImages.main[0] || '',
      images: combinedAllFresh,
      mainImages: allImages.main,
      detailImages: allImages.details,
      descImages: allImages.details,
      skuImages: allImages.skus,
      props: propsDict,
      createdAt: product.createdAt
    };

    return jsonResponse({
      success: true,
      product: normalizedProduct,
      images: allImages,
      apiUsed: actualApiUsed
    });
  } catch (error: any) {
    console.error('[Collect] 路由致命异常:', error);
    return jsonResponse({ error: formatUserError(error, '采集遇到未知异常') }, 500);
  }
}
