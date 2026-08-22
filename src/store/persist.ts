import type { ShotPrompt, PreviousGroupSignature } from '@/lib/vision';
import type { OriginalLookParts } from '@/lib/drawing';
import type { ProductImage } from '@/types';
import type {
  AssistantMessage,
  AssistantSession,
  ChatSession,
  GenerationTask,
  MediaAttachment,
} from '@/types/app-store';
import { isProjectAutosaveEnabled } from '@/lib/localStoragePrefs';

function sanitizeAssistantAttachment(a: MediaAttachment): MediaAttachment {
  /** 大体积 dataURL 一律不落盘；仅保留 http(s)/同源路径/短 thumbnail */
  const persistableUrl = (u?: string) => {
    if (!u || typeof u !== 'string') return undefined;
    if (u.startsWith('data:')) return undefined;
    if (u.startsWith('blob:')) return undefined;
    return u;
  };
  if (a.type === 'document') {
    const text = typeof a.extractedText === 'string' ? a.extractedText.slice(0, 80000) : undefined;
    return {
      type: 'document',
      name: a.name,
      size: a.size,
      mime: a.mime,
      extractedText: text,
      url: '',
      thumbnailUrl: undefined,
    };
  }
  const url = persistableUrl(a.url);
  const thumb = persistableUrl(a.thumbnailUrl);
  // 视频：允许仅有远程 URL；本地上传仅保留短 JPEG 封面（若曾抽帧且非 data 则已在上面过滤）
  // 图片：无持久化 URL 则丢弃（filter 阶段）
  return {
    ...a,
    url: url || '',
    thumbnailUrl: thumb,
  };
}

export function sanitizeAssistantSessions(sessions: AssistantSession[]): AssistantSession[] {
  return (sessions || []).slice(0, 30).map((s) => ({
    ...s,
    messages: (s.messages || []).slice(-80).map((m) => ({
      ...m,
      attachments: m.attachments
        ?.map(sanitizeAssistantAttachment)
        .filter((a) =>
          (a.type === 'document' && Boolean(a.extractedText))
          || (a.type === 'video' && Boolean(a.url || a.thumbnailUrl))
          || (a.type === 'image' && Boolean(a.url))
        ),
    })),
  }));
}

let assistantPersistTimer: ReturnType<typeof setTimeout> | null = null;

/** 已删除会话 id，防止 hydrate 从远端/旧缓存复活 */
export const assistantDeletedIds = new Set<string>();
const ASSISTANT_TOMBSTONE_KEY = 'ai_assistant_deleted_ids';

export function loadAssistantTombstones() {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(ASSISTANT_TOMBSTONE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) arr.forEach((id: string) => id && assistantDeletedIds.add(id));
  } catch {}
}

function persistAssistantTombstones() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ASSISTANT_TOMBSTONE_KEY, JSON.stringify(Array.from(assistantDeletedIds).slice(-80)));
  } catch {}
}

export function markAssistantSessionDeleted(id: string) {
  assistantDeletedIds.add(id);
  persistAssistantTombstones();
}

/** 已删除生成记录 key，防止 hydrate / refetch 从 DB 或缓存复活 */
export const generationDeletedKeys = new Set<string>();
const GENERATION_TOMBSTONE_KEY = 'drawing_deleted_keys';

export function isGenerationDeleted(
  id?: string | null,
  taskId?: string | null,
  resultUrl?: string | null,
  dbId?: string | null,
): boolean {
  return [id, taskId, resultUrl, dbId].some((k) => k && generationDeletedKeys.has(k));
}

export function loadGenerationTombstones() {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(GENERATION_TOMBSTONE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) arr.forEach((k: string) => k && generationDeletedKeys.add(k));
  } catch {}
}

function persistGenerationTombstones() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      GENERATION_TOMBSTONE_KEY,
      JSON.stringify(Array.from(generationDeletedKeys).slice(-200)),
    );
  } catch {}
}

export function markGenerationDeleted(ids: string[], urls?: string[]) {
  (ids || []).filter(Boolean).forEach((k) => generationDeletedKeys.add(k));
  (urls || []).filter(Boolean).forEach((k) => generationDeletedKeys.add(k));
  persistGenerationTombstones();
}

