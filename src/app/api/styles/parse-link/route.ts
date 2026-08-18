import { NextResponse } from 'next/server';

// 尝试从小红书/抖音各形式链接中提取纯净的 Target URL / ID
function normalizeSocialMediaUrl(rawText: string): { originalUrl: string; cleanUrl: string; noteId?: string } {
  const urlMatch = rawText.match(/https?:\/\/[^\s"'<>]+/i);
  const rawUrl = urlMatch ? urlMatch[0] : rawText;

  let cleanUrl = rawUrl;
  let noteId: string | undefined;

  // 小红书链接特征: /explore/xxx or /discovery/item/xxx
  const xhsMatch = rawUrl.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
  if (xhsMatch) {
    noteId = xhsMatch[1];
    // 标准化为 discovery/item 格式
    cleanUrl = `https://www.xiaohongshu.com/discovery/item/${noteId}`;
  }

  // 抖音链接特征: /video/xxx or /note/xxx
  const dyMatch = rawUrl.match(/douyin\.com\/(?:video|note)\/([0-9]+)/i);
  if (dyMatch) {
    noteId = dyMatch[1];
  }

  return { originalUrl: rawUrl, cleanUrl, noteId };
}

// 深度提取任何可能存放图片、封面或视频的字段
function extractMediaFromData(data: any): { 
  title: string; 
  description: string;
  author: string;
  cover: string; 
  images: string[]; 
  video: string | null 
} {
  if (!data) return { title: '', description: '', author: '', cover: '', images: [], video: null };

  const root = data.data && typeof data.data === 'object' ? data.data : data;

  let rawTitle = root.title || data.title || '';
  let rawDesc = root.desc || root.text || data.desc || data.text || '';
  let author = root.author?.nickname || root.user_name || root.nickname || root.author || data.author || '';

  // 智能拆分标题与正文文案 (处理平台常见的 || 分隔符或长文案)
  let cleanTitle = rawTitle;
  let cleanDesc = rawDesc;

  if (rawTitle.includes('||')) {
    const parts = rawTitle.split('||').map((p: string) => p.trim()).filter(Boolean);
    cleanTitle = parts[0] || '社媒精选爆款素材';
    cleanDesc = parts.slice(1).join('\n\n') || cleanDesc;
  } else if (!cleanTitle && cleanDesc) {
    const lines = cleanDesc.split(/[\n\r]+/);
    cleanTitle = lines[0]?.slice(0, 50) || '社媒精选爆款素材';
    if (lines.length > 1) {
      cleanDesc = lines.slice(1).join('\n');
    }
  }

  // 去除标题前缀冗余符号
  cleanTitle = cleanTitle.replace(/^[📌📱🔴🔥✨\s]+/, '').trim() || '社媒精选爆款素材';

  // 封面
  let cover = root.cover || root.download_image || root.image || root.cover_url || root.video_cover || data.cover || data.download_image || '';
  if (typeof cover === 'object' && cover !== null) {
    cover = cover.url || cover.url_list?.[0] || '';
  }

  // 图集候选列表收集
  const rawList: any[] = [];
  if (Array.isArray(root.images)) rawList.push(...root.images);
  if (Array.isArray(root.pics)) rawList.push(...root.pics);
  if (Array.isArray(root.img_list)) rawList.push(...root.img_list);
  if (Array.isArray(root.live_photos)) rawList.push(...root.live_photos.map((l: any) => l?.image || l));
  if (Array.isArray(root.live)) rawList.push(...root.live.map((l: any) => l?.image || l));

  // 处理 photo 字段 (可能为数组或换行/逗号分隔的字符串)
  if (Array.isArray(root.photo)) {
    rawList.push(...root.photo);
  } else if (typeof root.photo === 'string' && root.photo.trim()) {
    const photoUrls = root.photo.split(/[\n\r,;\s]+/).filter((u: string) => u.startsWith('http') || u.startsWith('//'));
    rawList.push(...photoUrls);
  }

  if (root.download_image) rawList.push(root.download_image);
  if (root.image) rawList.push(root.image);

  // 🌟 严格指纹去重（消除同源不同参数、大小图、重名字段等重复素材）
  const seenFingerprints = new Set<string>();
  const cleanImages: string[] = [];

  for (const item of rawList) {
    if (!item) continue;
    let u = typeof item === 'string' ? item.trim() : (item.url || item.url_list?.[0] || item.download_url || item.pic || item.origin_url || item.image);
    if (!u || typeof u !== 'string') continue;
    if (u.startsWith('//')) u = 'https:' + u;
    if (!u.startsWith('http')) continue;

    // 规范化指纹 Key (去除 query 参数与缩略图变换后缀)
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
      cleanImages.push(u);
    }
  }

  // 视频
  const video = root.video || root.url || root.down || root.download_video || data.video || data.url || data.down || null;
  const videoUrl = typeof video === 'string' && (video.includes('.mp4') || video.includes('video') || video.startsWith('http')) ? video : null;

  return {
    title: cleanTitle,
    description: cleanDesc,
    author: typeof author === 'string' ? author : '',
    cover: typeof cover === 'string' && cover.startsWith('//') ? 'https:' + cover : (cover || cleanImages[0] || ''),
    images: cleanImages,
    video: videoUrl
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, text, link, query, scraperId, customScraperId, scraperSecret, customApiKey } = body;

    const rawInput = (url || text || link || query || '').toString().trim();

    if (!rawInput) {
      return NextResponse.json({ error: '请输入有效的小红书/抖音分享链接或图片网址' }, { status: 400 });
    }

    const rawText = rawInput;

    // 1. 如果用户直接输入了图片直链 (http...jpg/png/webp)
    if (/\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?|!|$)/i.test(rawText) && (rawText.startsWith('http://') || rawText.startsWith('https://'))) {
      return NextResponse.json({
        success: true,
        title: '图片直链素材',
        cover: rawText,
        images: [rawText],
        data: {
          title: '图片直链素材',
          cover: rawText,
          images: [rawText],
          description: '',
          author: '',
          video: null
        }
      });
    }

    // 2. 提取并标准化链接
    const { originalUrl, cleanUrl } = normalizeSocialMediaUrl(rawText);

    const secretKey = scraperSecret || customApiKey || process.env.EXTERNAL_SCRAPER_SECRET || '32843381450B00510784B97CBD53A7CDCD70844F87652F97FE';
    const clientId = scraperId || customScraperId || process.env.EXTERNAL_SCRAPER_ID || '202037331';

    // 尝试候选链接 (优先原始提取链接，若无果再试标准化链接)
    const urlsToTry = Array.from(new Set([originalUrl, cleanUrl])).filter(Boolean);

    let lastErrorMsg = '';

    for (const targetUrl of urlsToTry) {
      try {
        const apiUrl = `https://apia.vip/api/dsp/${secretKey}/${clientId}/?url=${encodeURIComponent(targetUrl)}`;
        console.log(`[ParseLink] 请求解析接口: url=${targetUrl}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;

        const data = await res.json();
        console.log('[ParseLink] 接口响应:', data?.code, data?.msg || data?.title);

        // 检查业务状态码
        if (data.code && data.code !== 200 && data.code !== '200') {
          const errMap: Record<string, string> = {
            '103': '请输入正确的作品链接',
            '104': '该解析接口已暂停使用',
            '110': '解析次数不足，请稍后再试',
            '113': '解析失败，该作品可能为私密或需要登录',
            '114': '作品不存在或链接已失效',
            '155': '接口密钥配置错误'
          };
          lastErrorMsg = errMap[String(data.code)] || data.msg || '作品链接解析异常';
          continue;
        }

        const extracted = extractMediaFromData(data);

        if (extracted.images.length > 0) {
          return NextResponse.json({
            success: true,
            title: extracted.title,
            description: extracted.description,
            author: extracted.author,
            cover: extracted.cover,
            images: extracted.images,
            video: extracted.video,
            data: extracted
          });
        }
      } catch (err: any) {
        console.warn(`[ParseLink] 尝试 ${targetUrl} 异常:`, err.message);
        lastErrorMsg = err.name === 'AbortError' ? '解析网络超时' : err.message;
      }
    }

    // 若 API 均未提取到图集，给出详尽友好的指引
    return NextResponse.json({
      error: lastErrorMsg || '未能提取到该作品的图集。可能原因：链接为私密内容或受平台反爬限制。您可以直接右键复制图片并在弹窗中 Ctrl+V 粘贴，或点击「本地上传」！'
    }, { status: 404 });

  } catch (error: any) {
    console.error('[ParseLink] 全局异常:', error);
    return NextResponse.json({
      error: error.message || '解析遇到未知错误'
    }, { status: 500 });
  }
}
