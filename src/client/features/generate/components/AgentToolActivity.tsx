import { useState } from 'react';
import { ChevronRight, FileText, Image, Link, ListChecks, Search, Terminal, Wrench } from 'lucide-react';
import type { ToolActivityGroup, ToolActivityIcon, ToolActivityLine } from '../model/agentToolActivity';

const ICONS: Record<ToolActivityIcon, typeof Wrench> = {
  plan: ListChecks,
  file: FileText,
  search: Search,
  code: Terminal,
  image: Image,
  link: Link,
  tool: Wrench,
};

function toneClass(tone: ToolActivityLine['tone']): string {
  if (tone === 'running') return 'text-slate-500 dark:text-slate-400';
  if (tone === 'error') return 'text-rose-700/80 dark:text-rose-300/80';
  return 'text-[#8b919a] dark:text-slate-500';
}

function ActivityIcon({ icon }: { icon: ToolActivityIcon }) {
  const Icon = ICONS[icon];
  return <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />;
}

export default function AgentToolActivity({ group }: { group: ToolActivityGroup }) {
  const [open, setOpen] = useState(false);
  const tone = toneClass(group.tone);
  const summary = (
    <span className={group.tone === 'running' ? 'animate-pulse' : undefined}>{group.summary}</span>
  );

  if (!group.expandable) {
    const line = group.lines[0];
    return (
      <div className={`flex items-center gap-1.5 py-0.5 text-[13px] leading-5 ${tone}`}>
        <ActivityIcon icon={line?.icon || 'tool'} />
        {summary}
      </div>
    );
  }

  return (
    <div className={`py-0.5 text-[13px] leading-5 ${tone}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-full items-center gap-1 text-left hover:text-slate-600 dark:hover:text-slate-300"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} strokeWidth={1.6} />
        {summary}
      </button>
      {open && (
        <div className="ml-[7px] mt-0.5 space-y-0.5 border-l border-slate-200/80 pl-3 dark:border-white/10">
          {group.lines.map((line) => (
            <div key={line.id} className={toneClass(line.tone)}>
              <div className="flex min-w-0 items-center gap-1.5 py-0.5">
                <ActivityIcon icon={line.icon} />
                <span className="min-w-0 truncate">{line.text}</span>
              </div>
              {line.details.map((detail, index) => (
                <p key={`${line.id}-${index}`} className="pl-5 text-[12px] leading-5 whitespace-normal text-slate-400 dark:text-slate-500">{detail}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
