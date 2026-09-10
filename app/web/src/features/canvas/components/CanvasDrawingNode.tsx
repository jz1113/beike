import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import { persistCanvasMedia } from '../canvasMediaImport';
import {drawingGeometry} from '../drawingGeometry';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square, Plus, Loader2, WandSparkles, X, Info, Volume2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useCanvasStore } from '../store/useCanvasStore';
import { proxyMediaUrl } from '@/lib/apiClient';
import { getEnabledVideoModelsFromSettings, getEnabledImageModelsFromSettings, readWorkflowModelsFromStorage } from '@beike/domain/workflowModels';
import { buildPromptBarGenerationTasks } from '@/features/home/utils/promptBarSubmit';
import { calculateImageDimensions } from '@/features/home/utils/promptBarDisplay';
import { IMAGE_RATIO_ITEMS } from '@/features/home/data/promptBarConstants';
import type { CanvasNode } from '../types';
import { canReference } from './CanvasConnections';
import { CanvasPromptInput, type CanvasPromptInputRef } from './CanvasPromptInput';
import { CanvasModelPicker } from './CanvasModelPicker';

const loadModels = (video = false) => (video ? getEnabledVideoModelsFromSettings : getEnabledImageModelsFromSettings)(readWorkflowModelsFromStorage())
  .filter(item => typeof item.id === 'string' && item.id)
  .map(item => ({ ...item, supportedAspectRatios:item.supportedAspectRatios, supportedResolutions:item.supportedResolutions, supportedDurations:item.supportedDurations, id: String(item.id), name: typeof item.name === 'string' ? item.name : String(item.id) }));

const VIDEO_ASPECT_ITEMS = [
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '21:9', label: '21:9', w: 21, h: 9 },
];

