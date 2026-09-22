import AssistantLiveStatus, { activityTarget } from './AssistantLiveStatus';
/**
 * AssistantTurnList — 直接消费 Codex-style AssistantItem[] 的渲染层。
 *
 * 与 AssistantMessageList 不同，本组件不依赖 AssistantMessage 的扁平字段；
 * 它直接按 item kind 派发到对应子组件，让多 agentMessage 回合、子代理、toolCall/toolResult
 * 配对、Approval 等都能如实呈现。
 *
 * 仍在双轨过渡期：
 *   - `AssistantMessageList` 走 legacy AssistantMessage 字段
 *   - `AssistantTurnList` 走 Codex item[]
 *   - `useAssistantTurn` 已经把两种形态同步维护
 *
 * 调用方（AIAssistantDrawer）会在 AssistantMessage 有 `items` 时优先渲染本组件。
 */

import React, { useMemo } from 'react';
import { Loader2, Sparkles, Wrench, CheckCircle2, AlertTriangle, Clock, X } from 'lucide-react';
import {
  AssistantItem,
  ToolCallItem,
  ToolResultItem,
  ApprovalRequestItem,
  SubAgentItem,
  AgentReasoningItem,
} from '@beike/domain/assistant/types';
import type { ApprovalDecision, PendingApproval } from '@/features/assistant/utils/assistantTurnTypes';
import ThinkingBlock from '@/features/assistant/components/ThinkingBlock';
import ApprovalCard from '@/features/assistant/components/ApprovalCard';
import FormattedMarkdown from '@/features/assistant/components/FormattedMarkdown';
import ProductCardWidget from '@/features/assistant/components/ProductCardWidget';
import type { MediaAttachment, ProductWidgetData } from '@/store/appStoreTypes';

export interface AssistantTurnListProps {
  items: AssistantItem[];
  referenceMedia?: MediaAttachment[];
  isSending?: boolean;
  streamingStatus?: string;
  productWidget?: ProductWidgetData;
  livePendingApprovals?: PendingApproval[];
  onApprovalDecision?: (approvalId: string, decision: ApprovalDecision) => void;
  modelUsed?: string;
  error?: boolean;
  // 商品挂件回调（从 CodexAssistantBubble 传入）
  onAnalyzeImages?: () => void;
  onSetAsReference?: (imgUrl: string) => void;
  onLoadToStudio?: (product: ProductWidgetData, imgs: any) => void;
  onGenerateShotsForProduct?: (title: string) => void;
  onPreviewImage?: (imgUrl: string) => void;
}

