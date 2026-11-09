import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Box, Camera, Cloud, Globe2, Grid2X2, Image as ImageIcon, Loader2, Sparkles, Workflow, X } from 'lucide-react';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { mediaData } from '../../model/canvasNodeFactory';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode, CanvasProviderField, CanvasSpecializedSettings } from '../../model/types';
import { CanvasThreeDNode, resolveThreeDMaterial, resolveThreeDModelId } from './CanvasThreeDNode';

export const specializedButton = 'rounded-lg border border-black/10 px-2.5 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/10';
export const specializedField = 'min-w-0 rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[#d2987a] dark:border-white/10';
export const specializedSurface = 'flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-3 text-slate-800 dark:border-white/10 dark:bg-[#202022] dark:text-zinc-200';

export type PriorityNodeProps = {
  node: CanvasNode;
  sources: CanvasNode[];
  projectId: string;
  selected?: boolean;
  onChange: (patch: Partial<CanvasNode>) => void;
};

export const imageData = (url: string, signal: AbortSignal) => mediaData(url, 'image', signal);

export function CanvasModelPreview({ url, className = '' }: { url: string; className?: string }) {
  const surface = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const target = surface.current;
    if (!target || !/^https:\/\//i.test(url)) return;
    const controller = new AbortController();
    const { signal } = controller;
    let cleanup: (() => void) | undefined;
    setStatus('loading');
    const setup = async () => {
      const [three, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js'),
      ]);
      signal.throwIfAborted();
      const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new Error('模型文件无法读取');
      const length = Number(response.headers.get('content-length'));
      if (length > 64 * 1024 * 1024) throw new Error('模型文件太大');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 64 * 1024 * 1024 || new DataView(buffer).getUint32(0, true) !== 0x46546c67) throw new Error('GLB 文件无效或过大');
      signal.throwIfAborted();
      const manager = new three.LoadingManager();
      manager.setURLModifier(asset => {
        if (!/^(blob:|data:)/i.test(asset)) throw new Error('GLB 包含外部资源');
        return asset;
      });
      const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
      const releaseModel = () => gltf.scene.traverse(object => {
        if (!(object instanceof three.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const texture of Object.values(material)) if (texture instanceof three.Texture) texture.dispose();
          material.dispose();
        }
      });
      cleanup = releaseModel;
      signal.throwIfAborted();
      const bounds = new three.Box3().setFromObject(gltf.scene);
      const scale = bounds.getSize(new three.Vector3()).length();
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('GLB 中无可显示的网格');
      const renderer = new three.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor('#18191c');
      renderer.domElement.className = 'block size-full touch-none';
      const scene = new three.Scene();
      scene.add(gltf.scene, new three.HemisphereLight(0xffffff, 0x7b7391, 2.2));
      const light = new three.DirectionalLight(0xffffff, 2.3);
      light.position.set(3, 5, 4);
      scene.add(light);
      const center = bounds.getCenter(new three.Vector3());
      const camera = new three.PerspectiveCamera(36, 1, scale / 100, scale * 100);
      camera.position.copy(center).add(new three.Vector3(scale, scale * 0.6, scale * 1.6));
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      controls.update();
      const draw = () => renderer.render(scene, camera);
      const resize = () => {
        const width = Math.max(1, target.clientWidth);
        const height = Math.max(1, target.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        draw();
      };
      target.append(renderer.domElement);
      controls.addEventListener('change', draw);
      const observer = new ResizeObserver(resize);
      observer.observe(target);
      cleanup = () => {
        observer.disconnect();
        controls.dispose();
        releaseModel();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      resize();
      setStatus('ready');
    };
    void setup().catch(() => {
      cleanup?.();
      cleanup = undefined;
      if (!signal.aborted) setStatus('error');
    });
    return () => { controller.abort(); cleanup?.(); cleanup = undefined; };
  }, [url]);

  return <div className={`relative min-h-28 shrink-0 overflow-hidden rounded-lg bg-[#18191c] text-white ${className}`} data-model-status={status}
    onMouseDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
    <div ref={surface} role="img" aria-label="可旋转 3D 预览" className="absolute inset-0" />
    {status !== 'ready' && <p className="absolute inset-0 grid place-items-center px-2 text-center text-[11px] text-white/65">{status === 'loading' ? '正在读取 3D 模型…' : '预览不可用，可下载 GLB 文件'}</p>}
  </div>;
}

