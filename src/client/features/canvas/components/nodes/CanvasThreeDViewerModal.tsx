import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Eye, EyeOff, RotateCcw, Sun, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { CanvasNode } from '../../model/types';

export interface ThreeDViewerLights {
  ambient: number;
  key: number;
  fill: number;
  exposure: number;
  background: string;
}

export const DEFAULT_THREE_D_LIGHTS: ThreeDViewerLights = {
  ambient: 1.4,
  key: 2.2,
  fill: 0.9,
  exposure: 1.3,
  background: '#000000',
};

const LIGHT_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  lights: Omit<ThreeDViewerLights, 'background'>;
}> = [
  { id: 'soft', label: '柔和', lights: { ambient: 1.8, key: 1.2, fill: 1.1, exposure: 1.15 } },
  { id: 'standard', label: '标准', lights: { ambient: 1.4, key: 2.2, fill: 0.9, exposure: 1.3 } },
  { id: 'bright', label: '明亮', lights: { ambient: 1.7, key: 3.1, fill: 1.4, exposure: 1.55 } },
  { id: 'studio', label: '影棚', lights: { ambient: 0.55, key: 3.4, fill: 0.35, exposure: 1.2 } },
];

const BACKGROUND_SWATCHES: ReadonlyArray<{ id: string; label: string; value: string }> = [
  { id: 'black', label: '纯黑', value: '#000000' },
  { id: 'dark', label: '深灰', value: '#1a1a1a' },
  { id: 'studio', label: '影棚', value: '#2b2b30' },
  { id: 'silver', label: '浅灰', value: '#d6d6d6' },
  { id: 'white', label: '纯白', value: '#ffffff' },
  { id: 'warm', label: '暖灰', value: '#e8e2d6' },
];

export type ViewfinderRatio = '16:9' | '3:2' | '1:1' | '9:16';
const VIEWFINDER_RATIOS: readonly ViewfinderRatio[] = ['16:9', '3:2', '1:1', '9:16'];

function ratioToAspect(ratio: ViewfinderRatio): number {
  switch (ratio) {
    case '16:9':
      return 16 / 9;
    case '3:2':
      return 1.5;
    case '9:16':
      return 9 / 16;
    case '1:1':
    default:
      return 1;
  }
}

function LightSliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="grid grid-cols-[36px_1fr_38px] items-center gap-2 text-[11px] text-white/75">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 cursor-pointer accent-white"
      />
      <span className="text-right font-mono text-[10px] text-white/55">{value.toFixed(1)}</span>
    </label>
  );
}