function ItemStatusBadge({
  status,
}: {
  status: 'running' | 'done' | 'error' | 'failed' | 'cancelled' | 'pending' | 'accepted' | 'declined' | 'expired' | 'spawning' | 'completed';
}) {
  const map: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    running: { color: 'bg-amber-100 text-amber-700 border-amber-200', label: '运行中', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    spawning: { color: 'bg-amber-100 text-amber-700 border-amber-200', label: '启动中', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    done: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: '完成', icon: <CheckCircle2 className="w-3 h-3" /> },
    completed: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: '完成', icon: <CheckCircle2 className="w-3 h-3" /> },
    error: { color: 'bg-rose-100 text-rose-700 border-rose-200', label: '失败', icon: <AlertTriangle className="w-3 h-3" /> },
    failed: { color: 'bg-rose-100 text-rose-700 border-rose-200', label: '失败', icon: <AlertTriangle className="w-3 h-3" /> },
    cancelled: { color: 'bg-slate-100 text-slate-500 border-slate-200', label: '已取消', icon: <X className="w-3 h-3" /> },
    pending: { color: 'bg-amber-100 text-amber-700 border-amber-200', label: '等待审批', icon: <Clock className="w-3 h-3" /> },
    accepted: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: '已批准', icon: <CheckCircle2 className="w-3 h-3" /> },
    declined: { color: 'bg-rose-100 text-rose-700 border-rose-200', label: '已拒绝', icon: <X className="w-3 h-3" /> },
    expired: { color: 'bg-slate-100 text-slate-500 border-slate-200', label: '已过期', icon: <Clock className="w-3 h-3" /> },
  };
  const cfg = map[status] || map.running;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${cfg.color}`}>
      {cfg.icon}
      <span>{cfg.label}</span>
    </span>
  );
}

function ToolCallRow({
  callItem,
  resultItem,
}: {
  callItem: ToolCallItem;
  resultItem?: ToolResultItem;
}) {
  const status = resultItem?.status || callItem.status;
  const running = status === 'running';
  const target = activityTarget(callItem.args);
  return (
    <details className="group/tool py-1.5 text-xs text-zinc-500" open={status === 'error' ? true : undefined}>
      <summary className="flex items-center gap-2 cursor-pointer list-none hover:text-zinc-800">
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Wrench className="w-3.5 h-3.5 shrink-0" />}
        <span className="shrink-0">{callItem.displayName || callItem.name}</span>
        {target && <span className="truncate text-zinc-400" title={target}>{target}</span>}
        <span className={status === 'error' ? 'text-rose-600 shrink-0 whitespace-nowrap' : 'text-zinc-400 shrink-0 whitespace-nowrap'}>{running ? '执行中' : status === 'error' ? '失败' : '已完成'}</span>
      </summary>
      <div className="mt-2 ml-1.5 border-l border-zinc-200 pl-4 space-y-2">
        {resultItem?.summary && <p className="leading-6">{resultItem.summary}</p>}
        {callItem.args && callItem.args !== '{}' && <pre className="rounded-lg bg-zinc-100 p-3 text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-auto">{callItem.args}</pre>}
        {resultItem?.action && <pre className="text-[11px] whitespace-pre-wrap break-words">{JSON.stringify(resultItem.action, null, 2)}</pre>}
      </div>
    </details>
  );
}

function ApprovalRow({
  item,
  onDecision,
  disabled,
}: {
  item: ApprovalRequestItem;
  onDecision?: (decision: ApprovalDecision) => void;
  disabled?: boolean;
}) {
  const legacy: PendingApproval = {
    turnId: '',
    approvalId: item.approvalId,
    toolName: item.toolName,
    displayName: item.displayName,
    args: item.args,
  };
  return (
    <div className="space-y-1">
      <ApprovalCard
        approval={legacy}
        onDecision={(d) => onDecision?.(d)}
        disabled={disabled || item.status !== 'pending'}
      />
      {item.status !== 'pending' && (
        <div className="text-[10px] text-slate-500 pl-2">决策：{item.decision || item.status}</div>
      )}
    </div>
  );
}

function SubAgentRow({ item }: { item: SubAgentItem }) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-transparent overflow-hidden text-[12px]">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-100/60 border-b border-zinc-200/60">
        <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
        <span className="font-semibold text-zinc-700">子代理 · {item.skillId || '未指定技能'}</span>
        <ItemStatusBadge status={item.status} />
      </div>
      {item.prompt && (
        <div className="px-3 py-2 text-[11px] text-zinc-600 border-b border-zinc-100 whitespace-pre-wrap">
          {item.prompt}
        </div>
      )}
    </div>
  );
}

function ReasoningRow({ item }: { item: AgentReasoningItem }) {
  if (!item.content) return null;
  return <ThinkingBlock content={item.content} defaultOpen={false} />;
}

export default function AssistantTurnList({
  items,
  referenceMedia,
  isSending,
  streamingStatus,
  productWidget,
  livePendingApprovals = [],
  onApprovalDecision,
  modelUsed,
  error,
  onAnalyzeImages,
  onSetAsReference,
  onLoadToStudio,
  onGenerateShotsForProduct,
  onPreviewImage,
}: AssistantTurnListProps) {
  // 配对 toolCall + toolResult
  const rendered = useMemo(() => {
    const rows: Array<{ kind: 'toolPair' | 'item'; data: any }> = [];
    const byToolId = new Map<string, ToolResultItem>();
    for (const item of items) {
      if (item.kind === 'toolResult') {
        const callId = item.id.replace('__result', '');
        byToolId.set(callId, item as ToolResultItem);
      }
    }
    for (const item of items) {
      if (item.kind === 'toolCall') {
        const tc = item as ToolCallItem;
        const result = byToolId.get(tc.id);
        rows.push({ kind: 'toolPair', data: { call: tc, result } });
      } else if (item.kind === 'toolResult') {
        // 已经随 toolCall 渲染过；跳过
      } else {
        rows.push({ kind: 'item', data: item });
      }
    }
    return rows;
  }, [items]);

  const hasLiveApproval = livePendingApprovals.length > 0;

  return (
    <div className="space-y-3 w-full">
      {/* 等待连接提示（最早期） */}
      {isSending && !hasLiveApproval && (/筛选|已恢复|已保存/.test(streamingStatus || '') || !items.some((item) => item.kind === 'toolCall' || item.kind === 'subAgent' || ((item.kind === 'agentMessage' || item.kind === 'agentReasoning') && item.content))) && (
        <AssistantLiveStatus message={streamingStatus} />
      )}

      {/* 实时审批（live stream 中的 pendingApprovals 优先于 item 列表） */}
      {isSending && hasLiveApproval && (
        <div className="space-y-1">
          {livePendingApprovals.map((a) => (
            <ApprovalCard
              key={`live_${a.approvalId}`}
              approval={a}
              onDecision={(d) => onApprovalDecision?.(a.approvalId, d)}
              disabled={false}
            />
          ))}
        </div>
      )}

      {rendered.map((row, idx) => {
        if (row.kind === 'toolPair') {
          const { call, result } = row.data;
          return (
            <ToolCallRow
              key={`tool_${call.id}_${idx}`}
              callItem={call}
              resultItem={result}
            />
          );
        }
        const item = row.data as AssistantItem;
        switch (item.kind) {
          case 'agentReasoning':
            return <ReasoningRow key={item.id} item={item} />;
          case 'agentMessage':
            if (!item.content) return null;
            return (
              <div key={item.id} className="py-1 text-zinc-800">
                <FormattedMarkdown content={(item as any).content || ''} referenceMedia={referenceMedia} accentColor="slate" />
                {isSending && idx === rendered.length - 1 && (
                  <span className="inline-block w-1.5 h-3.5 bg-zinc-500 animate-pulse ml-1 align-middle rounded-xs" />
                )}
              </div>
            );
          case 'approvalRequest':
            return (
              <ApprovalRow
                key={item.id}
                item={item}
                onDecision={(d) => onApprovalDecision?.((item as ApprovalRequestItem).approvalId, d)}
                disabled={!isSending}
              />
            );
          case 'subAgent':
            return <SubAgentRow key={item.id} item={item} />;
          case 'userMessage':
            if (!String(item.content || '').trim()) return null;
            return (
              <div key={item.id} className="rounded-2xl bg-zinc-200/60 text-zinc-800 px-4 py-3 max-w-[88%] ml-auto">
                {(item as any).content}
              </div>
            );
          default:
            return null;
        }
      })}

      {/* 商品挂件：仍然从 AssistantMessage.productWidget 取，方便一次呈现 */}
      {productWidget && (
        <ProductCardWidget
          product={productWidget}
          onAnalyzeImages={onAnalyzeImages}
          onSetAsReference={(u) => onSetAsReference?.(u)}
          onLoadToStudio={(p, imgs) => onLoadToStudio?.(p, imgs)}
          onGenerateShotsForProduct={(t) => onGenerateShotsForProduct?.(t)}
          onPreviewImage={(u) => onPreviewImage?.(u)}
        />
      )}

      {/* 错误提示 */}
      {error && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>本轮请求失败，可以重试。</span>
        </div>
      )}

      {/* 底部模型标签 */}
      {!isSending && modelUsed && (
        <div className="flex justify-end">
          <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80 text-[10px]">
            {modelUsed.replace('-preview-thinking-high', '').replace('-preview', '')}
          </span>
        </div>
      )}
    </div>
  );
}
