import { ChevronRight, FileText, Presentation } from 'lucide-react';

interface Props {
  filename: string;
  kind?: 'md' | 'ppt' | 'word';
  sizeLabel?: string;
  writing?: boolean;
  onOpen: () => void;
}

export default function AgentArtifactCard({
  filename,
  kind = 'md',
  sizeLabel,
  writing = false,
  onOpen,
}: Props) {
  const badgeConfig = {
    md: { label: 'MD', bg: 'bg-blue-600 text-white', border: 'border-blue-100', hint: 'Markdown 结构化文档' },
    ppt: { label: 'PPT', bg: 'bg-amber-600 text-white', border: 'border-amber-100', hint: 'PowerPoint 演示大纲' },
    word: { label: 'DOC', bg: 'bg-indigo-600 text-white', border: 'border-indigo-100', hint: 'Word 策划专案' },
  }[kind];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full max-w-xl items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 text-left shadow-xs transition-all duration-200 hover:border-slate-300 hover:bg-slate-50/60 hover:shadow-md cursor-pointer select-none"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 transition-transform group-hover:scale-105">
        {kind === 'ppt' ? (
          <Presentation className="h-5 w-5 text-amber-600" />
        ) : (
          <FileText className={`h-5 w-5 ${kind === 'word' ? 'text-indigo-600' : 'text-blue-600'}`} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${badgeConfig.bg}`}>
            {badgeConfig.label}
          </span>
          <span className="truncate text-sm font-semibold text-slate-800 group-hover:text-slate-950">
            {writing ? `正在构思生成 ${filename}` : filename}
          </span>
        </div>

        {writing ? (
          <div className="mt-2 flex flex-col gap-1.5" aria-hidden>
            <div className="h-2 w-20 rounded-full bg-slate-200 animate-pulse" />
            <div className="h-2 w-48 rounded-full bg-slate-100 animate-pulse" />
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span>{sizeLabel || badgeConfig.hint}</span>
            <span className="text-slate-300">·</span>
            <span className="text-blue-600 group-hover:underline">点击在线预览</span>
          </div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" />
    </button>
  );
}
