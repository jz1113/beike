import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft, ArrowUp, FileText, Film, LayoutGrid, Loader2,
  Maximize2, Plus, RotateCw, SlidersHorizontal, Trash2, Video, X,
} from 'lucide-react';
import { PromptBarReasoningPill } from '@client/shared/prompt-bar/controls/PromptBarReasoningPill';
import { buildQuickCanvasNode } from '../../model/canvasNodeFactory';
import { useCanvasStore } from '../../store/useCanvasStore';
import { CanvasDrawingEditor } from '../editor/CanvasNodeMenu';
import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import type { CanvasNode, CanvasSpecializedSettings } from '../../model/types';

type ScriptStage = 'confirm' | 'assets' | 'prompts';

const CONSTRAINT_TABS = [
  { key: 'globalStyle', label: '风格', fallback: '整体电影感叙事、色调统一、镜头衔接自然，人物与环境光影关系一致。' },
  { key: 'characterSpec', label: '人物', fallback: '提取核心角色姓名、外貌、服装与标志特征，保证全片人物身份与造型一致。' },
  { key: 'sceneSpec', label: '场景', fallback: '提取主场景空间结构、陈设细节、时间与环境氛围，保持镜头间空间关系连续。' },
  { key: 'propSpec', label: '道具', fallback: '提取推动剧情的关键道具材质、颜色与细节，避免无关杂物干扰。' },
  { key: 'seedance25Rules', label: 'SD2.5', fallback: '每个镜头明确首帧静态构图与运镜轨迹，动作清晰可执行，禁止画面突变或穿帮。' },
] as const;

type ConstraintKey = (typeof CONSTRAINT_TABS)[number]['key'];

const STAGE_STEPS: ReadonlyArray<{ key: ScriptStage; label: string }> = [
  { key: 'confirm', label: '确认分镜' },
  { key: 'assets', label: '角色·场景·道具' },
  { key: 'prompts', label: '合成提示词' },
];

function parseConstraintMap(raw?: string): Record<ConstraintKey, string> {
  const empty: Record<ConstraintKey, string> = {
    globalStyle: '', characterSpec: '', sceneSpec: '', propSpec: '', seedance25Rules: '',
  };
  if (!raw?.trim()) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ConstraintKey, string>>;
    if (parsed && typeof parsed === 'object') {
      return {
        globalStyle: typeof parsed.globalStyle === 'string' ? parsed.globalStyle : '',
        characterSpec: typeof parsed.characterSpec === 'string' ? parsed.characterSpec : '',
        sceneSpec: typeof parsed.sceneSpec === 'string' ? parsed.sceneSpec : '',
        propSpec: typeof parsed.propSpec === 'string' ? parsed.propSpec : '',
        seedance25Rules: typeof parsed.seedance25Rules === 'string' ? parsed.seedance25Rules : '',
      };
    }
  } catch {
    return { ...empty, globalStyle: raw };
  }
  return empty;
}

export function formatScriptConstraintsPrompt(raw?: string, shotCount?: number): string {
  const map = parseConstraintMap(raw);
  const parts: string[] = [];
  if (shotCount && shotCount > 0) {
    parts.push(`目标镜头数量：严格拆分为 ${Math.min(40, Math.max(1, shotCount))} 个镜头。`);
  }
  for (const item of CONSTRAINT_TABS) {
    const val = map[item.key]?.trim();
    if (val) parts.push(`【${item.label}约束】${val}`);
  }
  return parts.join('\n');
}

function dispatchHighlightRef(nodeId: string | null) {
  window.dispatchEvent(new CustomEvent('canvas:highlight-ref-node', { detail: { nodeId } }));
}

interface CanvasScriptParseNodeProps {
  node: CanvasNode;
  sources?: CanvasNode[];
  projectId: string;
  selected?: boolean;
  linkedText: string;
  availableModels: Array<{ id: string; name: string; modelId?: string }>;
  selectedModel: string;
  busy: boolean;
  locked: boolean;
  error: string;
  onChange: (patch: Partial<CanvasNode>) => void;
  onUpdateScene: (patch: Partial<CanvasSpecializedSettings>) => void;
  onGenerate: (options?: { shotCount?: number; customReq?: string }) => void;
  onExportStoryboard: () => void;
}

