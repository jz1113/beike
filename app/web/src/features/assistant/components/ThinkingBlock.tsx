import { ChevronDown, Brain } from 'lucide-react';
import { getShowThinkingPreference } from '@/features/assistant/assistantTurnTypes';

interface Props {
  content: string;
  defaultOpen?: boolean;
}

export default function ThinkingBlock({ content, defaultOpen = false }: Props) {
  if (!content?.trim() || !getShowThinkingPreference()) return null;

  return (
    <details
      open={defaultOpen}
      className="w-full text-xs text-zinc-500 overflow-hidden my-2"
    >
      <summary className="cursor-pointer py-1.5 font-normal flex items-center gap-1.5 list-none">
        <Brain className="w-3 h-3 text-zinc-400" />
        <span>思考过程</span>
        <ChevronDown className="w-3 h-3 ml-auto opacity-50" />
      </summary>
      <div className="pl-4 pb-2 border-l border-zinc-200 whitespace-pre-wrap text-zinc-500 max-h-48 overflow-y-auto">
        {content}
      </div>
    </details>
  );
}
