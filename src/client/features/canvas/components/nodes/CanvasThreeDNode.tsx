import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ArrowUp,
  Box,
  Download,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Plus,
  Tag,
} from 'lucide-react';
import { CanvasDrawingEditor } from '../editor/CanvasNodeMenu';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { buildQuickCanvasNode, persistCanvasMedia } from '../../model/canvasNodeFactory';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode, CanvasSpecializedSettings } from '../../model/types';
import { CanvasThreeDViewerModal, type ViewfinderRatio } from './CanvasThreeDViewerModal';

const THREE_D_AMBIENT_HALO_STYLE = {
  background:
    'radial-gradient(ellipse 75% 92% at center, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.06) 24%, rgba(255,255,255,0.028) 52%, rgba(255,255,255,0.012) 72%, rgba(255,255,255,0.004) 88%, rgba(255,255,255,0) 100%)',
} as const;

type ThreeDModelId =
  | 'hunyuan-3d-pro-fal'
  | 'hunyuan-3d-rapid-fal'
  | 'hunyuan-3d-smart-topology-fal'
  | 'tripo-h3'
  | 'hunyuan-3d-v3.1-huya'
  | 'hunyuan-3d-v3.0-huya'
  | 'tripo-3d-v3.1-huya';

type ThreeDMaterialMode = 'geometry' | 'texture' | 'pbr';

interface ThreeDModelMenuItem {
  id: string;
  label: string;
  brand: 'hunyuan' | 'tripo';
  defaultModelId: ThreeDModelId;
}

const THREE_D_MODEL_MENU_ITEMS: readonly ThreeDModelMenuItem[] = [
  { id: 'hunyuan-3d-fal', label: 'Hunyuan 3D - Fal', brand: 'hunyuan', defaultModelId: 'hunyuan-3d-pro-fal' },
  { id: 'hunyuan-3d-smart-topology-fal', label: 'Hunyuan 3D Topology - Fal', brand: 'hunyuan', defaultModelId: 'hunyuan-3d-smart-topology-fal' },
  { id: 'tripo-h3', label: 'Tripo H3.1 - Fal', brand: 'tripo', defaultModelId: 'tripo-h3' },
  { id: 'hunyuan-3d-v3.1-huya', label: '海艺腾讯混元-v3.1', brand: 'hunyuan', defaultModelId: 'hunyuan-3d-v3.1-huya' },
  { id: 'hunyuan-3d-v3.0-huya', label: '海艺腾讯混元-v3.0', brand: 'hunyuan', defaultModelId: 'hunyuan-3d-v3.0-huya' },
  { id: 'tripo-3d-v3.1-huya', label: '海艺Tripo-v3.1', brand: 'tripo', defaultModelId: 'tripo-3d-v3.1-huya' },
] as const;

const THREE_D_MATERIAL_OPTIONS: ReadonlyArray<{ id: ThreeDMaterialMode; label: string }> = [
  { id: 'geometry', label: '几何' },
  { id: 'texture', label: '纹理' },
  { id: 'pbr', label: 'PBR' },
];

const MULTIVIEW_BADGES = ['主图', '背视', '左视', '右视', '上视', '下视', '左前', '右前'];

export function resolveThreeDModelId(raw?: string): ThreeDModelId {
  switch (raw) {
    case 'hunyuan-3d-rapid-fal':
    case 'hunyuan-3d-smart-topology-fal':
    case 'tripo-h3':
    case 'hunyuan-3d-v3.1-huya':
    case 'hunyuan-3d-v3.0-huya':
    case 'tripo-3d-v3.1-huya':
      return raw;
    default:
      return 'hunyuan-3d-pro-fal';
  }
}

export function resolveThreeDMaterial(state: CanvasSpecializedSettings): ThreeDMaterialMode {
  if (state.threeDMaterial === 'geometry' || state.threeDMaterial === 'texture' || state.threeDMaterial === 'pbr') {
    return state.threeDMaterial;
  }
  return state.textured === false ? 'geometry' : 'texture';
}

