/**
 * TaskCenterPanel — 任务中心面板
 *
 * 显示当前所有 running / awaiting_approval 的 turn。
 * 点击某条 → 调 recoverTurn → 把 items 注入当前会话展示
 */

import { useEffect, useState } from 'react';
import { Loader2, Bell, RefreshCw, X, Sparkles } from 'lucide-react';
import { useTaskCenter, type ActiveRun } from '@/store/useTaskCenter';
import type { AssistantItem } from '@beike/domain/assistant/types';

interface Props {
  onResume?: (snapshot: { items: AssistantItem[]; modelUsed?: string; turnId: string }) => void;
  onClose?: () => void;
}

function statusLabel(status: ActiveRun['status']): string {
  switch (status) {
    case 'running':
      return '运行中';
    case 'awaiting_approval':
      return '等待审批';
    case 'completed':
      return '已完成';
    case 'interrupted':
      return '已中断';
    case 'failed':
      return '失败';
    default:
      return status;
  }
}

function statusColor(status: ActiveRun['status']): string {
  switch (status) {
    case 'running':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'awaiting_approval':
      return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'interrupted':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    case 'failed':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-500 border-slate-200';
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return `${Math.floor(diff / 3_600_000)} 小时前`;
}

export default function TaskCenterPanel({ onResume, onClose }: Props) {
  const { runs, loading, fetchRuns, recoverTurn, startPolling, stopPolling } = useTaskCenter();
  const [resuming, setResuming] = useState<string | null>(null);

  useEffect(() => {
    startPolling(5000);
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const handleResume = async (turnId: string) => {
    setResuming(turnId);
    try {
      const snap = (await recoverTurn(turnId)) as {
        items?: any[];
        modelUsed?: string;
        turnId?: string;
      } | null;
      if (snap && onResume) {
        const items = (snap.items || []).map((row: any) => {
          // row 直接来自 DB，结构略不同于 AssistantItem；做最小转换
          const base = {
            id: row.id,
            createdAt: row.startedAt,
            kind: row.kind,
          } as const;
          switch (row.kind) {
            case 'agentMessage':
              return { ...base, kind: 'agentMessage', content: row.content || '' };
            case 'agentReasoning':
              return { ...base, kind: 'agentReasoning', content: row.reasoning || '' };
            case 'toolCall':
              return {
                ...base,
                kind: 'toolCall',
                name: row.toolName || '',
                displayName: row.displayName || row.toolName || '',
                args: row.argsJson || '{}',
                callId: row.id,
                status: row.status === 'done' ? 'done' : row.status === 'error' ? 'error' : 'running',
              };
            case 'toolResult':
              return {
                ...base,
                kind: 'toolResult',
                name: row.toolName || '',
                displayName: row.displayName || row.toolName || '',
                status: row.status === 'done' ? 'done' : 'error',
                summary: row.summary || '',
                action: row.actionJson ? JSON.parse(row.actionJson) : undefined,
              };
            default:
              return { ...base, kind: 'userMessage', content: row.content || '' };
          }
        });
        onResume({
          items: items as unknown as AssistantItem[],
          modelUsed: snap.modelUsed,
          turnId: snap.turnId || turnId,
        });
      }
    } finally {
      setResuming(null);
    }
  };

  return (
    <div className="absolute top-14 right-3 w-80 max-h-[480px] rounded-2xl border border-slate-200 bg-white shadow-xl z-50 flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-xs font-semibold text-slate-700">任务中心</span>
          {runs.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
              {runs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fetchRuns()}
            className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            title="刷新"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              title="关闭"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {runs.length === 0 && !loading && (
          <div className="py-8 text-center text-[11px] text-slate-400">
            <Sparkles className="w-6 h-6 mx-auto mb-2 text-slate-300" />
            暂无运行中的任务
          </div>
        )}
        {runs.map((run) => (
          <button
            key={run.turnId}
            type="button"
            onClick={() => handleResume(run.turnId)}
            disabled={resuming === run.turnId}
            className="w-full p-2 rounded-lg border border-slate-100 hover:border-rose-200 hover:bg-rose-50/30 transition-colors text-left flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${statusColor(run.status)}`}
                >
                  {statusLabel(run.status)}
                </span>
                <span className="text-[10px] text-slate-400 truncate font-mono">{run.turnId}</span>
              </div>
              <div className="text-[11px] text-slate-600 truncate">
                {run.model && <span className="font-mono">{run.model.replace(/-preview.*/, '')} · </span>}
                {timeAgo(run.startedAt)}开始
              </div>
            </div>
            {resuming === run.turnId ? (
              <Loader2 className="w-3 h-3 animate-spin text-rose-500" />
            ) : (
              <span className="text-[10px] text-rose-600 font-bold">恢复</span>
            )}
          </button>
        ))}
      </div>

      <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50/50">
        每 5s 自动刷新 · 点击条目恢复进度
      </div>
    </div>
  );
}
