import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import { AlertCircle, CheckCircle2, ChevronDown, Download, FileSpreadsheet, ImageIcon, Layers, Loader2, Maximize2, Play, RotateCcw, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { loadCanvasChatModels, loadCanvasGenerationModels, persistCanvasMedia, resolveCanvasChatModel } from '../../model/canvasNodeFactory';
import { batchCoverLayouts, coverBatchSource, coverLayoutId, downloadCoverBatchZip, getCoverBatch, isCurrentCoverTextOperation, matchesCoverDraft, normalizeBatchCoverPrompt, renderCoverPng, validateCoverPromptFormat } from '../../model/coverBatch';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supportsCoverStyleReference } from '../../model/studioGeneration';
import { studioNodeTaskId, waitForStudioMediaRetry, type StudioTaskCommands } from '../../model/studioTaskState';
import { coverWorkflowWriter } from '../../model/creativeWorkflowProjects';
import { compilerSettings, studioEdgeSources, studioNodeMedia } from '../../model/studioConnections';
import type { CanvasProject, StudioScene } from '../../model/types';

const COVER_BATCH_CONCURRENCY = 20;
export function CoverBatchRun({ project, commands, onSave }: {
  project: CanvasProject;
  commands: StudioTaskCommands;
  onSave: (scene: StudioScene) => Promise<void>;
}) {
  const { id: projectId, studioScene: scene } = project;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const [reportBatchId, setReportBatchId] = useState('');
  const [errors, setErrors] = useState<{ id: string; title: string; stage: string; reason: string }[]>([]);
  const [previewId, setPreviewId] = useState<string>();
  const active = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const closePreview = () => setPreviewId(undefined);
  useEffect(() => () => active.current?.abort(), []);

  const source = coverBatchSource(scene, projectId);
  const batch = getCoverBatch(source);
  const dialog = useModalDialog(Boolean(previewId && open && batch?.ids.includes(previewId)), closePreview);
  if (!batch) return null;
  const total = batch.ids.length;
  const rowIds = [...new Set(batch.ids)];
  const currentErrors = reportBatchId === batch.ids[0] ? errors : [];
  const currentProgress = reportBatchId === batch.ids[0] ? progress : '';
  const nodesById = new Map(scene?.nodes.map(node => [node.id, node]));
  const completed = rowIds.flatMap(id => {
    const node = nodesById.get(id);
    if (!node || node.isGenerating || node.errorMsg) return [];
    const url = studioNodeMedia(node).url;
    const settings = compilerSettings(node);
    if (!url || settings.beikeSizedCoverUrl !== url || (batch.runId && settings.beikeCoverExportRunId !== batch.runId)) return [];
    const reference = nodesById.get(id.replace(/-render$/, '-ref'));
    return [{ id, title: String(settings.beikeCoverTitle || node.nodeName || '封面'), url,
      referenceUrl: reference ? studioNodeMedia(reference).url : '',
      ratio: settings.beikeCoverOutputRatio ?? settings.beikeCoverExportRatio, layout: settings.beikeSubmittedCoverLayout }];
  });

  const download = async () => {
    if (downloading || !completed.length) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadCoverBatchZip(batch.name, completed);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : '批量下载失败');
    } finally {
      setDownloading(false);
    }
  };

  const render = scene?.nodes.find(node => node.id === source?.id.replace(/-product$/, '-image') && node.type === 'gen-image');
  const writer = scene && render && coverWorkflowWriter(scene, render);
  const canvasWriter = project.nodes.find(node => node.id === writer?.id);
  const canvasRender = project.nodes.find(node => node.id === render?.id);
  const textModels = open ? loadCanvasChatModels() : [];
  const drawingModels = open ? loadCanvasGenerationModels() : [];
  const upstreamTextModel = canvasWriter?.referenceNodeIds?.map(id => project.nodes.find(node => node.id === id))
    .find(node => node?.textModel)?.textModel;
  const selectedTextRoute = resolveCanvasChatModel(textModels, canvasWriter?.textModel, upstreamTextModel)?.id || '';
  const textModel = selectedTextRoute && 'beike:chat:' + selectedTextRoute;
  const drawingModel = canvasRender?.drawing?.model;
  const imageModel = (drawingModels.find(model => model.id === drawingModel || model.modelId === drawingModel) ?? drawingModels[0])?.id || '';
  const imageModels = drawingModels.filter(model => supportsCoverStyleReference(model.modelId || model.id));
  const selectedImageModel = imageModels.some(model => model.id === imageModel) ? 'beike:image:' + imageModel : '';
  const connected = source && scene && writer && render && [writer.id, render.id].every(id =>
    scene.connections.some(edge => edge.to === id && (!edge.inputType || edge.inputType === 'default') &&
      studioEdgeSources(edge, scene).includes(source.id)));
  const canRun = !running && Boolean(connected && textModel && selectedImageModel);
  const setSharedModel = (node: typeof writer, field: 'textNodeChatModel' | 'model', model: string) => {
    if (node && !active.current) commands.update(node.id, undefined, { settings: { [field]: model } });
  };

  const run = async (retryIds?: string[]) => {
    const { insert, connect, runText } = commands;
    if (!source || active.current || !canRun || !insert || !connect || !runText) return;
    const rows = retryIds ? rowIds.filter(id => retryIds.includes(id)) : rowIds;
    if (!rows.length) return;
    const runId = (retryIds && batch.runId) || crypto.randomUUID();
    const controller = new AbortController();
    active.current = controller;
    setRunning(true);
    setReportBatchId(batch.ids[0]);
    setErrors(retryIds ? currentErrors.filter(error => !rows.includes(error.id)) : []);
    setFailedOnly(false);
    setProgress('');
    let failed = 0;
    let succeeded = 0;
    let settled = 0;
    let switched = false;
    const sourceCounts = new Map<string, number>();
    const usedBySource = new Map<string, Set<string>>();
    for (const node of scene?.nodes ?? []) {
      if (!node.id.endsWith('-render')) continue;
      const reference = nodesById.get(node.id.replace(/-render$/, '-ref'));
      const url = reference && studioNodeMedia(reference).url;
      if (!url) continue;
      const settings = compilerSettings(node);
      const used = usedBySource.get(url) ?? new Set<string>();
      const history = Array.isArray(settings.beikeCoverLayoutHistory) ? settings.beikeCoverLayoutHistory : [];
      for (const layout of [...history, settings.beikeSubmittedCoverLayout]) if (typeof layout === 'string') used.add(layout);
      usedBySource.set(url, used);
    }
    const rowPlans = new Map(rowIds.map(id => {
      const reference = nodesById.get(id.replace(/-render$/, '-ref'));
      const url = reference && studioNodeMedia(reference).url || id;
      const offset = sourceCounts.get(url) ?? 0;
      sourceCounts.set(url, offset + 1);
      return [id, { offset, used: [...(usedBySource.get(url) ?? [])].sort() }] as const;
    }));
    if (!batchCoverLayouts.length) {
      setProgress('封面 Skill 没有可用版式');
      active.current = null;
      setRunning(false);
      return;
    }
    const isCurrentBatch = (current: StudioScene) => {
      const latestSource = current.nodes.find(node => node.id === source.id);
      const latestBatch = getCoverBatch(latestSource);
      if (latestBatch?.runId === runId) return true;
      switched = true;
      return false;
    };
    const finishCover = async (id: string, previousTaskId: string | undefined) => {
      controller.signal.throwIfAborted();
      const node = commands.read().nodes.find(item => item.id === id);
      const taskId = node && studioNodeTaskId(node);
      if (!node || !taskId || taskId === previousTaskId || node.isGenerating || node.errorMsg) {
        throw new Error('未收到本轮封面成品');
      }
      const url = studioNodeMedia(node).url;
      const ratio = compilerSettings(node).beikeCoverExportRatio;
      if (!url || (ratio !== '3:4' && ratio !== '4:3')) throw new Error('封面缺少图片或尺寸');
      const outputRatio = ratio === '4:3' ? '1:1' : '3:4';
      const png = await renderCoverPng(url, outputRatio, { requireSquare: ratio === '4:3' });
      controller.signal.throwIfAborted();
      const media = await persistCanvasMedia(new File([png], id + '.png', { type: 'image/png' }), 0, 0);
      controller.signal.throwIfAborted();
      const latest = commands.read().nodes.find(item => item.id === id);
      if (!isCurrentBatch(commands.read())) return;
      if (!latest || latest.isGenerating || studioNodeTaskId(latest) !== taskId || studioNodeMedia(latest).url !== url) {
        throw new Error('封面节点已变更，本次成品未覆盖画布');
      }
      commands.update(id, taskId, {
        content: media.imageUrl, imageUrl: media.imageUrl,
        ...(outputRatio === '1:1' && Number(latest.width) > 0 ? { height: Number(latest.width) } : {}),
        settings: { beikeSizedCoverUrl: media.imageUrl, beikeCoverExportRunId: runId,
          beikeCoverOutputRatio: outputRatio, beikeCoverOutputWidth: media.resultWidth },
      });
      await onSave(commands.read());
    };
    const worker = async (queue: IterableIterator<string>) => {
      while (!controller.signal.aborted && !switched) {
        const next = queue.next();
        if (next.done) return;
        const id = next.value;
        const { offset, used } = rowPlans.get(id)!;
        const current = commands.read();
        if (!isCurrentBatch(current)) return;
        const ref = id.replace(/-render$/, '-ref');
        const reference = current.nodes.find(item => item.id === ref);
        const referenceUrl = reference ? studioNodeMedia(reference).url : '';
        const title = String(current.nodes.find(node => node.id === id)?.nodeName ||
          `Sheet1 第 ${id.match(/-(\d+)-render$/)?.[1] || '?'} 行`);
        const waitForImage = () => waitForStudioMediaRetry(() => {
          const scene = commands.read();
          return isCurrentBatch(scene) ? scene.nodes.find(node => node.id === id) : undefined;
        }, controller.signal);
        let stage = '核对原图片任务';
        try {
          const image = await waitForImage();
          stage = 'Skill 提示词';
          const settings = compilerSettings(image);
          const title = typeof settings.beikeCoverTitle === 'string' ? settings.beikeCoverTitle : undefined;
          const draftInputs = { offset, used, model: textModel, sourceUrl: referenceUrl, title };
          const writerId = id + '-writer';
          let writer = commands.read().nodes.find(node => node.id === writerId);
          if (!writer) {
            insert({
              id: writerId, type: 'text-node', nodeName: '封面提示词撰写',
              x: 0, y: 0, width: 250, height: 250,
              prompt: String(image.prompt || ''),
              settings: { beikeBatchCoverWriter: true, beikeLayerHidden: true, beikeCoverRotationOffset: offset, beikeCoverUsedLayouts: used, beikeTextResultRequired: true, textNodeChatModel: textModel },
            });
            connect([...commands.read().connections, { id: ref + ':' + writerId, from: ref, to: writerId }]);
            writer = commands.read().nodes.find(node => node.id === writerId);
          }
          if (!writer) throw new Error('未能建立提示词节点');
          const writerSettings = compilerSettings(writer);
          const currentCatalog = isCurrentCoverTextOperation(writer.beikeTextOperationId);
          if (!currentCatalog || writer.errorMsg || !writerSettings.textNodeDisplayText ||
              !matchesCoverDraft(writerSettings, draftInputs) || writer.beikeTextRecoveryRequired) {
            if (writerSettings.textNodeIsAnalyzing) throw new Error('提示词正在生成');
            const sameTextModel = writerSettings.textNodeChatModel === textModel ||
              Boolean(selectedTextRoute && writerSettings.textNodeChatModel === selectedTextRoute);
            const canRecoverFormatFailure = currentCatalog && sameTextModel &&
              writerSettings.beikeCoverRotationOffset === offset && Boolean(writer.beikeTextOperationId) &&
              writerSettings.beikeCoverRecoveredOperation !== writer.beikeTextOperationId &&
              /的回复缺少「画幅与构图」段落|封面 Skill 返回的 JSON 不完整或无法解析|封面标题与原文不一致/.test(String(writer.errorMsg || ''));
            commands.update(writerId, studioNodeTaskId(writer), {
              ...(canRecoverFormatFailure ? { beikeTextRecoveryRequired: true } : {}),
              settings: { textNodeChatModel: textModel, beikeCoverRotationOffset: offset, beikeCoverUsedLayouts: used,
                ...(canRecoverFormatFailure ? { beikeCoverRecoveredOperation: writer.beikeTextOperationId } : {}) },
            });
            await runText(writerId, controller.signal);
          }
          controller.signal.throwIfAborted();
          const latest = commands.read();
          if (!isCurrentBatch(latest)) return;
          const result = latest.nodes.find(node => node.id === writerId);
          if (!result || result.errorMsg) throw new Error(String(result?.errorMsg || '没有可用的封面提示词'));
          if (!isCurrentCoverTextOperation(result.beikeTextOperationId)) throw new Error('请使用新版素材重新撰写封面提示词');
          if (!matchesCoverDraft(compilerSettings(result), draftInputs)) {
            throw new Error('已取回上一份提示词，商品图、标题、文本模型或轮换顺序已变化，请按当前设置重新执行');
          }
          const output = String(compilerSettings(result).textNodeDisplayText || '').trim();
          const layout = coverLayoutId(output);
          if (!layout) throw new Error('封面提示词缺少匹配后的版式');
          let normalized: string;
          try {
            normalized = normalizeBatchCoverPrompt(output, layout);
            validateCoverPromptFormat(normalized, undefined, true);
          } catch (error) {
            const message = error instanceof Error ? error.message : '封面 Skill 回复无效';
            commands.update(writerId, studioNodeTaskId(result), { errorMsg: message });
            await onSave(commands.read());
            throw error;
          }
          if (normalized !== output || compilerSettings(result).beikeBatchCoverLayout !== layout) {
            commands.update(writerId, studioNodeTaskId(result), {
              content: normalized,
              settings: { text: normalized, textNodeDisplayText: normalized, beikeBatchCoverLayout: layout },
            });
          }
          if (!latest.connections.some(edge => edge.from === writerId && edge.to === id)) {
            connect([...latest.connections, { id: writerId + ':' + id, from: writerId, to: id }]);
          }
          stage = '核对原图片任务';
          const ready = await waitForImage();
          const previousTaskId = studioNodeTaskId(ready);
          const oldHistory = compilerSettings(ready).beikeCoverLayoutHistory;
          const history = Array.isArray(oldHistory) ? oldHistory.filter((item): item is string => typeof item === 'string') : [];
          const priorLayout = compilerSettings(ready).beikeSubmittedCoverLayout;
          if (typeof priorLayout === 'string' && !history.includes(priorLayout)) history.push(priorLayout);
          commands.update(id, previousTaskId, { settings: { model: selectedImageModel, beikeRequiredInputs: [ref, writerId], beikeSubmittedCoverLayout: layout, beikeCoverLayoutHistory: history } });
          stage = '图片生成';
          if (!await commands.run(id, controller.signal)) {
            const failedNode = commands.read().nodes.find(item => item.id === id);
            throw new Error(String(failedNode?.errorMsg || '图片任务未完成，请查看节点状态'));
          }
          stage = '保存成品';
          await finishCover(id, previousTaskId);
          succeeded++;
        } catch (error) {
          if (!controller.signal.aborted && !switched) {
            failed++;
            const reason = error instanceof Error ? error.message : String(error);
            setErrors(previous => [...previous, { id, title, stage, reason }]);
          }
        } finally {
          settled++;
          if (!controller.signal.aborted && !switched) setProgress(`已处理 ${settled}/${rows.length} 条`);
        }
      }
    };
    try {
      commands.update(source.id, studioNodeTaskId(source), { settings: { beikeCoverBatch: { ...batch, runId } } });
      await onSave(commands.read());
      setProgress(`已处理 0/${rows.length} 条`);
      const queue = rows.values();
      await Promise.allSettled(Array.from(
        { length: Math.min(COVER_BATCH_CONCURRENCY, rows.length) },
        () => worker(queue),
      ));
      if (controller.signal.aborted) return;
      if (switched) {
        setProgress('已切换工作簿，上一批停止提交');
        return;
      }
      setProgress(`${retryIds ? '重试' : '处理'}结束 · 成图 ${succeeded} 条 · 失败 ${failed} 条`);
    } catch (error) {
      if (!controller.signal.aborted) setProgress(error instanceof Error ? error.message : '无法保存本次执行记录');
    } finally {
      active.current = null;
      setRunning(false);
    }
  };

  const completedById = new Map(completed.map(item => [item.id, item]));
  const errorsById = new Map(currentErrors.map(error => [error.id, error]));
  const handled = new Set([...completedById.keys(), ...errorsById.keys()]).size;
  const preview = previewId ? completedById.get(previewId) : undefined;
  return <div className="absolute right-5 top-16 z-40 flex max-w-[calc(100%-2.5rem)] flex-col items-end gap-2 text-xs text-zinc-800 dark:text-zinc-100">
    <button type="button" aria-expanded={open} onClick={() => { closePreview(); setOpen(value => !value); }}
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 font-medium shadow-sm hover:bg-zinc-100 dark:border-white/10 dark:bg-[#202020] dark:hover:bg-[#292929]">
      {running ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
      批量封面
      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 tabular-nums text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{batch.ids.length}</span>
      <ChevronDown size={13} className={open ? 'rotate-180' : ''} />
    </button>
    {open && <div className="grid max-h-[calc(100dvh-8rem)] w-96 max-w-full gap-3 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#1f1f1f]">
      <div className="flex min-w-0 items-center gap-2.5 border-b border-zinc-100 pb-3 dark:border-white/10">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 dark:bg-white/10"><FileSpreadsheet size={16} /></span>
        <div className="min-w-0">
          <p className="font-semibold">批量执行封面</p>
          <p className="truncate text-zinc-500 dark:text-zinc-400" title={batch.name}>{batch.name}</p>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">共用画布中的文本模型和绘图模型，按 Excel 每行的商品图、标题和画幅生成。</p>
      <div className="space-y-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">
        <dl className="grid grid-cols-3 divide-x divide-zinc-200 dark:divide-white/10">
          <div className="px-2">
            <dt className="text-[11px] text-zinc-500 dark:text-zinc-400">全部</dt>
            <dd className="text-lg font-semibold leading-6 tabular-nums">{total}</dd>
          </div>
          <div className="px-2">
            <dt className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={12} />已成图</dt>
            <dd className="text-lg font-semibold leading-6 tabular-nums">{completed.length}</dd>
          </div>
          <div className="px-2">
            <dt className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400"><AlertCircle size={12} />失败</dt>
            <dd className={`text-lg font-semibold leading-6 tabular-nums ${currentErrors.length ? 'text-rose-700 dark:text-rose-300' : ''}`}>{currentErrors.length}</dd>
          </div>
        </dl>
        <div role="progressbar" aria-label="批量执行进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={handled}
          className="flex h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
          <span className="bg-emerald-500 transition-[width] motion-reduce:transition-none" style={{ width: `${completed.length / total * 100}%` }} />
          <span className="bg-rose-500 transition-[width] motion-reduce:transition-none" style={{ width: `${currentErrors.length / total * 100}%` }} />
        </div>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400" role="status">
          {currentProgress || `已处理 ${handled}/${total} 条`}
        </p>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="shrink-0 text-zinc-500 dark:text-zinc-400">Skill 文本模型</span>
        <CanvasModelPicker label="Skill 文本模型" models={textModels} value={selectedTextRoute}
          onChange={model => setSharedModel(writer, 'textNodeChatModel', model)} disabled={running || !writer} placeholder="请选择" preferUp={false} />
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="shrink-0 text-zinc-500 dark:text-zinc-400">图片生成模型</span>
        <CanvasModelPicker label="绘图模型" models={imageModels} value={selectedImageModel ? imageModel : ''}
          onChange={model => setSharedModel(render, 'model', model)} disabled={running || !render} placeholder="请选择" preferUp={false} />
      </div>
      {!connected ? <p className="text-[11px] text-zinc-500 dark:text-zinc-400">请将商品素材接到封面提示词和生成节点，并将提示词接到生成节点。</p>
        : imageModel && !selectedImageModel && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">批量使用商品图和版式参考，请选择支持多张参考图的绘图模型。</p>}
      <button type="button" className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200" disabled={!canRun} onClick={() => void run()}>
        {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        {running ? '执行中…' : batch.runId ? '重新执行整批' : '开始批量执行'}
      </button>
      <button type="button" className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 hover:bg-zinc-50 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
        disabled={downloading || !completed.length} onClick={() => void download()}>
        <Download size={14} />
        {downloading ? '正在打包…' : `下载当前批次 ZIP（${completed.length}/${batch.ids.length}）`}
      </button>
      {downloadError && <p role="alert" className="max-w-80 break-words">{downloadError}</p>}
      <details key={batch.ids[0]} className="min-w-0 rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-white/10">
        <summary className="cursor-pointer font-medium">任务明细（{total} 条{currentErrors.length > 0 && ` · ${currentErrors.length} 条失败`}）</summary>
        {currentErrors.length > 0 && <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={failedOnly} onChange={event => setFailedOnly(event.target.checked)} />只看失败</label>
          <button type="button" disabled={!canRun} onClick={() => void run(currentErrors.map(error => error.id))}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-rose-800 hover:bg-rose-50 disabled:opacity-40 dark:text-rose-300 dark:hover:bg-rose-400/10">
            <RotateCcw size={12} aria-hidden="true" />仅重试失败
          </button>
        </div>}
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto overscroll-contain">
          {rowIds.filter(id => !failedOnly || !currentErrors.length || errorsById.has(id)).map(id => {
            const node = nodesById.get(id);
            const settings = node ? compilerSettings(node) : {};
            const result = completedById.get(id);
            const error = errorsById.get(id);
            const prompt = result && typeof settings.beikeCoverSubmittedPrompt === 'string' ? settings.beikeCoverSubmittedPrompt : '';
            const copy = Array.from(prompt.matchAll(/^第\d+行：“(.*)”｜字号：/gm), match => match[1]).join(' / ');
            const title = String(settings.beikeCoverTitle || node?.nodeName || error?.title || 'Excel 封面');
            const ratio = settings.beikeCoverExportRatio === '4:3' ? '横屏 · 方图' : '竖屏 · 720×960';
            return <li key={id} className="rounded-lg bg-zinc-50 p-2 dark:bg-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-zinc-200/70 text-zinc-500 dark:bg-black/30 dark:text-zinc-400">
                  {result ? <img src={proxyMediaUrl(result.url)} alt="" loading="lazy" className="size-full object-contain" /> : <ImageIcon size={15} aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{title}</span>
                  <span className="block truncate text-[11px] text-zinc-600 dark:text-zinc-400">
                    {error ? '失败' : result ? '已成图' : node?.isGenerating ? '生图中' : '待完成'} · {ratio}{typeof result?.layout === 'string' ? ` · ${result.layout}` : ''}
                  </span>
                </span>
                {result && <button type="button" aria-haspopup="dialog" aria-label={`预览封面 · ${title}`}
                  onClick={() => setPreviewId(id)} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-zinc-200 dark:hover:bg-white/10">
                  <Maximize2 size={14} aria-hidden="true" />
                </button>}
              </div>
              {copy && <p className="mt-1 break-words text-[11px] text-zinc-600 dark:text-zinc-300">封面文案 · {copy}</p>}
              {error && <p className="mt-1 break-words text-[11px] text-rose-800 dark:text-rose-300">{error.stage} · {error.reason}</p>}
            </li>;
          })}
        </ul>
      </details>
      {preview && createPortal(
        <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/75 p-4"
          onWheel={event => event.stopPropagation()} onClick={event => { if (event.target === event.currentTarget) closePreview(); }}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-label="批量封面预览" tabIndex={-1}
            className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-zinc-950 text-zinc-100 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
              <h2 className="min-w-0 flex-1 break-words text-sm font-semibold">{preview.title}</h2>
              <button type="button" aria-label="关闭预览" onClick={closePreview}
                className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-white/10"><X size={18} /></button>
            </div>
            <img src={proxyMediaUrl(preview.url)} alt={preview.title} className="max-h-[80dvh] min-h-0 w-full object-contain" />
          </div>
        </div>, document.body)}
    </div>}
  </div>;
}