export function CanvasDrawingNode({ node, projectId, nodes, selected = false, onPreview }: { node: CanvasNode; projectId: string; nodes: CanvasNode[]; selected?: boolean; onPreview?: (url: string) => void }) {
  const updateNode = useCanvasStore(s => s.updateNode);
  const initial = useAppStore.getState();
  const isVideo = node.generationKind === 'video';
  const config = node.drawing || { model: isVideo ? initial.quickVideoModel : initial.quickModel, quality: isVideo ? '720P' : initial.quickQuality || 'medium', aspect: isVideo ? '16:9' : initial.quickAspectId || '1:1', count: 1, references: [] };
  const [models, setModels] = useState(() => loadModels(isVideo));
  const [panel, setPanel] = useState<'settings' | 'count' | null>(null);
  const [error, setError] = useState('');
  const promptInput = useRef<CanvasPromptInputRef>(null);
  const lock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    const refresh = () => setModels(loadModels(isVideo));
    window.addEventListener('models_updated', refresh);
    return () => window.removeEventListener('models_updated', refresh);
  }, [isVideo]);
  useEffect(() => {
    if (panel !== 'settings' && panel !== 'count') return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.('[data-drawing-settings]')) setPanel(null);
    };
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') setPanel(null);};
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => {document.removeEventListener('pointerdown', dismiss);document.removeEventListener('keydown', escape, true);};
  }, [panel]);
  useEffect(()=>{if(!selected)setPanel(null);},[selected]);
  const change = (patch: Partial<typeof config>) => {
    // Removing a linked thumbnail also disconnects its source, without copying other links into static URLs.
    const linkedUrls = nodes.filter(item => node.referenceNodeIds?.includes(item.id)).map(item => item.imageUrl);
    updateNode(projectId, node.id, {
      drawing: { ...config, ...patch, ...(patch.references ? {references: patch.references.filter(url => !linkedUrls.includes(url))} : {}) },
      ...(patch.references ? {referenceNodeIds: (node.referenceNodeIds || []).filter(id => {
        const url = nodes.find(item => item.id === id)?.imageUrl;
        return !url || patch.references!.includes(url);
      })} : {}),
    });
  };
  const busy = node.status === 'generating';
  const selectedModel = config.model || models[0]?.id || '';
  const activeModel = models.find(model => model.id === selectedModel);
  const videoAspects = (activeModel?.supportedAspectRatios as string[] | undefined)?.length ? (activeModel!.supportedAspectRatios as string[]) : ['16:9','4:3','1:1','3:4','9:16','21:9'];
  const rawResolutions = activeModel?.supportedResolutions as string[] | undefined;
  const videoResolutions: string[] = rawResolutions && Array.isArray(rawResolutions) && rawResolutions.length > 0 ? rawResolutions : ['480P', '720P', '1080P'];
  const rawDurations = activeModel?.supportedDurations as number[] | undefined;
  const videoDurations = rawDurations && Array.isArray(rawDurations) && rawDurations.length > 0 ? [...rawDurations].sort((a, b) => a - b) : [4, 5, 6, 7, 8, 9, 10, 11, 12];
  const duration = config.duration || 5;
  const linkedNodes = (node.referenceNodeIds || []).map(id => nodes.find(item => item.id === id)).filter((item): item is CanvasNode => Boolean(item));
  const refs = [...new Set([...config.references, ...linkedNodes.filter(canReference).map(item => item.imageUrl!)])];
  const uploadReferences = async (files: File[]) => {
    if (uploadLock.current || !files.length) return;
    uploadLock.current = true;
    setUploading(true);
    setError('');
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) throw new Error('请选择图片文件');
          const media = await persistCanvasMedia(file, 0, 0);
          if (!media.imageUrl) throw new Error('请选择图片文件');
          const current = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
          if (!current) break;
          const drawing = current.drawing || config;
          updateNode(projectId, node.id, { drawing: { ...drawing, references: [...new Set([...drawing.references, media.imageUrl])] } });
        } catch (cause) { failures.push(`${file.name}：${cause instanceof Error ? cause.message : '上传失败，请重试'}`); }
      }
      if (failures.length) setError(failures.join('；'));
    } finally { uploadLock.current = false; setUploading(false); }
  };
  const generate = () => {
    if (linkedNodes.some(item => !canReference(item))) { setError('连接的参考图尚未就绪，请等待生成完成或断开连接。'); return; }
    if (lock.current || busy || useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id)?.status === 'generating') return;
    if (!models.some(model => model.id === selectedModel)) { setError('请先配置并选择生成模型'); return; }
    if (isVideo && (!videoAspects.includes(config.aspect) || !videoResolutions.map(r => r.toUpperCase()).includes(config.quality.toUpperCase()) || !videoDurations.includes(duration))) { setError('请在视频参数中选择当前模型支持的比例、分辨率和时长'); setPanel('settings'); return; }
    if (isVideo && config.refMode === 'first_last_frame' && refs.length > 2) { setError('首尾帧模式最多使用两张参考图，请移除多余图片'); return; }
    const ratio = IMAGE_RATIO_ITEMS.find(item => item.id === config.aspect) || IMAGE_RATIO_ITEMS[0];
    const result = buildPromptBarGenerationTasks({
      quickGenMode: isVideo ? 'video' : 'image', quickPrompt: node.content || '', quickRefImages: refs, activeSubjects: [], allSubjects: [],
      quickModel: selectedModel, quickQuality: config.quality, quickCount: config.count,
      sizeStr: calculateImageDimensions({ quickModel: selectedModel, quickAspectId: config.aspect, quickQuality: config.quality, baseRatio: ratio }).sizeStr,
      currentView: 'canvas', hasImageModels: models.some(model => model.id === selectedModel),
      quickVideoRefMode: config.refMode || 'omni', quickVideoFirstFrame: refs[0] || null, quickVideoLastFrame: refs[1] || null, quickVideoMultiFrames: refs, quickVideoCount: config.count,
      quickVideoModel: selectedModel, quickVideoAspectId: config.aspect, quickVideoResolution: config.quality, quickVideoDuration: duration,
      quickVideoGenerateAudio: config.audio, quickDepthStyle: 'mocap', quickDepthQuality: 'standard',
    });
    if (!result.ok) { setError(result.error); return; }
    lock.current = true;
    setError(''); setPanel(null);
    try {
      // Bind IDs before enqueueing; the existing canvas sync handles results and failures.
      updateNode(projectId, node.id, { taskId: result.tasks[0].id, status: 'generating', imageUrl: undefined, videoUrl: undefined, resultWidth:undefined,resultHeight:undefined,generationSize:isVideo ? config.aspect : calculateImageDimensions({quickModel:selectedModel,quickAspectId:config.aspect,quickQuality:config.quality,baseRatio:ratio}).sizeStr, progress: 0, drawing: { ...config, model: selectedModel } });
      result.tasks.slice(1).forEach((task, index) => useCanvasStore.getState().addNode(projectId, {
        type: 'drawing', generationKind: node.generationKind, drawing: {...config, model:selectedModel}, taskId: task.id, title: `${isVideo ? '视频' : '绘图'} ${index + 2}`, content: node.content, status: 'generating',
        x: node.x + (index + 1) * (node.width + 32), y: node.y, width: node.width, height: node.height,
      }));
      useAppStore.getState().addBatchGenerationTasks(result.tasks, result.sessionTitle, result.shouldCreateNewSession);
    } catch (cause) {
      updateNode(projectId, node.id, { status: 'error' });
      setError(cause instanceof Error ? cause.message : '提交失败');
    } finally { lock.current = false; }
  };
  const geometry=drawingGeometry(node);
  return <div className="text-slate-600" aria-label={isVideo ? '视频生成节点' : '绘图节点'}>
    <div data-testid="drawing-preview" style={{width:geometry.width,height:geometry.height}} className={`mx-auto flex items-center justify-center overflow-hidden rounded-[20px] border bg-white transition-[border-color,box-shadow] ${selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 group-hover:border-indigo-300'}`}>
      {isVideo && node.videoUrl ? <video src={proxyMediaUrl(node.videoUrl)} controls playsInline preload="metadata" onMouseDown={event => event.stopPropagation()} onDoubleClick={() => onPreview?.(node.videoUrl!)} onLoadedMetadata={event => { const video = event.currentTarget; if(video.videoWidth && video.videoHeight && (node.resultWidth !== video.videoWidth || node.resultHeight !== video.videoHeight)) updateNode(projectId,node.id,{resultWidth:video.videoWidth,resultHeight:video.videoHeight}); }} className="h-full w-full object-contain" /> : node.imageUrl ? <button type="button" aria-label="预览绘图结果" onMouseDown={event => event.stopPropagation()} onClick={() => onPreview?.(node.imageUrl!)} className="h-full w-full"><img src={proxyMediaUrl(node.imageUrl)} alt="绘图结果" onLoad={event=>{const image=event.currentTarget;if(image.naturalWidth && image.naturalHeight && (node.resultWidth!==image.naturalWidth || node.resultHeight!==image.naturalHeight))updateNode(projectId,node.id,{resultWidth:image.naturalWidth,resultHeight:image.naturalHeight});}} className="h-full w-full object-contain" draggable={false} /></button> : busy ? <AIGeneratingCard embedded task={{id:node.taskId,model:selectedModel,mediaType:isVideo ? 'video' : 'image',prompt:node.content}} progressNumber={node.progress} className="h-full w-full" /> : <div className="flex flex-col items-center gap-3"><WandSparkles className="h-10 w-10 text-slate-400" />{node.status === 'error' && <span className="text-xs text-slate-500">生成失败，请检查设置后重试</span>}</div>}
    </div>
    {selected && <div aria-label={isVideo ? '视频编辑面板' : '绘图编辑面板'} onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} style={{width: Math.max(node.width, 960), marginLeft: (node.width - Math.max(node.width, 960)) / 2}} className="relative mt-7 rounded-[24px] border border-slate-200 bg-white px-6 pt-5 pb-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" aria-label="选择参考素材文件" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void uploadReferences(files); }} />
        <button type="button" aria-label="添加参考素材" disabled={uploading} onClick={() => fileInput.current?.click()} title="从系统添加参考素材" className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-500 transition-colors hover:border-indigo-400 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
        {refs.map((url, index) => <div key={url} className="relative"><button type="button" aria-label={`引用图片${index + 1}`} title={`插入 @图片${index + 1}`} onMouseDown={event => event.preventDefault()} onClick={() => promptInput.current?.insertReference(index)} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-400"><img src={proxyMediaUrl(url, {thumb: true, width: 80})} alt={`参考图 ${index + 1}`} className="h-11 w-11 rounded-lg object-cover" /></button><button type="button" aria-label={`移除参考图 ${index + 1}`} onClick={() => change({references: refs.filter(item => item !== url)})} className="absolute -right-1 -top-1 rounded-full bg-white text-slate-500 border border-slate-200"><X className="h-3 w-3" /></button></div>)}
        
      </div>
      <CanvasPromptInput ref={promptInput} value={node.content || ''} references={refs} onChange={content => updateNode(projectId, node.id, {content})} onSubmit={generate} />
      {panel === 'settings' && isVideo && (
        <div
          role="dialog"
          aria-label="画质与比例"
          data-drawing-settings
          className="absolute bottom-16 left-6 z-30 w-[332px] rounded-2xl bg-white/95 backdrop-blur-md text-slate-800 border border-slate-200/90 shadow-[0_16px_36px_rgba(15,23,42,0.12)] p-4 space-y-3.5 select-none text-left"
        >
          {/* 1. 生成方式 */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center justify-between">
              <span>生成方式</span>
            </div>
            <div className="w-full grid grid-cols-2 rounded-xl bg-slate-100/90 p-1 gap-1">
              <button
                type="button"
                onClick={() => change({ refMode: 'first_last_frame' })}
                className={`py-1.5 text-xs font-medium rounded-lg transition-all text-center flex items-center justify-center ${
                  config.refMode === 'first_last_frame'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                首尾帧
              </button>
              <button
                type="button"
                onClick={() => change({ refMode: 'omni' })}
                className={`py-1.5 text-xs font-medium rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  (config.refMode || 'omni') === 'omni'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                <span>全能参考</span>
                <Info className="w-3 h-3 text-slate-400 opacity-80 inline-block" />
              </button>
            </div>
          </div>

          {/* 2. 比例 */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
              比例
            </div>
            <div className="w-full grid grid-cols-6 gap-1 rounded-xl bg-slate-100/90 p-1">
              {VIDEO_ASPECT_ITEMS.map((item) => {
                const selected = config.aspect === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    aria-label={`比例 ${item.label}`}
                    aria-pressed={selected}
                    onClick={() => change({ aspect: item.id })}
                    className={`flex h-13 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-mono transition-all ${
                      selected
                        ? 'bg-white text-indigo-600 font-semibold shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    <span aria-hidden="true" className="flex h-5 w-6 items-center justify-center">
                      <span
                        className={`block rounded-[1.5px] border transition-colors ${
                          selected ? 'border-indigo-600' : 'border-slate-400'
                        }`}
                        style={{
                          width: Math.round((16 * item.w) / Math.max(item.w, item.h)),
                          height: Math.round((16 * item.h) / Math.max(item.w, item.h)),
                        }}
                      />
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. 清晰度 */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
              清晰度
            </div>
            <div className="w-full flex rounded-xl bg-slate-100/90 p-1 gap-1">
              {(videoResolutions.length > 0 ? videoResolutions : ['480P', '720P', '1080P']).map((res) => {
                const normalizedCurrent = (config.quality || '720P').toUpperCase();
                const isSelected = normalizedCurrent === res.toUpperCase();
                return (
                  <button
                    key={res}
                    type="button"
                    onClick={() => change({ quality: res })}
                    className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-lg transition-all text-center ${
                      isSelected
                        ? 'bg-white text-slate-900 font-semibold shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    {res.toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. 生成时长 */}
          <div>
            <div className="text-[11px] font-semibold text-slate-500 mb-1.5">
              生成时长
            </div>
            <div className="w-full flex items-center gap-1 rounded-xl bg-slate-100/90 p-1 overflow-x-auto no-scrollbar scroll-smooth">
              {(videoDurations.length > 0 ? videoDurations : [4, 5, 6, 7, 8, 9, 10, 11, 12]).map((sec) => {
                const isSelected = duration === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => change({ duration: sec })}
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg shrink-0 transition-all ${
                      isSelected
                        ? 'bg-white text-slate-900 font-semibold shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                    }`}
                  >
                    {sec}s
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. 生成音频 */}
          <div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mb-1.5">
              <span>生成音频</span>
              <Info className="w-3 h-3 text-slate-400 opacity-80 cursor-pointer" />
            </div>
            <div className="w-full grid grid-cols-2 rounded-xl bg-slate-100/90 p-1 gap-1">
              <button
                type="button"
                onClick={() => change({ audio: true } as any)}
                className={`py-1.5 text-xs font-medium rounded-lg transition-all text-center ${
                  config.audio
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                开启
              </button>
              <button
                type="button"
                onClick={() => change({ audio: false } as any)}
                className={`py-1.5 text-xs font-medium rounded-lg transition-all text-center ${
                  !config.audio
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === 'settings' && !isVideo && (
        <div
          role="dialog"
          aria-label="画质与比例"
          data-drawing-settings
          className="absolute bottom-16 left-6 z-30 w-[296px] space-y-3 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-lg text-left"
        >
          <div>
            <p className="mb-1.5 px-1 text-[11px] text-slate-500">画质</p>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {([
                { id: 'low', label: '低画质' },
                { id: 'medium', label: '标准' },
                { id: 'high', label: '高画质' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={config.quality === item.id}
                  onClick={() => change({ quality: item.id })}
                  className={`flex-1 rounded-lg py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400 ${
                    config.quality === item.id
                      ? 'bg-white font-medium text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 px-1 text-[11px] text-slate-500">比例</p>
            <div className="grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1">
              {IMAGE_RATIO_ITEMS.map((item) => {
                const [w, h] = item.id.includes(':')
                  ? item.id.split(':').map(Number)
                  : [1, 1];
                const selected = config.aspect === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    aria-label={`比例 ${item.label}`}
                    aria-pressed={selected}
                    onClick={() => change({ aspect: item.id })}
                    className={`flex h-14 flex-col items-center justify-center gap-1.5 rounded-lg text-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400 ${
                      selected
                        ? 'bg-white font-medium text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:bg-white/60'
                    }`}
                  >
                    <span aria-hidden="true" className="flex h-5 w-6 items-center justify-center">
                      <span
                        className={`block rounded-[2px] border border-current ${
                          item.id === 'smart' ? 'border-dashed' : ''
                        }`}
                        style={{
                          width: (18 * w) / Math.max(w, h),
                          height: (18 * h) / Math.max(w, h),
                        }}
                      />
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="flex min-h-9 items-center gap-2">
        <div className="flex min-w-0 items-center gap-1">
        <CanvasModelPicker models={models} value={selectedModel} onChange={model => { const next=models.find(item=>item.id===model); change(isVideo ? {model,aspect:(next?.supportedAspectRatios as string[])?.[0] || '16:9',quality:(next?.supportedResolutions as string[])?.[0] || '720P',duration:(next?.supportedDurations as number[])?.[0] || 5} : {model}); }} disabled={busy} />
        <span aria-hidden="true" className="mx-1 h-3.5 w-px shrink-0 bg-slate-200" />
        <button
          type="button"
          data-drawing-settings
          aria-label="绘图参数"
          aria-expanded={panel === 'settings'}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400 ${
            panel === 'settings'
              ? 'bg-slate-900 text-white font-medium shadow-xs'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
          onClick={() => setPanel(panel === 'settings' ? null : 'settings')}
        >
          <Square aria-hidden="true" className="h-3.5 w-3.5 opacity-70" />
          {isVideo ? (
            <span className="font-mono flex items-center gap-1">
              <span>{config.refMode === 'first_last_frame' ? '首尾帧' : '全能参考'}</span>
              <span className="opacity-40">·</span>
              <span>{config.aspect}</span>
              <span className="opacity-40">·</span>
              <span>{(config.quality || '720P').toLowerCase()}</span>
              <span className="opacity-40">·</span>
              <span>{duration}s</span>
              {config.audio && (
                <>
                  <span className="opacity-40">·</span>
                  <Volume2 className="h-3.5 w-3.5 text-cyan-500 inline-block shrink-0" />
                </>
              )}
            </span>
          ) : (
            <span>
              {config.aspect === 'smart' ? '智能' : config.aspect} · {config.quality === 'high' ? '高画质' : config.quality === 'low' ? '低画质' : '标准画质'}
            </span>
          )}
        </button>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="relative" data-drawing-settings>
          <button type="button" aria-label="绘图张数" aria-haspopup="menu" aria-expanded={panel === 'count'} onClick={() => setPanel(panel === 'count' ? null : 'count')} className="flex h-8 min-w-9 items-center justify-center rounded-lg bg-transparent px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-400">{config.count}×</button>
          {panel === 'count' && <div role="menu" aria-label="选择生成张数" className="absolute bottom-full left-1/2 z-30 mb-2 flex w-12 -translate-x-1/2 flex-col gap-1 rounded-2xl border border-slate-200/70 bg-white p-1 shadow-lg" onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1) + items.length) % items.length]?.focus();
            }
          }}>
            {[4,2,1].map(count => <button key={count} type="button" role="menuitemradio" aria-checked={config.count === count} autoFocus={config.count === count} onClick={event => {
              change({count}); setPanel(null);
              event.currentTarget.closest('[data-drawing-settings]')?.querySelector<HTMLButtonElement>('[aria-label="绘图张数"]')?.focus();
            }} className={`h-8 rounded-xl text-xs transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400 ${config.count === count ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>{count}×</button>)}
          </div>}
        </div>
        <button type="button" aria-label={isVideo ? '开始生成视频' : '开始绘图'} disabled={busy || uploading || (!node.content?.trim() && !(isVideo && refs.length)) || !models.some(item => item.id === selectedModel)} onClick={generate} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-400"><ArrowUp className="h-4 w-4" /></button>
        </div>
      </div>
      {(error || !models.length) && <p role="alert" className="mt-3 text-xs text-amber-700">{error || `请先在设置中配置并启用${isVideo ? '视频' : '绘图'}模型。`}</p>}
    </div>}
  </div>;
}