function getModelHint(modelId: ThreeDModelId): string {
  switch (modelId) {
    case 'hunyuan-3d-smart-topology-fal':
      return '连接上游 3D 节点后，可直接优化已有 GLB / OBJ 网格拓扑。';
    case 'hunyuan-3d-rapid-fal':
      return 'Rapid 更偏向快速出模；切换几何或 PBR 会直接映射 Fal 参数。';
    case 'tripo-h3':
      return '支持文生 3D、单图转 3D；连接 2–4 张参考图时自动切换多视角建模。';
    case 'hunyuan-3d-v3.1-huya':
    case 'hunyuan-3d-v3.0-huya':
    case 'tripo-3d-v3.1-huya':
      return '通过 Fal / 混元 3D 通道提交文生 3D、单图或多视图转 3D。';
    default:
      return 'Pro 支持更完整的细节控制，适合正式出模；多图参考按 背/左/右/上/下/左前/右前 顺序生效。';
  }
}

interface CanvasThreeDNodeProps {
  node: CanvasNode;
  sources: CanvasNode[];
  projectId: string;
  selected?: boolean;
  busy: boolean;
  locked: boolean;
  disabled: boolean;
  error: string;
  ModelPreview: ComponentType<{ url: string; className?: string }>;
  onStart: () => void;
  onPoll: () => void;
  onChange: (patch: Partial<CanvasNode>) => void;
  patchState: (patch: Partial<CanvasSpecializedSettings>, result?: Partial<CanvasNode>) => void;
}