export function clearAssistantPersistTimer() {
  if (assistantPersistTimer) {
    clearTimeout(assistantPersistTimer);
    assistantPersistTimer = null;
  }
}

export function writeAssistantLocalCache(
  sessions: AssistantSession[],
  currentId?: string,
  opts?: { force?: boolean }
) {
  if (typeof window === 'undefined') return;
  if (!isProjectAutosaveEnabled() && !opts?.force) return;
  const lightweight = sanitizeAssistantSessions(sessions);
  // 禁止用「仅空新对话」覆盖已有非空缓存（删除场景可 force 绕过）
  const onlyEmpty =
    lightweight.length === 1 &&
    lightweight[0].title === '新对话' &&
    (!lightweight[0].messages || lightweight[0].messages.length === 0);
  if (onlyEmpty && !opts?.force) {
    try {
      const existing = localStorage.getItem('ai_assistant_sessions');
      if (existing) {
        const parsed = JSON.parse(existing);
        if (Array.isArray(parsed) && parsed.some((s: any) => Array.isArray(s.messages) && s.messages.length > 0)) {
          return;
        }
      }
    } catch {}
  }
  try {
    localStorage.setItem('ai_assistant_sessions', JSON.stringify(lightweight));
    if (currentId) localStorage.setItem('ai_assistant_current_session_id', currentId);
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      try {
        const tiny = lightweight.slice(0, 5).map((s) => ({
          ...s,
          messages: (s.messages || []).slice(-20).map((m) => ({
            ...m,
            attachments: undefined,
          })),
        }));
        localStorage.setItem('ai_assistant_sessions', JSON.stringify(tiny));
      } catch {}
    }
  }
}

async function syncAssistantToServer(sessions: AssistantSession[], currentId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const { apiFetch } = await import('@/lib/apiClient');
    const lightweight = sanitizeAssistantSessions(sessions).filter((s) => !assistantDeletedIds.has(s.id));
    await apiFetch('/api/assistant/sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions: lightweight, currentId }),
    });
  } catch (err) {
    console.warn('[assistant] 同步服务端失败:', err);
  }
}

/** 防抖持久化：localStorage + 服务端 */
export function persistAssistantSessions(
  sessions: AssistantSession[],
  currentId?: string,
  opts?: { immediate?: boolean; forceLocal?: boolean }
) {
  if (typeof window === 'undefined') return;
  writeAssistantLocalCache(sessions, currentId, { force: opts?.forceLocal });

  const runSync = () => {
    assistantPersistTimer = null;
    void syncAssistantToServer(sessions, currentId);
  };

  if (opts?.immediate) {
    if (assistantPersistTimer) clearTimeout(assistantPersistTimer);
    assistantPersistTimer = null;
    runSync();
    return;
  }

  if (assistantPersistTimer) clearTimeout(assistantPersistTimer);
  assistantPersistTimer = setTimeout(runSync, 400);
}

export const getStoredAssistantState = () => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('ai_assistant_sessions');
      const savedId = localStorage.getItem('ai_assistant_current_session_id');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const currentId = savedId && parsed.some((s: any) => s.id === savedId) ? savedId : parsed[0].id;
          return { sessions: parsed as AssistantSession[], currentId };
        }
      }
    } catch {}
  }
  const defaultId = 'asst-session-default';
  return {
    sessions: [
      {
        id: defaultId,
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [] as AssistantMessage[],
      }
    ],
    currentId: defaultId
  };
};

// 辅助函数：瘦身任务对象以存入 localStorage，剔除巨型 base64 字符串
function sanitizeTaskForStorage(task: GenerationTask): GenerationTask {
  const sanitizeUrl = (url?: string) => {
    if (!url) return url;
    if (url.startsWith('data:image/') && url.length > 500) {
      return url.slice(0, 80) + '...[stripped]';
    }
    return url;
  };

  return {
    ...task,
    productImageUrl: sanitizeUrl(task.productImageUrl),
    referenceImageUrl: sanitizeUrl(task.referenceImageUrl),
    referenceImages: task.referenceImages?.map(sanitizeUrl).filter(Boolean) as string[] | undefined,
    images: task.images?.map(sanitizeUrl).filter(Boolean) as string[] | undefined
  };
}

