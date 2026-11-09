import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box, Camera, Check, ChevronLeft, ChevronRight, Columns2, Download, Eye, Gamepad2,
  Grid3X3, Hand, HelpCircle, Layers, Maximize2, MousePointer, Pause, Play, Plus,
  RotateCcw, Route, Sparkles, Sun, Trash2, User, Video, X,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import type { CanvasNode, CanvasSpecializedSettings } from '../../model/types';

export type DirectorObject3D = NonNullable<CanvasSpecializedSettings['objects']>[number];

interface CameraRig { id: string; name: string; yaw: number; pitch: number; fov: number; distance: number }

const DEFAULT_CAMERAS: CameraRig[] = [{ id: 'cam-1', name: '机位 1', yaw: -28, pitch: 18, fov: 45, distance: 8.5 }];
const ASPECT_OPTIONS = ['Auto', '16:9', '9:16', '4:3', '3:4', '2.39:1'] as const;
type AspectOption = (typeof ASPECT_OPTIONS)[number];

const PALETTE = ['#d2987a', '#789ca3', '#d3b16c', '#8d90bb', '#7ebdc2', '#c97b84'];
const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] as const;
const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] as const;

export function buildObjectVertices(object: DirectorObject3D): number[][] {
  return CORNERS.map(([x, y, z]) => [object.x + (x - 0.5) * object.width, y * object.height, object.z + (z - 0.5) * object.depth]);
}

