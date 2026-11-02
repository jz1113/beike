import { useEffect, useRef, useState } from 'react';
import { runSeedancePrecheck } from '@client/shared/api/generation/seedancePrecheck';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { uploadSalesViewImage, type AssetViewRequest, type AssetViewStage } from '../api/salesAssetViews';
import type { AssetViewDefinition, AssetViewSet } from '../model/salesAssetViews';
import type { SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import { submitSalesAssetJob } from '../api/salesAssetJobs';
import { supportsSalesAssetReferences } from '../model/salesAssetModels';

export interface SalesAssetBackground<V extends string> {
  kind: 'persona' | 'scene';
  assetId?: string;
  enabled: boolean;
  data: (views: AssetViewSet<V>['views'], extraImages: string[]) => Record<string, unknown>;
  onQueued: () => void;
}

export function useSalesAssetViews<V extends string>(options: {
  initial: () => AssetViewSet<V>;
  definitions: readonly AssetViewDefinition<V>[];
  referenceKeys: readonly (V | 'main')[];
  prefix: string;
  draft?: SalesAssetDraftPersistence;
  background?: SalesAssetBackground<V>;
  generate: (request: AssetViewRequest, signal: AbortSignal, onStage: (stage: AssetViewStage) => void, onProgress: () => void) => Promise<Record<string, string>>;
}) {
  const [initial] = useState(() => {
    const base = options.initial();
    return { views: { ...base.views, ...options.draft?.saved?.views }, extraImages: options.draft?.saved?.extraImages || base.extraImages };
  });
  const [views, setViews] = useState(initial.views);
  const viewsRef = useRef(views);
  const [configured] = useState(loadSystemConfiguredModels);
  const models = configured.availableImageModels.filter(({ id }) => supportsSalesAssetReferences(id));
  const [model, selectModel] = useState(() => {
    const preferred = options.draft?.saved?.model || configured.selectedImageGenModel;
    return models.some(({ id }) => id === preferred) ? preferred : models[0]?.id || '';
  });
  const [active, setActive] = useState<(V | 'main')[]>([]);
  const [stage, setStage] = useState<AssetViewStage | 'uploading' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef<AssetViewRequest | null>(options.draft?.saved?.request || null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    // Fast Refresh replays effects while retaining state and refs. Resume an
    // interrupted task from its checkpoint instead of leaving the dialog busy.
    if (operation.current?.signal.aborted) {
      operation.current = null; setActive([]); setStage('');
    }
    return () => operation.current?.abort();
  }, []);
  const missing = options.definitions.filter(({ id }) => id !== 'main' && !views[id]).map(({ id }) => id as V);
  const persist = () => options.draft?.update({ views: viewsRef.current, extraImages: initial.extraImages, model, request: request.current }) ?? true;
  const setModel = (next: string) => { selectModel(next); options.draft?.update({ model: next }); };
  const commitViews = (next: typeof views) => { viewsRef.current = next; setViews(next); persist(); };

  const upload = async (view: V | 'main', file: File) => {
    if (operation.current) return;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') { setError('请选择 JPG、PNG、WebP 等图片文件'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('图片不能超过 20 MB'); return; }
    const controller = new AbortController(); operation.current = controller;
    setActive([view]); setStage('uploading'); setError(''); setNotice('');
    try {
      const url = await uploadSalesViewImage(file, file.name, controller.signal);
      if (controller.signal.aborted) return;
      if (view === 'main') request.current = null;
      commitViews({ ...viewsRef.current, [view]: url });
      void runSeedancePrecheck([{ url, mediaType: 'image' }]);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      if (operation.current === controller && !controller.signal.aborted) {
        operation.current = null; setActive([]); setStage('');
      }
    }
  };

  const generate = async (targets: V[] = missing) => {
    const pending = [...new Set(targets)].filter((view) => missing.includes(view));
    if (operation.current || !views.main || !model || !pending.length || options.background?.enabled === false) return;
    const controller = new AbortController(); operation.current = controller;
    setError(''); setNotice(''); setActive(pending);
    const current = request.current ||= {
      key: `${options.prefix}-${crypto.randomUUID()}`, model,
      references: [...new Set(options.referenceKeys.map((key) => views[key]).filter(Boolean))],
    };
    // Save the idempotency key before any paid request can leave the browser.
    if (!persist()) { operation.current = null; setActive([]); return; }
    const reused = Boolean(current.images);
    let currentStage: AssetViewStage = current.resultUrl || current.images ? 'cropping' : current.prompt || current.taskId ? 'generating' : 'prompt';
    setStage(currentStage);
    try {
      if (options.background) {
        const job = await submitSalesAssetJob(options.background.kind, current,
          options.background.data(viewsRef.current, initial.extraImages), options.background.assetId, controller.signal);
        if (controller.signal.aborted) return;
        persist();
        if (job.status === 'failed') throw new Error(job.error || '后台任务失败，请在任务列表中继续处理');
        options.background.onQueued();
        return;
      }
      const images = current.images || await options.generate(current, controller.signal, (nextStage) => {
        if (!controller.signal.aborted) { currentStage = nextStage; setStage(nextStage); }
      }, () => { persist(); });
      if (controller.signal.aborted) return;
      if (pending.some((view) => !images[view])) throw new Error('九宫格裁切结果不完整，请继续处理原图');
      current.images = images;
      const next = { ...viewsRef.current };
      for (const view of pending) if (!next[view]) next[view] = images[view];
      commitViews(next);
      setNotice(`${reused ? '已恢复' : '已从九宫格补充'} ${pending.length} 张视角图，保存后即可使用。`);
      void runSeedancePrecheck(pending.map((view) => ({ url: images[view], mediaType: 'image' })));
    } catch (err) {
      if (!controller.signal.aborted) {
        // Before a prompt is loaded no generation can have been submitted. A retry
        // should use the latest model/references, not pretend to resume a paid task.
        if (!options.background && ((!current.prompt && !current.taskId && !current.resultUrl && !current.images)
          || (err instanceof Error && (err.name === 'ImageGenBusinessError' || err.name === 'NonRetryableError')))) request.current = null;
        persist();
        setError(err instanceof Error ? err.message : '九宫格处理失败');
        if (request.current && (currentStage === 'cropping' || current.resultUrl)) {
          setNotice('九宫格已生成。点击「继续补全」重新读取原图并裁切保存，无需重新生图。');
        }
      }
    } finally {
      if (operation.current === controller && !controller.signal.aborted) {
        operation.current = null; setActive([]); setStage('');
      }
    }
  };

  const remove = (view: V | 'main') => {
    if (operation.current) return;
    if (view === 'main') request.current = null;
    commitViews({ ...viewsRef.current, [view]: '' });
    setError(''); setNotice('');
  };
  return { views, extraImages: initial.extraImages, model, setModel, models, active, stage, error, notice, missing, upload, generate, remove,
    background: Boolean(options.background), canGenerate: options.background?.enabled !== false,
    savedAssetId: request.current?.assetId, unconfirmedBackground: Boolean(options.background && request.current && !request.current.assetId),
    recovering: Boolean(request.current && !request.current.images), reusable: Boolean(request.current?.images && missing.length) };
}