let saveDrawingTimer: ReturnType<typeof setTimeout> | null = null;
export function persistDrawingStateToStorage(allGens?: GenerationTask[], sessions?: ChatSession[], currentId?: string) {
  if (typeof window === 'undefined') return;
  if (!isProjectAutosaveEnabled()) return;
  if (saveDrawingTimer) clearTimeout(saveDrawingTimer);
  saveDrawingTimer = setTimeout(() => {
    try {
      if (allGens) {
        // 限制本地 Storage 缓存最近 100 条（数据库已全量持久化），防止巨型 JSON 阻塞主线程
        const lightweightGens = allGens.slice(0, 100).map(sanitizeTaskForStorage);
        localStorage.setItem('drawing_all_generations', JSON.stringify(lightweightGens));
      }
      if (sessions) {
        const lightweightSessions = sessions.slice(0, 25).map(s => ({
          ...s,
          tasks: (s.tasks || []).slice(0, 30).map(sanitizeTaskForStorage)
        }));
        localStorage.setItem('drawing_sessions', JSON.stringify(lightweightSessions));
      }
      if (currentId) {
        localStorage.setItem('drawing_current_session_id', currentId);
      }
    } catch (e: any) {
      if (e?.name === 'QuotaExceededError' || e?.code === 22) {
        try {
          // 超出配额时紧急缩减至最近 20 条
          localStorage.removeItem('drawing_all_generations');
          if (sessions) {
            localStorage.setItem('drawing_sessions', JSON.stringify(sessions.slice(0, 5).map(s => ({
              ...s,
              tasks: (s.tasks || []).slice(0, 10).map(sanitizeTaskForStorage)
            }))));
          }
        } catch {}
      }
    }
  }, 150);
}

export const STUDIO_DRAFT_KEY = 'buyer_show_studio_draft';
let saveStudioDraftTimer: ReturnType<typeof setTimeout> | null = null;

function sanitizeStudioUrl(url?: string) {
  if (!url) return url;
  if (url.startsWith('data:') && url.length > 800) {
    return undefined; // sessionStorage 不存巨型 base64，避免爆配额
  }
  return url;
}

/** 勾选社媒参考 URL 签名（顺序敏感：与分镜 1:1 对齐） */
export function buildSocialPromptSourceKey(
  cloned: { url: string; selected?: boolean }[]
): string {
  return cloned
    .filter((i) => i.selected !== false && i.url)
    .map((i) => i.url.trim())
    .join('|');
}

export function invalidateSocialPromptsIfNeeded(
  state: {
    generatedPrompts: ShotPrompt[];
    socialPromptSourceKey: string;
    clonedSocialImages: { url: string; selected: boolean }[];
  },
  nextCloned: { url: string; selected: boolean }[]
): Partial<{
  generatedPrompts: ShotPrompt[];
  generationTasks: GenerationTask[];
  socialPromptSourceKey: string;
}> {
  const nextKey = buildSocialPromptSourceKey(nextCloned);
  if (!state.socialPromptSourceKey || state.generatedPrompts.length === 0) {
    return {};
  }
  if (nextKey === state.socialPromptSourceKey) {
    return {};
  }
  // 参考图勾选变更：旧提示词失效
  return {
    generatedPrompts: [],
    generationTasks: [],
    socialPromptSourceKey: '',
  };
}