const rad = Math.PI / 180;

function renderView(canvas: HTMLCanvasElement, source: ImageData, yaw: number, pitch: number, fov: number) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  const frame = context.createImageData(width, height);
  const focal = width / (2 * Math.tan(fov * rad / 2));
  const sinPitch = Math.sin(pitch * rad), cosPitch = Math.cos(pitch * rad);
  for (let y = 0; y < height; y++) {
    const vertical = (height / 2 - y - 0.5) / focal;
    const worldY = vertical * cosPitch + sinPitch;
    const worldZ = cosPitch - vertical * sinPitch;
    for (let x = 0; x < width; x++) {
      const worldX = (x + 0.5 - width / 2) / focal;
      const longitude = Math.atan2(worldX, worldZ) + yaw * rad;
      const latitude = Math.atan2(worldY, Math.hypot(worldX, worldZ));
      const u = ((longitude / (2 * Math.PI) + 0.5) % 1 + 1) % 1;
      const v = Math.min(source.height - 1, Math.floor((0.5 - latitude / Math.PI) * source.height));
      const input = (v * source.width + Math.floor(u * source.width)) * 4;
      const output = (y * width + x) * 4;
      frame.data[output] = source.data[input];
      frame.data[output + 1] = source.data[input + 1];
      frame.data[output + 2] = source.data[input + 2];
      frame.data[output + 3] = source.data[input + 3];
    }
  }
  context.putImageData(frame, 0, 0);
}

export function CanvasPanoramaNode({ node, sources, projectId, onChange }: PriorityNodeProps) {
  const [pixels, setPixels] = useState<ImageData>();
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ yaw: number; pitch: number }>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; next?: { yaw: number; pitch: number } }>(null);
  const source = sources.find(item => item.imageUrl && !item.missingMedia)?.imageUrl;
  const settings = node.specialized;
  const yaw = draft?.yaw ?? settings?.yaw ?? 0;
  const pitch = draft?.pitch ?? settings?.pitch ?? 0;
  const fov = settings?.fov ?? 80;

  useEffect(() => {
    setPixels(undefined);
    setError('');
    if (!source) return;
    let alive = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = proxyMediaUrl(source);
    void image.decode().then(() => {
      if (!alive) return;
      const texture = document.createElement('canvas');
      const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
      texture.width = Math.max(1, Math.round(image.naturalWidth * scale));
      texture.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = texture.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('全景画布不可用');
      context.drawImage(image, 0, 0, texture.width, texture.height);
      setPixels(context.getImageData(0, 0, texture.width, texture.height));
    }).catch(() => { if (alive) setError('无法读取全景图片，请检查来源或重新上传'); });
    return () => { alive = false; };
  }, [source]);

  useEffect(() => {
    if (!pixels || !canvas.current) return;
    const frame = requestAnimationFrame(() => {
      if (canvas.current) renderView(canvas.current, pixels, yaw, pitch, fov);
    });
    return () => cancelAnimationFrame(frame);
  }, [pixels, yaw, pitch, fov]);

  const saveViews = (four: boolean) => {
    if (!pixels || node.layerLocked) return;
    const output = document.createElement('canvas');
    output.width = 640;
    output.height = 360;
    const state = useCanvasStore.getState();
    const urls = (four ? [0, 90, 180, 270] : [0]).map(offset => {
      renderView(output, pixels, yaw + offset, pitch, fov);
      return output.toDataURL('image/png');
    });
    onChange({ imageUrl: urls[0], resultWidth: 640, resultHeight: 360 });
    urls.forEach((imageUrl, index) => state.addNode(projectId, {
      type: 'image', title: four ? `全景 · 角${index + 1}` : '全景截图', imageUrl,
      x: node.x + node.width + 64 + (index % 2) * 290, y: node.y + Math.floor(index / 2) * 190,
      width: 256, height: 144, resultWidth: 640, resultHeight: 360, referenceNodeIds: [node.id],
    }));
  };

  const finish = () => {
    if (drag.current?.next) onChange({ specialized: { ...settings, ...drag.current.next } });
    drag.current = null;
    setDraft(undefined);
  };

  return <section aria-label={node.title} className={specializedSurface} style={{ height: node.height }}>
    <header className="flex items-center gap-2 text-xs font-semibold"><Globe2 size={15} className="text-[#d2987a]" />{node.title}</header>
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-[#19191c] text-xs text-zinc-300">
      {pixels ? <canvas ref={canvas} width={400} height={225} role="img" aria-label="全景预览"
        className="h-full w-full touch-none cursor-grab object-contain active:cursor-grabbing"
        onMouseDown={event => event.stopPropagation()}
        onPointerDown={event => {
          if (event.button !== 0 || node.layerLocked) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, yaw, pitch };
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (!start) return;
          const next = {
            yaw: ((start.yaw + (start.x - event.clientX) * 0.5) % 360 + 360) % 360,
            pitch: Math.max(-85, Math.min(85, start.pitch + (event.clientY - start.y) * 0.5)),
          };
          start.next = next;
          setDraft(next);
        }}
        onLostPointerCapture={finish} /> : <span>{error || (source ? '加载全景图…' : '连接一张等距柱状全景图')}</span>}
    </div>
    {pixels && <p className="text-[11px] opacity-65">{Math.abs(pixels.width / pixels.height - 2) > 0.1 ? '源图并非 2:1，将按全景纹理投影' : '拖动调整水平和垂直视角'}</p>}
    <label className="flex items-center gap-2 text-xs">视野 <input aria-label="全景视野" type="range" min={35} max={110} value={fov} disabled={node.layerLocked} onChange={event => onChange({ specialized: { ...settings, fov: Number(event.target.value) } })} />{fov}°</label>
    <div className="flex gap-2">
      <button type="button" className={`${specializedButton} flex items-center gap-1`} disabled={!pixels || node.layerLocked} onClick={() => saveViews(false)}><Camera size={14} />当前画面拍照</button>
      <button type="button" className={`${specializedButton} flex items-center gap-1`} disabled={!pixels || node.layerLocked} onClick={() => saveViews(true)}><Grid2X2 size={14} />导出四角视角</button>
    </div>
  </section>;
}

