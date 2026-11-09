import { useMemo } from 'react';
import { Check, Shield, X } from 'lucide-react';
import { getToolDefinition } from '@shared/domain/assistant/tools/defs';
import type { AssistantItem } from '@shared/domain/assistant/types';
import type { AssistantTaskState } from '@shared/domain/assistant/taskPolicy';
import type { ApprovalDecision, PendingApproval } from '../../model/assistantTurnTypes';
import { answerVerdicts, groupTurnItems } from '../../model/assistantActivity';
import AssistantExecution from './AssistantExecution';
import AssistantCodeBlock from './AssistantCodeBlock';
import MarkdownBody, { type MarkdownAccent } from '@client/shared/ui/markdown/MarkdownBody';
import ProductCardWidget from '@client/shared/agent/ProductCardWidget';
import type { MediaAttachment, ProductWidgetData } from '@client/store/appStoreTypes';

export function FormattedMarkdown({
  content,
  className = '',
  accentColor = 'amber',
  referenceMedia = [],
}: {
  content: string;
  referenceMedia?: MediaAttachment[];
  className?: string;
  accentColor?: MarkdownAccent;
}) {
  if (!content) return null;

  return (
    <MarkdownBody
      content={content}
      className={className}
      accentColor={accentColor}
      renderCode={(code, lang, incomplete) => (
        <AssistantCodeBlock code={code} lang={lang} referenceMedia={referenceMedia} incomplete={incomplete} />
      )}
    />
  );
}

export function ApprovalCard({
  approval,
  onDecision,
  disabled,
}: {
  approval: PendingApproval;
  onDecision: (decision: ApprovalDecision) => void;
  disabled?: boolean;
}) {
  const canRemember = getToolDefinition(approval.toolName)?.approval === 'per_session';
  const argsPreview = Object.entries(approval.args || {})
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join(' · ');

  return (
    <div data-pending-approval={!disabled ? approval.approvalId : undefined} className="agent-approval-card">
      <div className="flex items-center gap-1.5 font-semibold mb-1.5">
        <Shield className="w-3.5 h-3.5 text-zinc-500" />
        <span>确认操作 · {approval.displayName}</span>
      </div>
      {argsPreview && (
        <div className="text-zinc-500 mb-2 truncate" title={argsPreview}>
          {argsPreview}
        </div>
      )}
      <details className="mb-3">
        <summary className="cursor-pointer text-zinc-500">查看完整操作参数</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/60 p-2 dark:bg-[#18191c]/95">
          {JSON.stringify(approval.args, null, 2)}
        </pre>
      </details>
      <p className="mb-2 text-zinc-500">
        {canRemember
          ? '允许仅批准本次操作；本会话允许会在30分钟内批准此工具在当前对话中的后续操作。'
          : '允许仅批准本次操作，后续操作仍按工具规则确认。'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('accept')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 text-white text-[11px] font-medium hover:bg-zinc-900 disabled:opacity-50"
        >
          <Check className="w-3 h-3" />
          允许
        </button>
        {canRemember && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDecision('acceptForSession')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700 text-[11px] font-medium hover:bg-zinc-200 disabled:opacity-50"
          >
            本会话允许（30分钟）
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('decline')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-600 text-[11px] font-medium hover:bg-zinc-100 disabled:opacity-50 dark:bg-[#18191c]"
        >
          <X className="w-3 h-3" />
          拒绝
        </button>
      </div>
    </div>
  );
}

export interface AssistantTurnListProps {
  items: AssistantItem[];
  startedAt?: number;
  task?: AssistantTaskState;
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
  onGenerateShotsForProduct?: (title: string) => void;
  onPreviewImage?: (imgUrl: string) => void;
}

export default function AssistantTurnList({ items, startedAt, task, referenceMedia, isSending = false, streamingStatus,
  productWidget, modelUsed, livePendingApprovals = [], onApprovalDecision, onAnalyzeImages, onSetAsReference,
  onGenerateShotsForProduct, onPreviewImage }: AssistantTurnListProps) {
  const groups = useMemo(() => groupTurnItems(items), [items]);
  const verdicts = useMemo(() => answerVerdicts(items), [items]);
  const pendingIds = new Set(items.filter(item => item.kind === 'approvalRequest').map(item => item.approvalId));
  const extraApprovals = livePendingApprovals.filter(item => !pendingIds.has(item.approvalId));
  const awaiting = isSending && (livePendingApprovals.length > 0 || items.some(item => item.kind === 'approvalRequest' && item.status === 'pending'));
  const tail = groups.at(-1);
  const executionActive = isSending && !awaiting && (!tail || tail.kind === 'activity' || tail.item.kind !== 'agentMessage');
  const collectedProduct = !isSending && modelUsed === 'direct-collection' && productWidget?.platform === 'jd';
  return <div className="agent-turn-content" data-collected-product={collectedProduct}>
    {!collectedProduct && <AssistantExecution items={items} isSending={isSending} active={executionActive}
      startedAt={startedAt} task={task} message={streamingStatus} awaitingApproval={awaiting} />}
    {verdicts.map((line, index) => <p key={`${index}-${line}`} className="agent-step-verdict" role="status">{line}</p>)}
    {groups.map(group => {
      if (group.kind === 'activity') return null;
      const item = group.item;
      if (item.kind === 'agentMessage') return <div key={item.id} className="agent-response-body"><FormattedMarkdown content={item.content} referenceMedia={referenceMedia} accentColor="slate" /></div>;
      if (item.kind === 'approvalRequest') {
        const live = livePendingApprovals.find(approval => approval.approvalId === item.approvalId);
        if (item.status === 'pending' && isSending) return <ApprovalCard key={item.id} approval={live || { turnId:'', approvalId:item.approvalId, toolName:item.toolName, displayName:item.displayName, args:item.args }}
          onDecision={decision => onApprovalDecision?.(item.approvalId, decision)} disabled={!onApprovalDecision} />;
        return <div key={item.id} className="agent-approval-result">{item.status === 'accepted' ? <Check size={14} /> : <Shield size={14} />}<span>{item.displayName} · {item.status === 'accepted' ? '已允许' : item.status === 'declined' ? '已拒绝' : '确认已结束'}</span></div>;
      }
      return null;
    })}
    {extraApprovals.map(approval => isSending && <ApprovalCard key={approval.approvalId} approval={approval} onDecision={decision => onApprovalDecision?.(approval.approvalId, decision)} disabled={!onApprovalDecision} />)}
    {productWidget && <ProductCardWidget product={productWidget} onAnalyzeImages={onAnalyzeImages}
      onSetAsReference={url => onSetAsReference?.(url)}
      onGenerateShotsForProduct={title => onGenerateShotsForProduct?.(title)} onPreviewImage={url => onPreviewImage?.(url)} />}
  </div>;
}
