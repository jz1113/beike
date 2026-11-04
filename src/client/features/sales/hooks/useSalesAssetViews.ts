import { useEffect, useRef, useState } from 'react';
import { runSeedancePrecheck } from '@client/shared/api/generation/seedancePrecheck';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { uploadSalesViewImage, type AssetViewRequest, type AssetViewStage } from '../api/salesAssetViews';
import { hasLegacyPersonaSheet } from '../model/salesAssetViews';
import type { AssetViewDefinition, AssetViewSet } from '../model/salesAssetViews';
import type { SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import { readSalesAssetJob, submitSalesAssetJob, waitSalesAssetJob } from '../api/salesAssetJobs';
import { supportsSalesAssetReferences } from '../model/salesAssetModels';
import { assetCreationDimensions, type SalesAssetCreation } from '../model/salesAssetCreation';

export interface SalesAssetBackground<V extends string> {
  kind: 'persona' | 'scene';
  assetId?: string;
  enabled: boolean;
  data: (views: AssetViewSet<V>['views'], extraImages: string[]) => Record<string, unknown>;
  onQueued: () => void;
  waitForResult?: boolean;
}

export function useSalesAssetViews<V extends string>(options: {
  initial: () => AssetViewSet<V>;
  definitions: readonly AssetViewDefinition<V>[];
  referenceKeys: readonly (V | 'main')[];
  prefix: string;
  draft?: SalesAssetDraftPersistence;
  background?: SalesAssetBackground<V>;
  creationMode?: boolean;
  creation?: SalesAssetCreation;
  jobId?: string;
  generate: (request: AssetViewRequest, signal: AbortSignal, onStage: (stage: AssetViewStage) => void, onProgress: () => void) => Promise<Record<string, string>>;
}) {
  const [initial] = useState(() => {
    const base = options.initial();
    return { views: { ...base.views, ...options.draft?.saved?.views }, extraImages: options.draft?.saved?.extraImages || base.extraImages };
  });
  const [views, setViews] = useState(initial.views);
  const viewsRef = useRef(views);
  const [extraImages, setExtraImages] = useState(initial.extraImages);
  const extraImagesRef = useRef(extraImages);
  const [creation, setCreation] = useState(options.draft?.saved?.creation || options.creation);
  const creationRef = useRef(creation);
  const referenceChanged = useRef(Boolean(options.draft?.saved?.creation && options.creation
    && (options.draft.saved.creation.referenceImageUrl !== options.creation.referenceImageUrl
      || (!options.draft.saved.creation.imageUrl && options.creation.imageUrl))));
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
  const savedAssetId = useRef(options.draft?.saved?.assetId || request.current?.assetId || options.background?.assetId);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    // Fast Refresh replays effects while retaining state and refs. Resume an
    // interrupted task from its checkpoint instead of leaving the dialog busy.
    if (operation.current?.signal.aborted) {
      operation.current = null; setActive([]); setStage('');
    }
    return () => operation.current?.abort();
  }, []);
  const missing = options.definitions.filter(({ id }) => id !== 'main' && !views[id] && !(id === 'sheet' && hasLegacyPersonaSheet(views))).map(({ id }) => id as V);
  const persist = () => options.draft?.update({ views: viewsRef.current, extraImages: extraImagesRef.current, creation: creationRef.current, assetId: savedAssetId.current, model, request: request.current }) ?? true;
  const setModel = (next: string) => { selectModel(next); options.draft?.update({ model: next }); };
  const commitViews = (next: typeof views) => { viewsRef.current = next; setViews(next); persist(); };

  const applyGeneratedViews = (images: Record<string, string>, pending: V[]) => {
    const legacy = pending.some((id) => id === 'sheet') && !images.sheet && hasLegacyPersonaSheet(images);
    const next = { ...viewsRef.current };
    for (const view of legacy ? Object.keys(images) as V[] : pending) {
      if (!images[view]) throw new Error('生成视角不完整，请重新读取结果');
      if (!next[view]) next[view] = images[view];
    }
    commitViews(next);
  };

  const uploadImage = async (view: V | 'main', file: File, reference = false) => {
    if (operation.current) return;
    if (reference && request.current && !request.current.jobId) { setError('请先继续生成以确认原任务'); return; }
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') { setError('请选择 JPG、PNG、WebP 等图片文件'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('图片不能超过 20 MB'); return; }
    const controller = new AbortController(); operation.current = controller;
    setActive([view]); setStage('uploading'); setError(''); setNotice('');
    try {
      const url = await uploadSalesViewImage(file, file.name, controller.signal);
      if (controller.signal.aborted) return;
      if (view === 'main') request.current = null;
      if (reference) {
        referenceChanged.current = true;
        creationRef.current = { referenceImageUrl: url }; setCreation(creationRef.current);
        extraImagesRef.current = []; setExtraImages([]);
        commitViews(Object.fromEntries(Object.keys(viewsRef.current).map((id) => [id, ''])) as typeof views);
      } else {
        if (view === 'main' && creationRef.current) {
          creationRef.current = undefined; setCreation(undefined);
        }
        if (view === 'main' && options.definitions.some(({ id }) => id === 'sheet')) {
          referenceChanged.current = true;
          extraImagesRef.current = []; setExtraImages([]);
          commitViews({ ...Object.fromEntries(Object.keys(viewsRef.current).map((key) => [key, ''])), main: url } as typeof views);
        } else commitViews({ ...viewsRef.current, [view]: url });
        void runSeedancePrecheck([{ url, mediaType: 'image' }]);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      if (operation.current === controller && !controller.signal.aborted) {
        operation.current = null; setActive([]); setStage('');
      }
    }
  };
  const upload = (view: V | 'main', file: File) => uploadImage(view, file);
  const uploadReference = (file: File) => uploadImage('main', file, true);

  const generate = async (targets: V[] = missing) => {
    const pending = [...new Set(targets)].filter((view) => missing.includes(view));
    if (operation.current || (!views.main && !creationRef.current?.referenceImageUrl) || !model || !pending.length || options.background?.enabled === false) return;
    const needsMain = options.creationMode && creationRef.current && (!creationRef.current.imageUrl || creationRef.current.imageUrl !== viewsRef.current.main);
    if (needsMain && !configured.selectedVisionModel && !request.current?.analysisModel) {
      setError('请先在设置中配置图像理解模型'); return;
    }
    const controller = new AbortController(); operation.current = controller;
    setError(''); setNotice(''); setActive(pending);
    if (!request.current && options.jobId && options.creation && !referenceChanged.current) {
      try {
        const job = await readSalesAssetJob(options.jobId, controller.signal);
        if (controller.signal.aborted) return;
        if (job.assetId !== savedAssetId.current) throw new Error('资产任务不匹配，请刷新后重试');
        request.current = { key: job.key, jobId: job.id, assetId: job.assetId, model: job.model,
          references: [job.creation?.referenceImageUrl || viewsRef.current.main],
          ...(job.creation ? { creation: job.creation, analysisModel: job.creation.promptModel } : {}) };
      } catch (err) {
        if (!controller.signal.aborted) {
          operation.current = null; setActive([]); setError(err instanceof Error ? err.message : '任务读取失败，请重试');
        }
        return;
      }
    }
    const current = request.current ||= {
      key: `${options.prefix}-${crypto.randomUUID()}`, model,
      assetId: savedAssetId.current,
      references: needsMain && creationRef.current
        ? [creationRef.current.referenceImageUrl] : [...new Set(options.referenceKeys.map((key) => views[key]).filter(Boolean))],
      ...(needsMain ? { creation: creationRef.current, analysisModel: configured.selectedVisionModel } : {}),
    };
    // Save the idempotency key before any paid request can leave the browser.
    if (!persist()) { operation.current = null; setActive([]); return; }
    const reused = Boolean(current.images);
    let currentStage: AssetViewStage = current.resultUrl || current.images ? 'cropping' : current.prompt || current.taskId ? 'generating' : 'prompt';
    setStage(currentStage);
    try {
      if (options.background) {
        const data = options.background.data(viewsRef.current, extraImagesRef.current);
        if (current.creation) data.dimensions = assetCreationDimensions(typeof data.dimensions === 'string' ? data.dimensions : undefined, current.creation);
        let job = await submitSalesAssetJob(options.background.kind, current,
          data, savedAssetId.current, controller.signal);
        if (controller.signal.aborted) return;
        savedAssetId.current = job.assetId;
        persist();
        if (options.background.waitForResult || current.creation) {
          job = await waitSalesAssetJob(job, controller.signal, (next) => {
            if (next.creation) {
              current.creation = next.creation; creationRef.current = next.creation; setCreation(next.creation);
              if (next.creation.imageUrl) commitViews({ ...viewsRef.current, main: next.creation.imageUrl });
            }
            setStage(next.status === 'analyzing' || next.status === 'creating' || next.status === 'generating' ? next.status
              : next.status === 'cropping' || next.status === 'saving' ? 'cropping' : 'prompt');
            persist();
          });
          if (job.status === 'completed') {
            applyGeneratedViews(job.images, pending);
            current.images = job.images; persist();
            setNotice('资产已生成');
          }
        }
        if (job.status === 'failed') throw new Error(job.error || '生成未完成，请继续处理');
        options.background.onQueued();
        return;
      }
      const images = current.images || await options.generate(current, controller.signal, (nextStage) => {
        if (!controller.signal.aborted) { currentStage = nextStage; setStage(nextStage); }
      }, () => { persist(); });
      if (controller.signal.aborted) return;
      applyGeneratedViews(images, pending);
      current.images = images; persist();
      setNotice(`${reused ? '已恢复' : '已从视角图补充'} ${pending.length} 张视角图，保存后即可使用。`);
      void runSeedancePrecheck(pending.map((view) => ({ url: images[view], mediaType: 'image' })));
    } catch (err) {
      if (!controller.signal.aborted) {
        // Before a prompt is loaded no generation can have been submitted. A retry
        // should use the latest model/references, not pretend to resume a paid task.
        if (!options.background && ((!current.prompt && !current.taskId && !current.resultUrl && !current.images)
          || (err instanceof Error && (err.name === 'ImageGenBusinessError' || err.name === 'NonRetryableError')))) request.current = null;
        persist();
        setError(err instanceof Error ? err.message : '视角图处理失败');
        if (request.current && (currentStage === 'cropping' || current.resultUrl)) {
          setNotice('视角图已生成。点击「继续生成」重新读取并保存原图，无需重新生图。');
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
  const removeReference = () => {
    if (operation.current) return;
    if (request.current && !request.current.jobId) { setError('请先继续生成以确认原任务'); return; }
    referenceChanged.current = true;
    creationRef.current = undefined; setCreation(undefined); request.current = null;
    commitViews(Object.fromEntries(Object.keys(viewsRef.current).map((id) => [id, ''])) as typeof views);
    setError(''); setNotice('');
  };
  return { views, extraImages, model, setModel, models, active, stage, error, notice, missing, upload, generate, remove,
    creation, creationMode: Boolean(options.creationMode), referenceUrl: creation?.referenceImageUrl || '', uploadReference, removeReference,
    withCreationDimensions: (base?: string) => assetCreationDimensions(base, creationRef.current),
    background: Boolean(options.background), canGenerate: options.background?.enabled !== false,
    savedAssetId: savedAssetId.current, unconfirmedBackground: Boolean(options.background && request.current && !request.current.jobId),
    recovering: Boolean(request.current && !request.current.images), reusable: Boolean(request.current?.images && missing.length) };
}
