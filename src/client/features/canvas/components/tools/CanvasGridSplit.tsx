import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Grid2X2, Layers, Redo2, Undo2, X } from 'lucide-react';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { EXTENDED_IMAGE_RATIO_ITEMS, IMAGE_RATIO_ITEMS } from '@client/shared/prompt-bar/promptBarConstants';
import { ModelIcon } from '@client/shared/ui/ModelIcons';
import { agentTriggerModelName, PromptBarModelPickerModal } from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import { prepareLayerImage, runLayerDecompositionTask } from '../../model/layerDecompositionTask';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';
import {
  BUILTIN_IMAGE_PICKER_MODELS,
  BUILTIN_VIDEO_PICKER_MODELS,
  MODEL_CHANNEL_TABS,
  resolveImagePickerModels,
  type ModelChannelTab,
} from '../nodes/CanvasCameraAndPrompts';
import { CanvasVideoPopover, resolveImageModelCapabilities } from '../video/CanvasVideoPlayer';

export type ImageControlConfig = {
  aspect: string;
  quality: string;
  generationQuality?: 'max' | 'xhigh' | 'high' | 'medium' | 'low';
  backgroundMode?: 'auto' | 'transparent';
  customWidth?: number;
  customHeight?: number;
  count: number;
};
const backgroundModes = [
  { id: 'auto' as const, label: '默认' },
  { id: 'transparent' as const, label: '透明底' },
];
const ALL_RATIO_IDS = ['smart', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', ...EXTENDED_IMAGE_RATIO_ITEMS.slice(2).map(item => item.id), 'custom'];

function RatioFrameIcon({ ratio }: { ratio: string }) {
  const clean = String(ratio || '').trim();
  const match = clean && clean !== 'smart' && clean !== 'Auto' ? clean.match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i) : null;
  if (!match) {
    return (
      <svg width="12" height="12" viewBox="0 0 16 14" fill="none" className="shrink-0 opacity-90" aria-hidden="true">
        <path
          d="M1.5 4.2V2.4c0-.5.4-.9.9-.9H4.4M11.6 1.5h2c.5 0 .9.4.9.9v1.8M14.5 9.8v1.8c0 .5-.4.9-.9.9h-2M4.4 12.5H2.4c-.5 0-.9-.4-.9-.9V9.8"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="5" y="4" width="6" height="6" rx="0.8" stroke="currentColor" strokeWidth="1.55" />
      </svg>
    );
  }
  const w = Number(match[1]);
  const h = Number(match[2]);
  const maxDim = 12;
  let boxW = maxDim;
  let boxH = (h / w) * maxDim;
  if (boxH > maxDim) {
    boxH = maxDim;
    boxW = (w / h) * maxDim;
  }
  return (
    <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center" aria-hidden="true">
      <span
        className="box-border rounded-[1.5px] border-[1.5px] border-current"
        style={{ width: Math.max(5, boxW), height: Math.max(5, boxH) }}
      />
    </span>
  );
}

