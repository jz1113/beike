import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatModelPayload, cleanPromptText, normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@/lib/storage';

const DEFAULT_BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const DEFAULT_API_KEY = process.env.AI_DRAWING_API_KEY || 'sk-zPD0Umv6ccqJjGoCZ1HJPpFD1wDqU5g66jsDEsj4K86dtXnZ';

/**
 * 获取请求使用的 Base URL 和 API Key (优先使用客户端自定义配置)
 */
function resolveCredentials(req: NextRequest, body?: any) {
  const customBaseUrl = body?.customBaseUrl || req.headers.get('x-custom-base-url') || req.nextUrl.searchParams.get('customBaseUrl');
  const customApiKey = body?.customApiKey || req.headers.get('x-custom-api-key') || req.nextUrl.searchParams.get('customApiKey');

  const baseUrl = (customBaseUrl && customBaseUrl.trim()) ? customBaseUrl.trim().replace(/\/+$/, '') : DEFAULT_BASE_URL;
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : DEFAULT_API_KEY;

  return { baseUrl, apiKey };
}

/**
 * 远程垫图与防盗链资源安全拉取并转化为 Base64 Data URL
 * 彻底杜绝小红书/抖音等外站 CDN 403 Forbidden 导致下游绘图网关拿不到参考图
 */