export function persistStudioDraftToStorage(state: {
  currentStep: number;
  product: any;
  images: ProductImage[];
  apiUsed: string | null;
  generatedPrompts: ShotPrompt[];
  generationTasks: GenerationTask[];
  clonedSocialImages: { url: string; selected: boolean }[];
  workshopMode: string;
  shotCount: number;
  extraRequirements: string;
  selectedStyleId: string;
  selectedAspectId: string;
  selectedQuality: string;
  useReferenceImage: boolean;
  productFingerprint: string;
  productRole?: string | null;
  anchorFaceImageUrl?: string;
  socialPromptSourceKey?: string;
  masterScene?: string;
  lookBible?: string;
  identityBible?: string;
  styleBible?: string;
  lookParts?: OriginalLookParts | null;
  previousMasterScenes?: string[];
  previousGroupSignatures?: PreviousGroupSignature[];
  sceneAnchorEnabled?: boolean;
}) {
  if (typeof window === 'undefined') return;
  if (saveStudioDraftTimer) clearTimeout(saveStudioDraftTimer);
  saveStudioDraftTimer = setTimeout(() => {
    try {
      const draft = {
        currentStep: state.currentStep,
        product: state.product,
        images: (state.images || []).map((img) => ({ ...img, url: sanitizeStudioUrl(img.url) || '' })).filter((img) => img.url),
        apiUsed: state.apiUsed,
        generatedPrompts: state.generatedPrompts,
        generationTasks: (state.generationTasks || []).map((t) => ({
          ...sanitizeTaskForStorage(t),
          resultUrl: sanitizeStudioUrl(t.resultUrl),
          referenceImageUrl: sanitizeStudioUrl(t.referenceImageUrl),
        })),
        clonedSocialImages: (state.clonedSocialImages || [])
          .map((i) => ({ ...i, url: sanitizeStudioUrl(i.url) || '' }))
          .filter((i) => i.url),
        workshopMode: state.workshopMode,
        shotCount: state.shotCount,
        extraRequirements: state.extraRequirements,
        selectedStyleId: state.selectedStyleId,
        selectedAspectId: state.selectedAspectId,
        selectedQuality: state.selectedQuality,
        useReferenceImage: state.useReferenceImage,
        productFingerprint: state.productFingerprint,
        productRole: state.productRole || null,
        anchorFaceImageUrl: sanitizeStudioUrl(state.anchorFaceImageUrl),
        socialPromptSourceKey: state.socialPromptSourceKey || '',
        masterScene: state.masterScene || '',
        lookBible: state.lookBible || '',
        identityBible: state.identityBible || '',
        styleBible: state.styleBible || '',
        lookParts: state.lookParts || null,
        previousMasterScenes: (state.previousMasterScenes || []).slice(0, 2),
        previousGroupSignatures: (state.previousGroupSignatures || []).slice(0, 3),
        sceneAnchorEnabled: state.sceneAnchorEnabled !== false,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      try {
        sessionStorage.removeItem(STUDIO_DRAFT_KEY);
      } catch {}
    }
  }, 200);
}

export function getStoredStudioDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STUDIO_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export const getStoredDrawingSessions = () => {
  loadGenerationTombstones();

  let sessions: ChatSession[] = [];
  let currentId = 'session-default';
  let allGenerations: GenerationTask[] = [];

  if (typeof window !== 'undefined') {
    try {
      const savedSessions = localStorage.getItem('drawing_sessions');
      const savedId = localStorage.getItem('drawing_current_session_id');
      const savedAll = localStorage.getItem('drawing_all_generations');
      if (savedSessions) {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sessions = parsed;
          currentId = (savedId && savedId !== '__all__' && parsed.some((s: any) => s.id === savedId)) ? savedId : parsed[0].id;
        }
      }
      if (savedAll) {
        const parsedAll = JSON.parse(savedAll);
        if (Array.isArray(parsedAll)) {
          allGenerations = parsedAll;
        }
      }
    } catch {}
  }

  if (sessions.length === 0) {
    const defaultId = 'session-default';
    sessions = [
      {
        id: defaultId,
        title: '未命名对话',
        createdAt: Date.now(),
        tasks: []
      }
    ];
    currentId = defaultId;
  }

  // 聚合所有会话中的 tasks 与 allGenerations，合并去重
  const map = new Map<string, GenerationTask>();
  allGenerations.forEach(t => {
    const key = t.id || t.taskId;
    if (key) map.set(key, t);
  });
  sessions.forEach(s => {
    (s.tasks || []).forEach(t => {
      const key = t.id || t.taskId;
      if (key && !map.has(key)) map.set(key, t);
    });
  });

  const mergedGenerations = Array.from(map.values())
    .filter((t) => !isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId))
    .sort((a, b) => {
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

  return {
    sessions,
    currentId,
    tasks: mergedGenerations
  };
};

export function clearBuyerShowStudioDraft() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STUDIO_DRAFT_KEY);
  } catch {}
}
