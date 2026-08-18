import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleanPromptText } from '@/lib/drawing';
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

function normalizeVideoModelId(model: string): string {
  if (!model) return 'doubao-seedance-2.5';
  const m = model.toLowerCase().trim();

  // 1. MiniMax 海螺 系列 (高优先级精确匹配)
  if (m === 'minimax-h3' || m === 'h3' || m.includes('minimax-h3') || m.includes('h3')) return 'MiniMax-H3';
  if (m.includes('hailuo-02') || m.includes('hailuo-2') || m.includes('hailuo-01')) return 'MiniMax-Hailuo-02';
  if (m.includes('hailuo') || m.includes('minimax') || m.includes('video-01')) return 'MiniMax-Hailuo-2.3';

  // 2. 即梦 / 火山 / Seedance 系列 (严格针对包含 seedance 或 doubao 的模型)
  if (m === 'doubao-seedance-2.5' || m === 'seedance-2.5' || m.includes('seedance-2.5')) return 'doubao-seedance-2.5';
  if (m === 'doubao-seedance-2.0-mini' || m === 'seedance-2.0-mini' || (m.includes('seedance') && m.includes('mini'))) return 'doubao-seedance-2.0-mini';
  if (m.includes('seedance') && m.includes('fast')) return 'doubao-seedance-2-0-fast-260128';
  if (m.includes('seedance') && (m.includes('vip') || m.includes('2.0') || m.includes('2-0'))) return 'doubao-seedance-2-0-260128';
  if (m.includes('seedance') && (m.includes('1.5') || m.includes('1-5') || m.includes('pro'))) return 'doubao-seedance-1-5-pro-251215';

  // 3. Google Veo 系列
  if (m.includes('veo3.1') || m.includes('veo-3.1') || m.includes('veo-3-1')) return 'veo3.1';
  if (m.includes('veo3') || m.includes('veo-3')) return 'veo3';
  if (m.includes('fast-frames') || m.includes('veo2-fast')) return 'veo2-fast-frames';
  if (m.includes('veo2') || m.includes('veo-2') || m.includes('veo')) return 'veo2';

  // 4. OpenAI Sora 2 系列
  if (m.includes('sora-vip') || m.includes('sora-2-vip')) return 'sora-2-vip';
  if (m.includes('sora-pro') || m.includes('sora-2-pro')) return 'sora-2-pro';
  if (m.includes('sora')) return 'sora-2';

  // 5. 快手可灵 Kling 系列
  if (m.includes('kling-omni') || m.includes('omni-video')) return 'kling-omni';
  if (m.includes('kling-v2') || m.includes('kling-2')) return 'kling-v2';
  if (m.includes('kling-v1-5') || m.includes('kling-1.5')) return 'kling-v1-5';
  if (m.includes('kling') || m.includes('keling') || m.includes('t2v-01')) return 'T2V-01';

  // 6. 阿里通义万相 Wan 系列
  if (m.includes('wan2.6-i2v') || m.includes('wan-2.6-i2v')) return 'wan2.6-i2v';
  if (m.includes('wan2.6') || m.includes('wan-2.6')) return 'wan2.6-t2v';
  if (m.includes('wan2.5') || m.includes('wan-2.5')) return 'wan2.5-t2v-preview';
  if (m.includes('wan2.2') || m.includes('s2v')) return 'wan2.2-s2v';
  if (m.includes('wan2.1') || m.includes('wan-2.1')) return 'wan2.1-t2v';
  if (m.includes('wanx') || m.includes('wan')) return 'wan2.6-t2v';

  // 7. Vidu 系列
  if (m.includes('vidu-v2') || m.includes('vidu-2')) return 'vidu-v2';
  if (m.includes('vidu')) return 'vidu-v1';

  // 8. xAI Grok 视频
  if (m.includes('grok')) return 'grok-video';

  return model;
}

/**
 * 根据比例和分辨率计算具体像素宽高
 */
