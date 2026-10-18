import { useState } from 'react';
import ThoughtLine from '@client/shared/ui/ThoughtLine';
import { getShowThinkingPreference } from '../../model/assistantTurnTypes';

interface Props {
  content: string;
  defaultOpen?: boolean;
  isRunning?: boolean;
}

export default function ThinkingBlock({
  content,
  defaultOpen = false,
  isRunning = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (!content?.trim() || !getShowThinkingPreference()) return null;

  return (
    <div className="agent-thinking-wrapper my-1.5">
      <ThoughtLine
        label="正在深度思考…"
        doneLabel="已深度思考"
        working={isRunning}
        collapseOnSettle={!defaultOpen}
        open={open}
        onOpenChange={setOpen}
        fontSize={12}
        className="w-full text-slate-500 dark:text-slate-400"
      >
        <div className="agent-thinking-content mt-1.5 p-2.5 rounded-lg border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-black/30 font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
          {content}
        </div>
      </ThoughtLine>
    </div>
  );
}