export function CanvasScriptParseNode({
  node, sources = [], projectId, selected = false, linkedText, availableModels,
  selectedModel, busy, locked, error, onChange, onUpdateScene, onGenerate, onExportStoryboard,
}: CanvasScriptParseNodeProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'constraints'>('script');
  const [activeConstraintKey, setActiveConstraintKey] = useState<ConstraintKey>('globalStyle');
  const [shotCount, setShotCount] = useState<number>(0);
  const [showCustomReq, setShowCustomReq] = useState(false);
  const [customReq, setCustomReq] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeStage, setActiveStage] = useState<ScriptStage>('confirm');
  const [editingCard, setEditingCard] = useState(false);

  useEffect(() => {
    if (!selected || locked) setEditingCard(false);
  }, [selected, locked]);

  const rows = node.specialized?.scriptRows ?? [];
  const assets = node.specialized?.scriptAssets ?? { characters: [], scenes: [], props: [] };
  const constraintMap = parseConstraintMap(node.specialized?.scriptConstraints);
  const currentConstraintTab = CONSTRAINT_TABS.find((t) => t.key === activeConstraintKey) ?? CONSTRAINT_TABS[0];
  const currentConstraintValue = constraintMap[activeConstraintKey] || '';
  const scriptText = [linkedText, node.textPrompt, customReq].filter(Boolean).join('\n\n').trim();
  const canRun = !locked && Boolean(selectedModel && (node.textRecoveryRequired || scriptText));
  const textSources = sources.filter((s) => s.type === 'prompt' || s.type === 'note');
  const activeConstraintCount = CONSTRAINT_TABS.filter((t) => Boolean(constraintMap[t.key]?.trim())).length;
  const runLabel = busy ? '处理中…' : node.textRecoveryRequired ? '查询原回执' : '解析脚本';

  const updateConstraint = (key: ConstraintKey, value: string) => {
    const next = { ...constraintMap, [key]: value };
    const hasAny = Object.values(next).some((v) => v.trim().length > 0);
    onUpdateScene({ scriptConstraints: hasAny ? JSON.stringify(next) : undefined });
  };

  const triggerGenerate = () => {
    if (!canRun) return;
    onGenerate({ shotCount: shotCount > 0 ? shotCount : undefined, customReq: customReq.trim() || undefined });
  };

  const spawnBatchDownstream = (kind: 'image' | 'video', targetRowIndices?: number[]) => {
    if (!rows.length) return;
    const indices = targetRowIndices ?? rows.map((_, idx) => idx);
    const store = useCanvasStore.getState();
    const baseRightX = Math.round(node.x + (node.width || 380) + 96);
    indices.forEach((rowIndex, idx) => {
      const row = rows[rowIndex];
      if (!row) return;
      const promptText = kind === 'image'
        ? `【镜头 ${rowIndex + 1} · ${row.scene}】\n${row.imagePrompt}`
        : `【镜头 ${rowIndex + 1} · ${row.scene}】\n${row.videoPrompt}`;
      const created = buildQuickCanvasNode(
        kind === 'image' ? 'image-generation' : 'video-generation',
        { x: baseRightX + (idx % 3) * 310, y: Math.round(node.y + Math.floor(idx / 3) * 310) },
        { referenceNodeIds: [node.id] },
      );
      store.addNode(projectId, {
        ...created,
        title: `镜头 ${rowIndex + 1} · ${kind === 'image' ? '分镜图' : '分镜视频'}`,
        content: promptText,
      });
    });
  };

  const spawnAssetImageNode = (roleLabel: string, name: string) => {
    const store = useCanvasStore.getState();
    const created = buildQuickCanvasNode(
      'image-generation',
      { x: Math.round(node.x + (node.width || 380) + 96), y: Math.round(node.y) },
      { referenceNodeIds: [node.id] },
    );
    store.addNode(projectId, {
      ...created,
      title: `${roleLabel}设定 · ${name}`,
      content: `${roleLabel}设定图：${name}。${constraintMap.globalStyle || '高清细节、设定集标准光影、主体突出'}`,
    });
  };

  const updateRowField = (index: number, patch: Partial<{ scene: string; imagePrompt: string; videoPrompt: string }>) => {
    const nextRows = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    const body = nextRows
      .map((row, idx) => `镜头 ${idx + 1} · ${row.scene}\n静帧：${row.imagePrompt}\n视频：${row.videoPrompt}`)
      .join('\n\n');
    onChange({ content: body, specialized: { ...node.specialized, scriptRows: nextRows, scriptAssets: assets } });
  };

  const addShotRow = () => {
    onUpdateScene({
      scriptRows: [
        ...rows,
        { scene: `新镜头 ${rows.length + 1}`, imagePrompt: '中景，电影感布光，画面主体清晰', videoPrompt: '镜头平稳缓推，人物自然完成动作' },
      ],
    });
  };

  const deleteShotRow = (index: number) => {
    onUpdateScene({ scriptRows: rows.filter((_, i) => i !== index) });
  };

  const updateAssetList = (category: 'characters' | 'scenes' | 'props', nextList: string[]) => {
    onUpdateScene({ scriptAssets: { ...assets, [category]: nextList } });
  };

  const topToolBtn =
    'flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-zinc-700 hover:bg-black/5 disabled:opacity-40 dark:text-zinc-100 dark:hover:bg-white/10 cursor-pointer';

  return (
    <section
      aria-label={node.title || '脚本解析'}
      className="pointer-events-auto relative flex w-full flex-col select-none"
      style={{ minHeight: rows.length > 0 ? Math.max(node.height || 320, 320) : node.height || 280 }}
    >
      <header className="pointer-events-none absolute -top-6 left-0.5 z-20 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <FileText size={14} className="shrink-0 text-zinc-400" />
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{node.title || '脚本解析'}</span>
      </header>

      {selected && (
        <div
          role="toolbar"
          aria-label="脚本解析操作栏"
          data-tapnow-float-toolbar=""
          data-canvas-pin-toolbar=""
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-1/2 z-[120] mb-9 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-zinc-200 dark:border-white/10 bg-[#f6f6f6] dark:bg-[#262626]/92 px-1.5 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md whitespace-nowrap"
        >
          <button type="button" disabled={!canRun} onClick={triggerGenerate} className={topToolBtn}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
            <span>{rows.length > 0 ? '重新解析' : '立即拆镜'}</span>
          </button>
          {rows.length > 0 && (
            <>
              <span className="mx-0.5 h-3.5 w-px bg-black/10 dark:bg-white/10" />
              <button type="button" onClick={() => setModalOpen(true)} className={topToolBtn}>
                <Maximize2 size={12} />
                <span>三步工作台</span>
              </button>
              <button type="button" disabled={locked} onClick={() => spawnBatchDownstream('image')} className={topToolBtn}>
                <LayoutGrid size={12} />
                <span>批量生成分镜</span>
              </button>
              <button type="button" disabled={locked} onClick={() => spawnBatchDownstream('video')} className={topToolBtn}>
                <Video size={12} />
                <span>批量生视频</span>
              </button>
              <button type="button" disabled={locked} onClick={onExportStoryboard} className={topToolBtn}>
                <Film size={12} />
                <span>创建分镜视表</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 画布卡片主体（支持单击直接拖拽移动、双击编辑或打开三步工作台） */}
      <div
        ref={anchor}
        data-testid="drawing-preview"
        onDoubleClick={(e) => {
          if (locked) return;
          e.stopPropagation();
          if (rows.length > 0) setModalOpen(true);
          else setEditingCard(true);
        }}
        className={`flex h-full min-h-[260px] w-full flex-col justify-between overflow-hidden rounded-[18px] border bg-white p-3.5 text-zinc-800 transition-shadow dark:bg-[#1f1f1f] dark:text-zinc-100 cursor-grab active:cursor-grabbing ${
          selected
            ? 'border-sky-400/90 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_18px_42px_rgba(0,0,0,0.45)]'
            : 'border-slate-200/90 dark:border-white/[0.1] shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.42)]'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] pb-2.5 dark:border-white/[0.07]">
          <div className="flex min-w-0 items-center gap-1.5">
            {linkedText ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <AlignLeft size={11} />
                <span>已连接上游剧本</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
                <span>剧本拆镜与资产提取</span>
              </span>
            )}
            {activeConstraintCount > 0 && (
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                {activeConstraintCount} 项约束
              </span>
            )}
          </div>
          <span className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-500">
            {rows.length > 0 ? `已拆 ${rows.length} 镜` : shotCount > 0 ? `目标 ${shotCount} 镜` : '自动镜数'}
          </span>
        </div>

        <div className="my-2.5 flex min-h-0 flex-1 flex-col justify-between gap-2.5 overflow-hidden">
          {rows.length > 0 ? (
            <div className="flex flex-1 min-h-0 flex-col gap-2">
              <div className="flex items-center justify-around gap-2 rounded-xl border border-black/[0.06] bg-black/[0.02] px-2 py-2 dark:border-white/[0.06] dark:bg-white/[0.025]">
                {STAGE_STEPS.map((step, idx) => {
                  const isAct = activeStage === step.key;
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveStage(step.key);
                        setModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 cursor-pointer"
                    >
                      <span
                        className={`flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[10px] font-semibold ${
                          isAct
                            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                            : 'border-zinc-400 text-zinc-500 dark:border-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">{step.label}</span>
                    </button>
                  );
                })}
              </div>

              {node.specialized?.scriptAssets && (
                <p className="truncate px-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  角色 {assets.characters.join('、') || '无'} · 场景 {assets.scenes.join('、') || '无'} · 道具 {assets.props.join('、') || '无'}
                </p>
              )}

              <div className="max-h-36 flex-1 space-y-1.5 overflow-y-auto pr-1" onWheel={(e) => e.stopPropagation()}>
                {rows.map((row, index) => (
                  <details
                    key={index}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="rounded-lg border border-black/[0.05] bg-black/[0.02] p-2 text-xs dark:border-white/[0.06] dark:bg-white/[0.03]"
                  >
                    <summary className="cursor-pointer font-medium text-zinc-800 dark:text-zinc-100">
                      镜头 {index + 1} · {row.scene}
                    </summary>
                    <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">静帧：{row.imagePrompt}</p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300">视频：{row.videoPrompt}</p>
                  </details>
                ))}
              </div>

              <div className="mt-auto flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
                  className="flex-1 rounded-xl bg-zinc-900/10 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-900/15 dark:bg-white/10 dark:text-zinc-100 dark:hover:bg-white/15 cursor-pointer"
                >
                  打开脚本节点 →
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onExportStoryboard(); }}
                  className="rounded-xl border border-black/10 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-black/5 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/10 cursor-pointer"
                >
                  创建分镜视表
                </button>
              </div>
            </div>
          ) : editingCard || !selected ? (
            <div className="flex flex-1 min-h-0 flex-col gap-2">
              {linkedText && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                  <div className="line-clamp-2 opacity-90">{linkedText}</div>
                </div>
              )}
              <textarea
                aria-label="剧本"
                placeholder={linkedText ? '可在此补充或覆盖剧本内容…' : '粘贴剧本，或连接文本节点'}
                value={node.textPrompt || ''}
                maxLength={18000}
                disabled={locked}
                autoFocus={editingCard}
                onMouseDown={(e) => { if (editingCard) e.stopPropagation(); }}
                onWheel={(e) => { if (editingCard) e.stopPropagation(); }}
                onBlur={() => setEditingCard(false)}
                onChange={(e) => onChange({ textPrompt: e.target.value })}
                className="flex-1 w-full resize-none rounded-xl border border-black/[0.06] bg-black/[0.02] p-2.5 text-[12px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-200 dark:placeholder:text-zinc-500"
              />
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 flex-col justify-center rounded-xl border border-dashed border-black/10 bg-black/[0.015] p-3.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
              {scriptText ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                    {linkedText ? '上游剧本与补充内容预览（双击卡片可直接编辑）' : '待拆解剧本预览（双击卡片可直接编辑）'}
                  </div>
                  <p className="line-clamp-5 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">{scriptText}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1.5 py-4 text-center">
                  <FileText size={20} className="text-zinc-400 dark:text-zinc-500" />
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">连接左侧文本节点，或在下方输入框填写剧本</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">按时间顺序拆解分镜、提取角色/场景/道具并生成双轨提示词</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-black/[0.06] pt-2 text-[11px] text-zinc-400 dark:border-white/[0.06] dark:text-zinc-500">
          <span className="truncate">
            {busy ? '正在拆解剧本与分镜资产…' : rows.length > 0 ? '双击卡片打开全屏三步工作台' : '单击拖动节点 · 在下方配置模型与约束'}
          </span>
          {!selected && (
            <button
              type="button"
              aria-label={runLabel}
              disabled={!canRun}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); triggerGenerate(); }}
              className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900 cursor-pointer"
            >
              {runLabel}
            </button>
          )}
        </div>

        {error && <p role="alert" className="mt-1.5 text-xs text-red-500">{error}</p>}
      </div>

      {/* 选中时底部浮动的配置与输入面板 */}
      {selected && (
        <CanvasDrawingEditor
          data-script-parse-prompt-panel="true"
          anchor={anchor}
          className="rounded-[22px] border border-slate-200/90 dark:border-white/[0.08] bg-white/98 dark:bg-[#1b1b1e]/98 px-5 pt-4 pb-3.5 shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-slate-700 dark:text-zinc-100 backdrop-blur-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-white/[0.08]">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-lg bg-black/[0.05] p-0.5 dark:bg-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setActiveTab('script')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'script'
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/15 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  剧本
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('constraints')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'constraints'
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/15 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  约束{activeConstraintCount > 0 ? ` (${activeConstraintCount})` : ''}
                </button>
              </div>

              {textSources.map((source, idx) => (
                <span
                  key={source.id}
                  onMouseEnter={() => dispatchHighlightRef(source.id)}
                  onMouseLeave={() => dispatchHighlightRef(null)}
                  className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                  title={source.content || source.title}
                >
                  <AlignLeft size={11} className="shrink-0" />
                  <span className="truncate">{source.title || `文本 ${idx + 1}`}</span>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span>镜头数</span>
              <button
                type="button"
                onClick={() => setShotCount(0)}
                className={`rounded-md px-2 py-0.5 text-xs transition-colors cursor-pointer ${
                  shotCount === 0
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-medium'
                    : 'bg-black/[0.04] text-zinc-500 hover:text-zinc-800 dark:bg-white/[0.06] dark:text-zinc-400'
                }`}
              >
                自动
              </button>
              <label className="flex items-center gap-1 rounded-md border border-black/10 bg-black/[0.02] px-2 py-0.5 dark:border-white/10 dark:bg-white/[0.04]">
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={shotCount > 0 ? shotCount : ''}
                  placeholder="1–40"
                  title="自定义镜头数，最多 40 镜"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setShotCount(Number.isFinite(val) && val > 0 ? Math.min(40, Math.round(val)) : 0);
                  }}
                  className="w-10 bg-transparent text-center text-xs text-zinc-800 outline-none dark:text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span>镜</span>
              </label>
            </div>
          </div>

          {activeTab === 'constraints' ? (
            <div className="mb-2.5 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {CONSTRAINT_TABS.map((item) => {
                  const isCurrent = item.key === activeConstraintKey;
                  const hasVal = Boolean(constraintMap[item.key]?.trim());
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveConstraintKey(item.key)}
                      className={`rounded-lg px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-medium'
                          : 'bg-black/[0.04] text-zinc-500 hover:text-zinc-800 dark:bg-white/[0.06] dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                      {hasVal && <span className="ml-1 opacity-75">●</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => updateConstraint(activeConstraintKey, currentConstraintValue.trim() ? '' : currentConstraintTab.fallback)}
                  className="ml-auto text-xs text-zinc-400 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer"
                >
                  {currentConstraintValue.trim() ? '清空当前项' : '填入推荐默认'}
                </button>
              </div>
              <textarea
                aria-label="解析约束"
                placeholder={`输入【${currentConstraintTab.label}】拆镜约束（留空则使用默认：${currentConstraintTab.fallback}）`}
                value={currentConstraintValue}
                maxLength={3000}
                disabled={locked}
                rows={3}
                onChange={(e) => updateConstraint(activeConstraintKey, e.target.value)}
                className="w-full resize-none rounded-xl border border-black/[0.08] bg-black/[0.02] p-2.5 text-[13px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>
          ) : (
            <div className="mb-2.5 space-y-2">
              <textarea
                aria-label="剧本"
                placeholder={
                  linkedText
                    ? '已连接上游剧本，可在此补充剧本内容或分镜指示（按 ↑ 开始拆镜）…'
                    : '粘贴剧本，或从左侧连接文本节点（按 ↑ 自动拆解分镜、资产与双轨提示词）…'
                }
                value={node.textPrompt || ''}
                maxLength={18000}
                disabled={locked}
                rows={3}
                onChange={(e) => onChange({ textPrompt: e.target.value })}
                className="w-full resize-none rounded-xl border border-black/[0.06] bg-black/[0.015] p-2.5 text-[14px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {showCustomReq && (
                <textarea
                  aria-label="拆镜要求"
                  value={customReq}
                  placeholder="附加拆镜要求（例如：突出悬疑光影、全片采用中近景与手持跟拍）"
                  rows={2}
                  onChange={(e) => setCustomReq(e.target.value)}
                  className="w-full resize-none rounded-xl border border-black/[0.08] bg-black/[0.02] p-2 text-xs text-zinc-800 outline-none placeholder:text-zinc-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-200 dark:placeholder:text-zinc-500"
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <CanvasModelPicker
                label="解析模型"
                models={availableModels}
                value={selectedModel}
                disabled={locked}
                onChange={(value) => onChange({ textModel: value })}
              />
              <PromptBarReasoningPill
                assistantModel={availableModels.find((m) => m.id === selectedModel)?.modelId || selectedModel}
                isUp={true}
                value={node.textReasoningEffort}
                onChange={(effort) => onChange({ textReasoningEffort: effort })}
                disabled={locked}
              />
              <button
                type="button"
                onClick={() => setShowCustomReq((v) => !v)}
                className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors cursor-pointer ${
                  showCustomReq || customReq.trim()
                    ? 'bg-zinc-900/10 text-zinc-900 dark:bg-white/15 dark:text-white'
                    : 'bg-black/[0.04] text-zinc-600 hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]'
                }`}
              >
                <SlidersHorizontal size={12} />
                <span>拆镜要求</span>
              </button>
            </div>

            <button
              type="button"
              aria-label={runLabel}
              title={runLabel}
              disabled={!canRun}
              onClick={triggerGenerate}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
                canRun
                  ? 'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200'
                  : 'bg-zinc-200 text-zinc-400 dark:bg-white/10 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}
              <span className="sr-only">{runLabel}</span>
            </button>
          </div>
        </CanvasDrawingEditor>
      )}

      {/* 全屏脚本解析三步工作台 */}
      {modalOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="脚本解析工作台"
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
            onMouseDown={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div
              className="flex h-[min(86vh,860px)] w-[min(1260px,95vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#18181b] text-zinc-100 shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FileText size={16} className="text-zinc-400" />
                  <span>{node.title || '脚本解析'}</span>
                </div>
                <div className="ml-6 flex items-center gap-2">
                  {STAGE_STEPS.map((step, idx) => (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => setActiveStage(step.key)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        activeStage === step.key ? 'bg-white text-zinc-900' : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                      }`}
                    >
                      <span>{idx + 1}.</span>
                      <span>{step.label}</span>
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => spawnBatchDownstream('image')} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 cursor-pointer">
                    <LayoutGrid size={13} />
                    <span>批量生成分镜</span>
                  </button>
                  <button type="button" onClick={() => spawnBatchDownstream('video')} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 cursor-pointer">
                    <Video size={13} />
                    <span>批量生视频</span>
                  </button>
                  <button type="button" onClick={onExportStoryboard} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 cursor-pointer">
                    <Film size={13} />
                    <span>创建分镜视表</span>
                  </button>
                  <button type="button" aria-label="关闭脚本解析工作台" onClick={() => setModalOpen(false)} className="ml-2 rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto p-5">
                {activeStage === 'confirm' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
                      <span className="shrink-0 text-xs text-zinc-400">全局风格</span>
                      <input
                        value={constraintMap.globalStyle}
                        placeholder="整体视觉风格、色调与镜头语言约束…"
                        onChange={(e) => updateConstraint('globalStyle', e.target.value)}
                        className="flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
                      />
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                            <th className="w-14 px-3 py-2.5">镜号</th>
                            <th className="w-64 px-3 py-2.5">画面描述</th>
                            <th className="px-3 py-2.5">静帧提示词</th>
                            <th className="px-3 py-2.5">视频运镜提示词</th>
                            <th className="w-20 px-3 py-2.5 text-center">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr key={idx} className="border-b border-white/[0.06] align-top">
                              <td className="px-3 py-2.5 font-mono text-zinc-400">#{idx + 1}</td>
                              <td className="p-2">
                                <textarea rows={3} value={row.scene} onChange={(e) => updateRowField(idx, { scene: e.target.value })} className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.02] p-2 text-xs text-zinc-100 outline-none" />
                              </td>
                              <td className="p-2">
                                <textarea rows={3} value={row.imagePrompt} onChange={(e) => updateRowField(idx, { imagePrompt: e.target.value })} className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.02] p-2 text-xs text-zinc-100 outline-none" />
                              </td>
                              <td className="p-2">
                                <textarea rows={3} value={row.videoPrompt} onChange={(e) => updateRowField(idx, { videoPrompt: e.target.value })} className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.02] p-2 text-xs text-zinc-100 outline-none" />
                              </td>
                              <td className="p-2 text-center">
                                <button type="button" onClick={() => deleteShotRow(idx)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 cursor-pointer" title="删除镜头">
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeStage === 'assets' && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {([
                      { key: 'characters', label: '角色', list: assets.characters },
                      { key: 'scenes', label: '场景', list: assets.scenes },
                      { key: 'props', label: '道具', list: assets.props },
                    ] as const).map((group) => (
                      <div key={group.key} className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-200">{group.label} ({group.list.length})</span>
                          <button
                            type="button"
                            onClick={() => updateAssetList(group.key, [...group.list, `新${group.label}${group.list.length + 1}`])}
                            className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/15 cursor-pointer"
                          >
                            <Plus size={12} />
                            <span>添加{group.label}</span>
                          </button>
                        </div>
                        <div className="space-y-2">
                          {group.list.map((name, idx) => (
                            <div key={idx} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
                              <input
                                value={name}
                                onChange={(e) => {
                                  const next = [...group.list];
                                  next[idx] = e.target.value;
                                  updateAssetList(group.key, next);
                                }}
                                className="flex-1 bg-transparent text-xs text-zinc-100 outline-none"
                              />
                              <button type="button" onClick={() => spawnAssetImageNode(group.label, name)} className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/20 cursor-pointer">
                                AI 生{group.label}
                              </button>
                              <button type="button" onClick={() => updateAssetList(group.key, group.list.filter((_, i) => i !== idx))} className="rounded p-1 text-zinc-500 hover:text-red-400 cursor-pointer">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeStage === 'prompts' && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {rows.map((row, idx) => (
                      <div key={idx} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-200">第 {idx + 1} 镜 · {row.scene}</span>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => spawnBatchDownstream('image', [idx])} className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/20 cursor-pointer">生成分镜图</button>
                            <button type="button" onClick={() => spawnBatchDownstream('video', [idx])} className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/20 cursor-pointer">生成视频</button>
                          </div>
                        </div>
                        <div className="text-[11px] text-zinc-400">静帧提示词：{row.imagePrompt}</div>
                        <div className="text-[11px] text-zinc-400">视频运镜：{row.videoPrompt}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
                <button type="button" onClick={addShotRow} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 cursor-pointer">
                  <Plus size={13} />
                  <span>添加镜头</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStage((prev) => (prev === 'confirm' ? 'assets' : prev === 'assets' ? 'prompts' : 'confirm'))}
                  className="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-200 cursor-pointer"
                >
                  {activeStage === 'confirm' ? '下一步：角色·场景·道具 →' : activeStage === 'assets' ? '下一步：合成提示词 →' : '返回确认分镜'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