function calculateVideoSize(aspectRatio: string, resolution: string): string {
  const is4K = resolution.toUpperCase().includes('4K') || resolution.toUpperCase().includes('UHD');
  const is1080 = resolution.toUpperCase().includes('1080') || resolution.toUpperCase().includes('FHD');
  const is480 = resolution.toUpperCase().includes('480') || resolution.toUpperCase().includes('SD');
  
  if (aspectRatio === '9:16') {
    if (is4K) return '2160x3840';
    if (is1080) return '1080x1920';
    if (is480) return '480x854';
    return '720x1280';
  }
  if (aspectRatio === '1:1') {
    if (is4K) return '2048x2048';
    if (is1080) return '1440x1440';
    if (is480) return '720x720';
    return '1024x1024';
  }
  if (aspectRatio === '4:3') {
    if (is4K) return '2880x2160';
    if (is1080) return '1440x1080';
    if (is480) return '640x480';
    return '960x720';
  }
  if (aspectRatio === '3:4') {
    if (is4K) return '2160x2880';
    if (is1080) return '1080x1440';
    if (is480) return '480x640';
    return '720x960';
  }
  if (aspectRatio === '21:9') {
    if (is4K) return '3840x1645';
    if (is1080) return '2560x1080';
    if (is480) return '1120x480';
    return '1680x720';
  }
  // 默认 16:9
  if (is4K) return '3840x2160';
  if (is1080) return '1920x1080';
  if (is480) return '854x480';
  return '1280x720';
}

