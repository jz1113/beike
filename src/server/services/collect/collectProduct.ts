import { fetchWithRetry, extractUrls, WanbangHttpError } from '../../gateways/wanbang';
import { productRepository } from '../../repositories/products';
import { buildComprehensiveProductProps } from '@shared/domain/products/props';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { cleanProductImages, productTitleFailure, resolveProductInput, wanbangFailure, type CollectionFailure } from './collectSupport';

const collectResult = (body: Record<string, unknown>, status = 200) => ({ body, status });
export async function collectProduct(body: Record<string, unknown>, apiKey: string, apiSecret: string, signal: AbortSignal = new AbortController().signal) {
  try {
    const input = resolveProductInput(body);
    if (!input.success) return collectResult({ success: false, error: input.error }, 400);
    const { platform, itemId: itemIdStr, forceRefresh } = input;
    signal.throwIfAborted();

    // 本地缓存与新采集使用同样的图片校验，空素材缓存继续请求上游。
    if (!forceRefresh) {
      const cached = await productRepository.findCollected(platform, itemIdStr);
      signal.throwIfAborted();
      if (cached && !productTitleFailure(cached.title || '')) {
        try {
          const stored = cached.detailUrls ? JSON.parse(cached.detailUrls) : {};
          const normalizedMain = cleanProductImages([...(Array.isArray(stored.main) ? stored.main : []), cached.picUrl]);
          const normalizedDetails = cleanProductImages(stored.details);
          const normalizedSkus = cleanProductImages(stored.skus);
          const combined = [...new Set([...normalizedMain, ...normalizedSkus, ...normalizedDetails])];
          if (combined.length) {
            const cover = normalizedMain[0] || combined[0];
            const images = {
              main: normalizedMain, details: normalizedDetails, skus: normalizedSkus,
              props: stored.props || {}, price: stored.price || 0, brand: stored.brand || '', category: stored.category || '全品类',
            };
            return collectResult({
              success: true,
              product: {
                id: cached.id, platform, itemId: itemIdStr, num_iid: itemIdStr, skuId: itemIdStr,
                title: cached.title, price: images.price, brand: images.brand, category: images.category,
                picUrl: cover, coverImage: cover, images: combined, mainImages: normalizedMain,
                detailImages: normalizedDetails, descImages: normalizedDetails, skuImages: normalizedSkus,
                props: images.props, createdAt: cached.createdAt,
              },
              images, apiUsed: '💾 本地数据库已存 (0次扣费/瞬时加载)', fromCache: true,
            });
          }
        } catch {
          console.warn('[Collect] 本地缓存格式无效，将重新采集');
        }
      }
    }
    signal.throwIfAborted();

    if (!apiKey || !apiSecret) {
      return collectResult({
        success: false,
        error: '未配置万邦 (OneBound) 电商数据采集接口凭证。请在「设置 -> 服务接口配置」中填入您的万邦 API Key 和 Secret 后再使用。',
        missingConfig: 'wanbang',
      }, 400);
    }

    // 京东只走 item_get_pro，不进入 item_get、App 或非官方爬虫通道。
    const candidateApis = platform === 'jd' ? ['item_get_pro'] : ['item_get_pro', 'item_get'];
    let item: Record<string, unknown> | undefined;
    let main: string[] = [], details: string[] = [], skus: string[] = [];
    let actualApiUsed = '';
    let lastFailure: CollectionFailure = { error: '万邦接口未返回有效商品数据', status: 502 };
    for (const apiName of candidateApis) {
      signal.throwIfAborted();
      actualApiUsed = `万邦 OneBound 官方专线 (${platform}.${apiName})`;
      // OneBound 接口需要 query 凭证；日志仅记录平台和商品 ID。
      const apiUrl = new URL(`https://api-gw.onebound.cn/${platform}/${apiName}/`);
      apiUrl.searchParams.set('key', apiKey);
      apiUrl.searchParams.set('secret', apiSecret);
      apiUrl.searchParams.set('num_iid', itemIdStr);
      apiUrl.searchParams.set('cache', forceRefresh ? 'no' : 'yes');
      if (platform === 'jd') apiUrl.searchParams.set('domain_type', 'jd');
      else if (platform === 'taobao' || platform === '1688') apiUrl.searchParams.set('is_promotion', '1');
      console.log(`[Collect] 发起万邦接口请求: ${actualApiUsed} (SKU: ${itemIdStr})`);
      try {
        const data = await fetchWithRetry(apiUrl.toString(), apiKey, apiSecret, 1, 10000, signal);
        const candidate = data?.item;
        const code = String(data?.error_code ?? '');
        if (!data || data.error || !candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
            candidate.error || (code && code !== '0000' && code !== '0')) {
          lastFailure = wanbangFailure(data || {});
          if (lastFailure.stop) break;
          continue;
        }
        const titleFailure = productTitleFailure(String(candidate.title || ''));
        if (titleFailure) { lastFailure = titleFailure; break; }
        const candidateMain = cleanProductImages([candidate.pic_url, ...extractUrls(candidate.item_imgs)]);
        const candidateDetails = cleanProductImages(extractUrls(candidate.desc_img, false));
        const candidateSkus = cleanProductImages([
          ...extractUrls(candidate.prop_imgs), ...extractUrls(candidate.props_img), ...extractUrls(candidate.skus),
        ]);
        if (!candidateMain.length && !candidateDetails.length && !candidateSkus.length) {
          lastFailure = wanbangFailure(data);
          continue;
        }
        item = candidate;
        main = candidateMain; details = candidateDetails; skus = candidateSkus;
        break;
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof WanbangHttpError && error.status === 429) {
          lastFailure = { error: '万邦采集接口请求受限，请稍后重试', status: 429, upstreamCode: 429, retryable: false };
          break;
        }
        if (error instanceof WanbangHttpError && [401, 403].includes(error.status)) {
          lastFailure = { error: '万邦接口凭证或权限异常，请检查服务接口配置', status: 400, upstreamCode: error.status, retryable: false };
          break;
        }
        if (error instanceof WanbangHttpError && error.status < 500 && error.status !== 408) {
          lastFailure = { error: '万邦接口地址或请求参数异常，请检查服务接口配置', status: 400, upstreamCode: error.status, retryable: false };
          break;
        }
        const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        lastFailure = { error: timeout ? '万邦采集接口超时，请稍后重试' : '连接万邦采集接口失败，请稍后重试', status: timeout ? 504 : 502 };
        console.warn(`[Collect] ${platform}.${apiName} 请求失败`);
      }
    }
    if (!item) return collectResult({ success: false, ...lastFailure, stop: undefined }, lastFailure.status);
    signal.throwIfAborted();

    const title = String(item.title || `精选商品 (SKU: ${itemIdStr})`);
    const price = parseFloat(String(item.price || item.orginal_price || item.promotion_price || '0')) || 0;
    const category = String(item.cat_name || item.category_name || item.rootCatId || '全品类');
    const brand = String(item.brand || item.nick || '');
    const props = buildComprehensiveProductProps({
      title, brand, category, weight: typeof item.item_weight === 'string' ? item.item_weight : undefined, rawProps: item.props,
      rawPropsList: item.props_list, rawPropsName: item.props_name, rawSkus: item.skus,
    });
    const allImages = { main, details, skus, props, price, brand, category };
    const combined = [...new Set([...main, ...skus, ...details])];
    const picUrl = main[0] || combined[0];
    const dbPayload = { title, picUrl, detailUrls: JSON.stringify(allImages) };
    // 使用已有复合唯一键原子写入，避免同时采集同一商品的创建冲突。
    const product = await productRepository.saveCollected(platform, itemIdStr, dbPayload);
    return collectResult({
      success: true,
      product: {
        id: product.id, platform, itemId: itemIdStr, num_iid: itemIdStr, skuId: itemIdStr,
        title, price, category, brand, picUrl, coverImage: picUrl, images: combined,
        mainImages: main, detailImages: details, descImages: details, skuImages: skus, props,
        createdAt: product.createdAt,
      },
      images: allImages, apiUsed: actualApiUsed,
    });
  } catch (error) {
    if (signal.aborted) return collectResult({ success: false, error: '采集已取消' }, 499);
    console.error('[Collect] 路由异常:', formatUserError(error, '采集遇到未知异常'));
    return collectResult({ success: false, error: formatUserError(error, '采集遇到未知异常') }, 500);
  }
}