async function fetchImageAsSafeDataUrl(rawUrl?: string): Promise<string | undefined> {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const url = normalizeImageUrlToStandardJpg(rawUrl.trim());
  if (url.startsWith('data:image/')) return url;

  if (url.startsWith('http://') || url.startsWith('https://')) {
    const isAntiHotlink = /xiaohongshu\.com|douyinpic\.com|byteoversea\.com|byteimg\.com|alicdn\.com|360buyimg\.com/i.test(url);
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      };
      if (/xiaohongshu\.com/i.test(url)) {
        headers['Referer'] = 'https://www.xiaohongshu.com/';
      } else if (/douyinpic\.com|byteoversea\.com|byteimg\.com/i.test(url)) {
        headers['Referer'] = 'https://www.douyin.com/';
      } else if (/alicdn\.com|taobao\.com/i.test(url)) {
        headers['Referer'] = 'https://www.taobao.com/';
      } else if (/360buyimg\.com|jd\.com/i.test(url)) {
        headers['Referer'] = 'https://www.jd.com/';
      }

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:${contentType};base64,${base64}`;
      }
    } catch (e: any) {
      console.warn(`[AI生图-安全转存] 转换远程垫图为 Data URL 异常 (${url}):`, e.message);
    }
  }
  return url;
}

/**
 * POST /api/generate-image
 * 提交异步生图任务
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      prompt, 
      model = 'gpt-image-2', 
      size = '2448x3264', 
      quality = 'high', 
      productId,
      productImageUrl,
      referenceImageUrl,
      socialReferenceImageUrl,
      referenceImages,
      images,
      anchorFaceImageUrl,
      sceneAnchorImageUrl,
      has_human,
      hasHuman,
      shot_type,
      shotType,
      useReferenceImage = false,
      productTitle
    } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ success: false, error: '提示词不能为空' }, { status: 400 });
    }

    const { baseUrl, apiKey } = resolveCredentials(req, body);
    const cleanedPrompt = cleanPromptText(prompt);
    const finalHasHuman = has_human !== undefined ? has_human : (hasHuman !== undefined ? hasHuman : undefined);
    const finalShotType = shot_type || shotType;
    const payload = formatModelPayload(model, { 
      prompt: cleanedPrompt, 
      size, 
      quality, 
      hasHuman: finalHasHuman, 
      shotType: finalShotType 
    });

    // 🌟 核心权重体系与防人脸污染铁律：
    // 1. 目标商品实物图 (productImageUrl) 具有最高一致性权重，必须作为主垫图，确保生成出的商品 100% 还原真实商品外观！
    // 2. 模特面容图 (anchorFaceImageUrl): 当有人物出镜且绑定了专属人脸时，作为唯一的人脸一致性参考；
    // 3. 场景环境定桩图 (sceneAnchorImageUrl): 首图定景图，作为全套分镜统一桌面环境、机械键盘、鼠标、水杯的一致性基准参考！
    // 4. 🚨 防人脸污染：当存在专属人脸 cleanFaceUrl 时，严禁将含有旧模特人脸的社媒参考图 (cleanSocialRefUrl) 传入生图模型！
    const [targetProductUrl, cleanFaceUrl, cleanSceneAnchorUrl, cleanSocialRefUrl, cleanRefUrl] = await Promise.all([
      fetchImageAsSafeDataUrl(productImageUrl),
      fetchImageAsSafeDataUrl(anchorFaceImageUrl),
      fetchImageAsSafeDataUrl(sceneAnchorImageUrl),
      fetchImageAsSafeDataUrl(socialReferenceImageUrl),
      fetchImageAsSafeDataUrl(referenceImageUrl)
    ]);

    const isHumanShot = finalHasHuman !== false;
    const safeSocialRef = (isHumanShot && cleanFaceUrl) ? undefined : cleanSocialRefUrl;
    const safeRef = (isHumanShot && cleanFaceUrl) ? undefined : cleanRefUrl;

    // 主垫图选择：目标商品图优先 > 面容图 > 纯静物参考图
    const primaryImgUrl = targetProductUrl || cleanFaceUrl || safeRef || safeSocialRef || (Array.isArray(images) ? images[0] : (Array.isArray(referenceImages) ? referenceImages[0] : undefined));

    console.log(`[AI生图-提交] 收到生图请求: 模型=${payload.model}, 尺寸=${payload.size}, 质量=${payload.quality}, 主商品图=${targetProductUrl ? '已绑定' : '无'}, 场景定景=${cleanSceneAnchorUrl ? '已绑定首图环境' : '无'}, 专属人脸=${cleanFaceUrl ? '已锁定唯一正脸' : '无'}, 提示词长度=${payload.prompt.length}`);

    let taskId: string | null = null;
    let usedEndpoint = 'generations';

    // 提交标准文生图/图生图异步任务至 /v1/images/generations?async=true
    console.log(`[AI生图-提交] 正在派发任务至: ${baseUrl}/v1/images/generations?async=true (模型=${payload.model})`);
    const genPayload: any = {
      ...payload
    };
    if (primaryImgUrl && typeof primaryImgUrl === 'string' && primaryImgUrl.trim()) {
      genPayload.image = primaryImgUrl;
      genPayload.image_url = primaryImgUrl;
      genPayload.reference_image = primaryImgUrl;
      genPayload.reference_image_url = primaryImgUrl;
    }
    if (targetProductUrl) {
      genPayload.product_image = targetProductUrl;
      genPayload.product_image_url = targetProductUrl;
    }
    if (cleanFaceUrl) {
      genPayload.face_image = cleanFaceUrl;
      genPayload.face_url = cleanFaceUrl;
      genPayload.anchor_face = cleanFaceUrl;
    }
    if (cleanSceneAnchorUrl) {
      genPayload.scene_image = cleanSceneAnchorUrl;
      genPayload.scene_anchor = cleanSceneAnchorUrl;
      genPayload.environment_anchor_image = cleanSceneAnchorUrl;
    }
    if (safeSocialRef) {
      genPayload.composition_image = safeSocialRef;
      genPayload.composition_url = safeSocialRef;
    }

    // 多参考图适配 (严格保证 [商品主图, 模特人脸, 场景定景底图, 纯静物图] 顺序且目标商品在首位)
    const rawPassedImages = (Array.isArray(images) && images.length > 0)
      ? images
      : (Array.isArray(referenceImages) && referenceImages.length > 0 ? referenceImages : []);

    const safePassedImages = await Promise.all(
      rawPassedImages.map(img => fetchImageAsSafeDataUrl(img))
    );

    // 过滤掉包含旧人脸的参考图
    const filteredPassedImages = safePassedImages.filter(img => {
      if (isHumanShot && cleanFaceUrl) {
        return img !== cleanSocialRefUrl && img !== cleanRefUrl;
      }
      return true;
    });

    // 🌟 确保多参考图首位永远为目标商品实物图 (targetProductUrl)
    const prioritizedImages = targetProductUrl
      ? [targetProductUrl, ...filteredPassedImages.filter(img => img !== targetProductUrl)]
      : filteredPassedImages;

    const allMulti = [
      targetProductUrl,
      cleanFaceUrl,
      cleanSceneAnchorUrl,
      safeSocialRef,
      ...prioritizedImages,
      safeRef
    ]
      .filter(Boolean) as string[];
    const multiImages = (prioritizedImages.length > 0)
      ? Array.from(new Set(prioritizedImages.filter(Boolean) as string[]))
      : Array.from(new Set(allMulti));

    if (multiImages.length > 0) {
      genPayload.images = multiImages;
      genPayload.reference_images = multiImages;
      // 单图字段保持多图首位的主图 (确保为主商品实物)
      genPayload.image = multiImages[0];
      genPayload.image_url = multiImages[0];
      genPayload.reference_image = multiImages[0];
      genPayload.reference_image_url = multiImages[0];
    }

    const genRes = await fetch(`${baseUrl}/v1/images/generations?async=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(genPayload)
    });

    const genData = await genRes.json();
    taskId = genData.task_id || genData.data?.task_id || (typeof genData.data === 'string' ? genData.data : (genData.id || null));
    usedEndpoint = 'generations';

    // 🌟 检查网关是否直接同步返回了出图结果 (如部分模型直出 URL 或 base64)
    let directResultUrl: string = '';
    if (genData.data && Array.isArray(genData.data) && genData.data.length > 0) {
      const firstItem = genData.data[0];
      if (firstItem.url) {
        directResultUrl = firstItem.url;
      } else if (firstItem.b64_json) {
        directResultUrl = `data:image/png;base64,${firstItem.b64_json}`;
      }
    } else if (typeof genData.url === 'string') {
      directResultUrl = genData.url;
    } else if (typeof genData.output === 'string') {
      directResultUrl = genData.output;
    } else if (typeof genData.image_url === 'string') {
      directResultUrl = genData.image_url;
    }

    if (!genRes.ok || (!taskId && !directResultUrl)) {
      const errorMsg = genData.message || genData.error?.message || genData.fail_reason || `HTTP ${genRes.status} 提交失败`;
      console.error(`[AI生图-失败] 绘图模型接口返回错误:`, genData);
      throw new Error(`绘图接口错误: ${errorMsg}`);
    }

    const finalTaskId = taskId || `direct_${Date.now()}`;
    console.log(`[AI生图-成功] 成功分派绘图任务: taskId=${finalTaskId}, 模型=${payload.model}, 直出图=${directResultUrl ? '是' : '否'}`);

    // 3. 安全记录任务到 SQLite 数据库
    let recordId: string | undefined;
    try {
      let validProductId: string | null = null;
      if (productId) {
        const existProduct = await prisma.product.findUnique({ where: { id: productId } }).catch(() => null);
        if (existProduct) {
          validProductId = productId;
        }
      }

      const taskRecord = await prisma.imageTask.create({
        data: {
          productId: validProductId,
          prompt: payload.prompt,
          taskId: finalTaskId,
          model: model || payload.model || 'gpt-image-2',
          mediaType: 'image',
          size: size || payload.size || '2448x3264',
          quality: quality || payload.quality || 'high',
          status: directResultUrl ? 'SUCCESS' : 'IN_PROGRESS',
          resultUrl: directResultUrl || undefined
        }
      });
      recordId = taskRecord.id;
      console.log(`[AI生图-入库] 任务已持久化到数据库 dev.db: recordId=${recordId}`);
    } catch (dbErr: any) {
      console.warn(`[AI生图-入库] 数据库记录非致命告警: ${dbErr.message}`);
    }

    return NextResponse.json({
      success: true,
      taskId: finalTaskId,
      recordId,
      model: payload.model,
      usedEndpoint,
      status: directResultUrl ? 'SUCCESS' : 'IN_PROGRESS',
      resultUrl: directResultUrl || undefined,
      prompt: payload.prompt
    });

  } catch (error: any) {
    console.error('[AI生图] 任务提交发生异常:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '生图任务提交失败'
    }, { status: 500 });
  }
}

