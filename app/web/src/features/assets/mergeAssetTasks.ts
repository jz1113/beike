import { isGenerationDeleted } from '@/store/persist/generation';
import { getAspectRatioFromSize } from '@beike/shared/drawing';
import type { useAppStore } from '@/store/useAppStore';
type AppState = ReturnType<typeof useAppStore.getState>;
interface MergeAssetTaskInput {
  dbTasks: any[];
  generationTasks: AppState['generationTasks'];
  sessions: AppState['sessions'];
  canvasTasks: any[];
  mediaCategory: 'image' | 'video' | 'audio' | 'canvas';
  searchKeyword: string;
  timeFilter: 'all' | 'today' | 'yesterday' | '7days' | '30days';
}
export function mergeAssetTasks({ dbTasks, generationTasks, sessions, canvasTasks, mediaCategory, searchKeyword, timeFilter }: MergeAssetTaskInput) {
    // 0. 建立全量内存任务检索表 (包括当前会话 tasks、全局 generationTasks)
    const memoryTaskMap = new Map<string, any>();
    (generationTasks || []).forEach(t => {
      if (t.id) memoryTaskMap.set(t.id, t);
      if (t.taskId) memoryTaskMap.set(t.taskId, t);
    });

    const sessionMap = new Map<string, { sessionId: string; sessionTitle: string }>();
    (sessions || []).forEach((sess) => {
      sess.tasks?.forEach((st) => {
        const info = { sessionId: sess.id, sessionTitle: sess.title };
        if (st.id) {
          sessionMap.set(st.id, info);
          if (!memoryTaskMap.has(st.id)) memoryTaskMap.set(st.id, st);
        }
        if (st.taskId) {
          sessionMap.set(st.taskId, info);
          if (!memoryTaskMap.has(st.taskId)) memoryTaskMap.set(st.taskId, st);
        }
      });
    });

    // 1. 建立数据库任务快速索引表 (taskId, id, resultUrl)
    const dbByTaskId = new Map<string, any>();
    const dbById = new Map<string, any>();
    const dbByResultUrl = new Map<string, any>();
    dbTasks.forEach(t => {
      if (t.taskId) dbByTaskId.set(t.taskId, t);
      if (t.id) dbById.set(t.id, t);
      if (t.resultUrl) dbByResultUrl.set(t.resultUrl, t);
    });

    // 2. 规范化内存任务（包括进行中的任务 + 刚完成但尚未落库的新任务）
    const memoryMapped: any[] = [];
    Array.from(memoryTaskMap.values()).forEach(t => {
      if (isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId)) return;
      const matchedDb = (t.taskId ? dbByTaskId.get(t.taskId) : null) || 
        dbById.get(t.id) || 
        (t.resultUrl ? dbByResultUrl.get(t.resultUrl) : null);
      
      const isDbSuccess = matchedDb && matchedDb.status === 'SUCCESS' && matchedDb.resultUrl;
      const finalStatus = (t.resultUrl || isDbSuccess || t.status === 'SUCCESS') ? 'SUCCESS' : (t.status || 'IN_PROGRESS');
      const finalResultUrl = t.resultUrl || (isDbSuccess ? matchedDb.resultUrl : undefined);

      // 如果数据库里已经有了成功的此任务，则由 dbMapped 接管，避免重复处理
      if (matchedDb && isDbSuccess && !t.taskId?.startsWith('local_')) {
        return;
      }

      const rawMediaType = String((t as any).mediaType || '');
      const rawModel = String((t as any).model || matchedDb?.model || '').toLowerCase();
      const isTaskVideo =
        rawMediaType === 'video' ||
        rawMediaType === 'depth-video' ||
        rawModel.includes('video') ||
        rawModel.includes('seedance') ||
        rawModel === 'video-depth-anything' ||
        (matchedDb ? (matchedDb.mediaType === 'video' || matchedDb.mediaType === 'depth-video') : false) ||
        (finalResultUrl?.includes('.mp4'));
      const isTaskAudio = rawMediaType === 'audio' || (matchedDb ? matchedDb.mediaType === 'audio' : false) || (finalResultUrl?.includes('.mp3') || finalResultUrl?.includes('.wav'));
      const isTaskDoc = rawMediaType === 'doc' || rawMediaType === 'document' || (matchedDb ? matchedDb.mediaType === 'doc' : false);
      const resolvedMediaType = isTaskVideo ? 'video' : isTaskAudio ? 'audio' : isTaskDoc ? 'doc' : 'image';

      const tAny = t as any;
      const sessInfo = (t.taskId ? sessionMap.get(t.taskId) : null) || (t.id ? sessionMap.get(t.id) : null);
      const resolvedSessionId = t.sessionId || sessInfo?.sessionId;
      const resolvedSessionTitle = t.sessionTitle || sessInfo?.sessionTitle;

      memoryMapped.push({
        id: matchedDb?.id || t.id,
        taskId: t.taskId || matchedDb?.taskId,
        sessionId: resolvedSessionId,
        sessionTitle: resolvedSessionTitle,
        batchId: tAny.batchId,
        prompt: t.prompt,
        resultUrl: finalResultUrl,
        status: finalStatus,
        createdAt: t.createdAt ? (typeof t.createdAt === 'number' ? new Date(t.createdAt).toISOString() : t.createdAt) : new Date().toISOString(),
        model: t.model,
        aspectRatio: tAny.aspectRatio || (tAny.size ? getAspectRatioFromSize(tAny.size) : '1:1'),
        mediaType: resolvedMediaType,
        referenceImages: t.referenceImages || tAny.images || tAny.rawTask?.referenceImages || tAny.rawTask?.images,
        referenceImageUrl: t.referenceImageUrl || tAny.sourceImageUrl || tAny.rawTask?.referenceImageUrl,
        images: t.images || t.referenceImages || tAny.rawTask?.images,
        sourceImageUrl: t.sourceImageUrl || t.referenceImageUrl || tAny.rawTask?.sourceImageUrl,
        useReferenceImage: Boolean(t.referenceImages?.length || t.referenceImageUrl || t.images?.length || t.sourceImageUrl),
        rawTask: t,
        mode: tAny.mode || (tAny.isWorkshop ? 'workshop' : undefined)
      });
    });

    // 3. 规范化数据库任务（严格剔除已持久化删除的记录，并施加内存实时热补丁）
    const dbMapped = dbTasks
      .filter((t) => !isGenerationDeleted(t.id, t.taskId, t.resultUrl, (t as any).dbId))
      .map((t) => {
        // 🌟 实时热补丁：若内存中该任务状态更新（如已变成 SUCCESS），立即覆盖，绝不等待数据库慢轮询！
        const memTask = (t.taskId ? memoryTaskMap.get(t.taskId) : null) || (t.id ? memoryTaskMap.get(t.id) : null);
        const memIsSuccess = memTask && (memTask.status === 'SUCCESS' || Boolean(memTask.resultUrl));
        const effectiveStatus = memIsSuccess ? 'SUCCESS' : (t.status || 'SUCCESS');
        const effectiveResultUrl = memTask?.resultUrl || t.resultUrl;

        const dbRawMediaType = String((t as any).mediaType || memTask?.mediaType || '');
        const dbModel = String((t as any).model || memTask?.model || '').toLowerCase();
        const isVideo =
          dbRawMediaType === 'video' ||
          dbRawMediaType === 'depth-video' ||
          dbModel.includes('video') ||
          dbModel.includes('seedance') ||
          dbModel === 'video-depth-anything' ||
          (effectiveResultUrl && effectiveResultUrl.includes('.mp4'));
        const isAudio = dbRawMediaType === 'audio' || (effectiveResultUrl && (effectiveResultUrl.includes('.mp3') || effectiveResultUrl.includes('.wav')));
        const isDoc = dbRawMediaType === 'doc' || dbRawMediaType === 'document' || (effectiveResultUrl && (effectiveResultUrl.includes('.pdf') || effectiveResultUrl.includes('.docx')));
        const resolvedMediaType = isVideo ? 'video' : isAudio ? 'audio' : isDoc ? 'doc' : 'image';

        const tAny = t as any;
        const sessInfo = (t.taskId ? sessionMap.get(t.taskId) : null) || (t.id ? sessionMap.get(t.id) : null);
        const resolvedSessionId = tAny.sessionId || memTask?.sessionId || sessInfo?.sessionId;
        const resolvedSessionTitle = tAny.sessionTitle || memTask?.sessionTitle || sessInfo?.sessionTitle;

        const refImgs = t.referenceImages || memTask?.referenceImages || tAny.images || memTask?.images || tAny.rawTask?.referenceImages || tAny.rawTask?.images;
        const refImgUrl = t.referenceImageUrl || memTask?.referenceImageUrl || tAny.sourceImageUrl || memTask?.sourceImageUrl || tAny.rawTask?.referenceImageUrl;

        return {
          id: t.id,
          taskId: t.taskId || memTask?.taskId,
          sessionId: resolvedSessionId,
          sessionTitle: resolvedSessionTitle,
          batchId: tAny.batchId || memTask?.batchId,
          prompt: t.prompt || memTask?.prompt,
          resultUrl: effectiveResultUrl,
          status: effectiveStatus,
          createdAt: t.createdAt,
          model: t.model || memTask?.model,
          aspectRatio: t.aspectRatio || memTask?.aspectRatio || (t.size ? getAspectRatioFromSize(t.size) : '1:1'),
          mediaType: resolvedMediaType,
          referenceImages: refImgs,
          referenceImageUrl: refImgUrl,
          images: refImgs || t.images,
          sourceImageUrl: refImgUrl || t.sourceImageUrl,
          useReferenceImage: Boolean((refImgs && refImgs.length > 0) || refImgUrl),
          rawTask: memTask || t,
          mode: t.mode || memTask?.mode || (t.isWorkshop ? 'workshop' : undefined)
        };
      });

    // 4. 按 ID 合并去重（正在生成的任务与内存最新任务优先）
    const map = new Map<string, any>();
    memoryMapped.forEach(t => map.set(t.id, t));
    dbMapped.forEach(t => {
      if (!map.has(t.id)) {
        map.set(t.id, t);
      } else {
        const existing = map.get(t.id);
        if (existing.status !== 'SUCCESS' && t.status === 'SUCCESS') {
          map.set(t.id, t);
        }
      }
    });

    let list = Array.from(map.values());

    // 5. 严格过滤媒体类型 (图片/视频/音频/画布)
    if (mediaCategory === 'canvas') {
      list = canvasTasks;
    } else if (mediaCategory === 'image') {
      list = list.filter(t => t.mediaType === 'image' || t.mediaType === 'depth-image' || (!t.mediaType && !t.resultUrl?.includes('.mp4')));
    } else if (mediaCategory === 'video') {
      list = list.filter(t => t.mediaType === 'video' || t.mediaType === 'depth-video' || t.resultUrl?.includes('.mp4'));
    } else if (mediaCategory === 'audio') {
      list = list.filter(t => t.mediaType === 'audio' || t.resultUrl?.includes('.mp3') || t.resultUrl?.includes('.wav'));
    }

    // 6. 搜索关键词
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      list = list.filter(t => t.prompt?.toLowerCase().includes(kw) || t.title?.toLowerCase().includes(kw));
    }

    // 7. 时间范围过滤 (只保留画圈的时间筛选)
    if (timeFilter !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const yesterdayStart = todayStart - 86400000;

      list = list.filter(t => {
        const time = new Date(t.createdAt).getTime();
        if (timeFilter === 'today') return time >= todayStart;
        if (timeFilter === 'yesterday') return time >= yesterdayStart && time < todayStart;
        if (timeFilter === '7days') return time >= now.getTime() - 7 * 86400000;
        if (timeFilter === '30days') return time >= now.getTime() - 30 * 86400000;
        return true;
      });
    }

    // 8. 排序 (默认最新优先在最前)
    list.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
}