/**
 * POST /api/generate-video
 * 提交异步视频生成任务 (严格对标 /v2/videos/generations 统一标准规范及各厂商扩展字段)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      model = 'doubao-seedance-2.0-mini',
      duration = 5,
      aspect_ratio = '16:9',
      resolution = '720P',
      images = [],
      videos = [],
      watermark = false,
      productId,
      referenceImageUrl,
      first_frame_image,
      last_frame_image,
      ref_mode,
      camera_motion,
      camera_control,
      audio,
      fps,
      seed,
      character,
      character_id,
      storyboard
    } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ success: false, error: '视频提示词不能为空' }, { status: 400 });
    }

    const { baseUrl, apiKey } = resolveCredentials(req, body);
    const cleanedPrompt = cleanPromptText(prompt);
    const normalizedModel = normalizeVideoModelId(model);

    // 整合参考图列表
    const effectiveImages: string[] = Array.isArray(images) ? [...images] : [];
    if (first_frame_image && !effectiveImages.includes(first_frame_image)) {
      effectiveImages.unshift(first_frame_image);
    }
    if (referenceImageUrl && !effectiveImages.includes(referenceImageUrl)) {
      effectiveImages.unshift(referenceImageUrl);
    }
    if (last_frame_image && !effectiveImages.includes(last_frame_image)) {
      effectiveImages.push(last_frame_image);
    }

    const normRatio = aspect_ratio || '16:9';
    const normRes = resolution || '720P';
    const normDuration = Number(duration) || 5;
    const computedSize = calculateVideoSize(normRatio, normRes);

    // 基础视频生成载荷
    const videoPayload: Record<string, any> = {
      model: normalizedModel,
      prompt: cleanedPrompt,
      duration: normDuration,
      seconds: String(normDuration),
      aspect_ratio: normRatio,
      ratio: normRatio,
      resolution: normRes,
      quality: normRes.toLowerCase(), // 兼容 quality
      size: computedSize, // 具体分辨率尺寸 1280x720 / 1920x1080 等
      watermark: Boolean(watermark),
      fps: Number(fps) || 24,
      n: 1
    };

    // MiniMax-H3 官方规范适配
    if (normalizedModel === 'MiniMax-H3') {
      videoPayload.mode = effectiveImages.length > 1 ? 'multimodal-to-video' : (effectiveImages.length === 1 ? 'image-to-video' : 'text-to-video');
      videoPayload.resolution = (normRes === '1080P' || normRes === '4K') ? '2k' : '768P';
      videoPayload.aspect_ratio = effectiveImages.length > 0 ? 'adaptive' : (normRatio || '16:9');
      if (effectiveImages.length > 0) {
        videoPayload.imageUrls = effectiveImages;
      }
    }

    // 镜头控制参数
    if (camera_motion || camera_control) {
      videoPayload.camera_motion = camera_motion || camera_control;
      videoPayload.camera_control = camera_control || camera_motion;
    }

    // 音频同步参数 (Wan / Seedance / Sora)
    if (audio !== undefined) {
      videoPayload.audio = audio;
      videoPayload.generate_audio = Boolean(audio);
    }

    // 随机种子参数
    if (seed !== undefined && seed !== null) {
      videoPayload.seed = Number(seed);
    }

    // 角色客串 / 故事板模式 (Sora2 / Kling / Seedance)
    if (character || character_id) {
      videoPayload.character = character || character_id;
      videoPayload.character_id = character_id || character;
    }
    if (storyboard) {
      videoPayload.storyboard = storyboard;
    }

    // 参考模式字段
    if (ref_mode) {
      videoPayload.ref_mode = ref_mode;
    }

    // 图片输入 (支持文生视频、图生视频、首尾帧与多图/多帧参考)
    if (effectiveImages.length > 0) {
      videoPayload.images = effectiveImages;
      videoPayload.image = effectiveImages[0];
      videoPayload.first_frame_image = first_frame_image || effectiveImages[0];
      videoPayload.image_url = effectiveImages[0];

      // 首尾帧模式支持
      if (last_frame_image || effectiveImages.length >= 2) {
        const lastImg = last_frame_image || effectiveImages[effectiveImages.length - 1];
        videoPayload.last_frame_image = lastImg;
        videoPayload.end_frame_image = lastImg;
      }
    }

    // 视频输入 (视频生视频、动作迁移、视频编辑)
    if (Array.isArray(videos) && videos.length > 0) {
      videoPayload.videos = videos;
      videoPayload.video = videos[0];
      videoPayload.video_url = videos[0];
    }

    console.log(`[AI视频-提交] 收到视频生成请求: 模型=${normalizedModel}, 时长=${normDuration}s, 比例=${normRatio}, 分辨率=${normRes}, 尺寸=${computedSize}, 参考图数=${effectiveImages.length}`);

    // 根据模型系列精准匹配主路由端点 (MiniMax-H3 / Sora2 优先走 /v1/videos)
    const isV1VideosModel = normalizedModel === 'MiniMax-H3' || 
      normalizedModel.toLowerCase().includes('sora') || 
      normalizedModel.toLowerCase().includes('grok');

    const submitUrls: string[] = isV1VideosModel ? [
      `${baseUrl}/v1/videos`,
      `${baseUrl}/v2/videos/generations`,
      `${baseUrl}/v1/videos/generations`,
      `${baseUrl}/v1/video_generation`
    ] : [
      `${baseUrl}/v2/videos/generations`,
      `${baseUrl}/v1/videos`,
      `${baseUrl}/v1/videos/generations`
    ];

    let genRes: Response | null = null;
    let genData: any = null;
    let lastErrorMsg = '';

    for (const submitUrl of submitUrls) {
      console.log(`[AI视频-提交] 正在尝试派发任务至: ${submitUrl}`);
      try {
        const res = await fetch(submitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(videoPayload)
        });

        const data = await res.json().catch(() => null);
        const tId = data?.task_id || data?.data?.task_id || data?.id || (typeof data?.data === 'string' ? data.data : null);

        if (res.ok && tId) {
          genRes = res;
          genData = data;
          break;
        } else {
          lastErrorMsg = data?.message || data?.error?.message || data?.fail_reason || `HTTP ${res.status}`;
          console.warn(`[AI视频-提交] 端点 ${submitUrl} 未被接受: ${lastErrorMsg}`);
        }
      } catch (err: any) {
        console.warn(`[AI视频-提交] 连接 ${submitUrl} 异常: ${err.message}`);
      }
    }

    if (!genRes || !genData) {
      throw new Error(`视频接口错误: ${lastErrorMsg || '网络连接超时或网关拒绝该模型'}`);
    }

    const taskId = genData?.task_id || genData?.data?.task_id || genData?.id || (typeof genData?.data === 'string' ? genData.data : null);

    console.log(`[AI视频-成功] 成功分派视频任务: taskId=${taskId}, 模型=${normalizedModel}`);

    // 记录任务到本地 SQLite 数据库
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
          prompt: cleanedPrompt,
          taskId: taskId,
          model: normalizedModel || model || 'doubao-seedance-2.5',
          mediaType: 'video',
          size: normRatio || computedSize || '16:9',
          quality: normRes || '720P',
          status: 'IN_PROGRESS'
        }
      });
      recordId = taskRecord.id;
    } catch (dbErr: any) {
      console.warn(`[AI视频-入库] 数据库记录非致命告警: ${dbErr.message}`);
    }

    return NextResponse.json({
      success: true,
      taskId,
      recordId,
      model: normalizedModel,
      duration: normDuration,
      aspect_ratio: normRatio,
      resolution: normRes,
      size: computedSize,
      status: 'IN_PROGRESS',
      prompt: cleanedPrompt
    });

  } catch (error: any) {
    console.error('[AI视频] 任务提交发生异常:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '视频生成任务提交失败'
    }, { status: 500 });
  }
}

/**
 * GET /api/generate-video?taskId={taskId}
 * 轮询查询异步视频任务状态 (严格支持 /v1/videos/:id 与 /v2/videos/generations/:id 各类返回载荷)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ success: false, error: '缺少 taskId 参数' }, { status: 400 });
    }

    const { baseUrl, apiKey } = resolveCredentials(req);

    // 多端点状态查询适配 (MiniMax-H3 / Sora2 / Seedance / Wan 统一轮询)
    const queryUrls = [
      `${baseUrl}/v1/videos/${taskId}`,
      `${baseUrl}/v2/videos/generations/${taskId}`,
      `${baseUrl}/v1/videos/generations/${taskId}`,
      `${baseUrl}/v1/videos/tasks/${taskId}`,
      `${baseUrl}/v1/query/video_generation?task_id=${taskId}`
    ];

    let res: Response | null = null;
    let resData: any = null;

    for (const qUrl of queryUrls) {
      try {
        const r = await fetch(qUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d && (d.status || d.data?.status || d.video_url || d.url || d.data?.output || d.output)) {
            res = r;
            resData = d;
            break;
          }
        }
      } catch (err) {}
    }

    if (!res || !res.ok || !resData) {
      console.warn(`[AI视频-轮询] 查询任务 ${taskId} 状态暂未就绪`);
      return NextResponse.json({
        success: true,
        taskId,
        status: 'IN_PROGRESS',
        progress: '15%'
      });
    }

    const taskInfo = resData.data || resData;

    const rawStatus = (taskInfo.status || resData.status || 'PENDING').toUpperCase();
    const progress = taskInfo.progress !== undefined ? `${taskInfo.progress}%` : (resData.progress !== undefined ? `${resData.progress}%` : (rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED' ? '100%' : '35%'));
    const failReason = taskInfo.fail_reason || resData.fail_reason || resData.message || taskInfo.error?.message || taskInfo.error || '';

    // 🌟 全量提取结果视频 URL (覆盖 url / video_url / output / outputs / download_url 等所有格式)
    let resultUrl = '';
    if (typeof taskInfo.video_url === 'string' && taskInfo.video_url.trim()) {
      resultUrl = taskInfo.video_url.trim();
    } else if (typeof taskInfo.url === 'string' && taskInfo.url.trim()) {
      resultUrl = taskInfo.url.trim();
    } else if (typeof taskInfo.output === 'string' && taskInfo.output.trim()) {
      resultUrl = taskInfo.output.trim();
    } else if (Array.isArray(taskInfo.outputs) && taskInfo.outputs.length > 0 && typeof taskInfo.outputs[0] === 'string') {
      resultUrl = taskInfo.outputs[0].trim();
    } else if (typeof taskInfo.data?.video_url === 'string' && taskInfo.data.video_url.trim()) {
      resultUrl = taskInfo.data.video_url.trim();
    } else if (typeof taskInfo.data?.url === 'string' && taskInfo.data.url.trim()) {
      resultUrl = taskInfo.data.url.trim();
    } else if (typeof taskInfo.data?.output === 'string' && taskInfo.data.output.trim()) {
      resultUrl = taskInfo.data.output.trim();
    } else if (Array.isArray(taskInfo.data?.outputs) && taskInfo.data.outputs.length > 0) {
      resultUrl = taskInfo.data.outputs[0].trim();
    } else if (typeof taskInfo.download_url === 'string' && taskInfo.download_url.trim()) {
      resultUrl = taskInfo.download_url.trim();
    } else if (typeof taskInfo.video?.download_url === 'string' && taskInfo.video.download_url.trim()) {
      resultUrl = taskInfo.video.download_url.trim();
    } else if (typeof resData.video_url === 'string' && resData.video_url.trim()) {
      resultUrl = resData.video_url.trim();
    } else if (typeof resData.url === 'string' && resData.url.trim()) {
      resultUrl = resData.url.trim();
    } else if (typeof resData.output === 'string' && resData.output.trim()) {
      resultUrl = resData.output.trim();
    } else if (typeof resData.data?.output === 'string') {
      resultUrl = resData.data.output.trim();
    }

    // 规范化任务状态
    let status = 'IN_PROGRESS';
    if ((rawStatus === 'SUCCESS' || rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED') && resultUrl) {
      status = 'SUCCESS';
    } else if (rawStatus === 'FAILURE' || rawStatus === 'FAILED' || rawStatus === 'ERROR') {
      status = 'FAILURE';
    } else if (rawStatus === 'NOT_START' || rawStatus === 'SUBMITTED' || rawStatus === 'QUEUED' || rawStatus === 'IN_PROGRESS' || rawStatus === 'PENDING' || rawStatus === 'PROCESSING') {
      status = 'IN_PROGRESS';
    }

    // 任务完成时更新数据库记录
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

        // 🌟 自动异步转存视频至永久对象存储 (非阻塞)
        if (status === 'SUCCESS' && resultUrl) {
          const storageConfig = extractStorageConfigFromRequest(req);
          persistMediaUrl(taskId, resultUrl, 'video', storageConfig).catch(() => {});
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
    console.error('[AI视频-轮询] 异常:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '查询视频任务状态失败'
    }, { status: 500 });
  }
}
