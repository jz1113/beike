import { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  ArrowUp,
  ChevronsUpDown,
  Download,
  LayoutGrid,
  ListOrdered,
  Loader2,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
} from 'lucide-react';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { PromptBarReasoningPill } from '@client/shared/prompt-bar/controls/PromptBarReasoningPill';
import { DEFAULT_MULTIMODAL_MODEL_ID } from '@shared/domain/models/modelCatalog';
import { buildQuickCanvasNode, loadCanvasChatModels, resolveCanvasChatModel } from '../../model/canvasNodeFactory';
import { requestCanvasText } from '../../model/canvasTextRequest';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { CanvasDrawingEditor } from '../editor/CanvasNodeMenu';
import { CanvasModelPicker } from '../tools/CanvasGridSplit';
import type { CanvasNode } from '../../model/types';

interface CanvasTableEditorProps {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
  selected?: boolean;
  updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void;
}

const DEFAULT_HEADERS = ['时间段', '镜头类型', '画面描述', '视觉/技术要求', '音效/旁白'];

function parseTabContent(content?: string): string[][] {
  if (!content) return [['', ''], ['', '']];
  const parsed = content.split('\n').map((line) => line.split('\t'));
  return parsed.length > 0 ? parsed : [['', '']];
}

function toMarkdownTable(rows: string[][], columns: number, headers: string[]): string {
  const head = Array.from({ length: columns }, (_, idx) => headers[idx] || `列 ${idx + 1}`);
  const divider = head.map(() => '---');
  const body = rows.map((row) =>
    Array.from({ length: columns }, (_, col) => (row[col] || '').replace(/\|/g, '\\|').trim()),
  );
  return [
    `| ${head.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...body.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

function splitUpstreamTextToRows(upstreamText: string, mode: 'organize' | 'generate-list'): string[][] {
  const cleanLines = upstreamText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (cleanLines.length === 0) return [['', '']];
  if (mode === 'generate-list') {
    return cleanLines.map((line, index) => [`#${index + 1}`, line]);
  }
  return cleanLines.map((line, index) => {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 2) return cells;
    }
    const parts = line.split(/[：:——]/);
    if (parts.length >= 2) {
      return [parts[0].trim(), parts.slice(1).join('：').trim()];
    }
    return [`${index + 1}`, line];
  });
}

function dispatchHighlightRef(nodeId: string | null) {
  window.dispatchEvent(new CustomEvent('canvas:highlight-ref-node', { detail: { nodeId } }));
}

