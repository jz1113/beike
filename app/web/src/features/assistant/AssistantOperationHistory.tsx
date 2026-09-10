/**
 * AssistantOperationHistory — 操作历史面板
 *
 * 把当前 turn 内所有工具调用按时间线列出，
 * 用户可点击展开查看参数和结果（审计 + 透明）。
 */

import { useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { AssistantItem, ToolCallItem, ToolResultItem } from '@beike/domain/assistant/types';

interface Props {
  items: AssistantItem[];
}

type ToolRow = {
  id: string;
  name: string;
  displayName: string;
  args: string;
  status: ToolCallItem['status'] | ToolResultItem['status'];
  summary?: string;
};

export default function AssistantOperationHistory({ items }: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 仅按 toolCall 计数，避免与 toolResult 翻倍；配对逻辑与 AssistantTurnList 一致
  const tools = useMemo(() => {
    const byToolId = new Map<string, ToolResultItem>();
    for (const item of items) {
      if (item.kind === 'toolResult') {
        const callId = item.id.replace('__result', '');
        byToolId.set(callId, item);
      }
    }

    const rows: ToolRow[] = [];
    for (const item of items) {
      if (item.kind !== 'toolCall') continue;
      const result = byToolId.get(item.id);
      rows.push({
        id: item.id,
        name: item.name,
        displayName: item.displayName || item.name,
        args: item.args,
        status: result?.status || item.status,
        summary: result?.summary,
      });
    }
    return rows;
  }, [items]);

  if (tools.length === 0) return null;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="border-t border-slate-100 w-full rounded-xl overflow-hidden bg-white/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between text-[11px] text-slate-500 hover:bg-slate-50 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          <span className="font-medium">操作历史</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold">
            {tools.length}
          </span>
        </div>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {tools.map((row) => {
            const isExpanded = expanded.has(row.id);
            const icon =
              row.status === 'done' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : row.status === 'error' ? (
                <XCircle className="w-3 h-3 text-rose-500" />
              ) : (
                <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
              );
            return (
              <div key={row.id} className="rounded-lg border border-slate-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="w-full px-2 py-1.5 flex items-center gap-2 hover:bg-slate-50 cursor-pointer text-left"
                >
                  {icon}
                  <code className="text-[10px] font-mono text-slate-700 truncate">
                    {row.displayName || row.name || row.id}
                  </code>
                  {isExpanded ? (
                    <ChevronDown className="w-2.5 h-2.5 ml-auto text-slate-400" />
                  ) : (
                    <ChevronRight className="w-2.5 h-2.5 ml-auto text-slate-400" />
                  )}
                </button>
                {isExpanded && (
                  <div className="px-2 pb-2 text-[10px] font-mono text-slate-500 space-y-1 bg-slate-50/50">
                    {row.args ? (
                      <div>
                        <div className="text-[9px] uppercase text-slate-400 mb-0.5">参数</div>
                        <pre className="whitespace-pre-wrap break-all">{row.args}</pre>
                      </div>
                    ) : null}
                    {row.summary ? (
                      <div>
                        <div className="text-[9px] uppercase text-slate-400 mb-0.5">结果</div>
                        <div className="whitespace-pre-wrap break-words text-slate-600">{row.summary}</div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