function mediaPatch(output: { url: string; extension: string }) {
  const extension = output.extension.toLowerCase().replace(/^\./, '') || new URL(output.url).pathname.split('.').pop()?.toLowerCase() || '';
  return {
    imageUrl: /^(image|png|jpe?g|gif|webp|avif)$/.test(extension) ? output.url : undefined,
    videoUrl: /^(video|mp4|mov|webm)$/.test(extension) ? output.url : undefined,
    audioUrl: /^(audio|mp3|wav|ogg|m4a|flac)$/.test(extension) ? output.url : undefined,
  };
}

export function CanvasProviderNode({ node, sources, projectId, selected = true, onChange }: PriorityNodeProps) {
  const threeD = node.studioSubType === 'gen-3d';
  const upscale = node.studioSubType === 'jimeng-super-resolution';
  const comfy = node.studioSubType === 'rh-comfy';
  const Icon = threeD ? Box : upscale ? Sparkles : comfy ? Workflow : Cloud;
  const state = node.specialized ?? {};
  const current = useRef({ node, onChange });
  current.current = { node, onChange };
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const upscaleProvider = state.upscaleProvider || 'jimeng-api';
  const upscaleUnavailable = upscale && !['jimeng-api', 'jimeng-cli', 'volc-super-res'].includes(upscaleProvider);
  const upscaleResolutionUnavailable = upscale && state.upscaleResolution === '2k';
  const fields = state.fields ?? [];
  const image = sources.find(source => source.imageUrl && !source.missingMedia)?.imageUrl;
  const text = sources.filter(source => ['prompt', 'note'].includes(source.type) && source.content).map(source => source.content).join('\n');
  const patchState = (patch: Partial<CanvasSpecializedSettings>, result?: Partial<CanvasNode>) => {
    const latest = current.current;
    latest.onChange({ ...result, specialized: { ...latest.node.specialized, ...patch } });
  };

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!state.operation || state.taskStatus !== 'pending') return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch('/api/generate/canvas-specialized?status=1&operationKey=' + encodeURIComponent(state.operation!), { signal: controller.signal, cache: 'no-store' });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.submissionRejected) {
          patchState({ taskStatus: 'failed' });
          setError(data.error || '提交被拒绝');
          return;
        }
        if (!response.ok || !data.success) throw new Error(data.error || '暂时无法查询原任务');
        setError('');
        if (data.status === 'done') {
          const outputs = Array.isArray(data.outputs) ? data.outputs as NonNullable<CanvasSpecializedSettings['outputs']> : [];
          const primary = outputs.find(output => Object.values(mediaPatch(output)).some(Boolean));
          patchState({ taskId: data.taskId, taskStatus: 'done', outputs }, primary ? mediaPatch(primary) : {
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
            modelUrl: typeof data.modelUrl === 'string' ? data.modelUrl : undefined,
          });
        } else if (data.status === 'failed') {
          patchState({ taskId: data.taskId, taskStatus: 'failed' });
          setError('提供方任务失败，可调整参数后重新提交');
        } else {
          if (data.taskId && data.taskId !== current.current.node.specialized?.taskId) patchState({ taskId: data.taskId });
          setPollCount(value => value + 1);
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '查询失败');
      }
    }, pollCount ? 3500 : 900);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [state.operation, state.taskStatus, pollCount]);

  const setField = (index: number, field: Partial<CanvasProviderField>) => patchState({ fields: fields.map((value, row) => row === index ? { ...value, ...field } : value) });
  const start = async () => {
    if (request.current || node.layerLocked || state.taskStatus === 'pending') return;
    if (upscaleUnavailable || upscaleResolutionUnavailable) {
      setError('请选择即梦智能超清及 4K 或 8K 后生成');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    let operation: string | undefined;
    try {
      const threeDImages = threeD
        ? await Promise.all(
            sources
              .filter(src => Boolean(src.imageUrl && !src.missingMedia))
              .slice(0, 8)
              .map(src => imageData(src.imageUrl!, controller.signal)),
          )
        : [];
      const threeDModel = resolveThreeDModelId(state.threeDModel);
      const threeDMaterial = resolveThreeDMaterial(state);
      const sourceModelUrl = sources.find(src => Boolean(src.modelUrl))?.modelUrl;
      const payload = upscale ? {
        kind: node.studioSubType, image: image ? await imageData(image, controller.signal) : undefined,
        resolution: state.upscaleResolution || '4k', detail: state.upscaleDetail ?? 50,
      } : threeD ? {
        kind: node.studioSubType,
        model: threeDModel,
        material: threeDMaterial,
        prompt: node.textPrompt || text,
        image: threeDImages[0],
        images: threeDImages.length > 0 ? threeDImages : undefined,
        sourceFileUrl: sourceModelUrl,
        textured: threeDMaterial !== 'geometry',
      } : {
        kind: node.studioSubType, target: state.target?.trim(),
        fields: await Promise.all(fields.map(async field => {
          const source = sources.find(item => item.id === field.sourceId);
          if (field.sourceId && !source) throw new Error('绑定的素材已断开，请重新选择参数来源');
          const media = source?.videoUrl ? { url: source.videoUrl, kind: 'video' as const } : source?.audioUrl ? { url: source.audioUrl, kind: 'audio' as const } :
            source?.imageUrl ? { url: source.imageUrl, kind: 'image' as const } : undefined;
          const fieldValue = media ? await mediaData(media.url, media.kind, controller.signal) : source ? (source.content || '') : field.fieldValue;
          return { nodeId: field.nodeId.trim(), fieldName: field.fieldName.trim(), fieldValue };
        })),
      };
      controller.signal.throwIfAborted();
      operation = crypto.randomUUID();
      patchState({ operation, taskId: undefined, taskStatus: 'pending' });
      await saveCanvasProjects();
      const response = await apiFetch('/api/generate/canvas-specialized', {
        method: 'POST', signal: controller.signal, headers: {
          'Content-Type': 'application/json', 'x-idempotency-key': operation,
        }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.submissionRejected) patchState({ taskStatus: 'failed' });
        throw new Error(data.error || '任务回执待核对');
      }
      patchState({ taskId: data.taskId });
      setPollCount(value => value + 1);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '提交失败');
      if (!operation) setPollCount(0);
    } finally {
      request.current = null;
      setBusy(false);
    }
  };
  const locked = Boolean(node.layerLocked || busy || state.taskStatus === 'pending');
  const activeThreeDModel = resolveThreeDModelId(state.threeDModel);
  const hasSourceModel = sources.some(src => Boolean(src.modelUrl));
  const disabled = locked || (upscale
    ? !image
    : threeD
      ? activeThreeDModel === 'hunyuan-3d-smart-topology-fal'
        ? !hasSourceModel
        : !image && !String(node.textPrompt || text).trim()
      : !state.target?.trim() || fields.some(field => !field.nodeId.trim() || !field.fieldName.trim()));

  if (threeD) {
    return (
      <CanvasThreeDNode
        node={node}
        sources={sources}
        projectId={projectId}
        selected={selected}
        busy={busy}
        locked={locked}
        disabled={disabled}
        error={error}
        ModelPreview={CanvasModelPreview}
        onStart={() => void start()}
        onPoll={() => setPollCount(value => value + 1)}
        onChange={onChange}
        patchState={patchState}
      />
    );
  }

  if (upscale) {
    const activeRes = state.upscaleResolution || '4k';
    const cardHeight = node.height || 250;
    return (
      <div
        role="region" aria-label={node.title || '图片增强'}
        className="pointer-events-auto relative w-full select-none"
        style={{ height: cardHeight }}
      >
        {/* 顶部 250×250 预览卡片：占据节点本体高度，支持直接点击选中与拖拽移动 */}
        <div
          data-testid="drawing-preview"
          style={{ height: cardHeight }}
          className="pointer-events-auto relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-[#1f1f1f] text-zinc-400 cursor-grab active:cursor-grabbing"
        >
          <button
            type="button"
            title="删除节点"
            aria-label="删除节点"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              useCanvasStore.getState().deleteNode(projectId, node.id);
            }}
            className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700/80 text-white/85 transition-colors hover:bg-zinc-600 cursor-pointer"
          >
            <X size={13} />
          </button>
          {state.taskStatus === 'done' && <span className="sr-only" role="status">已完成</span>}
          {node.imageUrl ? (
            <img alt="生成预览" className="h-full w-full object-contain pointer-events-none" src={proxyMediaUrl(node.imageUrl) || node.imageUrl} draggable={false} />
          ) : state.taskStatus === 'pending' || busy ? (
            <div className="pointer-events-none flex flex-col items-center gap-2 text-xs text-zinc-300">
              <Loader2 size={20} className="animate-spin text-white/80" />
              <span>正在超分增强…</span>
            </div>
          ) : (
            <div className="pointer-events-none flex flex-col items-center gap-2 text-zinc-400">
              <ImageIcon size={22} className="opacity-70" />
              <span className="text-xs font-medium tracking-wide">配置并生成</span>
            </div>
          )}
        </div>

        {/* 底部独立参数配置面板：使用 absolute top-full 悬浮于预览框下方，不撑高外层节点边框，同时面板空白处支持点击选中与拖拽 */}
        <div
          data-upscale-config-panel="true"
          className="pointer-events-auto absolute left-1/2 top-full z-30 mt-3 w-[380px] -translate-x-1/2 rounded-2xl border border-white/15 bg-[#1f1f1f] p-3.5 text-white shadow-[0_20px_50px_rgba(0,0,0,0.65)] cursor-grab active:cursor-grabbing"
        >
          <div className="mb-3 flex items-center gap-2.5">
            <span className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-[#121212] px-3 text-xs font-medium text-white">
              高清放大
            </span>
            {image && (
              <img
                src={proxyMediaUrl(image) || image}
                alt="参考图"
                draggable={false}
                className="h-8 w-8 rounded-md border border-white/15 object-cover pointer-events-none"
              />
            )}
          </div>

          <div className="mb-3 flex items-center justify-between gap-3 text-xs">
            <span>即梦智能超清 API</span>
            {upscaleUnavailable && <button type="button" disabled={locked} onClick={() => patchState({ upscaleProvider: 'jimeng-api' })}>
              旧渠道不可用，切换到即梦
            </button>}
          </div>

          <div className="mb-3 flex items-center gap-3">
            <span className="w-[4.5rem] shrink-0 text-xs text-white/70">目标画质</span>
            <div className="flex flex-1 items-center gap-2" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              {(['4k', '8k'] as const).map((res) => {
                const selected = activeRes === res;
                return (
                  <button
                    key={res}
                    type="button"
                    disabled={locked}
                    aria-pressed={selected}
                    onClick={() => patchState({ upscaleResolution: res })}
                    className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                      selected
                        ? 'border-white bg-white font-semibold text-black'
                        : 'border-white/20 bg-transparent text-white/90 hover:bg-white/5'
                    }`}
                  >
                    {res.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mb-3 flex items-center gap-3 text-xs">
            细节程度
            <input aria-label="细节程度" type="number" min={0} max={100} value={state.upscaleDetail ?? 50}
              disabled={locked} onChange={event => patchState({ upscaleDetail: Math.max(0, Math.min(100, Number(event.target.value))) })} />
          </label>
          {upscaleResolutionUnavailable && <p className="mb-2 text-xs">旧稿为 2K，请重新选择 4K 或 8K。</p>}
          {error && <p role="alert" className="mb-2 text-xs text-rose-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-0.5" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            {state.taskStatus === 'pending' && (
              <button
                type="button"
                onClick={() => setPollCount((value) => value + 1)}
                className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/10 cursor-pointer"
              >
                查询原任务
              </button>
            )}
            <button
              type="button"
              title="开始高清放大"
              aria-label="开始高清放大"
              disabled={disabled || upscaleUnavailable || upscaleResolutionUnavailable}
              onClick={() => void start()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-opacity hover:bg-white/90 disabled:opacity-40 cursor-pointer"
            >
              <ArrowUp size={15} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <section aria-label={node.title} className={specializedSurface} style={{ height: node.height }}>
    <header className="flex items-center gap-2 text-xs font-semibold"><Icon size={15} className="text-[#d2987a]" />{node.title}</header>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto" onWheel={event => event.stopPropagation()}>
      <label className="flex flex-col gap-1 text-xs">{comfy ? '工作流 ID' : '应用 ID'}
        <input className={specializedField} inputMode="numeric" value={state.target || ''} disabled={locked} onChange={event => patchState({ target: event.target.value })} />
      </label>
      {fields.map((field, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-1 rounded-lg border border-black/10 p-1.5 dark:border-white/10">
        <input aria-label={`节点 ID ${index + 1}`} placeholder="节点 ID" className={specializedField} value={field.nodeId} disabled={locked} onChange={event => setField(index, { nodeId: event.target.value })} />
        <input aria-label={`字段名 ${index + 1}`} placeholder="字段名" className={specializedField} value={field.fieldName} disabled={locked} onChange={event => setField(index, { fieldName: event.target.value })} />
        <button type="button" aria-label={`删除参数 ${index + 1}`} disabled={locked} onClick={() => patchState({ fields: fields.filter((_, row) => index !== row) })}>×</button>
        <select aria-label={`参数来源 ${index + 1}`} className={`col-span-3 ${specializedField}`} value={field.sourceId || ''} disabled={locked} onChange={event => setField(index, { sourceId: event.target.value || undefined })}>
          <option value="">手动值</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title || source.id}</option>)}
        </select>
        {!field.sourceId && <input aria-label={`参数值 ${index + 1}`} placeholder="参数值" className={`col-span-3 ${specializedField}`} value={field.fieldValue} disabled={locked} onChange={event => setField(index, { fieldValue: event.target.value })} />}
      </div>)}
      <button type="button" className={`${specializedButton} self-start`} disabled={locked || fields.length >= 32} onClick={() => patchState({ fields: [...fields, { nodeId: '', fieldName: '', fieldValue: '' }] })}>添加参数</button>
      {node.modelUrl && <CanvasModelPreview url={node.modelUrl} />}
      {node.imageUrl && !node.modelUrl && <img alt="生成预览" className="max-h-36 rounded-lg object-contain" src={proxyMediaUrl(node.imageUrl)} />}
      {node.videoUrl && <video aria-label="生成视频" controls preload="metadata" src={proxyMediaUrl(node.videoUrl, { asVideo: true })} />}
      {node.audioUrl && <audio aria-label="生成音频" controls preload="metadata" src={proxyMediaUrl(node.audioUrl, { asAudio: true })} />}
      {node.modelUrl && <a href={node.modelUrl} target="_blank" rel="noreferrer" className="text-xs underline">下载 GLB</a>}
      {state.outputs?.map((output, index) => <a key={index} href={output.url} target="_blank" rel="noreferrer" className="text-xs underline">输出 {index + 1}{output.extension ? ' · ' + output.extension : ''}</a>)}
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </div>
    <div className="flex items-center justify-between gap-2">
      <span role="status" className="truncate text-[11px] opacity-65">{state.taskStatus === 'done' ? '已完成' : state.taskStatus === 'pending' ? '等待任务结果' : 'RunningHub'}</span>
      {state.taskStatus === 'pending' ?
        <button type="button" className={specializedButton} onClick={() => setPollCount(value => value + 1)}>查询原任务</button> :
        <button type="button" className={specializedButton} disabled={disabled} onClick={() => void start()}>生成</button>}
    </div>
  </section>;
}
