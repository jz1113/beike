import { useCallback, useEffect, useRef, useState } from 'react';
import { appendSalesImages, markSalesImageUnavailable } from '@shared/domain/sales';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { collectEcommerceProduct } from '../api/collectProduct';
import { uploadSalesImages } from '../api/uploadSalesImages';
import { recognizeProductImage, SalesOCRError } from '../api/recognizeProductImage';
import { summarizeProduct } from '../api/summarizeProduct';
import { salesSummarySource } from '../model/salesSummary';
import { addSalesOCRImages } from '../model/salesImageDrag';
import { patchOCRImage } from '../model/salesOCR';
import { mergeSalesCollection } from '../model/salesCollectionMerge';
import type { SalesOCRProgress, SalesOCRReport } from '../model/salesWorkflow';
import { parseProductLink } from '../model/productLink';
import { productImageFiles } from '../model/productImageDrop';
import { createSalesDraftSaver } from '../model/salesDraftSaver';
import { emptySalesCollection, hasSalesCollection, readSalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import { patchSalesProductionPlan } from '../model/salesProductionOutputs';

const storageError = '商品资料暂存在当前页面，本地保存失败。请检查浏览器存储空间后点击“重试保存”，保存成功前请勿关闭页面。';

export function useSalesCollection() {
  const [state, setState] = useState(readSalesCollection);
  const [error, setError] = useState<string | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [ocrProgress, setOCRProgress] = useState<SalesOCRProgress | null>(null);
  const [ocrReport, setOCRReport] = useState<SalesOCRReport | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const ocrBusyRef = useRef(false);
  const resetRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const summaryRef = useRef<{ controller: AbortController; inputKey: string } | null>(null);
  const saverRef = useRef<ReturnType<typeof createSalesDraftSaver> | null>(null);
  if (!saverRef.current) saverRef.current = createSalesDraftSaver(
    () => { setSaveStatus('saved'); setError((previous) => previous === storageError ? null : previous); },
    () => { setSaveStatus('error'); setError(storageError); },
  );
  useEffect(() => {
    const flush = () => saverRef.current?.flush();
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (saverRef.current?.hasPending()) { event.preventDefault(); event.returnValue = ''; }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener?.('pagehide', flush);
      window.addEventListener?.('beforeunload', onBeforeUnload);
    }
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', onHidden);
    return () => {
      abortRef.current?.abort();
      summaryRef.current?.controller.abort();
      flush();
      if (typeof window !== 'undefined') {
        window.removeEventListener?.('pagehide', flush);
        window.removeEventListener?.('beforeunload', onBeforeUnload);
      }
      if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', onHidden);
    };
  }, []);
  const flushDraft = useCallback(() => saverRef.current?.flush() ?? true, []);

  const cancelSummary = useCallback((message?: string) => {
    summaryRef.current?.controller.abort();
    summaryRef.current = null;
    setIsSummarizing(false);
    if (typeof message === 'string') setSummaryError(message);
  }, []);

  const commit = useCallback((recipe: (previous: SalesCollectionState) => SalesCollectionState) => {
    const next = recipe(stateRef.current);
    if (next === stateRef.current) return;
    if (summaryRef.current) {
      const source = salesSummarySource(next);
      if (source.error || source.inputKey !== summaryRef.current.inputKey) cancelSummary('资料已更新，本次提炼已停止，可使用新资料重新提炼。');
    }
    stateRef.current = next;
    setState(next);
    setSaveStatus('saving');
    saverRef.current?.queue(next);
  }, [cancelSummary]);
  const updateState = useCallback((patch: Partial<SalesCollectionState>) => {
    const keys = Object.keys(patch);
    const productionOnly = keys.every((key) => key === 'selectedScriptId' || key === 'productionPlan' || key === 'summaryModel' || key === 'activeProductId');
    const referenceOnly = keys.every((key) =>
      key === 'colorSelection' || key === 'imageCatalog' || key === 'selectedScriptId'
      || key === 'productionPlan' || key === 'summaryModel' || key === 'activeProductId'
      || key === 'category' || key === 'categorySource' || key === 'audience' || key === 'audienceSource');
    if (!busyRef.current || productionOnly || (ocrBusyRef.current && referenceOnly)) {
      if (patch.ocrImageUrls || patch.ocrImages) setOCRReport(null);
      commit((previous) => ({ ...previous, ...patch, ...(patch.productionPlan
        ? { productionPlan: patchSalesProductionPlan(previous.productionPlan, patch.productionPlan) } : {}) }));
    }
  }, [commit]);

  const runProductCollect = useCallback(async () => {
    if (busyRef.current) return;
    const parsed = parseProductLink(stateRef.current.productUrl);
    if (!parsed.ok) { setError(parsed.error); return; }
    const controller = new AbortController();
    cancelSummary();
    abortRef.current = controller;
    busyRef.current = true;
    setIsCollecting(true);
    setError(null);
    try {
      const product = await collectEcommerceProduct(parsed.url, parsed.platform, controller.signal,
        stateRef.current.collectedProductUrl === parsed.url);
      if (!controller.signal.aborted) { setOCRReport(null); setSummaryError(null); commit((previous) => mergeSalesCollection(previous, product, parsed.url)); }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '商品采集失败');
    } finally {
      busyRef.current = false;
      if (!controller.signal.aborted) setIsCollecting(false);
    }
  }, [commit, cancelSummary]);

  const addProductImages = useCallback(async (files: File[], forOCR = false) => {
    if (busyRef.current) return;
    const images = productImageFiles(files);
    if (!images.length) { setError('没有可用的图片'); return; }
    const controller = new AbortController();
    cancelSummary();
    abortRef.current = controller;
    busyRef.current = true;
    setIsUploading(true);
    setError(null);
    try {
      const { urls, failed } = await uploadSalesImages(images, controller.signal);
      if (controller.signal.aborted) return;
      commit((previous) => {
        const imageCatalog = appendSalesImages(previous.imageCatalog, urls);
        return { ...previous, imageCatalog, productImages: imageCatalog.map((image) => image.url),
          ...(forOCR ? { ocrImageUrls: addSalesOCRImages(imageCatalog, previous.ocrImageUrls, urls) } : {}) };
      });
      if (failed) setError(`${urls.length} 张已上传，${failed} 张失败，请只补传失败图片`);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      busyRef.current = false;
      if (!controller.signal.aborted) setIsUploading(false);
    }
  }, [commit, cancelSummary]);

  const markImageUnavailable = useCallback((index: number) => commit((previous) =>
    previous.imageCatalog.some((image) => image.index === index && !image.unavailable)
      ? { ...previous, imageCatalog: markSalesImageUnavailable(previous.imageCatalog, index) } : previous), [commit]);

  const recognizeImages = useCallback(async (onlyUrl?: string, force = false, failedOnly = false, targetUrls?: string[]) => {
    if (busyRef.current) return;
    const current = stateRef.current;
    const targets = targetUrls ? new Set(targetUrls) : null;
    const urls = current.imageCatalog.filter((image) => !image.unavailable && (!targets || targets.has(image.url)) && (onlyUrl ? image.url === onlyUrl : current.ocrImageUrls.includes(image.url)))
      .map((image) => image.url).filter((url) => !failedOnly || current.ocrImages.some((entry) => entry.imageUrl === url && entry.error))
      .filter((url) => force || !current.ocrImages.find((entry) => entry.imageUrl === url && entry.result && !entry.error));
    if (!urls.length) return;
    const controller = new AbortController();
    cancelSummary();
    abortRef.current = controller;
    busyRef.current = true;
    setError(null);
    setOCRReport(null);
    ocrBusyRef.current = true;
    let succeeded = 0;
    let failed = 0;
    let completed = 0;
    let message: string | undefined;
    try {
      for (let index = 0; index < urls.length; index += 1) {
        if (controller.signal.aborted) break;
        const imageUrl = urls[index];
        setOCRProgress({ current: index + 1, total: urls.length, imageUrl, completed, succeeded, failed });
        try {
          const result = await recognizeProductImage(imageUrl, controller.signal, force);
          if (controller.signal.aborted) break;
          succeeded += 1;
          commit((previous) => {
            const previousImage = previous.ocrImages.find((entry) => entry.imageUrl === imageUrl);
            const hasUserEdit = previousImage && (previousImage.result
              ? previousImage.editedText !== previousImage.result.text : Boolean(previousImage.editedText.trim()));
            const editedText = hasUserEdit ? previousImage.editedText : result.text;
            return { ...previous, ocrImages: patchOCRImage(previous.ocrImages, imageUrl, { result, editedText, error: undefined }) };
          });
        } catch (err) {
          if (controller.signal.aborted) break;
          failed += 1;
          commit((previous) => ({ ...previous, ocrImages: patchOCRImage(previous.ocrImages, imageUrl, { error: err instanceof Error ? err.message : '文字识别失败' }) }));
          if (err instanceof SalesOCRError && [429, 503].includes(err.status)) message = err.message;
        }
        completed += 1;
        setOCRProgress({ current: index + 1, total: urls.length, imageUrl, completed, succeeded, failed });
        if (message) break;
      }
    } finally {
      busyRef.current = false;
      setOCRProgress(null);
      ocrBusyRef.current = false;
      setOCRReport({ status: controller.signal.aborted || message ? 'stopped' : 'completed', succeeded, failed, remaining: urls.length - completed, message });
    }
  }, [commit, cancelSummary]);

  const addOCRImages = useCallback((urls: string[]) => {
    if (busyRef.current) return;
    commit((previous) => {
      const ocrImageUrls = addSalesOCRImages(previous.imageCatalog, previous.ocrImageUrls, urls);
      if (ocrImageUrls.length === previous.ocrImageUrls.length) return previous;
      setOCRReport(null);
      return { ...previous, ocrImageUrls };
    });
  }, [commit]);

  const retryUnavailableImages = useCallback(() => {
    if (!busyRef.current) commit((previous) => ({ ...previous, imageCatalog: previous.imageCatalog.map((image) => ({ ...image, unavailable: undefined })) }));
  }, [commit]);

  const summarize = useCallback(async (model: string) => {
    if (busyRef.current || summaryRef.current) return;
    const source = salesSummarySource(stateRef.current);
    if (source.error || !model) { setSummaryError(source.error || '请先选择多模态模型'); return; }
    const controller = new AbortController();
    summaryRef.current = { controller, inputKey: source.inputKey };
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const response = await summarizeProduct(source.input, model, controller.signal);
      if (controller.signal.aborted) return;
      if (salesSummarySource(stateRef.current).inputKey !== source.inputKey) { setSummaryError('商品资料已变化，请重新提炼卖点。'); return; }
      commit((previous) => ({ ...previous, productSummary: { result: response.result, model: response.model, skillVersion: response.skillVersion, inputKey: source.inputKey, generatedAt: new Date().toISOString() } }));
    } catch (err) {
      if (!controller.signal.aborted) setSummaryError(err instanceof Error ? err.message : '卖点提炼失败，请重试');
    } finally {
      if (summaryRef.current?.controller === controller) { summaryRef.current = null; setIsSummarizing(false); }
    }
  }, [commit]);

  const resetProduct = useCallback(async () => {
    if (resetRef.current || busyRef.current || !hasSalesCollection(stateRef.current)) return;
    resetRef.current = true;
    try {
      const confirmed = await confirmAction({ title: '清空当前商品？', confirmText: '清空并更换商品', description: '清空当前页面的商品资料和选图。采集缓存、原始文件及服务端记录继续保留。' });
      if (confirmed && !busyRef.current) { cancelSummary(); setError(null); setSummaryError(null); setOCRReport(null); commit((previous) => ({ ...emptySalesCollection(), summaryModel: previous.summaryModel, selectedScriptId: previous.selectedScriptId, productionPlan: { ...emptySalesProductionPlan(), videoModel: previous.productionPlan.videoModel, voiceModel: previous.productionPlan.voiceModel } })); saverRef.current?.flush(); }
    } finally { resetRef.current = false; }
  }, [commit, cancelSummary]);

  return { state, updateState, error, clearError: () => setError(null), isCollecting, isUploading, ocrProgress, ocrReport, saveStatus, flushDraft,
    recognizeImages, addOCRImages, retryFailedImages: () => recognizeImages(undefined, false, true), cancelOCR: () => abortRef.current?.abort(), runProductCollect, addProductImages, markImageUnavailable, retryUnavailableImages, resetProduct,
    isSummarizing, summaryError, summarize, cancelSummary };
}
