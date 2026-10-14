import { useState, useMemo } from 'react';
import { Film, MessageSquare } from 'lucide-react';
import { useAppStore, type ChatSession, type GenerationTask } from '@client/store';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

/** 校验是否为合法有效的图片/视频媒体地址 */
function isValidMediaUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed === '-' || trimmed.includes('[stripped]')) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  );
}

/** 会话缩略图：精准对齐 3:4 竖向封面海报与消息卡片，严格会话隔离 */
export function GenerateSessionThumbnail({ sess }: {
  sess: ChatSession;
  isSelected: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const globalTasks = useAppStore((s) => s.generationTasks);

  // 🌟 严格按会话隔离：仅展示属于该会话自身任务的最新媒体，绝不被其他会话的全局任务污染
  const { mediaUrl, isVideo } = useMemo(() => {
    const rawTasks = sess.tasks || [];
    if (rawTasks.length === 0) {
      return { mediaUrl: null, isVideo: false };
    }

    // 1. 构建全局任务 Map，仅用于按唯一任务 ID 同步本会话任务的最新轮询/出图状态
    const globalMap = new Map<string, GenerationTask>();
    if (globalTasks && globalTasks.length > 0) {
      for (const gt of globalTasks) {
        const key = gt.id || gt.taskId;
        if (key) globalMap.set(key, gt);
      }
    }

    // 2. 合并最新任务状态，并按创建时间倒序排序（最新任务优先）
    const mergedTasks = rawTasks
      .map((t) => {
        const key = t.id || t.taskId;
        if (key && globalMap.has(key)) {
          return { ...t, ...globalMap.get(key) };
        }
        return t;
      })
      .sort((a, b) => {
        const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
        const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
        return tB - tA;
      });

    // 3. 优先级 1：优先寻找该会话最新成功出图的任务成果
    const successTask = mergedTasks.find(
      (t) => Boolean(t.resultUrl && isValidMediaUrl(t.resultUrl)) && (t.status === 'SUCCESS' || t.resultUrl?.startsWith('http') || t.resultUrl?.startsWith('data:') || t.resultUrl?.startsWith('/'))
    );

    // 4. 优先级 2：若会话尚未成功出图，寻找最新任务中的输入参考图/素材图
    const refTask = mergedTasks.find(
      (t) =>
        Boolean(t.referenceImageUrl && isValidMediaUrl(t.referenceImageUrl)) ||
        (Array.isArray(t.referenceImages) && t.referenceImages.some(isValidMediaUrl)) ||
        (Array.isArray(t.images) && t.images.some(isValidMediaUrl)) ||
        Boolean(t.productImageUrl && isValidMediaUrl(t.productImageUrl))
    );

    const targetTask = successTask || refTask;
    const rawUrl =
      successTask?.resultUrl ||
      refTask?.referenceImageUrl ||
      refTask?.referenceImages?.find(isValidMediaUrl) ||
      refTask?.images?.find(isValidMediaUrl) ||
      refTask?.productImageUrl;

    if (!rawUrl || !isValidMediaUrl(rawUrl)) {
      return { mediaUrl: null, isVideo: false };
    }

    const isVid = Boolean(
      rawUrl.endsWith('.mp4') ||
        rawUrl.includes('.mp4') ||
        rawUrl.includes('video') ||
        targetTask?.mediaType === 'video' ||
        targetTask?.mediaType === 'depth-video' ||
        targetTask?.model?.toLowerCase().includes('seedance') ||
        targetTask?.model?.toLowerCase().includes('veo') ||
        targetTask?.model?.toLowerCase().includes('kling')
    );

    return { mediaUrl: rawUrl, isVideo: isVid };
  }, [sess.tasks, globalTasks]);

  // 🌟 1. 有图片或视频媒体：展示图 2 原版 1:1 正方形圆角卡片封面
  if (mediaUrl && !imgError) {
    const safeUrl = proxyMediaUrl(mediaUrl);

    if (isVideo) {
      return (
        <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200/90 shadow-2xs bg-slate-900 flex items-center justify-center">
          <video
            src={safeUrl}
            muted
            playsInline
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
            <Film className="w-4 h-4 text-white/95" />
          </div>
          {sess.isPinned && <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-amber-500 rounded-bl-sm z-10" />}
        </div>
      );
    }

    return (
      <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200/90 shadow-2xs bg-slate-100">
        <img
          src={safeUrl}
          alt="封面"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        {sess.isPinned && <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-amber-500 rounded-bl-sm z-10" />}
      </div>
    );
  }

  // 🌟 2. 无图片/草稿对话：透明背景无边框，居中气泡图标
  return (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      <MessageSquare className="h-5 w-5 stroke-[1.8] text-slate-400" />
      {sess.isPinned && <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500 z-10" />}
    </div>
  );
}

export default GenerateSessionThumbnail;

