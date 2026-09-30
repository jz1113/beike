import { Shield } from 'lucide-react';

export default function AssistantApprovalNotice({ count, onView }: { count: number; onView: () => void }) {
  if (!count) return null;
  return <div role="status" className="agent-approval-notice">
    <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span className="flex-1">有 {count} 项操作等待确认</span>
    <button type="button" onClick={onView} className="rounded underline underline-offset-2">查看待确认操作</button>
  </div>;
}
