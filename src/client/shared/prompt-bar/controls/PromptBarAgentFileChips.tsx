import { FileAudio, FileText, Presentation, X } from 'lucide-react';
import { agentFileLabel, isAgentAttachmentUrl, readAgentAttachment, type AgentFileKind } from '../agentAttachments';

function Icon({ kind }: { kind: AgentFileKind }) {
  if (kind === 'audio') return <FileAudio className="h-3.5 w-3.5" />;
  if (kind === 'ppt') return <Presentation className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

export function PromptBarAgentFileChips({
  urls,
  onRemove,
}: {
  urls: string[];
  onRemove: (index: number) => void;
}) {
  const chips = urls
    .map((url, index) => ({ url, index, meta: readAgentAttachment(url) }))
    .filter((item) => isAgentAttachmentUrl(item.url));
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-0.5">
      {chips.map((item) => (
        <span key={item.url} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
          <Icon kind={item.meta?.kind || 'file'} />
          <span className="truncate">{item.meta?.name || '附件'}</span>
          <span className="text-slate-400">{agentFileLabel(item.meta?.kind || 'file')}</span>
          <button type="button" aria-label="移除附件" onClick={() => onRemove(item.index)} className="text-slate-400 hover:text-slate-700">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