/**
 * GET /api/generate-image?taskId={taskId}
 * 查询异步生图任务状态 (多端点高可用智能探测)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId 参数' }, { status: 400 });
    }

    // 若直接为 direct_ 开头的同步已完成任务
    if (taskId.startsWith('direct_')) {
      return NextResponse.json({
        success: true,
        taskId,
        status: 'SUCCESS',
        progress: '100%'
      });
    }

    const { baseUrl, apiKey } = resolveCredentials(req);

    // 🌟 多端点探测机制 (兼容 /v1/images/tasks, /v1/tasks, /v1/images/generations, /v1/query/image_generation 等各厂商网关)
    const queryUrls = [
      `${baseUrl}/v1/images/tasks/${taskId}`,
      `${baseUrl}/v1/tasks/${taskId}`,
      `${baseUrl}/v1/images/generations/${taskId}`,
      `${baseUrl}/v1/images/${taskId}`,
      `${baseUrl}/v1/query/image_generation?task_id=${taskId}`,
      `${baseUrl}/v1/task/${taskId}`
    ];

    let res: Response | null = null;
    let resData: any = null;

    for (const qUrl of queryUrls) {
      try {
        const r = await fetch(qUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(8000)
        });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d && (d.status || d.data?.status || d.data?.url || d.url || d.output || d.data?.data)) {
            res = r;
            resData = d;
            break;
          }
        }
      } catch (err) {}
    }

    if (!res || !res.ok || !resData) {
      console.warn(`[AI生图-轮询] 查询任务 ${taskId} 状态暂未就绪`);
      return NextResponse.json({
        success: true,
        taskId,
        status: 'IN_PROGRESS',
        progress: '25%'
      });
    }

    const taskInfo = resData.data || resData;

    const rawStatus = (taskInfo.status || resData.status || 'PENDING').toUpperCase();
    const progress = taskInfo.progress !== undefined ? `${taskInfo.progress}%` : (resData.progress !== undefined ? `${resData.progress}%` : (rawStatus === 'SUCCESS' || rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' ? '100%' : '50%'));
    const failReason = taskInfo.fail_reason || resData.fail_reason || resData.message || taskInfo.error?.message || taskInfo.error || '';
    
    // 提取结果图片 URL (深度解析全格式)
    let resultUrl = '';
    if (taskInfo.data?.data && Array.isArray(taskInfo.data.data) && taskInfo.data.data.length > 0) {
      const first = taskInfo.data.data[0];
      resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
    } else if (taskInfo.data && Array.isArray(taskInfo.data) && taskInfo.data.length > 0) {
      const first = taskInfo.data[0];
      resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
    } else if (Array.isArray(resData.data) && resData.data.length > 0) {
      const first = resData.data[0];
      resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
    } else if (typeof taskInfo.data?.url === 'string') {
      resultUrl = taskInfo.data.url;
    } else if (typeof taskInfo.url === 'string') {
      resultUrl = taskInfo.url;
    } else if (typeof taskInfo.image_url === 'string') {
      resultUrl = taskInfo.image_url;
    } else if (typeof taskInfo.output === 'string') {
      resultUrl = taskInfo.output;
    } else if (Array.isArray(taskInfo.outputs) && taskInfo.outputs.length > 0 && typeof taskInfo.outputs[0] === 'string') {
      resultUrl = taskInfo.outputs[0];
    } else if (typeof resData.url === 'string') {
      resultUrl = resData.url;
    } else if (typeof resData.output === 'string') {
      resultUrl = resData.output;
    }

    // 状态映射为规范枚举
    let status = 'IN_PROGRESS';
    if ((rawStatus === 'SUCCESS' || rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' || rawStatus === 'FINISHED') && resultUrl) {
      status = 'SUCCESS';
    } else if (rawStatus === 'FAILURE' || rawStatus === 'FAILED' || rawStatus === 'ERROR') {
      status = 'FAILURE';
    } else if (rawStatus === 'NOT_START' || rawStatus === 'PENDING' || rawStatus === 'IN_PROGRESS' || rawStatus === 'RUNNING' || rawStatus === 'QUEUED') {
      status = 'IN_PROGRESS';
    }

    // 任务状态完成时更新数据库记录
    if (status === 'SUCCESS' || status === 'FAILURE') {
      try {
        await prisma.imageTask.updateMany({
          where: { taskId: taskId },
          data: {
            status: status,
            resultUrl: resultUrl || undefined,
            failReason: failReason || undefined
          }
        });

        // 🌟 自动异步转存至永久对象存储 (非阻塞)
        if (status === 'SUCCESS' && resultUrl) {
          const storageConfig = extractStorageConfigFromRequest(req);
          persistMediaUrl(taskId, resultUrl, 'image', storageConfig).catch(() => {});
        }
      } catch (dbErr) {
        // ignore
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      status,
      progress,
      resultUrl,
      failReason
    });

  } catch (error: any) {
    console.error('[AI生图-轮询] 异常:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '查询任务状态失败'
    }, { status: 500 });
  }
}

