import { useMemo } from 'react';
import { Check, Shield } from 'lucide-react';
import type { AssistantItem } from '@shared/domain/assistant/types';
import type { AssistantTaskState } from '@shared/domain/assistant/taskPolicy';
import type { ApprovalDecision, PendingApproval } from '../model/assistantTurnTypes';
import { groupTurnItems } from '../model/assistantActivity';
import AssistantExecution from './AssistantExecution';
import ApprovalCard from './ApprovalCard';
import FormattedMarkdown from './FormattedMarkdown';
import ProductCardWidget from './ProductCardWidget';
import type { MediaAttachment, ProductWidgetData } from '@client/store/appStoreTypes';

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
  onLoadToStudio?: (product: ProductWidgetData, imgs: any) => void;
  onGenerateShotsForProduct?: (title: string) => void;
  onPreviewImage?: (imgUrl: string) => void;
}

export default function AssistantTurnList({ items, startedAt, task, referenceMedia, isSending = false, streamingStatus,
  productWidget, livePendingApprovals = [], onApprovalDecision, onAnalyzeImages, onSetAsReference,
  onLoadToStudio, onGenerateShotsForProduct, onPreviewImage }: AssistantTurnListProps) {
  const groups = useMemo(() => groupTurnItems(items), [items]);
  const pendingIds = new Set(items.filter(item => item.kind === 'approvalRequest').map(item => item.approvalId));
  const extraApprovals = livePendingApprovals.filter(item => !pendingIds.has(item.approvalId));
  const awaiting = isSending && (livePendingApprovals.length > 0 || items.some(item => item.kind === 'approvalRequest' && item.status === 'pending'));
  const tail = groups.at(-1);
  const executionActive = isSending && !awaiting && (!tail || tail.kind === 'activity' || tail.item.kind !== 'agentMessage');
  return <div className="agent-turn-content">
    <AssistantExecution items={items} isSending={isSending} active={executionActive}
      startedAt={startedAt} task={task} message={streamingStatus} awaitingApproval={awaiting} />
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
      onSetAsReference={url => onSetAsReference?.(url)} onLoadToStudio={(product, images) => onLoadToStudio?.(product, images)}
      onGenerateShotsForProduct={title => onGenerateShotsForProduct?.(title)} onPreviewImage={url => onPreviewImage?.(url)} />}
  </div>;
}