export function CanvasTableEditorNode({ node, nodes, projectId, selected = false, updateNode }: CanvasTableEditorProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const [tableMode, setTableMode] = useState<'organize' | 'generate-list'>('organize');
  const [viewMode, setViewMode] = useState<'table' | 'markdown'>('table');
  const [customPrompt, setCustomPrompt] = useState(node.textPrompt || '');
  const [autoRowHeight, setAutoRowHeight] = useState(false);
  const [availableModels, setAvailableModels] = useState(loadCanvasChatModels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => setAvailableModels(loadCanvasChatModels());
    window.addEventListener('models_updated', refresh);
    window.addEventListener('modality_models_updated', refresh);
    return () => {
      window.removeEventListener('models_updated', refresh);
      window.removeEventListener('modality_models_updated', refresh);
    };
  }, []);

  const rows = parseTabContent(node.content);
  const columns = rows.reduce((width, row) => Math.max(width, row.length), 2);

  const upstreamNodes = (node.referenceNodeIds ?? [])
    .map((id) => nodes.find((item) => item.id === id))
    .filter((item): item is CanvasNode => Boolean(item));
  const upstreamText = upstreamNodes
    .filter((item) => item.type === 'prompt' || item.type === 'note')
    .map((item) => item.content?.trim())
    .filter(Boolean)
    .join('\n\n');

  const matchedModel = resolveCanvasChatModel(
    availableModels,
    node.textModel,
    upstreamNodes.find((s) => s.textModel)?.textModel,
  );
  const selectedModel = matchedModel?.id || node.textModel || availableModels[0]?.id || DEFAULT_MULTIMODAL_MODEL_ID;
  const upstreamModel = matchedModel?.modelId || selectedModel;

  const save = (next: string[][]) =>
    updateNode(projectId, node.id, {
      content: next.map((row) => row.join('\t')).join('\n'),
    });

  const exportCsv = () => {
    const csv = rows
      .map((row) =>
        Array.from({ length: columns }, (_, col) => {
          const cell = row[col] || '';
          const safe = /^[\s]*[=+\-@]/.test(cell) ? "'" + cell : cell;
          return '"' + safe.replaceAll('"', '""') + '"';
        }).join(','),
      )
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = (node.title || '表格') + '.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleQuickLineSplit = () => {
    if (busy || node.layerLocked) return;
    const sourceText = upstreamText || node.content?.trim() || '';
    if (!sourceText) {
      setError('请先连接文本节点，或在表格中输入内容');
      return;
    }
    setError('');
    save(splitUpstreamTextToRows(sourceText, tableMode));
  };

  const handleSmartParse = async () => {
    if (busy || node.layerLocked) return;
    const sourceText = upstreamText || node.content?.trim() || customPrompt.trim();
    if (!sourceText) {
      setError('请先连接文本节点，或在下方输入整理要求');
      return;
    }
    setError('');
    if (!selectedModel) {
      save(splitUpstreamTextToRows(sourceText, tableMode));
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    try {
      const instruction =
        tableMode === 'generate-list'
          ? '把以下内容整理为结构化生图提示词列表。只返回 JSON：{"rows":[["序号","画面提示词","补充要求"]]}。'
          : '把以下内容整理为结构化分镜或信息表格。只返回 JSON：{"rows":[["列1","列2","列3"]]}。';
      const overrides = getMultimodalClientOverrides(selectedModel);
      const usesResponses = selectedModel.startsWith('openai-responses:') || overrides.apiFormat === 'openai-responses';
      const activeEffort =
        node.textReasoningEffort && node.textReasoningEffort !== 'auto'
          ? node.textReasoningEffort === 'xhigh' || node.textReasoningEffort === 'max'
            ? 'high'
            : node.textReasoningEffort
          : undefined;
      const data = await requestCanvasText(
        () => ({
          model: upstreamModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${instruction}\n${customPrompt.trim() ? `补充要求：${customPrompt.trim()}\n` : ''}\n内容：\n${sourceText.slice(0, 12000)}`,
                },
              ],
            },
          ],
          ...overrides,
          ...(usesResponses ? { apiFormat: 'openai-responses' } : {}),
          ...(activeEffort ? { reasoning_effort: activeEffort } : {}),
        }),
        {
          usageModel: selectedModel,
          projectId,
          nodeId: node.id,
          runId: crypto.randomUUID(),
          onOperation: async (id) => {
            updateNode(projectId, node.id, { textOperationId: id, textRecoveryRequired: true });
            await saveCanvasProjects();
          },
        },
        controller.signal,
      );
      const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
      const raw = typeof data.text === 'string' ? data.text : String(choices?.[0]?.message?.content || '');
      const cleaned = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, '');
      const parsed = JSON.parse(cleaned) as { rows?: unknown[][] };
      if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        const nextRows = parsed.rows.map((r) =>
          Array.isArray(r) ? r.map((cell) => String(cell ?? '').replace(/[\t\r\n]/g, ' ')) : [String(r ?? '')],
        );
        save(nextRows);
      } else {
        save(splitUpstreamTextToRows(sourceText, tableMode));
      }
    } catch {
      save(splitUpstreamTextToRows(sourceText, tableMode));
    } finally {
      setBusy(false);
    }
  };

  const handleBatchSpawnDrawing = () => {
    const validRows = rows.filter((r) => r.some((cell) => cell.trim()));
    if (validRows.length === 0) return;
    const store = useCanvasStore.getState();
    const baseRightX = Math.round(node.x + (node.width || 480) + 96);
    validRows.forEach((row, idx) => {
      const promptText = row.filter((c) => c.trim()).join(' · ');
      const created = buildQuickCanvasNode(
        'image-generation',
        { x: baseRightX + (idx % 3) * 300, y: Math.round(node.y + Math.floor(idx / 3) * 300) },
        { referenceNodeIds: [node.id] },
      );
      store.addNode(projectId, {
        ...created,
        title: `列表 #${idx + 1}`,
        content: promptText,
      });
    });
  };

  const pillGroup = 'flex items-center gap-0.5 rounded-lg bg-black/[0.05] p-0.5 dark:bg-white/[0.06]';
  const pillBtn = (active: boolean) =>
    `rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
      active
        ? 'bg-white text-zinc-900 shadow-xs dark:bg-white/15 dark:text-zinc-100'
        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
    }`;
  const smallActionBtn =
    'flex h-6.5 items-center gap-1 rounded-md px-2 text-[11px] text-zinc-600 transition-colors hover:bg-black/[0.05] hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/[0.08] dark:hover:text-zinc-100 cursor-pointer';

  return (
    <section
      aria-label={node.title || '表格编辑'}
      style={{ height: node.height || 340 }}
      className="pointer-events-auto relative flex w-full flex-col select-none"
    >
      {/* 节点顶部小标题 */}
      <header className="pointer-events-none absolute -top-6 left-0.5 z-20 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <Table2 size={14} className="shrink-0 text-zinc-400" />
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{node.title || '表格编辑'}</span>
      </header>

      {/* 选中时顶部悬浮胶囊工具栏 */}
      {selected && (
        <div
          role="toolbar"
          aria-label="表格编辑操作栏"
          data-canvas-pin-toolbar=""
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-1/2 z-[120] mb-9 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-200 dark:border-white/10 bg-[#f6f6f6] dark:bg-[#262626]/92 px-2 py-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md whitespace-nowrap"
        >
          <div className={pillGroup}>
            <button type="button" onClick={() => setViewMode('table')} className={pillBtn(viewMode === 'table')}>
              表格
            </button>
            <button type="button" onClick={() => setViewMode('markdown')} className={pillBtn(viewMode === 'markdown')}>
              Markdown
            </button>
          </div>
          <span className="mx-0.5 h-3.5 w-px bg-black/10 dark:bg-white/10" />
          <button
            type="button"
            disabled={node.layerLocked || rows.length >= 100}
            onClick={() => save([...rows, Array<string>(columns).fill('')])}
            className={smallActionBtn}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>添加行</span>
          </button>
          <button
            type="button"
            disabled={node.layerLocked || columns >= 20}
            onClick={() => save(rows.map((row) => Array.from({ length: columns + 1 }, (_, index) => row[index] || '')))}
            className={smallActionBtn}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>添加列</span>
          </button>
          <button
            type="button"
            onClick={() => setAutoRowHeight((v) => !v)}
            title="行高自适应"
            className={smallActionBtn}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={exportCsv} title="导出 CSV" className={smallActionBtn}>
            <Download className="h-3.5 w-3.5" />
            <span>导出 CSV</span>
          </button>
          <button
            type="button"
            onClick={handleBatchSpawnDrawing}
            title="按每行内容批量创建下游绘画节点"
            className={smallActionBtn}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>逐行生图</span>
          </button>
        </div>
      )}

      {/* 画布卡片主体（可直接在标题区与边框区域拖拽移动节点） */}
      <div
        ref={anchor}
        data-testid="drawing-preview"
        className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[18px] border bg-white text-zinc-800 transition-shadow dark:bg-[#1f1f1f] dark:text-zinc-200 cursor-grab active:cursor-grabbing ${
          selected
            ? 'border-sky-400/90 shadow-[0_0_0_1px_rgba(56,189,248,0.35),0_18px_42px_rgba(0,0,0,0.45)]'
            : 'border-slate-200/90 dark:border-white/[0.1] shadow-[0_10px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.42)]'
        }`}
      >
        {/* 卡片内部顶栏（不拦截拖拽，仅按钮拦截） */}
        <div
          className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] px-3.5 py-2.5 dark:border-white/[0.07]"
          data-table-editor-prompt=""
        >
          <div className="flex min-w-0 items-center gap-2">
            {upstreamText ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <AlignLeft size={11} />
                <span>已连接上游文本</span>
              </span>
            ) : (
              <span className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">结构化分镜与清单表</span>
            )}
            <span className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[10px] tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
              {rows.length} 行 × {columns} 列
            </span>
          </div>

          <div
            className="flex items-center gap-1"
            data-table-editor-controls=""
            onMouseDown={(e) => e.stopPropagation()}
          >
            {upstreamText && (
              <button
                type="button"
                onClick={handleQuickLineSplit}
                title="将上游文本直接按行拆分到表格"
                className={smallActionBtn}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                <span>按行拆分</span>
              </button>
            )}
            {!selected && (
              <button
                type="button"
                disabled={Boolean(node.layerLocked || busy)}
                onClick={() => void handleSmartParse()}
                aria-label="解析表格"
                className={smallActionBtn}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>智能整理</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="border-b border-black/[0.06] bg-amber-500/10 px-3.5 py-1.5 text-[11px] text-amber-600 dark:border-white/[0.06] dark:text-amber-400">
            {error}
          </div>
        )}

        {/* 表格 / Markdown 主体区域 */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-auto px-2.5 py-1.5"
          onWheel={(event) => {
            if (selected) event.stopPropagation();
          }}
        >
          {viewMode === 'markdown' ? (
            <pre
              onMouseDown={(e) => e.stopPropagation()}
              className="min-h-[80px] shrink-0 whitespace-pre-wrap rounded-xl bg-black/[0.02] p-3 font-mono text-[11px] leading-relaxed text-zinc-700 dark:bg-white/[0.03] dark:text-zinc-300 cursor-text"
            >
              {toMarkdownTable(rows, columns, DEFAULT_HEADERS)}
            </pre>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-[1] bg-white dark:bg-[#1f1f1f]">
                <tr>
                  <th
                    scope="col"
                    className="w-8 border-b border-black/[0.06] px-1 py-1.5 text-center text-[10px] font-normal text-zinc-400 dark:border-white/[0.06] dark:text-zinc-500"
                  >
                    #
                  </th>
                  {Array.from({ length: columns }, (_, col) => (
                    <th
                      scope="col"
                      key={col}
                      className="border-b border-black/[0.06] px-2 py-1.5 text-left text-[10px] font-medium tracking-wide text-zinc-400 dark:border-white/[0.06] dark:text-zinc-500"
                    >
                      {DEFAULT_HEADERS[col] ? `${col + 1} · ${DEFAULT_HEADERS[col]}` : `列 ${col + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="group/row transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.02]"
                  >
                    <th
                      scope="row"
                      className="border-b border-black/[0.06] px-1 py-1.5 text-center font-normal text-zinc-400 dark:border-white/[0.06] dark:text-zinc-500"
                    >
                      <span className="text-[10px] tabular-nums group-hover/row:hidden">{rowIndex + 1}</span>
                      <button
                        type="button"
                        disabled={node.layerLocked || rows.length <= 1}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => save(rows.filter((_, idx) => idx !== rowIndex))}
                        title="删除行"
                        className="hidden rounded p-0.5 text-zinc-400 hover:text-red-400 group-hover/row:inline-flex cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </th>
                    {Array.from({ length: columns }, (_, col) => (
                      <td
                        key={col}
                        className="border border-black/[0.06] p-0.5 align-top dark:border-white/[0.06]"
                      >
                        <input
                          aria-label={`第 ${rowIndex + 1} 行第 ${col + 1} 列`}
                          value={row[col] || ''}
                          readOnly={node.layerLocked}
                          placeholder={DEFAULT_HEADERS[col] || `列 ${col + 1}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`w-full min-w-[92px] rounded bg-transparent px-2 text-[11px] text-zinc-800 outline-none placeholder:text-zinc-400/50 focus:bg-black/[0.02] focus:outline focus:outline-[#edb699] dark:text-zinc-200 dark:placeholder:text-zinc-600 dark:focus:bg-white/[0.03] ${
                            autoRowHeight ? 'py-2.5' : 'py-1.5'
                          }`}
                          onChange={(event) => {
                            const value = event.target.value.replace(/[\t\r\n]/g, ' ');
                            save(
                              rows.map((line, index) =>
                                index === rowIndex
                                  ? Array.from({ length: columns }, (_, cell) =>
                                      cell === col ? value : line[cell] || '',
                                    )
                                  : line,
                              ),
                            );
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 选中时底部浮动的 AI 智能整理与模型面板 */}
      {selected && (
        <CanvasDrawingEditor
          anchor={anchor}
          className="rounded-[22px] border border-slate-200/90 dark:border-white/[0.08] bg-white/98 dark:bg-[#1b1b1e]/98 px-5 pt-4 pb-3.5 shadow-[0_18px_48px_rgba(15,23,42,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)] text-slate-700 dark:text-zinc-100 backdrop-blur-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* 顶栏：整理 / 生成列表切换 + 上游连接素材 + 快速操作 */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-white/[0.08]">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className={pillGroup}>
                <button
                  type="button"
                  onClick={() => setTableMode('organize')}
                  className={pillBtn(tableMode === 'organize')}
                >
                  AI 整理表格
                </button>
                <button
                  type="button"
                  onClick={() => setTableMode('generate-list')}
                  className={pillBtn(tableMode === 'generate-list')}
                >
                  生成提示词列表
                </button>
              </div>

              {upstreamNodes.map((up, idx) =>
                up.imageUrl ? (
                  <img
                    key={up.id}
                    src={proxyMediaUrl(up.imageUrl)}
                    alt={up.title || '参考图'}
                    onMouseEnter={() => dispatchHighlightRef(up.id)}
                    onMouseLeave={() => dispatchHighlightRef(null)}
                    className="h-6 w-6 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span
                    key={up.id}
                    onMouseEnter={() => dispatchHighlightRef(up.id)}
                    onMouseLeave={() => dispatchHighlightRef(null)}
                    className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                    title={up.content || up.title}
                  >
                    <AlignLeft size={11} className="shrink-0" />
                    <span className="truncate">{up.title || `文本 ${idx + 1}`}</span>
                  </span>
                ),
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={Boolean(node.layerLocked || busy)}
                onClick={handleQuickLineSplit}
                title="不调用大模型，直接将上游文本按行或分隔符拆入表格"
                className={smallActionBtn}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                <span>按行快速拆分</span>
              </button>
              <button
                type="button"
                onClick={handleBatchSpawnDrawing}
                title="按每行内容批量创建下游绘画节点"
                className={smallActionBtn}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>逐行生图</span>
              </button>
            </div>
          </div>

          {/* 中部：自定义表格整理 / 列表生成要求 */}
          <div className="mb-2.5">
            <textarea
              data-table-editor-textarea=""
              value={customPrompt}
              onChange={(e) => {
                setCustomPrompt(e.target.value);
                updateNode(projectId, node.id, { textPrompt: e.target.value });
              }}
              placeholder={
                tableMode === 'generate-list'
                  ? '输入列表生成要求（例如：将上游文本拆成 8 条白底电商主图提示词，不要文字）…'
                  : '输入表格整理要求（例如：按时间段、景别、画面描述、视觉要求、旁白整理为 5 列分镜表）…'
              }
              rows={2}
              className="w-full resize-none rounded-xl border border-black/[0.06] bg-black/[0.015] p-2.5 text-[14px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>

          {/* 底栏：表格模型（与设置 -> 多模态 1:1 同步） + 思考力度 + 发送按钮 */}
          <div data-node-header-toolbar="" className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <CanvasModelPicker
                label="表格模型"
                models={availableModels}
                value={selectedModel}
                disabled={Boolean(node.layerLocked || busy)}
                onChange={(val) => updateNode(projectId, node.id, { textModel: val })}
              />
              <PromptBarReasoningPill
                assistantModel={upstreamModel}
                isUp={true}
                value={node.textReasoningEffort}
                onChange={(effort) => updateNode(projectId, node.id, { textReasoningEffort: effort })}
                disabled={Boolean(node.layerLocked || busy)}
              />
            </div>

            <button
              type="button"
              disabled={Boolean(node.layerLocked || busy)}
              onClick={() => void handleSmartParse()}
              title={tableMode === 'generate-list' ? '调用大模型生成结构化提示词列表' : '调用大模型智能分类整理表格'}
              aria-label="解析表格"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer ${
                !node.layerLocked && !busy
                  ? 'bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200'
                  : 'bg-zinc-200 text-zinc-400 dark:bg-white/10 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4.5 w-4.5" strokeWidth={2.4} />}
            </button>
          </div>
        </CanvasDrawingEditor>
      )}
    </section>
  );
}