export function CanvasImageControls({ config, model, selection, onChange }: { config: ImageControlConfig; model?: string; selection?: string; onChange: (patch: Partial<ImageControlConfig>) => void }) {
  const [open, setOpen] = useState<'aspect' | 'quality' | 'count' | null>(null);
  const aspect = useRef<HTMLButtonElement>(null);
  const quality = useRef<HTMLButtonElement>(null);
  const count = useRef<HTMLButtonElement>(null);
  const anchors = useMemo(() => ({ aspect, quality, count }), []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!(event.target as Element).closest('[data-image-control]')) setOpen(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(null); anchors[open].current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape, true); };
  }, [open, anchors]);
  const choose = (patch: Partial<ImageControlConfig>, keepOpen = false) => {
    onChange(patch);
    if (!keepOpen) {
      if (open) anchors[open].current?.focus();
      setOpen(null);
    }
  };
  const caps = useMemo(() => resolveImageModelCapabilities(model, selection), [model, selection]);
  const activeQuality =
    caps.resolutions.find((item) => item.id === config.quality || item.short === config.quality) ||
    caps.resolutions[Math.min(1, Math.max(0, caps.resolutions.length - 1))] ||
    { id: 'medium', short: '2K', label: '高清画质' };
  const activeGenQuality =
    caps.qualities.find((item) => item.id === (config.generationQuality || 'high')) ||
    caps.qualities.find((item) => item.id === 'high') ||
    caps.qualities[0];
  const activeBg = config.backgroundMode || 'auto';
  const effectiveAspect = caps.ratios.includes(config.aspect) ? config.aspect : caps.ratios[0] || '1:1';
  const ratioText =
    effectiveAspect === 'smart' || effectiveAspect === 'Auto'
      ? '自适应'
      : effectiveAspect === 'custom'
        ? `${config.customWidth || 1024}×${config.customHeight || 1024}`
        : effectiveAspect || '1:1';
  const summaryParts = [
    ratioText,
    caps.resolutions.length > 0 ? activeQuality.short : '',
    caps.qualities.length > 0 && activeGenQuality ? activeGenQuality.label : '',
    caps.supportsBackground && activeBg === 'transparent' ? '透明底' : '',
  ].filter(Boolean);
  const ratioItems = ALL_RATIO_IDS.filter((id) => caps.ratios.includes(id)).map((id) => {
    const found = IMAGE_RATIO_ITEMS.find((item) => item.id === id);
    if (found) return found;
    return { id, label: id === 'custom' ? '自定义' : id };
  });

  return (
    <>
      <div className="qiaodoumayi-gen-size-beside-model shrink-0 flex items-center gap-1 overflow-visible">
        <span className="qiaodoumayi-gen-model-size-divider" aria-hidden="true" />
        <button
          ref={aspect}
          type="button"
          data-image-control
          data-gen-dropdown-type="ratio"
          aria-label="图片比例"
          title="画质 / 生成质量 / 背景 / 比例"
          aria-haspopup="dialog"
          aria-expanded={open === 'aspect'}
          onClick={() => setOpen(open === 'aspect' ? null : 'aspect')}
          className={`node-dropdown-button flex items-center gap-1.5 rounded-[9px] px-2 py-1 text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
            open === 'aspect' ? 'bg-black/[0.06] text-zinc-950 dark:bg-white/[0.1] dark:text-white' : ''
          }`}
        >
          <RatioFrameIcon ratio={effectiveAspect} />
          <span>{summaryParts.join(' · ')}</span>
        </button>
        <button
          ref={quality}
          type="button"
          data-image-control
          data-gen-dropdown-type="quality"
          aria-label="图片画质"
          title={`画质：${activeQuality.label} (${activeQuality.short})`}
          aria-haspopup="dialog"
          aria-expanded={open === 'quality'}
          onClick={() => setOpen(open === 'quality' ? null : 'quality')}
          className="sr-only"
        >
          {activeQuality.label}
        </button>
        <button
          ref={count}
          type="button"
          data-image-control
          aria-label="绘图张数"
          title="从当前节点发送的生图任务数量"
          aria-haspopup="dialog"
          aria-expanded={open === 'count'}
          onClick={() => setOpen(open === 'count' ? null : 'count')}
          className="sr-only"
        >
          {config.count}×
        </button>
      </div>

      {open && (
        <CanvasVideoPopover key={open} anchor={anchors[open]} width={open === 'aspect' ? 342 : open === 'quality' ? 220 : 88}>
          <div
            data-image-control
            role="dialog"
            aria-label={open === 'aspect' ? '图片比例' : open === 'quality' ? '图片画质' : '绘图张数'}
            className={open === 'aspect' ? 'qiaodoumayi-gen-ratio-panel qiaodoumayi-gen-size-panel' : 'p-1.5'}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              event.preventDefault();
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1) + items.length) % items.length]?.focus();
            }}
          >
            {open === 'aspect' ? (
              <div className="qiaodoumayi-gen-ratio-panel-content qiaodoumayi-gen-size-panel-content space-y-2.5">
                {(caps.resolutions.length > 0 || caps.qualities.length > 0) && (
                  <div className="qiaodoumayi-gen-size-section">
                    <div className="qiaodoumayi-gen-popover-label text-zinc-500 dark:text-zinc-400">
                      {caps.resolutions.length > 0 ? '画质' : '生成质量'}
                    </div>
                    {caps.resolutions.length > 0 && (
                      <div
                        role="tablist"
                        aria-label="画质"
                        style={{ gridTemplateColumns: `repeat(${caps.resolutions.length}, minmax(0, 1fr))` }}
                        className="qiaodoumayi-gen-quality-pills grid gap-1 rounded-[12px] bg-zinc-100 p-1 dark:bg-black/40"
                      >
                        {caps.resolutions.map((item) => {
                          const active = activeQuality.id === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => choose({ quality: item.id }, true)}
                              className={`flex items-center justify-center rounded-[9px] py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                                active
                                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                              }`}
                            >
                              <span>{item.short}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {caps.supportsCustomSize && (config.quality === 'custom' || effectiveAspect === 'custom') && (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded-[10px] bg-zinc-100/80 px-2.5 py-1.5 text-[11px] dark:bg-black/35">
                        <span className="text-zinc-400">宽</span>
                        <input
                          type="number"
                          min={256}
                          max={3840}
                          step={16}
                          value={config.customWidth || 1024}
                          onChange={(e) => choose({ customWidth: Math.min(3840, Math.max(256, Number(e.target.value) || 1024)) }, true)}
                          className="w-16 rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-center text-zinc-900 dark:border-white/15 dark:bg-black/40 dark:text-white"
                        />
                        <span className="text-zinc-400">× 高</span>
                        <input
                          type="number"
                          min={256}
                          max={3840}
                          step={16}
                          value={config.customHeight || 1024}
                          onChange={(e) => choose({ customHeight: Math.min(3840, Math.max(256, Number(e.target.value) || 1024)) }, true)}
                          className="w-16 rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-center text-zinc-900 dark:border-white/15 dark:bg-black/40 dark:text-white"
                        />
                      </div>
                    )}
                    {caps.qualities.length > 0 && (
                      <div
                        role="tablist"
                        aria-label="生成质量"
                        style={{ gridTemplateColumns: `repeat(${caps.qualities.length}, minmax(0, 1fr))` }}
                        className={`qiaodoumayi-gen-quality-pills ${caps.resolutions.length > 0 ? 'mt-1.5' : ''} grid gap-1 rounded-[12px] bg-zinc-100 p-1 dark:bg-black/40`}
                      >
                        {caps.qualities.map((item) => {
                          const active = activeGenQuality?.id === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => choose({ generationQuality: item.id }, true)}
                              className={`flex items-center justify-center rounded-[9px] py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                                active
                                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                              }`}
                            >
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {caps.supportsBackground && (
                  <div className="qiaodoumayi-gen-size-section">
                    <div className="qiaodoumayi-gen-popover-label text-zinc-500 dark:text-zinc-400">背景</div>
                    <div
                      role="tablist"
                      aria-label="背景"
                      className="qiaodoumayi-gen-quality-pills grid grid-cols-2 gap-1 rounded-[12px] bg-zinc-100 p-1 dark:bg-black/40"
                    >
                      {backgroundModes.map((item) => {
                        const active = activeBg === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => choose({ backgroundMode: item.id }, true)}
                            className={`flex items-center justify-center rounded-[9px] py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                              active
                                ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                            }`}
                          >
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="qiaodoumayi-gen-size-section">
                  <div className="qiaodoumayi-gen-popover-label text-zinc-500 dark:text-zinc-400">比例</div>
                  <div className="qiaodoumayi-gen-ratio-grid">
                    <div className="grid grid-cols-5 gap-2">
                      {ratioItems.map((item) => {
                        const [w, h] = item.id.includes(':') ? item.id.split(':').map(Number) : [1, 1];
                        const selected = effectiveAspect === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-dropdown-option-selected={selected ? 'true' : undefined}
                            autoFocus={selected}
                            aria-pressed={selected}
                            onClick={() => choose({ aspect: item.id }, item.id === 'custom')}
                            className={`flex min-h-[54px] flex-col items-center justify-center gap-1.5 rounded-[9px] border px-1 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
                              selected
                                ? 'border-zinc-900 bg-zinc-900/[0.06] text-zinc-950 dark:border-white/75 dark:bg-white/[0.12] dark:text-white'
                                : 'border-zinc-200/90 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-white/[0.16] dark:text-zinc-300 dark:hover:border-white/40 dark:hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className="flex h-5 w-6 items-center justify-center">
                              <div
                                className={`rounded-[2px] border-[1.6px] border-current ${item.id === 'smart' || item.id === 'custom' ? 'border-dashed' : ''}`}
                                style={{ width: (20 * w) / Math.max(w, h), height: (20 * h) / Math.max(w, h) }}
                              />
                            </div>
                            <span className="leading-none">{item.id === 'smart' ? '自适应' : item.id === 'custom' ? '自定义' : item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : open === 'quality' ? (
              <div className="space-y-1">
                {caps.resolutions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    autoFocus={activeQuality.id === item.id}
                    aria-pressed={activeQuality.id === item.id}
                    onClick={() => choose({ quality: item.id })}
                    className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-xs transition-colors cursor-pointer ${
                      activeQuality.id === item.id
                        ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-white/10 dark:text-white'
                        : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <span>{item.short} · {item.label}</span>
                    {activeQuality.id === item.id && <Check size={13} />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-stretch gap-0.5">
                {[1, 2, 4, 9].map((value) => (
                  <button
                    key={value}
                    type="button"
                    autoFocus={config.count === value}
                    aria-pressed={config.count === value}
                    onClick={() => choose({ count: value })}
                    className={`rounded-full px-3 py-1.5 text-center text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      config.count === value
                        ? 'bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/70'
                    }`}
                  >
                    {value}× ({value} 张)
                  </button>
                ))}
              </div>
            )}
          </div>
        </CanvasVideoPopover>
      )}
    </>
  );
}

export function CanvasLayerDecomposition({ node, projectId, menuItemClass, onMenuOpen }: { node: CanvasNode; projectId: string; menuItemClass?: string; onMenuOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const busy = false;
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  type Box = { x: number; y: number; w: number; h: number };
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [redo, setRedo] = useState<Box[]>([]);
  const [draft, setDraft] = useState<Box | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lock = useRef(false);
  const run = async () => {
    if (lock.current || !node.imageUrl) return;
    lock.current = true;
    const source = { ...node };
    const text = [prompt.trim() || '自动拆分图片中的主要元素，保留底图和独立透明图层', ...boxes.map((box, index) => `重点拆分区域${index + 1}中的物体：左上角(${Math.round(box.x * 100)}%, ${Math.round(box.y * 100)}%)，右下角(${Math.round((box.x + box.w) * 100)}%, ${Math.round((box.y + box.h) * 100)}%)，坐标相对于原图宽高。`)].join('\n');
    const key = crypto.randomUUID();
    setOpen(false);
    try {
      await runLayerDecompositionTask(projectId, source, () => prepareLayerImage(source.imageUrl!), text, key);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作标识保存失败，未提交');
      setOpen(true);
    } finally {
      lock.current = false;
    }
  };
  return <>
    <button
      type="button"
      aria-label="图层分离"
      title="图层分离"
      disabled={!node.imageUrl || node.missingMedia}
      onClick={event => {
        event.stopPropagation();
        setHost(event.currentTarget.closest<HTMLElement>('.canvas-node-card') || document.querySelector<HTMLElement>(`[data-canvas-node-id="${node.id}"]`));
        onMenuOpen?.();
        setOpen(true);
      }}
      className={menuItemClass || 'group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:pointer-events-none active:scale-95 dark:hover:text-white dark:text-slate-200 dark:hover:bg-white/10'}
    >
      <Layers className="w-3.5 h-3.5 shrink-0" />
      {menuItemClass ? <span>图层分解</span> : (
        <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]/95">
          图层分离
        </span>
      )}
    </button>
    {open && host && createPortal(<div data-layer-editor className="pointer-events-none absolute left-0 top-0 z-50 w-full" style={{ height: node.height }} onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' && !busy) setOpen(false); }}>
      <section role="region" aria-label="图层分离" className="relative h-full w-full text-slate-700 dark:text-slate-200">
        <header className="pointer-events-auto absolute -top-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-[#18191c]">
          <button autoFocus type="button" aria-label="关闭图层分离" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
          <span className="h-5 w-px bg-slate-200 dark:bg-white/10" /><h2 className="flex items-center gap-2 text-xs font-medium"><Layers className="h-4 w-4" />图层分离</h2><span className="h-5 w-px bg-slate-200 dark:bg-white/10" />
          <button type="button" aria-label="撤销框选" disabled={busy || !boxes.length} onClick={() => { setRedo([...redo, boxes[boxes.length - 1]]); setBoxes(boxes.slice(0, -1)); }} className="p-1 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" aria-label="重做框选" disabled={busy || !redo.length} onClick={() => { setBoxes([...boxes, redo[redo.length - 1]]); setRedo(redo.slice(0, -1)); }} className="p-1 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        </header>
        <div aria-label="框选拆分区域" className="pointer-events-auto absolute inset-0 touch-none select-none" style={{ cursor: busy ? 'default' : 'crosshair' }}
          onPointerDown={event => {
            event.stopPropagation();
            if (busy || event.button !== 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            start.current = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
            setDraft({ ...start.current, w: 0, h: 0 }); event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            if (!start.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
            setDraft({ x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), w: Math.abs(x - start.current.x), h: Math.abs(y - start.current.y) });
          }}
          onPointerUp={() => { if (draft && draft.w > 0.01 && draft.h > 0.01) { setBoxes([...boxes, draft]); setRedo([]); } start.current = null; setDraft(null); }}
          onPointerCancel={() => { start.current = null; setDraft(null); }}>
          {!boxes.length && !draft && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-lg bg-black/65 px-3 py-2 text-xs text-white">框选你想要拆分的物体</span></div>}
          {[...boxes, ...(draft ? [draft] : [])].map((box, index) => <div key={index} className="pointer-events-none absolute border-2 border-indigo-500 bg-indigo-400/15" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}><span className="absolute left-0 top-0 bg-indigo-500 px-1 text-[10px] text-white">{index + 1}</span></div>)}
        </div>
        <div className="pointer-events-auto absolute top-full left-1/2 mt-3 w-[420px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#18191c]">
          <p className="mb-3 text-xs font-medium">图层分离</p>
          {error && <p role="alert" className="mb-2 text-xs text-rose-600">{error}</p>}
          <textarea aria-label="拆分要求" disabled={busy} value={prompt} onChange={e => { setPrompt(e.target.value); }} placeholder="描述或框选希望拆分的图层，留空将自动识别并拆分" className="soft-textarea h-20 w-full resize-none p-3 text-xs" />
          <footer className="mt-3 flex gap-2"><button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-xs dark:bg-white/10">取消</button><button type="button" onClick={run} className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-xs text-white dark:bg-white dark:text-slate-950">拆分</button></footer>
        </div>
      </section>
    </div>, host)}
  </>;
}

interface PickerModel { id: string; name: string; modelId?: string; upstreamId?: string; provider?: string }

export function CanvasModelPicker({ models, value, onChange, disabled = false, label = '绘图模型', placeholder, preferUp = true }: {
  models: PickerModel[]; value: string; onChange: (id: string) => void; disabled?: boolean; label?: string; placeholder?: string; preferUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [channelTab, setChannelTab] = useState<ModelChannelTab>('api');
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; height: number }>({ left: 8, top: 8, width: 288, height: 390 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const isImagePicker = label === '绘图模型';
  const isChatPicker = label !== '绘图模型' && label !== '视频模型';
  const hasFalModels = useMemo(
    () => resolveImagePickerModels(models, 'fal').length > 0 && resolveImagePickerModels(models, 'api').length > 0,
    [models],
  );
  const showChannelTabs = (label === '绘图模型' || label === '视频模型') && hasFalModels;
  const displayedModels = useMemo(
    () => (showChannelTabs ? resolveImagePickerModels(models, channelTab) : models),
    [models, channelTab, showChannelTabs],
  );
  const builtins = isImagePicker ? BUILTIN_IMAGE_PICKER_MODELS : BUILTIN_VIDEO_PICKER_MODELS;
  const current =
    models.find((model) => model.id === value || model.modelId === value || model.upstreamId === value) ||
    (!placeholder ? models[0] : undefined) ||
    (label === '绘图模型' || label === '视频模型' ? builtins.find((model) => model.id === value || model.name === value) : undefined);
  const fallbackName = isImagePicker ? 'GPT Image 2' : label === '视频模型' ? 'Seedance 2.0 Mini' : '未配置模型';
  const triggerDisplayName = !current && placeholder ? placeholder : isChatPicker
    ? agentTriggerModelName(current?.modelId || current?.upstreamId || value, current?.name || '')
    : current?.name ? current.name.split(' · ')[0] : value || fallbackName;
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open || isChatPicker) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(288, window.innerWidth - 16);
      const above = rect.top - 16;
      const below = window.innerHeight - rect.bottom - 16;
      const up = preferUp ? above >= Math.min(390, below) : below < Math.min(390, above);
      const height = Math.max(80, Math.min(390, up ? above : below));
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), ...(up ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }), width, height });
    };
    place();
    (popup.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') || popup.current?.querySelector<HTMLButtonElement>('[data-model-choice]'))?.focus();
    const outside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, isChatPicker, preferUp]);

  return (
    <div data-model-select-area="true" className="relative shrink-0 min-w-0">
      <button
        ref={trigger}
        type="button"
        data-gen-dropdown-type="model"
        data-qiaodoumayi-gen-model="true"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="node-dropdown-button flex max-w-[200px] items-center gap-1.5 rounded-[9px] px-2 py-1 text-[13px] font-medium text-zinc-900 dark:text-white/95 transition-colors hover:bg-black/5 dark:hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50 cursor-pointer"
      >
        <span aria-hidden="true" className="flex shrink-0 items-center justify-center">
          <ModelIcon modelId={current?.modelId || current?.upstreamId || value || (isImagePicker ? 'gpt-image-2' : 'doubao-seedance-2.0-mini')} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate leading-none" title={current?.name || fallbackName}>
          {triggerDisplayName}
        </span>
      </button>
      {isChatPicker && <PromptBarModelPickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        triggerRef={trigger}
        isUp={preferUp}
        models={models.map((model) => ({ ...model, upstreamId: model.modelId || model.upstreamId, desc: '' }))}
        selectedModelId={current?.id || value}
        modalityKind="chat"
        onSelectModel={onChange}
      />}
      {open && !isChatPicker &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="dialog"
            data-gen-node-portal-dropdown="true"
            aria-label={`选择${label}`}
            className="node-dropdown-menu fixed z-[200] flex flex-col overflow-hidden rounded-[18px] border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#1f1f1f] p-2 text-zinc-800 dark:text-zinc-100 shadow-2xl"
            style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.height }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') { event.preventDefault(); close(); }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const choices = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[data-model-choice]') || []);
                const index = choices.indexOf(document.activeElement as HTMLButtonElement);
                choices[(index + (event.key === 'ArrowDown' ? 1 : choices.length - 1) + choices.length) % choices.length]?.focus();
              }
            }}
          >
            {showChannelTabs && (
              <div role="tablist" aria-label="模型渠道" className="mb-1.5 grid shrink-0 grid-cols-2 gap-1 rounded-[11px] bg-zinc-100 p-1 dark:bg-white/[0.05]">
                {MODEL_CHANNEL_TABS.map((tab) => {
                  const active = channelTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setChannelTab(tab.id)}
                      className={`rounded-[8px] py-1 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/[0.14] dark:text-white'
                          : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
              {displayedModels.map((model) => {
                const isSelected = model.id === (current?.id ?? value);
                const resolvedModelId = model.modelId || model.upstreamId || model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    data-model-choice
                    aria-pressed={isSelected}
                    onClick={() => { onChange(model.id); close(); }}
                    className={`flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300 cursor-pointer ${
                      isSelected
                        ? 'bg-black/[0.05] dark:bg-white/[0.08] text-zinc-900 dark:text-white font-semibold'
                        : 'text-zinc-800 dark:text-zinc-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
                      <ModelIcon modelId={resolvedModelId} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] leading-none" title={resolvedModelId !== model.name ? `${model.name} (${resolvedModelId})` : model.name}>
                      {model.name}
                    </span>
                    {resolvedModelId && resolvedModelId !== model.name && (
                      <span className="max-w-[108px] shrink-0 truncate text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                        {resolvedModelId}
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400 opacity-95" />}
                  </button>
                );
              })}
              {!displayedModels.length && <p className="px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">请先在设置中配置并启用模型</p>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function CanvasGridSplit({ node, projectId, menuItemClass, onMenuOpen }: { node: CanvasNode; projectId: string; menuItemClass?: string; onMenuOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const valid = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1 && rows <= 10 && cols <= 10 && rows * cols > 1 && rows * cols <= 100;
  const split = async () => {
    if (!valid || !node.imageUrl || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    let bitmap: ImageBitmap | undefined;
    try {
      const response = await apiFetch(proxyMediaUrl(node.imageUrl));
      if (!response.ok) throw new Error('原图加载失败，请重试');
      const blob = await response.blob();
      if (blob.size > 40 * 1024 * 1024) throw new Error('原图超过 40MB，请先缩小图片');
      bitmap = await createImageBitmap(blob);
      if (bitmap.width * bitmap.height > 40_000_000) throw new Error('原图超过 4000 万像素，请先缩小图片');
      if (bitmap.width < cols || bitmap.height < rows) throw new Error('图片尺寸小于切分行列数');
      const output: CanvasNode[] = [];
      const width = Math.min(240, node.width / cols);
      const height = (width * bitmap.height * cols) / (bitmap.width * rows);
      const canvas = document.createElement('canvas');
      let totalBytes = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = Math.floor((col * bitmap.width) / cols);
          const y = Math.floor((row * bitmap.height) / rows);
          const w = Math.floor(((col + 1) * bitmap.width) / cols) - x;
          const h = Math.floor(((row + 1) * bitmap.height) / rows) - y;
          canvas.width = w;
          canvas.height = h;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('浏览器无法处理图片');
          context.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
          const imageUrl = canvas.toDataURL('image/png');
          totalBytes += imageUrl.length;
          if (totalBytes > 60_000_000) throw new Error('切片数据过大，请先缩小原图');
          output.push({
            id: `grid-${crypto.randomUUID()}`, type: 'image', title: `${node.title || '图片'} · ${row + 1}-${col + 1}`,
            imageUrl, resultWidth: w, resultHeight: h, width, height: (width * h) / w,
            x: node.x + node.width + 60 + col * (width + 24), y: node.y + row * (height + 40), createdAt: Date.now(), status: 'success',
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      useCanvasStore.setState((state) => ({
        projects: state.projects.map((project) =>
          project.id === projectId && project.nodes.some((item) => item.id === node.id)
            ? { ...project, nodes: [...project.nodes, ...output], updatedAt: Date.now(), subtitle: '画布 · 刚刚修改' }
            : project,
        ),
      }));
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '切分失败，请重试');
    } finally {
      bitmap?.close();
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" aria-label="宫格切分" title="宫格切分" onClick={() => { setError(''); onMenuOpen?.(); setOpen(true); }} className={menuItemClass || 'flex h-8 items-center gap-1.5 rounded-full px-2 hover:bg-slate-100 dark:hover:bg-white/10'}>
        <Grid2X2 size={14} className="shrink-0" /><span>宫格切分</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); if (!busy) setOpen(false); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape' && !busy) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="宫格切分" className="max-h-[calc(100dvh-32px)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-700 shadow-xl dark:text-slate-200 dark:bg-[#18191c]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">宫格切分</h2><button aria-label="关闭宫格切分" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div className="mb-4 flex flex-wrap gap-2">
              {[2, 3, 4, 5].map((size) => (
                <button autoFocus={size === 2} key={size} disabled={busy} aria-pressed={rows === size && cols === size} onClick={() => { setRows(size); setCols(size); }} className={`rounded-lg border px-3 py-2 text-xs ${rows === size && cols === size ? 'border-slate-900 bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'border-slate-200 dark:border-white/10'}`}>
                  {size * size}宫格 ({size}×{size})
                </button>
              ))}
            </div>
            <div className="mb-4 flex items-center gap-3 text-sm">
              <span>自定义</span>
              <label>行 <input aria-label="切分行数" type="number" min={1} max={10} disabled={busy} value={rows || ''} onChange={(e) => setRows(Number(e.target.value))} className="w-16 rounded-lg border border-slate-200 p-2 dark:border-white/10" /></label>
              <label>列 <input aria-label="切分列数" type="number" min={1} max={10} disabled={busy} value={cols || ''} onChange={(e) => setCols(Number(e.target.value))} className="w-16 rounded-lg border border-slate-200 p-2 dark:border-white/10" /></label>
            </div>
            <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
              <img src={proxyMediaUrl(node.imageUrl)} alt="宫格切分预览" className="max-h-64 max-w-full object-contain" />
              {valid && (
                <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>
                  {Array.from({ length: rows * cols }, (_, index) => <div key={index} className="border border-white/80 outline outline-1 outline-black/20" />)}
                </div>
              )}
            </div>
            <p className="mt-4 whitespace-normal text-xs leading-5 text-slate-500 dark:text-slate-400">按原图像素均匀切分，保留原图，在右侧创建独立图片节点。支持 1–10 行/列，最多 100 张，不调用 AI。</p>
            {error && <p role="alert" className="mt-2 whitespace-normal text-xs text-rose-600">{error}</p>}
            <button disabled={!valid || busy} onClick={() => void split()} className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-950">
              {busy ? '正在切分…' : `切分为 ${valid ? rows * cols : '—'} 张图片`}
            </button>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
