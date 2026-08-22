import { jsonResponse } from '../../adapters/http';
import { prisma } from '@/lib/prisma';
import { normalizeImageUrlToStandardJpg, isProductImageUrl } from '@/lib/drawing';
import { buildComprehensiveProductProps } from '@/lib/props';
import { formatUserError } from '../../lib/formatApiError';

// 🌟 京东官方原生高保真备用解析器 (仅当万邦接口未命中时作为备用，严格提取真实正品大图，杜绝 UI 角标)
async function fetchJdDirect(skuId: string): Promise<any> {
  try {
    const res = await fetch(`https://item.m.jd.com/product/${skuId}.html`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://item.m.jd.com/'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const html = await res.text();

    let itemData: any = null;

    // 优先采用正则安全提取 _itemOnly JSON 数据
    const jsonMatch = html.match(/window\._itemOnly\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:window\.|<\/script>)/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        itemData = parsed?.item || parsed;
      } catch {}
    }

    if (!itemData) {
      const startIdx = html.indexOf('window._itemOnly');
      if (startIdx !== -1) {
        const rawCode = html.slice(startIdx);
        const assignMatch = rawCode.match(/window\._itemOnly\s*=\s*(\{[\s\S]*)$/);
        const blob = assignMatch?.[1] || '';
        const end = blob.search(/\n\s*window\./);
        const jsonCandidate = (end > 0 ? blob.slice(0, end) : blob).replace(/;\s*$/, '').trim();
        try {
          const parsed = JSON.parse(jsonCandidate);
          itemData = parsed?.item || parsed;
        } catch {
          /* 放弃不可信脚本执行 */
        }
      }
    }

    // 提取真实标题
    let title = itemData?.skuName || itemData?.name;
    if (!title) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].replace(/【图片 价格 品牌 评论】-京东/g, '').replace(/-京东/g, '').trim();
      }
    }

    if (!title && !itemData) return null;

    const brand = itemData?.brandName || '';
    const mainImages: string[] = [];

    // 提取真实主图 (全量 360buyimg /pcpubliccms/s1440x1440_ 无水印原图母版)
    if (Array.isArray(itemData?.image)) {
      for (const img of itemData.image) {
        if (!img || typeof img !== 'string') continue;
        const clean = normalizeImageUrlToStandardJpg(img);
        if (clean && isProductImageUrl(clean) && !mainImages.includes(clean)) {
          mainImages.push(clean);
        }
      }
    }

    const detailImages: string[] = [];
    const skuImages: string[] = [];

    // 🌟 按真实【颜色/款式分类】去重提取，每种颜色/款式仅保留 1 张最高清实物图，彻底杜绝套餐规格重复图
    const colorSeen = new Set<string>();
    if (Array.isArray(itemData?.newColorSize)) {
      for (const c of itemData.newColorSize) {
        const colorName = (c.color || c['1'] || '').trim();
        const imgPath = c.imagePath;
        if (imgPath && typeof imgPath === 'string') {
          const dedupeKey = colorName || imgPath.split('/').pop() || imgPath;
          if (!colorSeen.has(dedupeKey)) {
            colorSeen.add(dedupeKey);
            const clean = normalizeImageUrlToStandardJpg(imgPath);
            if (clean && isProductImageUrl(clean) && !skuImages.includes(clean) && !mainImages.includes(clean)) {
              skuImages.push(clean);
            }
          }
        }
      }
    }

    const props = buildComprehensiveProductProps({
      title: title || `京东官方商品 (SKU: ${skuId})`,
      brand,
      category: '京东数码 / 正品好物',
      saleProp: itemData?.saleProp,
      salePropSeq: itemData?.salePropSeq
    });

    return {
      title: title || `京东官方商品 (SKU: ${skuId})`,
      brand,
      category: '京东数码 / 正品好物',
      price: 0,
      picUrl: mainImages[0] || '',
      mainImages: mainImages,
      detailImages: detailImages,
      skuImages: skuImages,
      props
    };
  } catch (err: any) {
    console.warn('[JD Direct] 原生备用解析发生异常:', err.message);
    return null;
  }
}

// 辅助函数：带超时和重试的 fetch
async function fetchWithRetry(url: string, retries = 1, timeoutMs = 12000): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        throw new Error(`服务请求失败（HTTP ${res.status}）`);
      }
      return await res.json();
    } catch (err: any) {
      if (i === retries) throw err;
      console.warn(`第 ${i + 1} 次请求万邦接口失败，正在重试...`, err.message);
      await new Promise(resolve => setTimeout(resolve, 600));
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
    const body = await req.json();
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
    let descImgs: string[] = [];
    let skuImgs: string[] = [];
    let actualApiUsed = `万邦 OneBound 官方接口 (${platform.toUpperCase()})`;
    let propsDict: Record<string, string> = {};

    // 4.1 🌟 第一优先级：全网调用万邦 (OneBound) 官方开放接口
    const apiKey = body.customWanbangKey || body.wanbangKey || process.env.WANBANG_API_KEY || '';
    const apiSecret = body.customWanbangSecret || body.wanbangSecret || process.env.WANBANG_API_SECRET || '';

    const candidateApis = platform === 'jd' 
      ? ['item_get_pro', 'item_get', 'item_get_app']
      : ['item_get', 'item_get_pro', 'item_get_app'];

    let wanbangData: any = null;

    for (const apiName of candidateApis) {
      try {
        actualApiUsed = `万邦 OneBound 官方接口 (${platform}.${apiName})`;
        let apiUrl = `https://api-gw.onebound.cn/${platform}/${apiName}/?key=${apiKey}&secret=${apiSecret}&num_iid=${itemIdStr}&cache=yes`;
        
        if (platform === 'jd') {
          apiUrl += '&domain_type=jd';
        } else if (platform === 'taobao' || platform === '1688') {
          apiUrl += '&is_promotion=1';
        }

        console.log(`[Collect] 发起万邦接口请求: ${actualApiUsed} (SKU: ${itemIdStr})`);
        const data = await fetchWithRetry(apiUrl, 1, 8000);

        if (data && !data.error && data.item && (!data.error_code || data.error_code === '0000') && !data.item.error) {
          wanbangData = data;
          break;
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

    // 4.2 🌟 第二优先级（京东专属备用通道）：若万邦接口未命中/触发限制，调用 JD 原生解析
    if ((!title || itemImgs.length === 0) && platform === 'jd') {
      const jdDirectData = await fetchJdDirect(itemIdStr);
      if (jdDirectData && (jdDirectData.mainImages.length > 0 || jdDirectData.title)) {
        console.log(`[Collect] JD 官方原生通道备用解析成功: ${jdDirectData.title}`);
        title = jdDirectData.title;
        brandStr = jdDirectData.brand || '京东官方正品';
        categoryStr = jdDirectData.category || '数码家电 / 品质好物';
        priceNum = jdDirectData.price || 0;
        picUrl = jdDirectData.picUrl;
        itemImgs = jdDirectData.mainImages || [];
        descImgs = jdDirectData.detailImages || [];
        skuImgs = jdDirectData.skuImages || [];
        Object.assign(propsDict, jdDirectData.props || {});
        actualApiUsed = `JD 官方原生极速通道 (SKU: ${itemIdStr})`;
      }
    }

    // 4.3 终极校验：如果仍未获取到有效商品数据，返回明确的错误提示（严禁混入主页插画壁纸）
    if (!title && itemImgs.length === 0) {
      return jsonResponse({
        error: `未能获取到 ${platform.toUpperCase()} 商品 (${itemIdStr}) 的详情数据，请检查链接或 SKU 是否有效`,
        status: 404
      }, 404);
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