export function CanvasThreeDNode({
  node,
  sources,
  projectId,
  selected = true,
  busy,
  locked,
  disabled,
  error,
  ModelPreview,
  onStart,
  onPoll,
  onChange,
  patchState,
}: CanvasThreeDNodeProps) {
  const state = node.specialized ?? {};
  const modelId = resolveThreeDModelId(state.threeDModel);
  const material = resolveThreeDMaterial(state);
  const isHunyuanFalFamily = modelId === 'hunyuan-3d-pro-fal' || modelId === 'hunyuan-3d-rapid-fal';
  const isTopology = modelId === 'hunyuan-3d-smart-topology-fal';
  const hasContent = Boolean(node.modelUrl || node.imageUrl);

  const activeMenuItem = isHunyuanFalFamily
    ? THREE_D_MODEL_MENU_ITEMS[0]
    : THREE_D_MODEL_MENU_ITEMS.find((item) => item.defaultModelId === modelId) || THREE_D_MODEL_MENU_ITEMS[0];

  const activeMaterialOption =
    THREE_D_MATERIAL_OPTIONS.find((item) => item.id === material) || THREE_D_MATERIAL_OPTIONS[1];

  const [openPopover, setOpenPopover] = useState<'model' | 'variant' | 'material' | 'more' | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(node.title || '3D');
  const [uploadingRef, setUploadingRef] = useState(false);
  const editorAnchor = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setLabelDraft(node.title || '3D');
  }, [node.title]);

  useEffect(() => {
    if (!openPopover) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openPopover]);

  const imageSources = sources.filter((source) => Boolean(source.imageUrl && !source.missingMedia));
  const modelSources = sources.filter((source) => Boolean(source.modelUrl));
  const textFromSources = sources
    .filter((source) => ['prompt', 'note'].includes(source.type) && source.content)
    .map((source) => source.content)
    .join('\n');

  const handleUploadReferenceImage = async (file?: File) => {
    if (!file || uploadingRef || locked) return;
    setUploadingRef(true);
    try {
      const media = await persistCanvasMedia(file, node.x - 320, node.y);
      const refId = crypto.randomUUID();
      useCanvasStore.getState().addNode(projectId, {
        ...media,
        id: refId,
        x: Math.round(node.x - (media.width || 250) - 64),
        y: Math.round(node.y + imageSources.length * 44),
      });
      const nextRefs = Array.from(new Set([...(node.referenceNodeIds || []), refId]));
      onChange({ referenceNodeIds: nextRefs });
    } catch {
      // Upload errors are surfaced if needed on next action
    } finally {
      setUploadingRef(false);
    }
  };

  const handleCaptureToCanvas = (dataUrl: string, width: number, height: number, ratio: ViewfinderRatio) => {
    const targetW = 280;
    const targetH = Math.max(160, Math.round((targetW * height) / Math.max(1, width)));
    useCanvasStore.getState().addNode(projectId, {
      type: 'image',
      title: `${node.title || '3D'} 视角 (${ratio})`,
      imageUrl: dataUrl,
      x: Math.round(node.x + (node.width || 375) + 72),
      y: Math.round(node.y),
      width: targetW,
      height: targetH,
      resultWidth: width,
      resultHeight: height,
      referenceNodeIds: [node.id],
    });
  };

  const handleImportToDirector = () => {
    const store = useCanvasStore.getState();
    const project = store.projects.find((item) => item.id === projectId);
    const existingDirector = project?.nodes.find(
      (item) => item.studioSubType === 'director-3d' && (item.referenceNodeIds || []).includes(node.id),
    );
    let directorId = existingDirector?.id;

    if (!directorId) {
      directorId = crypto.randomUUID();
      const baseDirector = buildQuickCanvasNode(
        'director-3d',
        { x: Math.round(node.x + (node.width || 375) + 88), y: Math.round(node.y) },
        { referenceNodeIds: [node.id] },
      );
      store.addNode(projectId, {
        ...baseDirector,
        id: directorId,
        specialized: {
          ...baseDirector.specialized,
          objects: [
            {
              label: node.title || '3D模型',
              x: 0,
              z: 0,
              width: 1.8,
              height: 2.2,
              depth: 1.4,
              color: '#d2987a',
            },
          ],
        },
      });
    }

    const targetDirectorId = directorId;
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('canvas:open-director-3d', {
          detail: { nodeId: targetDirectorId, sourceNodeId: node.id },
        }),
      );
    }, 40);
  };

  const cardHeight = node.height || 250;
  const showPromptPanel = selected;

  return (
    <div
      ref={editorAnchor}
      role="region" aria-label={node.title || '3D'}
      className="pointer-events-auto relative w-full select-none"
      style={{ height: cardHeight }}
    >
      {/* 顶部选中悬浮工具栏：预览 | 标签 | 下载 */}
      {hasContent && selected && (
        <div
          data-three-d-node-toolbar=""
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute -top-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/10 bg-[#1a1a1a]/95 px-2 py-1 text-xs text-white/90 shadow-2xl backdrop-blur-md whitespace-nowrap"
        >
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-white/85 transition hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <Maximize2 size={13} />
            <span>预览</span>
          </button>
          <button
            type="button"
            onClick={() => setEditingLabel((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-white/85 transition hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <Tag size={13} />
            <span>标签</span>
          </button>
          {node.modelUrl ? (
            <a
              href={node.modelUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-white/85 transition hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <Download size={13} />
              <span>下载 GLB</span>
            </a>
          ) : (
            <a
              href={node.imageUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-white/85 transition hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <Download size={13} />
              <span>下载</span>
            </a>
          )}
        </div>
      )}

      {/* 顶部节点小标题：🧊 3D 标识 */}
      <div className="absolute -top-6 left-0.5 z-20 flex items-center gap-1.5 text-xs text-zinc-400">
        <Box size={14} className="shrink-0 text-zinc-400" />
        {editingLabel ? (
          <input
            type="text"
            aria-label="编辑 3D 节点名称"
            value={labelDraft}
            autoFocus
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => {
              onChange({ title: labelDraft.trim() || '3D' });
              setEditingLabel(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onChange({ title: labelDraft.trim() || '3D' });
                setEditingLabel(false);
              } else if (e.key === 'Escape') {
                setLabelDraft(node.title || '3D');
                setEditingLabel(false);
              }
            }}
            className="w-28 rounded border border-white/25 bg-[#1b1b1e] px-1.5 py-0.5 text-xs text-white outline-none"
          />
        ) : (
          <span className="pointer-events-none font-medium text-zinc-300">{node.title || '3D'}</span>
        )}
      </div>

      {/* 3D 预览卡片本体（与参考图 5 一致的 #0D0D0D 柔光舞台底色） */}
      <div
        data-testid="drawing-preview"
        style={{ height: cardHeight }}
        onPointerDown={(event) => {
          pointerDownPosRef.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          if (!hasContent) return;
          const start = pointerDownPosRef.current;
          pointerDownPosRef.current = null;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
          if ((event.target as HTMLElement).closest('a,button,input')) return;
          setViewerOpen(true);
        }}
        className={`pointer-events-auto relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/[0.14] text-zinc-400 shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-colors ${
          hasContent ? 'bg-[#0D0D0D] cursor-pointer' : 'bg-[#1f1f1f] cursor-grab active:cursor-grabbing'
        }`}
      >
        {hasContent && (
          <div
            aria-hidden="true"
            data-testid="three-d-node-ambient-halo"
            style={THREE_D_AMBIENT_HALO_STYLE}
            className="pointer-events-none absolute inset-0"
          />
        )}

        {node.imageUrl ? (
          <div className="relative z-[1] flex h-full w-full items-center justify-center">
            <img
              alt="生成预览"
              src={proxyMediaUrl(node.imageUrl) || node.imageUrl}
              draggable={false}
              className="h-full w-full object-contain p-[10%] drop-shadow-[0_16px_26px_rgba(0,0,0,0.34)] pointer-events-none select-none"
            />
          </div>
        ) : node.modelUrl ? (
          <div className="relative z-[1] h-full w-full">
            <ModelPreview url={node.modelUrl} className="h-full w-full rounded-none bg-transparent" />
            <div
              className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1.5"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setViewerOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md hover:bg-black/85 cursor-pointer"
              >
                <Maximize2 size={12} />
                全屏检视
              </button>
              <a
                href={node.modelUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-md hover:bg-black/85"
              >
                <Download size={12} />
                下载 GLB
              </a>
              {state.outputs
                ?.filter((output) => output.url !== node.modelUrl)
                .map((output, index) => (
                  <a
                    key={index}
                    href={output.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border border-white/15 bg-black/65 px-2 py-1 text-[11px] text-white/80 backdrop-blur-md hover:bg-black/85"
                  >
                    {output.extension ? output.extension.toUpperCase() : `输出 ${index + 1}`}
                  </a>
                ))}
            </div>
          </div>
        ) : state.taskStatus === 'pending' || busy ? (
          <div className="pointer-events-none flex flex-col items-center gap-2.5 text-xs text-zinc-300">
            <Loader2 size={26} className="animate-spin text-white/80" />
            <span>正在生成 3D 模型…</span>
          </div>
        ) : (
          <div className="pointer-events-none flex flex-col items-center justify-center text-zinc-500">
            <Box size={40} strokeWidth={1.6} className="text-zinc-500/85" />
          </div>
        )}
      </div>

      {/* 全屏 3D 模型检视器（取景器 + 光源调节 + 导入 3D 导演台） */}
      {viewerOpen && (
        <CanvasThreeDViewerModal
          node={node}
          onClose={() => setViewerOpen(false)}
          onCaptureToCanvas={handleCaptureToCanvas}
          onImportToDirector={handleImportToDirector}
        />
      )}

      {/* 悬浮 3D 提示词与 Fal 模型参数面板 */}
      {showPromptPanel && (
        <CanvasDrawingEditor
          anchor={editorAnchor}
          panelRef={panelRef}
          preferredWidth={680}
          data-gen-prompt-panel="true"
          data-three-d-prompt-panel="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto rounded-[22px] border border-white/[0.08] bg-[#1b1b1e]/98 px-5 pt-4 pb-3.5 text-zinc-100 shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-xl"
        >
          {/* 顶部参考图 / 上游 3D 模型栏 */}
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                void handleUploadReferenceImage(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {!isTopology && (
              <button
                type="button"
                disabled={locked || uploadingRef}
                title="上传或添加 3D 参考图"
                aria-label="添加参考图"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-white/[0.08] bg-[#2a2a2e] text-zinc-300 transition-colors hover:border-white/20 hover:bg-[#333338] hover:text-white disabled:opacity-40 cursor-pointer"
              >
                {uploadingRef ? <Loader2 size={16} className="animate-spin" /> : <Plus size={17} />}
              </button>
            )}
            {imageSources.map((srcNode, idx) => (
              <div
                key={srcNode.id}
                className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[12px] border border-white/15 bg-zinc-800"
                title={`${MULTIVIEW_BADGES[idx] || `参考图 ${idx + 1}`}: ${srcNode.title || '参考图'}`}
              >
                <img
                  src={proxyMediaUrl(srcNode.imageUrl) || srcNode.imageUrl}
                  alt={srcNode.title || '参考图'}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/65 text-center text-[8px] leading-tight text-white/90">
                  {MULTIVIEW_BADGES[idx] || `#${idx + 1}`}
                </span>
              </div>
            ))}
            {isTopology && (
              <span className="text-xs text-zinc-400">
                {modelSources.length > 0
                  ? `已连接上游 3D 模型：${modelSources[0].title || 'GLB 模型'}`
                  : '请先连接一个已生成的上游 3D 节点以优化拓扑'}
              </span>
            )}
          </div>

          {/* 中部提示词输入区 */}
          <textarea
            aria-label="3D 描述"
            value={node.textPrompt || ''}
            maxLength={1024}
            disabled={locked || isTopology}
            placeholder={
              isTopology
                ? '该模型用于优化已有 3D 网格拓扑，无需输入提示词'
                : textFromSources || '输入提示词...'
            }
            onChange={(event) => onChange({ textPrompt: event.target.value })}
            onWheel={(event) => event.stopPropagation()}
            className="min-h-[78px] w-full resize-none bg-transparent text-[14.5px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-50"
          />

          {error && (
            <p role="alert" className="mt-1 text-xs text-rose-400">
              {error}
            </p>
          )}

          {/* 底部控制栏：模型选择 | Pro/Rapid | 几何/纹理/PBR | ...  右侧 ↑ */}
          <div className="mt-2 flex min-h-[34px] items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {/* 1. 3D 模型选择器 */}
              <div className="relative">
                <button
                  type="button"
                  disabled={locked}
                  aria-label="选择 3D 模型"
                  data-three-d-model-trigger="true"
                  onClick={() => setOpenPopover((prev) => (prev === 'model' ? null : 'model'))}
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] disabled:opacity-45 cursor-pointer"
                >
                  <ModelIcon modelId={activeMenuItem.brand} className="h-3.5 w-3.5 shrink-0 object-contain" />
                  <span>{activeMenuItem.label}</span>
                </button>

                {openPopover === 'model' && (
                  <div
                    role="menu"
                    aria-label="3D 模型列表"
                    className="absolute bottom-full left-0 z-50 mb-2 flex w-[232px] flex-col gap-0.5 rounded-2xl border border-white/10 bg-[#222226] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.72)]"
                  >
                    {THREE_D_MODEL_MENU_ITEMS.map((item) => {
                      const active = item.id === activeMenuItem.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            const nextModel: ThreeDModelId =
                              item.id === 'hunyuan-3d-fal'
                                ? modelId === 'hunyuan-3d-rapid-fal'
                                  ? 'hunyuan-3d-rapid-fal'
                                  : 'hunyuan-3d-pro-fal'
                                : item.defaultModelId;
                            patchState({ threeDModel: nextModel });
                            setOpenPopover(null);
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-white/[0.11] text-white'
                              : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <ModelIcon modelId={item.brand} className="h-3.5 w-3.5 shrink-0 object-contain" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. Hunyuan 3D - Fal 专属 Pro / Rapid 规格切换 */}
              {isHunyuanFalFamily && (
                <>
                  <span className="mx-0.5 h-3.5 w-px bg-white/15" />
                  <div className="relative">
                    <button
                      type="button"
                      disabled={locked}
                      aria-label="切换 Hunyuan 3D 规格"
                      data-three-d-variant-trigger="true"
                      onClick={() => setOpenPopover((prev) => (prev === 'variant' ? null : 'variant'))}
                      className="flex h-7 items-center rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] disabled:opacity-45 cursor-pointer"
                    >
                      <span>{modelId === 'hunyuan-3d-rapid-fal' ? 'Rapid' : 'Pro'}</span>
                    </button>

                    {openPopover === 'variant' && (
                      <div
                        role="menu"
                        aria-label="Hunyuan 3D 规格"
                        className="absolute bottom-full left-1/2 z-50 mb-2 flex w-[92px] -translate-x-1/2 flex-col gap-0.5 rounded-2xl border border-white/10 bg-[#222226] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.72)]"
                      >
                        {(
                          [
                            { id: 'hunyuan-3d-pro-fal', label: 'Pro' },
                            { id: 'hunyuan-3d-rapid-fal', label: 'Rapid' },
                          ] as const
                        ).map((variant) => {
                          const active = modelId === variant.id;
                          return (
                            <button
                              key={variant.id}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                patchState({ threeDModel: variant.id });
                                setOpenPopover(null);
                              }}
                              className={`flex w-full items-center justify-center rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                                active
                                  ? 'bg-white/[0.12] text-white'
                                  : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              {variant.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 3. 材质输出模式：几何 / 纹理 / PBR */}
              {!isTopology && (
                <>
                  <span className="mx-0.5 h-3.5 w-px bg-white/15" />
                  <div className="relative">
                    <button
                      type="button"
                      disabled={locked}
                      aria-label="选择 3D 材质模式"
                      data-three-d-material-trigger="true"
                      onClick={() => setOpenPopover((prev) => (prev === 'material' ? null : 'material'))}
                      className="flex h-7 items-center rounded-lg px-2 text-xs font-semibold text-zinc-100 transition-colors hover:bg-white/[0.08] disabled:opacity-45 cursor-pointer"
                    >
                      <span>{activeMaterialOption.label}</span>
                    </button>

                    {openPopover === 'material' && (
                      <div
                        role="menu"
                        aria-label="3D 材质模式"
                        className="absolute bottom-full left-1/2 z-50 mb-2 flex w-[84px] -translate-x-1/2 flex-col gap-0.5 rounded-2xl border border-white/10 bg-[#222226] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.72)]"
                      >
                        {THREE_D_MATERIAL_OPTIONS.map((option) => {
                          const active = option.id === material;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                patchState({
                                  threeDMaterial: option.id,
                                  textured: option.id !== 'geometry',
                                });
                                setOpenPopover(null);
                              }}
                              className={`flex w-full items-center justify-center rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                                active
                                  ? 'bg-white/[0.12] text-white'
                                  : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 4. 更多参数说明（...） */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="更多 3D 说明"
                  onClick={() => setOpenPopover((prev) => (prev === 'more' ? null : 'more'))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-200 cursor-pointer"
                >
                  <MoreHorizontal size={15} />
                </button>

                {openPopover === 'more' && (
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-[268px] rounded-2xl border border-white/10 bg-[#222226] p-3 text-[11px] leading-relaxed text-zinc-300 shadow-[0_18px_45px_rgba(0,0,0,0.72)]">
                    {!isTopology && (
                      <p className="mb-1.5 text-zinc-200">
                        几何只输出网格。纹理加上表面颜色。PBR 加上材质贴图，支持真实光照。
                      </p>
                    )}
                    <p className="text-zinc-400">{getModelHint(modelId)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧操作按钮区 */}
            <div className="flex items-center gap-1.5">
              <span role="status" className="sr-only">
                {state.taskStatus === 'done'
                  ? '已完成'
                  : state.taskStatus === 'pending'
                    ? '等待任务结果'
                    : activeMenuItem.label}
              </span>
              {state.taskStatus === 'pending' && (
                <button
                  type="button"
                  onClick={onPoll}
                  className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-white/85 hover:bg-white/10 cursor-pointer"
                >
                  查询原任务
                </button>
              )}
              <button
                type="button"
                title="生成"
                aria-label="生成"
                disabled={disabled}
                onClick={onStart}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-opacity hover:bg-white/90 disabled:opacity-40 cursor-pointer"
              >
                <ArrowUp size={17} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </CanvasDrawingEditor>
      )}
    </div>
  );
}
