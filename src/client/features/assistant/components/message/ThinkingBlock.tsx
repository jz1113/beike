import { useState } from 'react';
import { ChevronRight, Check, Loader2 } from 'lucide-react';
import { getShowThinkingPreference } from '../../model/assistantTurnTypes';

interface Props { content: string; defaultOpen?: boolean; isRunning?: boolean }
export default function ThinkingBlock({ content, defaultOpen = false, isRunning = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content?.trim() || !getShowThinkingPreference()) return null;
  return <details className="agent-thinking" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{isRunning ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}<span>{isRunning ? '正在思考' : '已思考'}</span><ChevronRight size={12} /></summary>
    <div className="agent-thinking-content">{content}</div>
  </details>;
}