export function exportDirectorObj(objects: DirectorObject3D[]) {
  const lines = objects.flatMap((object, index) => [
    `o object_${index + 1}`,
    ...buildObjectVertices(object).map((v) => 'v ' + v.join(' ')),
    ...FACES.map((face) => 'f ' + face.map((vertex) => vertex + index * 8 + 1).join(' ')),
  ]);
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'scene.obj';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatTimecode(frame: number, fps: number): string {
  const totalSec = Math.floor(frame / fps);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(totalSec / 3600)}:${pad(Math.floor(totalSec / 60) % 60)}:${pad(totalSec % 60)}:${pad(frame % fps)}`;
}

interface StageViewportSvgProps {
  objects: DirectorObject3D[]; selectedIndex: number; yaw: number; pitch: number; zoom: number;
  panX: number; panY: number; cameraRig: CameraRig; showFrustum: boolean; showGrid: boolean;
  pathPoints: Array<{ x: number; z: number }>; linkedPreviewUrl?: string;
  svgRef?: React.RefObject<SVGSVGElement | null>; compact?: boolean; onSelectObject?: (index: number) => void;
}

function StageViewportSvg({
  objects, selectedIndex, yaw, pitch, zoom, panX, panY, cameraRig,
  showFrustum, showGrid, pathPoints, linkedPreviewUrl, svgRef, compact = false, onSelectObject,
}: StageViewportSvgProps) {
  const viewW = compact ? 320 : 1280;
  const viewH = compact ? 180 : 720;
  const centerX = viewW / 2 + (compact ? 0 : panX);
  const centerY = viewH * 0.56 + (compact ? 0 : panY);
  const unitScale = (compact ? 14 : 38) * zoom;

  const yawRad = (yaw * Math.PI) / 180;
  const pitchRad = (pitch * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  const project = useCallback(([x, y, z]: number[]): [number, number, number] => {
    const rx = x * cosY - z * sinY;
    const rz = x * sinY + z * cosY;
    const ry = y * cosP - rz * sinP;
    const depth = y * sinP + rz * cosP;
    const perspective = Math.max(0.35, 18 / (18 + depth * 0.65));
    return [centerX + rx * unitScale * perspective, centerY - ry * unitScale * perspective, depth];
  }, [centerX, centerY, cosP, cosY, sinP, sinY, unitScale]);

  const displayObjects: DirectorObject3D[] = useMemo(
    () => (objects.length > 0 ? objects : [{ label: '主体模型', x: 0, z: 0, width: 1.8, height: 2.2, depth: 1.4, color: '#d2987a' }]),
    [objects],
  );

  const polygons = useMemo(() => {
    return displayObjects
      .flatMap((object, index) => {
        const pts = buildObjectVertices(object).map(project);
        return FACES.slice(1).map((face, side) => ({
          id: `${index}-${side}`,
          objectIndex: index,
          depth: face.reduce<number>((sum, v) => sum + pts[v][2], 0) / 4,
          points: face.map((v) => `${pts[v][0].toFixed(1)},${pts[v][1].toFixed(1)}`).join(' '),
          color: object.color || PALETTE[index % PALETTE.length],
          opacity: side === 0 ? 0.92 : side % 2 === 0 ? 0.78 : 0.64,
        }));
      })
      .sort((a, b) => b.depth - a.depth);
  }, [displayObjects, project]);

  const activeObj = displayObjects[Math.min(selectedIndex, displayObjects.length - 1)] || displayObjects[0];
  const gizmoOrigin = activeObj ? project([activeObj.x, activeObj.height * 0.5, activeObj.z]) : project([0, 1, 0]);
  const gizmoX = activeObj ? project([activeObj.x + 1.9, activeObj.height * 0.5, activeObj.z]) : project([1.9, 1, 0]);
  const gizmoY = activeObj ? project([activeObj.x, activeObj.height * 0.5 + 1.9, activeObj.z]) : project([0, 2.9, 0]);
  const gizmoZ = activeObj ? project([activeObj.x, activeObj.height * 0.5, activeObj.z + 1.9]) : project([0, 1, 1.9]);

  const camYawRad = (cameraRig.yaw * Math.PI) / 180;
  const camOrigin = project([-Math.sin(camYawRad) * 5.2, 2.1, Math.cos(camYawRad) * 5.2]);
  const frustumNearTL = project([-1.8, 2.8, 0.4]);
  const frustumNearTR = project([1.8, 2.8, 0.4]);
  const frustumNearBR = project([1.8, 0.3, 0.4]);
  const frustumNearBL = project([-1.8, 0.3, 0.4]);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewW} ${viewH}`}
      role="img"
      aria-label={compact ? '机位画面预览' : '3D导演台主视口'}
      className="block h-full w-full select-none"
    >
      <defs>
        <radialGradient id={compact ? 'stage-bg-pip' : 'stage-bg-main'} cx="50%" cy="54%" r="62%">
          <stop offset="0%" stopColor="#151821" />
          <stop offset="65%" stopColor="#090a0f" />
          <stop offset="100%" stopColor="#050608" />
        </radialGradient>
      </defs>
      <rect width={viewW} height={viewH} fill={`url(#${compact ? 'stage-bg-pip' : 'stage-bg-main'})`} />

      {showGrid &&
        Array.from({ length: 21 }, (_, idx) => idx - 10).flatMap((line) => {
          const isMajor = line % 5 === 0;
          const isAxis = line === 0;
          const [x1, y1] = project([line, 0, -10]);
          const [x2, y2] = project([line, 0, 10]);
          const [x3, y3] = project([-10, 0, line]);
          const [x4, y4] = project([10, 0, line]);
          return [
            <line key={`gz-${line}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isAxis ? '#3b82f6' : isMajor ? '#2c313d' : '#1b1e26'} strokeWidth={isAxis ? '1.3' : isMajor ? '0.9' : '0.6'} strokeOpacity={isAxis ? 0.75 : 0.85} />,
            <line key={`gx-${line}`} x1={x3} y1={y3} x2={x4} y2={y4} stroke={isAxis ? '#ef4444' : isMajor ? '#2c313d' : '#1b1e26'} strokeWidth={isAxis ? '1.3' : isMajor ? '0.9' : '0.6'} strokeOpacity={isAxis ? 0.75 : 0.85} />,
          ];
        })}

      {pathPoints.length > 1 && (
        <polyline
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.2"
          strokeDasharray="6 4"
          points={pathPoints.map((pt) => {
            const [px, py] = project([pt.x, 0.08, pt.z]);
            return `${px.toFixed(1)},${py.toFixed(1)}`;
          }).join(' ')}
        />
      )}

      {polygons.map((poly) => (
        <polygon
          key={poly.id}
          points={poly.points}
          fill={poly.color}
          fillOpacity={poly.opacity}
          stroke={poly.objectIndex === selectedIndex ? '#ffffff' : '#1e2028'}
          strokeWidth={poly.objectIndex === selectedIndex ? '1.1' : '0.65'}
          className="cursor-pointer transition-opacity hover:opacity-95"
          onClick={(e) => {
            if (!onSelectObject) return;
            e.stopPropagation();
            onSelectObject(poly.objectIndex);
          }}
        />
      ))}

      {linkedPreviewUrl && activeObj && (
        <image
          href={proxyMediaUrl(linkedPreviewUrl) || linkedPreviewUrl}
          x={gizmoOrigin[0] - (compact ? 26 : 58)}
          y={gizmoOrigin[1] - (compact ? 28 : 64)}
          width={compact ? 52 : 116}
          height={compact ? 52 : 116}
          preserveAspectRatio="xMidYMid meet"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {!compact && showFrustum && (
        <g pointerEvents="none">
          <line x1={camOrigin[0]} y1={camOrigin[1]} x2={frustumNearTL[0]} y2={frustumNearTL[1]} stroke="#eab308" strokeWidth="1.1" strokeOpacity="0.8" />
          <line x1={camOrigin[0]} y1={camOrigin[1]} x2={frustumNearTR[0]} y2={frustumNearTR[1]} stroke="#eab308" strokeWidth="1.1" strokeOpacity="0.8" />
          <line x1={camOrigin[0]} y1={camOrigin[1]} x2={frustumNearBR[0]} y2={frustumNearBR[1]} stroke="#eab308" strokeWidth="1.1" strokeOpacity="0.8" />
          <line x1={camOrigin[0]} y1={camOrigin[1]} x2={frustumNearBL[0]} y2={frustumNearBL[1]} stroke="#eab308" strokeWidth="1.1" strokeOpacity="0.8" />
          <polygon
            points={`${frustumNearTL[0]},${frustumNearTL[1]} ${frustumNearTR[0]},${frustumNearTR[1]} ${frustumNearBR[0]},${frustumNearBR[1]} ${frustumNearBL[0]},${frustumNearBL[1]}`}
            fill="rgba(59,130,246,0.05)"
            stroke="#eab308"
            strokeWidth="1.2"
            strokeOpacity="0.85"
          />
          <rect x={camOrigin[0] - 9} y={camOrigin[1] - 7} width="18" height="14" rx="3" fill="#1d4ed8" stroke="#60a5fa" strokeWidth="1.4" />
        </g>
      )}

      {!compact && activeObj && (
        <g pointerEvents="none">
          <ellipse cx={gizmoOrigin[0]} cy={gizmoOrigin[1]} rx={34 * zoom} ry={14 * zoom} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeOpacity="0.7" />
          <ellipse cx={gizmoOrigin[0]} cy={gizmoOrigin[1]} rx={16 * zoom} ry={32 * zoom} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.7" />
          <line x1={gizmoOrigin[0]} y1={gizmoOrigin[1]} x2={gizmoX[0]} y2={gizmoX[1]} stroke="#ef4444" strokeWidth="2.4" />
          <circle cx={gizmoX[0]} cy={gizmoX[1]} r="4" fill="#ef4444" />
          <line x1={gizmoOrigin[0]} y1={gizmoOrigin[1]} x2={gizmoY[0]} y2={gizmoY[1]} stroke="#22c55e" strokeWidth="2.4" />
          <circle cx={gizmoY[0]} cy={gizmoY[1]} r="4" fill="#22c55e" />
          <line x1={gizmoOrigin[0]} y1={gizmoOrigin[1]} x2={gizmoZ[0]} y2={gizmoZ[1]} stroke="#3b82f6" strokeWidth="2.4" />
          <circle cx={gizmoZ[0]} cy={gizmoZ[1]} r="4" fill="#3b82f6" />
          <rect x={gizmoOrigin[0] - 4.5} y={gizmoOrigin[1] - 4.5} width="9" height="9" fill="#facc15" stroke="#18181b" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}

export interface CanvasDirector3DModalProps {
  node: CanvasNode;
  sources: CanvasNode[];
  projectId: string;
  availableModels: Array<{ id: string; name: string }>;
  selectedModel: string;
  busy: boolean;
  locked: boolean;
  error: string;
  initialSmartBuildOpen?: boolean;
  onClose: () => void;
  onChange: (patch: Partial<CanvasNode>) => void;
  onUpdateScene: (patch: Partial<CanvasSpecializedSettings>) => void;
  onGenerateSmartScene: () => void;
  onCaptureToCanvas: (dataUrl: string) => void;
}

export function CanvasDirector3DModal({
  node, sources, availableModels, selectedModel, busy, locked, error,
  initialSmartBuildOpen = false, onClose, onChange, onUpdateScene, onGenerateSmartScene, onCaptureToCanvas,
}: CanvasDirector3DModalProps) {
  const objects = node.specialized?.objects ?? [];
  const yaw = node.specialized?.yaw ?? 35;
  const [pitch, setPitch] = useState(22);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit');
  const [viewportMode, setViewportMode] = useState<'director' | 'camera' | 'top'>('director');
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'fly'>('select');
  const [aspectRatio, setAspectRatio] = useState<AspectOption>('Auto');
  const [showCompositionGrid, setShowCompositionGrid] = useState(false);
  const [splitPreview, setSplitPreview] = useState(false);
  const [showFrustum, setShowFrustum] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [smartBuildOpen, setSmartBuildOpen] = useState(initialSmartBuildOpen);
  const [drawingPath, setDrawingPath] = useState(false);
  const [pathPoints, setPathPoints] = useState<Array<{ x: number; z: number }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [cameras, setCameras] = useState<CameraRig[]>(DEFAULT_CAMERAS);
  const [activeCamIndex, setActiveCamIndex] = useState(0);
  const activeCamera = cameras[activeCamIndex] || DEFAULT_CAMERAS[0];

  const [playing, setPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [interpolation, setInterpolation] = useState<'linear' | 'smooth' | 'hold'>('linear');
  const [simpleBody, setSimpleBody] = useState(true);
  const [autoKey, setAutoKey] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(100);
  const fps = 24;
  const totalFrames = 359;

  const mainSvgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startYaw: number; startPitch: number; startPanX: number; startPanY: number; mode: 'orbit' | 'pan' } | null>(null);

  const linkedModel = sources.find(source => source.studioSubType === 'gen-3d' && /^https?:\/\//i.test(source.modelUrl || ''))?.modelUrl;
  const linkedPreviewUrl = useMemo(() => {
    const threeDSource = sources.find((s) => s.studioSubType === 'gen-3d' && (s.imageUrl || s.modelUrl));
    if (threeDSource?.imageUrl) return threeDSource.imageUrl;
    return sources.find((s) => s.imageUrl && !s.missingMedia)?.imageUrl;
  }, [sources]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setCurrentFrame((prev) => (prev >= totalFrames ? 0 : prev + 1)), Math.round(1000 / fps));
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (smartBuildOpen) setSmartBuildOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, smartBuildOpen]);

  const effectiveYaw = viewportMode === 'camera' ? activeCamera.yaw : viewportMode === 'top' ? 0 : yaw;
  const effectivePitch = viewportMode === 'camera' ? activeCamera.pitch : viewportMode === 'top' ? 82 : pitch;

  const handleAddObject = (preset: 'cube' | 'character') => {
    if (locked || objects.length >= 24) return;
    const index = objects.length;
    const offset = (index % 5) * 1.4 - 2;
    const newObj: DirectorObject3D =
      preset === 'character'
        ? { label: `角色 ${index + 1}`, x: offset, z: 0, width: 0.9, height: 1.8, depth: 0.6, color: '#d2987a' }
        : { label: `方块 ${index + 1}`, x: offset, z: 0, width: 2, height: 2, depth: 2, color: PALETTE[index % PALETTE.length] };
    const next = [...objects, newObj];
    onUpdateScene({ objects: next });
    setSelectedIndex(next.length - 1);
  };

  const handleAddCamera = () => {
    const nextIdx = cameras.length + 1;
    setCameras((prev) => [...prev, { id: `cam-${nextIdx}`, name: `机位 ${nextIdx}`, yaw, pitch, fov: 45, distance: 8.5 }]);
    setActiveCamIndex(cameras.length);
  };

  const handleCaptureStage = async () => {
    if (!mainSvgRef.current) return;
    const raw = new XMLSerializer().serializeToString(mainSvgRef.current);
    const url = URL.createObjectURL(new Blob([raw], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      onCaptureToCanvas(canvas.toDataURL('image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const modal = (
    <div
      data-director3d-workbench="" role="dialog" aria-modal="true" aria-label="3D导演台"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[270] flex flex-col overflow-hidden bg-[#060608] text-zinc-100 select-none"
    >
      {/* 顶部工作台导航栏 */}
      <header className="relative z-30 flex h-11 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0e0f14]/95 px-3 text-xs backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/10 cursor-pointer">
            <ChevronLeft size={14} />
            <span>返回</span>
          </button>

          <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5">
            {(['edit', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setEditMode(m)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${editMode === m ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {m === 'edit' ? '编辑' : '预览'}
              </button>
            ))}
          </div>

          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-emerald-400/90">
            <Check size={12} />
            已保存
          </span>
        </div>

        <div className="flex items-center rounded-xl border border-white/10 bg-[#15171e] p-0.5">
          {([
            { id: 'director', label: '导演视角' },
            { id: 'camera', label: '机位视角' },
            { id: 'top', label: '俯视视角' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewportMode(tab.id)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition cursor-pointer ${viewportMode === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSmartBuildOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${smartBuildOpen ? 'border-blue-500/50 bg-blue-600/20 text-blue-300' : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:bg-white/10'}`}
          >
            <Sparkles size={13} className="text-amber-300" />
            <span>智能搭建</span>
          </button>

          <button
            type="button"
            onClick={() => setSplitPreview((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${splitPreview ? 'border-blue-500/50 bg-blue-600/20 text-blue-300' : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10'}`}
          >
            <Columns2 size={13} />
            <span>分屏预览</span>
          </button>

          <div className="relative">
            <button type="button" onClick={() => setViewMenuOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:bg-white/10 cursor-pointer">
              <Eye size={13} />
              <span>视图</span>
            </button>
            {viewMenuOpen && (
              <div className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-xl border border-white/15 bg-[#15171f] p-2 text-xs shadow-2xl">
                <label className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <span>地面透视网格</span>
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <span>摄像机视锥体</span>
                  <input type="checkbox" checked={showFrustum} onChange={(e) => setShowFrustum(e.target.checked)} />
                </label>
              </div>
            )}
          </div>

          <button type="button" onClick={() => setHelpOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:bg-white/10 cursor-pointer">
            <HelpCircle size={13} />
            <span>帮助</span>
          </button>
        </div>
      </header>

      {/* 主 3D 舞台区域 */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <aside className="absolute left-3 top-3 z-20 flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-[#121318]/90 p-1.5 shadow-2xl backdrop-blur-xl">
          <button type="button" title="场景对象列表" aria-label="场景对象列表" onClick={() => setInspectorOpen((v) => !v)} className={`flex h-9 w-9 items-center justify-center rounded-xl transition cursor-pointer ${inspectorOpen ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>
            <Layers size={16} />
          </button>
          <button type="button" title="添加角色人偶" aria-label="添加角色" onClick={() => handleAddObject('character')} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer">
            <User size={16} />
          </button>
          <button type="button" title="添加方块几何体" aria-label="添加方块" onClick={() => handleAddObject('cube')} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer">
            <Box size={16} />
          </button>
          <button type="button" title="添加机位" aria-label="添加左侧机位" onClick={handleAddCamera} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer">
            <Video size={16} />
          </button>
          <button type="button" title="切换视锥体辅助" aria-label="灯光预设" onClick={() => setShowFrustum((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer">
            <Sun size={16} />
          </button>
          <button
            type="button"
            title="导出 OBJ"
            aria-label="导出 OBJ"
            onClick={() => exportDirectorObj(objects.length ? objects : [{ label: '方块 1', x: 0, z: 0, width: 2, height: 2, depth: 2, color: '#d2987a' }])}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <Download size={16} />
          </button>
        </aside>

        {inspectorOpen && (
          <div className="absolute left-16 top-3 z-20 w-72 rounded-2xl border border-white/12 bg-[#121319]/95 p-3 text-xs shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-white/90">场景对象 ({objects.length})</span>
              <button type="button" onClick={() => handleAddObject('cube')} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-white/10 cursor-pointer">
                <Plus size={12} />
                添加方块
              </button>
            </div>
            <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
              {objects.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-zinc-500">暂无自定义物体，点击上方按钮或使用智能搭建生成</p>
              ) : (
                objects.map((object, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedIndex(index)}
                    className={`flex items-center gap-1.5 rounded-xl border p-1.5 transition cursor-pointer ${selectedIndex === index ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06]'}`}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: object.color }} />
                    <span className="min-w-0 flex-1 truncate text-[11px]">{object.label}</span>
                    {(['x', 'z', 'height'] as const).map((field) => (
                      <input
                        key={field}
                        aria-label={`${object.label} ${field}`}
                        title={field}
                        type="number"
                        min={field === 'height' ? 0.15 : -12}
                        max={12}
                        step={0.25}
                        value={object[field]}
                        onChange={(event) => {
                          const num = Math.min(12, Math.max(field === 'height' ? 0.15 : -12, Number(event.target.value)));
                          onUpdateScene({ objects: objects.map((item, row) => (row === index ? { ...item, [field]: num } : item)) });
                        }}
                        className="w-11 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-center text-[10px] text-white outline-none"
                      />
                    ))}
                    <button
                      type="button"
                      aria-label={`删除 ${object.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateScene({ objects: objects.filter((_, row) => row !== index) });
                      }}
                      className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {smartBuildOpen && (
          <div data-testid="director-smart-build-modal" className="absolute right-3 top-3 z-30 w-80 rounded-2xl border border-white/15 bg-[#14161e]/95 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                <Sparkles size={14} className="text-amber-300" />
                一句话智能搭建 3D 场景
              </span>
              <button type="button" onClick={() => setSmartBuildOpen(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X size={14} />
              </button>
            </div>
            {linkedModel && <details className="mb-2">
              <summary className="cursor-pointer">已连接 3D 模型</summary>
              <a href={linkedModel} target="_blank" rel="noreferrer" className="underline">已连接 GLB</a>
            </details>}
            <textarea
              aria-label="搭建描述"
              placeholder="描述场景布局，例如：赛博朋克街角咖啡馆，中央有吧台与两张圆桌…"
              value={node.textPrompt || ''}
              maxLength={3000}
              disabled={locked}
              onChange={(e) => onChange({ textPrompt: e.target.value })}
              className="mb-2.5 h-20 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-blue-500/60"
            />
            {error && <p role="alert" className="mb-2 text-[11px] text-rose-400">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <CanvasModelPicker label="视觉模型" models={availableModels} value={selectedModel} disabled={locked} onChange={(value) => onChange({ textModel: value })} />
              <button type="button" disabled={locked || busy} onClick={onGenerateSmartScene} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500 disabled:opacity-45 cursor-pointer">
                {busy ? '处理中…' : node.textRecoveryRequired ? '查询原回执' : '生成布景'}
              </button>
            </div>
          </div>
        )}

        {helpOpen && (
          <div className="absolute right-3 top-3 z-30 w-64 rounded-2xl border border-white/15 bg-[#14161e]/95 p-3 text-[11px] leading-relaxed text-zinc-300 shadow-2xl backdrop-blur-xl">
            <div className="mb-1.5 flex items-center justify-between font-semibold text-white">
              <span>操作指南</span>
              <button type="button" onClick={() => setHelpOpen(false)} className="text-zinc-400 hover:text-white cursor-pointer">
                <X size={13} />
              </button>
            </div>
            <p>• 左键拖拽：旋转导演视角</p>
            <p>• 右键 / 平移工具：平移舞台视口</p>
            <p>• 滚轮：缩放舞台距离</p>
            <p>• 底部相机图标：将当前机位画面截图输出到画布</p>
          </div>
        )}

        <div
          className={`grid h-full w-full ${splitPreview ? 'grid-cols-2 divide-x divide-white/10' : 'grid-cols-1'}`}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button,input,aside')) return;
            if (drawingPath) {
              const rect = event.currentTarget.getBoundingClientRect();
              const nx = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 12;
              const nz = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 12;
              setPathPoints((prev) => [...prev, { x: Number(nx.toFixed(2)), z: Number(nz.toFixed(2)) }]);
              return;
            }
            const mode = event.button === 2 || event.button === 1 || activeTool === 'pan' ? 'pan' : 'orbit';
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { startX: event.clientX, startY: event.clientY, startYaw: yaw, startPitch: pitch, startPanX: pan.x, startPanY: pan.y, mode };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (drag.mode === 'pan') {
              setPan({ x: drag.startPanX + dx, y: drag.startPanY + dy });
            } else {
              onUpdateScene({ yaw: Math.max(-180, Math.min(180, Math.round(drag.startYaw + dx * 0.45))) });
              setPitch(Math.max(-15, Math.min(85, Math.round(drag.startPitch + dy * 0.35))));
            }
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(event) => {
            const factor = event.deltaY < 0 ? 1.08 : 0.92;
            setZoom((prev) => Math.max(0.45, Math.min(2.6, Number((prev * factor).toFixed(2)))));
          }}
        >
          <div className="relative h-full w-full overflow-hidden">
            <StageViewportSvg
              objects={objects}
              selectedIndex={selectedIndex}
              yaw={effectiveYaw}
              pitch={effectivePitch}
              zoom={zoom}
              panX={pan.x}
              panY={pan.y}
              cameraRig={activeCamera}
              showFrustum={showFrustum && viewportMode !== 'camera'}
              showGrid={showGrid}
              pathPoints={pathPoints}
              linkedPreviewUrl={linkedPreviewUrl}
              svgRef={mainSvgRef}
              onSelectObject={setSelectedIndex}
            />
            {showCompositionGrid && (
              <div className="pointer-events-none absolute inset-12 grid grid-cols-3 grid-rows-3 border border-white/25">
                {Array.from({ length: 9 }).map((_, idx) => <div key={idx} className="border border-white/10" />)}
              </div>
            )}
          </div>

          {splitPreview && (
            <div className="relative h-full w-full overflow-hidden bg-[#050608]">
              <StageViewportSvg
                objects={objects}
                selectedIndex={selectedIndex}
                yaw={activeCamera.yaw}
                pitch={activeCamera.pitch}
                zoom={1.15}
                panX={0}
                panY={0}
                cameraRig={activeCamera}
                showFrustum={false}
                showGrid={showGrid}
                pathPoints={pathPoints}
                linkedPreviewUrl={linkedPreviewUrl}
              />
              <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/65 px-2 py-0.5 text-[11px] text-zinc-300">
                {activeCamera.name} 实时画面
              </span>
            </div>
          )}
        </div>

        {/* 右上角坐标轴导航球 */}
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-[#121318]/80 shadow-xl backdrop-blur-md">
            <svg viewBox="0 0 80 80" className="h-16 w-16">
              <line x1="40" y1="40" x2="66" y2="40" stroke="#ef4444" strokeWidth="2" />
              <line x1="40" y1="40" x2="40" y2="14" stroke="#22c55e" strokeWidth="2" />
              <line x1="40" y1="40" x2="22" y2="58" stroke="#3b82f6" strokeWidth="2" />
              <g className="cursor-pointer" onClick={() => { onUpdateScene({ yaw: 90 }); setPitch(10); }}>
                <circle cx="66" cy="40" r="8" fill="#ef4444" />
                <text x="66" y="43.5" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">X</text>
              </g>
              <g className="cursor-pointer" onClick={() => { onUpdateScene({ yaw: 0 }); setPitch(80); }}>
                <circle cx="40" cy="14" r="8" fill="#22c55e" />
                <text x="40" y="17.5" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Y</text>
              </g>
              <g className="cursor-pointer" onClick={() => { onUpdateScene({ yaw: 0 }); setPitch(15); }}>
                <circle cx="22" cy="58" r="8" fill="#3b82f6" />
                <text x="22" y="61.5" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Z</text>
              </g>
            </svg>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#121318]/90 px-2 py-1 text-[11px] text-zinc-300 shadow-lg backdrop-blur-md">
            <button type="button" onClick={() => { onUpdateScene({ yaw: 35 }); setPitch(22); setZoom(1); setPan({ x: 0, y: 0 }); }} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-white/10 hover:text-white cursor-pointer">
              <RotateCcw size={11} />
              <span>重置</span>
            </button>
            <span className="h-3 w-px bg-white/10" />
            <button type="button" onClick={() => { setZoom(0.85); setPan({ x: 0, y: 0 }); }} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-white/10 hover:text-white cursor-pointer">
              <Maximize2 size={11} />
              <span>全场</span>
            </button>
          </div>
        </div>

        {/* 左下角画幅比例与构图参考线 */}
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-[#121318]/92 px-2 py-1 text-[11px] text-zinc-300 shadow-2xl backdrop-blur-xl">
          {ASPECT_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setAspectRatio(item)}
              className={`rounded-full px-2.5 py-1 font-medium transition cursor-pointer ${aspectRatio === item ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
            >
              {item}
            </button>
          ))}
          <span className="mx-0.5 h-3.5 w-px bg-white/15" />
          <button
            type="button"
            onClick={() => setShowCompositionGrid((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition cursor-pointer ${showCompositionGrid ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
          >
            <Grid3X3 size={12} />
            <span>构图</span>
          </button>
        </div>

        {/* 中下角路径绘制与工具条 */}
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDrawingPath((v) => !v);
              if (drawingPath) setPathPoints([]);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-xl backdrop-blur-xl transition cursor-pointer ${drawingPath ? 'border-amber-400/60 bg-amber-500/20 text-amber-200' : 'border-white/12 bg-[#14161d]/90 text-zinc-200 hover:bg-white/12'}`}
          >
            <Route size={13} />
            <span>{drawingPath ? '完成路径绘制' : '绘制移动路径'}</span>
          </button>

          <div className="flex items-center gap-1 rounded-full border border-white/12 bg-[#121318]/95 p-1 shadow-2xl backdrop-blur-xl">
            <button type="button" title="选择与变换" aria-label="选择工具" onClick={() => setActiveTool('select')} className={`flex h-8 w-8 items-center justify-center rounded-full transition cursor-pointer ${activeTool === 'select' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>
              <MousePointer size={14} />
            </button>
            <button type="button" title="平移视口" aria-label="平移工具" onClick={() => setActiveTool('pan')} className={`flex h-8 w-8 items-center justify-center rounded-full transition cursor-pointer ${activeTool === 'pan' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>
              <Hand size={14} />
            </button>
            <button type="button" title="漫游模式" aria-label="漫游工具" onClick={() => setActiveTool('fly')} className={`flex h-8 w-8 items-center justify-center rounded-full transition cursor-pointer ${activeTool === 'fly' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>
              <Gamepad2 size={14} />
            </button>
            <span className="mx-0.5 h-4 w-px bg-white/15" />
            <button type="button" title="输出场景图" aria-label="输出场景图" onClick={() => void handleCaptureStage()} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-200 transition hover:bg-white/15 hover:text-white cursor-pointer">
              <Camera size={14} />
            </button>
          </div>
        </div>

        {/* 右下角机位画中画监视器 */}
        <div data-testid="director-camera-pip" className="absolute bottom-3 right-3 z-20 w-[272px] overflow-hidden rounded-2xl border border-white/12 bg-[#111217]/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-1.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <select aria-label="选择机位" value={activeCamIndex} onChange={(e) => setActiveCamIndex(Number(e.target.value))} className="bg-transparent font-semibold text-white outline-none cursor-pointer">
                {cameras.map((cam, idx) => <option key={cam.id} value={idx} className="bg-[#15171f] text-white">{cam.name}</option>)}
              </select>
            </div>
            <span className="text-[10px] text-zinc-400">FOV {activeCamera.fov}° · {aspectRatio.toLowerCase()}</span>
          </div>

          <div className="relative h-[138px] w-full overflow-hidden bg-[#050608]">
            <StageViewportSvg
              objects={objects}
              selectedIndex={selectedIndex}
              yaw={activeCamera.yaw}
              pitch={activeCamera.pitch}
              zoom={1.1}
              panX={0}
              panY={0}
              cameraRig={activeCamera}
              showFrustum={false}
              showGrid={showGrid}
              pathPoints={pathPoints}
              linkedPreviewUrl={linkedPreviewUrl}
              compact
            />
          </div>

          <div className="grid grid-cols-4 gap-1 border-t border-white/[0.08] p-1.5 text-[10px]">
            <button type="button" onClick={() => setPan({ x: 0, y: 0 })} className="rounded-lg bg-white/[0.05] py-1 text-zinc-300 transition hover:bg-white/12 hover:text-white cursor-pointer">聚焦选中</button>
            <button type="button" onClick={() => { onUpdateScene({ yaw: activeCamera.yaw }); setPitch(activeCamera.pitch); }} className="rounded-lg bg-white/[0.05] py-1 text-zinc-300 transition hover:bg-white/12 hover:text-white cursor-pointer">对准</button>
            <button type="button" onClick={() => setCameras((prev) => prev.map((cam, idx) => (idx === activeCamIndex ? { ...cam, yaw, pitch } : cam)))} className="rounded-lg bg-white/[0.05] py-1 text-zinc-300 transition hover:bg-white/12 hover:text-white cursor-pointer">覆盖机位</button>
            <button type="button" onClick={handleAddCamera} className="rounded-lg bg-white/[0.05] py-1 text-zinc-300 transition hover:bg-white/12 hover:text-white cursor-pointer">+ 加机位</button>
          </div>
        </div>
      </div>

      {/* 底部时间轴控制栏 */}
      <footer className="relative z-30 flex h-11 shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] bg-[#0c0d12]/95 px-3 text-[11px] text-zinc-300">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={() => setPlaying((v) => !v)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-white hover:bg-white/15 cursor-pointer">
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button type="button" aria-label="上一帧" onClick={() => setCurrentFrame((f) => Math.max(0, f - 1))} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer">
            <ChevronLeft size={13} />
          </button>
          <button type="button" aria-label="下一帧" onClick={() => setCurrentFrame((f) => Math.min(totalFrames, f + 1))} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer">
            <ChevronRight size={13} />
          </button>
          <span className="font-mono text-xs text-zinc-200">{formatTimecode(currentFrame, fps)}</span>

          <div className="ml-1 flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5">
            {([
              { id: 'linear', label: '线性' },
              { id: 'smooth', label: '平滑' },
              { id: 'hold', label: '保持' },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setInterpolation(item.id)}
                className={`rounded px-2 py-0.5 text-[10px] transition cursor-pointer ${interpolation === item.id ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button type="button" onClick={() => void handleCaptureStage()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10 cursor-pointer">
            <Download size={11} />
            <span>视频</span>
          </button>

          <button type="button" onClick={() => setSimpleBody((v) => !v)} className={`rounded-lg border px-2 py-1 text-[10px] transition cursor-pointer ${simpleBody ? 'border-blue-500/40 bg-blue-500/15 text-blue-300' : 'border-white/10 bg-white/[0.04] text-zinc-400'}`}>
            精简人体
          </button>
        </div>

        <div className="flex min-w-[140px] flex-1 items-center gap-2 px-2">
          <input type="range" aria-label="时间轴帧位置" min={0} max={totalFrames} value={currentFrame} onChange={(e) => setCurrentFrame(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-blue-500" />
        </div>

        <div className="flex items-center gap-2.5 text-[11px] text-zinc-400">
          <span>FPS {fps}</span>
          <span>时长 15s</span>
          <button type="button" onClick={() => setAutoKey((v) => !v)} className={`rounded-md border px-2 py-0.5 text-[10px] transition cursor-pointer ${autoKey ? 'border-amber-400/50 bg-amber-500/20 text-amber-200' : 'border-white/10 text-zinc-400 hover:text-white'}`}>
            ◇ 自动K
          </button>
          <span className="font-mono text-zinc-300">{currentFrame} / {totalFrames}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setTimelineZoom((z) => Math.max(50, z - 25))} className="px-1 text-zinc-400 hover:text-white cursor-pointer">-</button>
            <span className="w-9 text-center font-mono text-[10px]">{timelineZoom}%</span>
            <button type="button" onClick={() => setTimelineZoom((z) => Math.min(200, z + 25))} className="px-1 text-zinc-400 hover:text-white cursor-pointer">+</button>
          </div>
        </div>
      </footer>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}
