import { CanvasImageControls } from './CanvasImageControls';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { CanvasVideoPromptGuide } from './video/CanvasVideoPromptGuide';
import { CanvasVideoControls } from './video/CanvasVideoControls';
import { videoInputError, videoModes, resolveVideoMode, videoDurationOptions } from '@shared/domain/media/videoCapabilities';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { CanvasDrawingEditor } from './CanvasDrawingEditor';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { persistCanvasMedia } from '../model/canvasMediaImport';
import {drawingGeometry} from '../model/drawingGeometry';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, Loader2, X, WandSparkles, Video } from 'lucide-react';
import { useAppStore } from '@client/store';
import { useCanvasStore } from '../store/useCanvasStore';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { getEnabledVideoModelsFromSettings, getEnabledImageModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { clampVideoDuration } from '@shared/domain/media/video';
import { buildPromptBarGenerationTasks } from '@client/shared/prompt-bar/promptBarSubmit';
import { calculateImageDimensions } from '@client/shared/prompt-bar/promptBarDisplay';
import { IMAGE_RATIO_ITEMS } from '@client/shared/prompt-bar/promptBarConstants';
import type { CanvasNode } from '../model/types';
import { canReference, isTextSource, referenceReady, linkedPrompt } from '../model/canvasGraph';
import { CanvasPromptInput, type CanvasPromptInputRef } from './prompt/CanvasPromptInput';
import { CanvasModelPicker } from './CanvasModelPicker';
import { HomeSyncToggle } from '@client/shared/homePublish/HomeSyncToggle';

const loadModels = (video = false) => (video ? getEnabledVideoModelsFromSettings : getEnabledImageModelsFromSettings)(readWorkflowModelsFromStorage())
  .filter(item => typeof item.id === 'string' && item.id)
  .map(item => ({ ...item,
    supportedAspectRatios: 'supportedAspectRatios' in item ? item.supportedAspectRatios : undefined,
    supportedResolutions: 'supportedResolutions' in item ? item.supportedResolutions : undefined,
    supportedDurations: 'supportedDurations' in item ? item.supportedDurations : undefined,
    id: String(item.id), name: typeof item.name === 'string' ? item.name : String(item.id) }));

export function CanvasDrawingNode({ node, projectId, nodes, selected = false, highlighted = false, onPreview }: { node: CanvasNode; projectId: string; nodes: CanvasNode[]; selected?: boolean; highlighted?: boolean; onPreview?: (url: string) => void }) {
  const editorAnchor = useRef<HTMLDivElement>(null);
  const updateNode = useCanvasStore(s => s.updateNode);
  const initial = useAppStore.getState();
  const isVideo = node.generationKind === 'video';
  const config = node.drawing || { model: isVideo ? initial.quickVideoModel : initial.quickModel, quality: isVideo ? '720P' : initial.quickQuality || 'medium', aspect: isVideo ? '16:9' : initial.quickAspectId || '1:1', count: 1, references: [] };
  const [models, setModels] = useState(() => loadModels(isVideo));
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
  const change = (patch: Partial<typeof config>) => {
    // Removing a linked thumbnail also disconnects its source, without copying other links into static URLs.
    const linkedUrls = nodes.filter(item => node.referenceNodeIds?.includes(item.id)).map(item => isVideo ? item.videoUrl || item.imageUrl : item.imageUrl);
    updateNode(projectId, node.id, {
      drawing: { ...config, ...patch, ...(patch.references ? {references: patch.references.filter(url => !linkedUrls.includes(url))} : {}) },
      ...(patch.references ? {referenceNodeIds: (node.referenceNodeIds || []).filter(id => {
        const url = nodes.find(item => item.id === id)?.[isVideo && nodes.find(item => item.id === id)?.videoUrl ? 'videoUrl' : 'imageUrl'];
        return !url || patch.references!.includes(url);
      })} : {}),
    });
  };
  const busy = node.status === 'generating';
  const selectedModel = config.model || models[0]?.id || '';
  const duration = clampVideoDuration(selectedModel, config.duration || 5);
  const linkedNodes = (node.referenceNodeIds || []).map(id => nodes.find(item => item.id === id)).filter((item): item is CanvasNode => Boolean(item));
  const refs = [...new Set([...config.references, ...linkedNodes.filter(item => canReference(item) || (isVideo && item.videoUrl && !item.missingMedia)).map(item => isVideo ? item.videoUrl || item.imageUrl! : item.imageUrl!)])];
  const referenceNames = mediaReferenceSlots(refs).map(item => item.name);
  const videoMode = resolveVideoMode(selectedModel, config.refMode, refs.filter(url => !isVideoMediaUrl(url)).length, refs.filter(isVideoMediaUrl).length);
  const videoValidation = isVideo ? videoInputError({ model: selectedModel, refMode: videoMode, images: refs.filter(url => !isVideoMediaUrl(url)), videos: refs.filter(isVideoMediaUrl), duration, resolution: config.quality, aspectRatio: config.aspect }) : null;
  const uploadReferences = async (files: File[]) => {
    if (uploadLock.current || !files.length) return;
    uploadLock.current = true;
    setUploading(true);
    setError('');
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (!(isVideo && (file.type.startsWith('video/') || isVideoMediaUrl(file.name))) && !file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) throw new Error('请选择图片文件');
          const media = await persistCanvasMedia(file, 0, 0);
          const mediaUrl = isVideo ? media.videoUrl || media.imageUrl : media.imageUrl;
          if (!mediaUrl) throw new Error('请选择图片或视频文件');
          const current = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
          if (!current) break;
          const drawing = current.drawing || config;
          updateNode(projectId, node.id, { drawing: { ...drawing, references: [...new Set([...drawing.references, mediaUrl])] } });
        } catch (cause) { failures.push(`${file.name}：${cause instanceof Error ? cause.message : '上传失败，请重试'}`); }
      }
      if (failures.length) setError(failures.join('；'));
    } finally { uploadLock.current = false; setUploading(false); }
  };
  const generate = () => {
    if (linkedNodes.some(item => !referenceReady(item))) { setError('上游提示词为空或参考图尚未就绪，请补全内容或断开连接。'); return; }
    if (lock.current || busy || useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id)?.status === 'generating') return;
    if (!models.some(model => model.id === selectedModel)) { setError('请先配置并选择生成模型'); return; }
    if (isVideo) {
      const validation = videoInputError({ model: selectedModel, refMode: videoMode, images: refs.filter(url => !isVideoMediaUrl(url)), videos: refs.filter(isVideoMediaUrl), duration, resolution: config.quality, aspectRatio: config.aspect });
      if (validation) { setError(validation); return; }
    }
    const ratio = IMAGE_RATIO_ITEMS.find(item => item.id === config.aspect) || IMAGE_RATIO_ITEMS[0];
    const result = buildPromptBarGenerationTasks({
      quickGenMode: isVideo ? 'video' : 'image', quickPrompt: linkedPrompt(node, nodes), quickRefImages: refs, activeSubjects: [], allSubjects: [],
      quickModel: selectedModel, quickQuality: config.quality, quickCount: config.count,
      sizeStr: calculateImageDimensions({ quickModel: selectedModel, quickAspectId: config.aspect, quickQuality: config.quality, baseRatio: ratio }).sizeStr,
      currentView: 'canvas', hasImageModels: models.some(model => model.id === selectedModel),
      quickVideoRefMode: videoMode, quickVideoFirstFrame: refs[0] || null, quickVideoLastFrame: refs[1] || null, quickVideoMultiFrames: refs, quickVideoCount: config.count,
      quickVideoModel: selectedModel, quickVideoAspectId: config.aspect, quickVideoResolution: config.quality, quickVideoDuration: duration,
      quickVideoGenerateAudio: config.audio, quickDepthStyle: 'mocap', quickDepthQuality: 'standard',
    });
    if (!result.ok) { setError(result.error); return; }
    lock.current = true;
    setError('');
    try {
      if (node.imageUrl || node.videoUrl) {
        useCanvasStore.getState().addNode(projectId, {
          type: isVideo ? 'video' : 'image', title: `${node.title || (isVideo ? '视频' : '图片')} · 上一版`,
          imageUrl: node.imageUrl, videoUrl: node.videoUrl, content: node.content,
          referenceNodeIds: node.referenceNodeIds, x: node.x - 360, y: node.y,
          width: 280, height: drawingGeometry(node).height, status: 'success',
        });
      }
      // Bind IDs before enqueueing; the existing canvas sync handles results and failures.
      updateNode(projectId, node.id, { taskId: result.tasks[0].id, status: 'generating', imageUrl: undefined, videoUrl: undefined, resultWidth:undefined,resultHeight:undefined,generationSize:isVideo ? config.aspect : calculateImageDimensions({quickModel:selectedModel,quickAspectId:config.aspect,quickQuality:config.quality,baseRatio:ratio}).sizeStr, progress: 0, drawing: { ...config, model: selectedModel } });
      result.tasks.slice(1).forEach((task, index) => useCanvasStore.getState().addNode(projectId, {
        type: 'drawing', generationKind: node.generationKind, drawing: {...config, model:selectedModel}, taskId: task.id, title: `${isVideo ? '视频' : '绘图'} ${index + 2}`, content: node.content, referenceNodeIds: node.referenceNodeIds, status: 'generating',
        x: node.x + (index + 1) * (node.width + 32), y: node.y, width: node.width, height: node.height,
      }));
      useAppStore.getState().addBatchGenerationTasks(result.tasks, result.sessionTitle, result.shouldCreateNewSession);
    } catch (cause) {
      updateNode(projectId, node.id, { status: 'error' });
      setError(cause instanceof Error ? cause.message : '提交失败');
    } finally { lock.current = false; }
  };
  const geometry=drawingGeometry(node);
  return <div ref={editorAnchor} className="pointer-events-none text-slate-600" aria-label={isVideo ? '视频生成节点' : '绘图节点'}>
    <div data-testid="drawing-preview" style={{width:geometry.width,height:geometry.height}} className={`pointer-events-auto mx-auto flex items-center justify-center overflow-hidden rounded-2xl border bg-white transition-[border-color,box-shadow] ${highlighted ? 'border-slate-400 ring-1 ring-slate-400/40' : 'border-slate-200 group-hover:border-slate-300'}`}>
      {isVideo && node.videoUrl ? <video src={proxyMediaUrl(node.videoUrl)} controls playsInline preload="metadata" onMouseDown={event => event.stopPropagation()} onDoubleClick={() => onPreview?.(node.videoUrl!)} onLoadedMetadata={event => { const video = event.currentTarget; if(video.videoWidth && video.videoHeight && (node.resultWidth !== video.videoWidth || node.resultHeight !== video.videoHeight)) updateNode(projectId,node.id,{resultWidth:video.videoWidth,resultHeight:video.videoHeight}); }} className="h-full w-full object-contain" /> : node.imageUrl ? <button type="button" aria-label="预览绘图结果" onMouseDown={event => event.stopPropagation()} onClick={() => onPreview?.(node.imageUrl!)} className="h-full w-full"><img src={proxyMediaUrl(node.imageUrl)} alt="绘图结果" onLoad={event=>{const image=event.currentTarget;if(image.naturalWidth && image.naturalHeight && (node.resultWidth!==image.naturalWidth || node.resultHeight!==image.naturalHeight))updateNode(projectId,node.id,{resultWidth:image.naturalWidth,resultHeight:image.naturalHeight});}} className="h-full w-full object-contain" draggable={false} /></button> : busy ? <AIGeneratingCard embedded task={{id:node.taskId,model:selectedModel,mediaType:isVideo ? 'video' : 'image',prompt:node.content}} progressNumber={node.progress} className="h-full w-full" /> : <div className="flex flex-col items-center gap-4 px-6">{isVideo ? <Video aria-hidden="true" className="h-10 w-10 text-slate-400 stroke-[1.5]" /> : <WandSparkles aria-hidden="true" className="h-10 w-10 text-slate-400 stroke-[1.5]" />}{node.status === 'error' && <span className="text-xs text-slate-500">生成失败，请检查设置后重试</span>}</div>}
    </div>
    {selected && <CanvasDrawingEditor anchor={editorAnchor} aria-label={isVideo ? '视频编辑面板' : '绘图编辑面板'} onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} className="pointer-events-auto rounded-[18px] border border-slate-200 bg-white px-4 pt-3.5 pb-3 shadow-[0_5px_20px_rgba(15,23,42,0.07)]">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" accept={isVideo ? "image/*,video/*" : "image/*"} multiple className="hidden" aria-label="选择参考素材文件" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void uploadReferences(files); }} />
        <button type="button" aria-label="添加参考素材" disabled={uploading} onClick={() => fileInput.current?.click()} title="从系统添加参考素材" className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-transparent text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
        {refs.map((url, index) => <div key={url} className="relative"><button type="button" aria-label={`引用${referenceNames[index]}`} title={`插入 @${referenceNames[index]}`} onMouseDown={event => event.preventDefault()} onClick={() => promptInput.current?.insertReference(index)} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-indigo-400">{isVideoMediaUrl(url) ? <video src={proxyMediaUrl(url)} muted preload="metadata" className="h-11 w-11 rounded-lg object-cover" /> : <img src={proxyMediaUrl(url, {thumb: true, width: 80})} alt={`参考图 ${index + 1}`} className="h-11 w-11 rounded-lg object-cover" />}</button><button type="button" aria-label={`移除${referenceNames[index]}`} onClick={() => change({references: refs.filter(item => item !== url)})} className="absolute -right-1 -top-1 rounded-full bg-white text-slate-500 border border-slate-200"><X className="h-3 w-3" /></button></div>)}

      </div>
      {videoValidation && <p role="status" className="mt-3 text-xs text-amber-700">{videoValidation}</p>}
      {linkedNodes.filter(isTextSource).map(item => <div key={item.id} className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50/70 p-2.5 text-xs text-indigo-700"><span className="min-w-0 flex-1 whitespace-pre-wrap"><strong className="mb-1 block">引用 · {item.title || '提示词'}</strong>{item.content || '上游提示词尚未填写'}</span><button type="button" aria-label={`断开 ${item.title || '提示词'}`} onClick={() => updateNode(projectId, node.id, {referenceNodeIds: node.referenceNodeIds?.filter(id => id !== item.id)})}><X size={13} /></button></div>)}
      <CanvasPromptInput ref={promptInput} value={node.content || ''} references={refs} onChange={content => updateNode(projectId, node.id, {content})} onSubmit={generate} />
      {isVideo && <CanvasVideoPromptGuide model={selectedModel} mode={videoMode} />}

      <div className="flex min-h-9 items-end gap-2 pt-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <CanvasModelPicker label={isVideo ? '视频模型' : '绘图模型'} models={models} value={selectedModel} onChange={model => {
          if (!isVideo) { change({model}); return; }
          const next = models.find(item => item.id === model);
          const ratios = next?.supportedAspectRatios as string[] || ['16:9'];
          const resolutions = next?.supportedResolutions as string[] || ['720P'];
          const quality = resolutions.includes(config.quality) ? config.quality : resolutions.includes('720P') ? '720P' : resolutions[0];
          const refMode = videoModes(model).some(item => item.id === videoMode) ? videoMode : videoModes(model)[0].id;
          const durations = videoDurationOptions(model, quality, refMode);
          change({model, aspect: ratios.includes(config.aspect) ? config.aspect : ratios[0], quality, refMode, duration: durations.includes(duration) ? duration : durations[0]});
        }} disabled={busy} />

        {isVideo ? <CanvasVideoControls config={{...config, references: refs, refMode: videoMode, duration}} model={selectedModel} onChange={change} /> : <CanvasImageControls config={config} onChange={change} />}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
        <HomeSyncToggle />
        <button type="button" aria-label={isVideo ? '开始生成视频' : '开始绘图'} disabled={busy || uploading || Boolean(videoValidation) || (!linkedPrompt(node, nodes) && !(isVideo && refs.length)) || !models.some(item => item.id === selectedModel)} onClick={generate} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-400"><ArrowUp className="h-4 w-4" /></button>
        </div>
      </div>
      {(error || !models.length) && <p role="alert" className="mt-3 text-xs text-amber-700">{error || `请先在设置中配置并启用${isVideo ? '视频' : '绘图'}模型。`}</p>}
    </CanvasDrawingEditor>}
  </div>;
}