function LightControlPopover({
  lights,
  onChange,
  onReset,
  onClose,
}: {
  lights: ThreeDViewerLights;
  onChange: (next: ThreeDViewerLights) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (target.closest('[data-three-d-light-toggle]')) return;
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="three-d-light-popover"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute bottom-16 left-1/2 z-30 w-72 -translate-x-1/2 rounded-2xl border border-white/15 bg-[#121318]/92 p-3.5 text-xs text-white shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="font-semibold text-white/90">光源调节</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-0.5 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white cursor-pointer"
        >
          收起
        </button>
      </div>

      <div className="mb-3 grid grid-cols-5 gap-1">
        {LIGHT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange({ ...lights, ...preset.lights })}
            className="rounded-lg border border-white/10 bg-white/[0.06] py-1 text-[11px] font-medium text-white/80 transition hover:border-white/25 hover:bg-white/14 hover:text-white cursor-pointer"
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-white/10 bg-white/[0.04] py-1 text-[11px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white cursor-pointer"
        >
          重置
        </button>
      </div>

      <div className="space-y-2.5">
        <LightSliderRow
          label="环境"
          value={lights.ambient}
          min={0}
          max={4}
          step={0.05}
          onChange={(ambient) => onChange({ ...lights, ambient })}
        />
        <LightSliderRow
          label="主光"
          value={lights.key}
          min={0}
          max={5}
          step={0.05}
          onChange={(key) => onChange({ ...lights, key })}
        />
        <LightSliderRow
          label="补光"
          value={lights.fill}
          min={0}
          max={3}
          step={0.05}
          onChange={(fill) => onChange({ ...lights, fill })}
        />
        <LightSliderRow
          label="曝光"
          value={lights.exposure}
          min={0.4}
          max={2.4}
          step={0.05}
          onChange={(exposure) => onChange({ ...lights, exposure })}
        />

        <div className="grid grid-cols-[36px_1fr] items-center gap-2 pt-0.5 text-[11px] text-white/75">
          <span>背景</span>
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              {BACKGROUND_SWATCHES.map((swatch) => {
                const active = lights.background.toLowerCase() === swatch.value.toLowerCase();
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    title={swatch.label}
                    aria-label={`背景${swatch.label}`}
                    onClick={() => onChange({ ...lights, background: swatch.value })}
                    style={{ backgroundColor: swatch.value }}
                    className={`h-5 w-5 rounded-full border transition cursor-pointer ${
                      active
                        ? 'scale-110 border-white ring-2 ring-white/35'
                        : 'border-white/25 hover:border-white/60'
                    }`}
                  />
                );
              })}
            </div>
            <label
              title="自定义背景色"
              className="relative flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/30 bg-white/10"
            >
              <input
                type="color"
                aria-label="自定义背景颜色"
                value={lights.background}
                onChange={(e) => onChange({ ...lights, background: e.target.value })}
                className="absolute inset-0 h-8 w-8 -translate-x-1 -translate-y-1 cursor-pointer border-0 bg-transparent p-0 opacity-0"
              />
              <span
                className="h-3.5 w-3.5 rounded-full border border-white/25"
                style={{ backgroundColor: lights.background }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewfinderOverlay({
  ratio,
  capturing,
  onRatioChange,
  onCapture,
}: {
  ratio: ViewfinderRatio;
  capturing: boolean;
  onRatioChange: (next: ViewfinderRatio) => void;
  onCapture: (rect: DOMRect) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 520, height: 292 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const bounds = container.getBoundingClientRect();
      const maxW = Math.max(220, bounds.width - 140);
      const maxH = Math.max(180, bounds.height - 210);
      const aspect = ratioToAspect(ratio);
      let width = maxW;
      let height = width / aspect;
      if (height > maxH) {
        height = maxH;
        width = height * aspect;
      }
      setSize({ width: Math.round(width), height: Math.round(height) });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [ratio]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        ref={frameRef}
        data-testid="three-d-viewfinder-frame"
        style={{
          width: size.width,
          height: size.height,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.58)',
        }}
        className="relative rounded-sm border border-white/85"
      >
        <span className="absolute -left-0.5 -top-0.5 h-6 w-6 border-l-[3px] border-t-[3px] border-white" />
        <span className="absolute -right-0.5 -top-0.5 h-6 w-6 border-r-[3px] border-t-[3px] border-white" />
        <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 border-b-[3px] border-l-[3px] border-white" />
        <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 border-b-[3px] border-r-[3px] border-white" />
      </div>

      <div className="pointer-events-auto absolute bottom-16 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/75 p-1 text-xs text-white shadow-2xl backdrop-blur-md">
        {VIEWFINDER_RATIOS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onRatioChange(item)}
            className={`rounded-full px-3 py-1.5 font-medium transition cursor-pointer ${
              ratio === item
                ? 'bg-white/18 text-white'
                : 'text-white/65 hover:bg-white/10 hover:text-white'
            }`}
          >
            {item}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-white/15" />
        <button
          type="button"
          disabled={capturing}
          aria-label="拍照到画布"
          title="拍照到画布"
          onClick={() => {
            const rect = frameRef.current?.getBoundingClientRect();
            if (rect) onCapture(rect);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/14 hover:text-white disabled:opacity-45 cursor-pointer"
        >
          <Camera size={15} />
        </button>
      </div>
    </div>
  );
}

export interface CanvasThreeDViewerModalProps {
  node: CanvasNode;
  onClose: () => void;
  onCaptureToCanvas: (dataUrl: string, width: number, height: number, ratio: ViewfinderRatio) => void;
  onImportToDirector: () => void;
}

export function CanvasThreeDViewerModal({
  node,
  onClose,
  onCaptureToCanvas,
  onImportToDirector,
}: CanvasThreeDViewerModalProps) {
  const [lights, setLights] = useState<ThreeDViewerLights>(DEFAULT_THREE_D_LIGHTS);
  const [viewfinderActive, setViewfinderActive] = useState(false);
  const [ratio, setRatio] = useState<ViewfinderRatio>('16:9');
  const [lightOpen, setLightOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stageHostRef = useRef<HTMLDivElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackImgRef = useRef<HTMLImageElement | null>(null);
  const resetCameraRef = useRef<(() => void) | null>(null);
  const lightsHandlerRef = useRef<((next: ThreeDViewerLights) => void) | null>(null);
  const lightsRef = useRef(lights);
  lightsRef.current = lights;

  // Interactive fallback orbit state when only imageUrl is available or GLB fails CORS
  const [fallbackTransform, setFallbackTransform] = useState({ yaw: -16, pitch: 8, scale: 1, panX: 0, panY: 0 });
  const [webglReady, setWebglReady] = useState(false);
  const dragRef = useRef<{ mode: 'rotate' | 'pan'; startX: number; startY: number; yaw: number; pitch: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    lightsHandlerRef.current?.(lights);
  }, [lights]);

  useEffect(() => {
    const host = stageHostRef.current;
    const url = node.modelUrl;
    if (!host || !url || !/^https?:\/\//i.test(url)) {
      setWebglReady(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const [three, { GLTFLoader }, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      signal.throwIfAborted();
      const response = await fetch(url, { signal, credentials: 'omit' });
      if (!response.ok) throw new Error('模型文件无法读取');
      const buffer = await response.arrayBuffer();
      signal.throwIfAborted();

      const gltf = await new GLTFLoader().parseAsync(buffer, '');
      signal.throwIfAborted();

      const bounds = new three.Box3().setFromObject(gltf.scene);
      const sizeVec = bounds.getSize(new three.Vector3());
      const scale = sizeVec.length();
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('GLB 无有效网格');

      const renderer = new three.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = three.ACESFilmicToneMapping;
      renderer.domElement.className = 'block h-full w-full touch-none';
      webglCanvasRef.current = renderer.domElement;

      const initialLights = lightsRef.current;
      const scene = new three.Scene();
      const ambientLight = new three.HemisphereLight(0xffffff, 0x5c5b66, initialLights.ambient);
      const keyLight = new three.DirectionalLight(0xffffff, initialLights.key);
      keyLight.position.set(3.5, 5, 4);
      const fillLight = new three.DirectionalLight(0xdbeafe, initialLights.fill);
      fillLight.position.set(-3.5, 2, -3);
      scene.add(gltf.scene, ambientLight, keyLight, fillLight);

      const center = bounds.getCenter(new three.Vector3());
      const camera = new three.PerspectiveCamera(36, 1, scale / 100, scale * 100);
      const defaultPos = center.clone().add(new three.Vector3(scale * 0.95, scale * 0.45, scale * 1.55));
      camera.position.copy(defaultPos);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(center);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.update();

      const draw = () => renderer.render(scene, camera);

      lightsHandlerRef.current = (nextLights) => {
        ambientLight.intensity = nextLights.ambient;
        keyLight.intensity = nextLights.key;
        fillLight.intensity = nextLights.fill;
        renderer.toneMappingExposure = nextLights.exposure;
        renderer.setClearColor(nextLights.background || '#000000');
        draw();
      };
      lightsHandlerRef.current(initialLights);

      resetCameraRef.current = () => {
        camera.position.copy(defaultPos);
        controls.target.copy(center);
        controls.update();
        draw();
      };

      const resize = () => {
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        draw();
      };

      host.innerHTML = '';
      host.appendChild(renderer.domElement);
      controls.addEventListener('change', draw);
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      setWebglReady(true);

      cleanup = () => {
        observer.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        webglCanvasRef.current = null;
        lightsHandlerRef.current = null;
        resetCameraRef.current = null;
      };
    };

    void setup().catch(() => {
      cleanup?.();
      setWebglReady(false);
    });

    return () => {
      controller.abort();
      cleanup?.();
    };
  }, [node.modelUrl]);

  const handleResetView = useCallback(() => {
    if (resetCameraRef.current) {
      resetCameraRef.current();
    } else {
      setFallbackTransform({ yaw: -16, pitch: 8, scale: 1, panX: 0, panY: 0 });
    }
  }, []);

  const handleCapture = useCallback(
    async (frameRect: DOMRect) => {
      if (capturing) return;
      setCapturing(true);
      try {
        const outCanvas = document.createElement('canvas');
        const outW = Math.max(320, Math.round(frameRect.width * 2));
        const outH = Math.max(240, Math.round(frameRect.height * 2));
        outCanvas.width = outW;
        outCanvas.height = outH;
        const ctx = outCanvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = lights.background || '#000000';
        ctx.fillRect(0, 0, outW, outH);

        const webglCanvas = webglCanvasRef.current;
        if (webglCanvas && webglReady) {
          const canvasRect = webglCanvas.getBoundingClientRect();
          const scaleX = webglCanvas.width / Math.max(1, canvasRect.width);
          const scaleY = webglCanvas.height / Math.max(1, canvasRect.height);
          const sx = Math.max(0, (frameRect.left - canvasRect.left) * scaleX);
          const sy = Math.max(0, (frameRect.top - canvasRect.top) * scaleY);
          const sw = Math.min(webglCanvas.width - sx, frameRect.width * scaleX);
          const sh = Math.min(webglCanvas.height - sy, frameRect.height * scaleY);
          if (sw > 0 && sh > 0) {
            ctx.drawImage(webglCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
          }
        } else if (fallbackImgRef.current) {
          const img = fallbackImgRef.current;
          const aspect = (img.naturalWidth || 512) / (img.naturalHeight || 512);
          const drawH = outH * 0.78 * fallbackTransform.scale;
          const drawW = drawH * aspect;
          ctx.save();
          ctx.translate(outW / 2 + fallbackTransform.panX, outH / 2 + fallbackTransform.panY);
          ctx.filter = `brightness(${(lights.exposure * (0.45 + lights.key * 0.22 + lights.ambient * 0.12)).toFixed(2)})`;
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        }

        const dataUrl = outCanvas.toDataURL('image/png');
        onCaptureToCanvas(dataUrl, outW, outH, ratio);
        onClose();
      } finally {
        setCapturing(false);
      }
    },
    [capturing, fallbackTransform, lights, onCaptureToCanvas, onClose, ratio, webglReady],
  );

  const previewImgUrl = node.imageUrl ? proxyMediaUrl(node.imageUrl) || node.imageUrl : '';
  const brightnessFilter = (lights.exposure * (0.45 + lights.key * 0.18 + lights.ambient * 0.12)).toFixed(2);

  const modalContent = (
    <div
      data-testid="three-d-fullscreen-modal"
      style={{ background: lights.background || '#050505' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[260] overflow-hidden text-white select-none"
    >
      {/* 3D 渲染视口 */}
      <div
        className="relative h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={(event) => {
          if (webglReady) return;
          const mode = event.button === 2 || event.button === 1 ? 'pan' : 'rotate';
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            mode,
            startX: event.clientX,
            startY: event.clientY,
            yaw: fallbackTransform.yaw,
            pitch: fallbackTransform.pitch,
            panX: fallbackTransform.panX,
            panY: fallbackTransform.panY,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || webglReady) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (drag.mode === 'pan') {
            setFallbackTransform((prev) => ({ ...prev, panX: drag.panX + dx, panY: drag.panY + dy }));
          } else {
            setFallbackTransform((prev) => ({
              ...prev,
              yaw: drag.yaw + dx * 0.45,
              pitch: Math.max(-65, Math.min(65, drag.pitch - dy * 0.35)),
            }));
          }
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(event) => {
          if (webglReady) return;
          const delta = event.deltaY < 0 ? 1.08 : 0.92;
          setFallbackTransform((prev) => ({
            ...prev,
            scale: Math.max(0.4, Math.min(2.8, Number((prev.scale * delta).toFixed(3)))),
          }));
        }}
      >
        <div ref={stageHostRef} className={`h-full w-full ${webglReady ? 'block' : 'hidden'}`} />
        {!webglReady && (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ perspective: '1100px' }}
          >
            {previewImgUrl ? (
              <img
                ref={fallbackImgRef}
                src={previewImgUrl}
                alt={node.title || '3D 预览'}
                crossOrigin="anonymous"
                draggable={false}
                style={{
                  transform: `translate3d(${fallbackTransform.panX}px, ${fallbackTransform.panY}px, 0) scale(${fallbackTransform.scale}) rotateX(${fallbackTransform.pitch}deg) rotateY(${fallbackTransform.yaw}deg)`,
                  filter: `brightness(${brightnessFilter}) drop-shadow(0 28px 48px rgba(0,0,0,0.65))`,
                }}
                className="max-h-[72vh] max-w-[72vw] object-contain transition-transform duration-75 pointer-events-none"
              />
            ) : (
              <div
                style={{
                  transform: `translate3d(${fallbackTransform.panX}px, ${fallbackTransform.panY}px, 0) scale(${fallbackTransform.scale}) rotateX(${fallbackTransform.pitch}deg) rotateY(${fallbackTransform.yaw}deg)`,
                }}
                className="flex h-56 w-56 items-center justify-center rounded-3xl border border-white/20 bg-gradient-to-br from-zinc-700/60 via-zinc-800/80 to-zinc-950 shadow-2xl"
              >
                <span className="text-sm font-semibold text-white/75">{node.title || '3D 模型'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 顶部栏：关闭按钮 + 拖拽旋转提示胶囊 */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={viewfinderActive ? '关闭取景器' : '关闭'}
          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 backdrop-blur-md transition hover:bg-white/14 hover:text-white cursor-pointer"
        >
          <X size={15} />
        </button>
        <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[11px] text-white/60 backdrop-blur-md">
          拖拽旋转，右键或中键平移，滚轮缩放
        </div>
        <div className="w-8" />
      </div>

      {/* 取景器遮罩与比例拍照栏 */}
      {viewfinderActive && (
        <ViewfinderOverlay
          ratio={ratio}
          capturing={capturing}
          onRatioChange={setRatio}
          onCapture={(rect) => void handleCapture(rect)}
        />
      )}

      {/* 光源调节弹窗 */}
      {lightOpen && (
        <LightControlPopover
          lights={lights}
          onChange={setLights}
          onReset={() => setLights(DEFAULT_THREE_D_LIGHTS)}
          onClose={() => setLightOpen(false)}
        />
      )}

      {/* 底部控制栏 */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleResetView}
          aria-label="恢复默认视角"
          title="恢复默认视角"
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white/80 backdrop-blur-md transition hover:bg-white/14 hover:text-white cursor-pointer"
        >
          <RotateCcw size={15} />
        </button>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewfinderActive((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium backdrop-blur-md transition cursor-pointer ${
              viewfinderActive
                ? 'border-white/30 bg-white/16 text-white'
                : 'border-white/15 bg-black/65 text-white/85 hover:bg-white/12'
            }`}
          >
            {viewfinderActive ? <EyeOff size={14} /> : <Eye size={14} />}
            取景器
          </button>

          <button
            type="button"
            data-three-d-light-toggle=""
            onClick={() => setLightOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium backdrop-blur-md transition cursor-pointer ${
              lightOpen
                ? 'border-white/30 bg-white/16 text-white'
                : 'border-white/15 bg-black/65 text-white/85 hover:bg-white/12'
            }`}
          >
            <Sun size={14} />
            光源
          </button>

          <button
            type="button"
            onClick={() => {
              onImportToDirector();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-black/70 px-3.5 py-2 text-xs font-medium text-white/90 backdrop-blur-md transition hover:border-white/30 hover:bg-white/14 cursor-pointer"
          >
            导入3D导演台
          </button>
        </div>

        <div className="w-9" />
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
