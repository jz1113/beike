import { useState } from 'react';
import { ArrowLeft, CircleHelp, Layers, List } from 'lucide-react';
import { CoverMemoryGraphCanvas } from './memory/CoverMemoryGraphCanvas';
import { CoverMemoryAuditDrawer } from './memory/CoverMemoryAuditDrawer';
import { CoverMultiImageBatchUploader } from './memory/CoverMultiImageBatchUploader';
import { useCoverMemory } from '../hooks/useCoverMemory';
import type { CoverMemoryBranch, CoverMemoryEntry } from '@shared/contracts/coverMemory';

interface Props {
  titleModel: string;
  onClose: () => void;
}

export function CoverMemoryStudioDialog({ titleModel, onClose }: Props) {
  const memory = useCoverMemory(true);
  const [selected, setSelected] = useState<CoverMemoryBranch | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const running = memory.memory.samples.filter((sample) => sample.status === 'running').length;

  const restore = (entry: CoverMemoryEntry) => {
    void memory.setStatus(entry, entry.source === 'correction' ? 'adopted' : 'pending');
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#101014] text-white">
      <header className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5" aria-label="返回封面生成"><ArrowLeft className="h-4 w-4" /></button>
          <span className="text-sm font-black">封面记忆</span>
          <div className="relative">
            <button type="button" onClick={() => setHelpOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5" aria-label="封面记忆说明"><CircleHelp className="h-4 w-4" /></button>
            {helpOpen && (
              <div className="absolute left-0 top-11 z-30 w-80 rounded-2xl border border-white/10 bg-[#1b1b1e] p-4 text-xs leading-5 text-slate-200 shadow-2xl">
                <p className="font-bold">生成封面时会用到这里的已采纳记忆。</p>
                <p className="mt-2">构图、字体、字色、背景和主体来自样张反推。纠正是你明确写下的错，优先级更高。待确认的条目不会进入生成。</p>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setFeedOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold"><Layers className="h-3.5 w-3.5" />投喂样张</button>
          {running > 0 && <span className="text-xs text-amber-200">反推中 {running}</span>}
        </div>
        <button type="button" onClick={() => setAuditOpen((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-xl border ${auditOpen ? 'border-amber-400 text-amber-200' : 'border-white/10'} bg-white/5`} aria-label="记忆审计"><List className="h-4 w-4" /></button>
      </header>
      {memory.error && <p className="px-4 text-xs text-rose-300">{memory.error}</p>}
      <main className="relative min-h-0 flex-1">
        <CoverMemoryGraphCanvas
          entries={memory.memory.entries}
          samples={memory.memory.samples}
          selected={selected}
          onSelect={setSelected}
          onSetStatus={(entry, status) => { void memory.setStatus(entry, status); }}
          onAddCorrection={(rule) => { void memory.addCorrection(rule); }}
          busy={memory.busy}
        />
        {auditOpen && (
          <CoverMemoryAuditDrawer
            usages={memory.memory.usages}
            entries={memory.memory.entries}
            busy={memory.busy}
            onClose={() => setAuditOpen(false)}
            onRestore={restore}
            onClearTrash={() => { void memory.clearTrash(); }}
          />
        )}
      </main>
      {memory.memory.samples.some((sample) => sample.status === 'failed') && (
        <div className="absolute bottom-5 right-5 z-20 max-w-sm rounded-2xl border border-rose-400/30 bg-[#1a1a1e] p-3 text-xs">
          {memory.memory.samples.filter((sample) => sample.status === 'failed').slice(0, 3).map((sample) => (
            <div key={sample.id} className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate">{sample.title || '样张'}：{sample.error || '反推失败'}</span>
              <button type="button" disabled={memory.busy} className="shrink-0 font-bold text-amber-200" onClick={() => { void memory.deconstruct(sample.imageUrls, sample.model, sample.title); }}>重试</button>
            </div>
          ))}
        </div>
      )}
      {feedOpen && (
        <CoverMultiImageBatchUploader
          titleModel={titleModel}
          busy={memory.busy}
          onClose={() => setFeedOpen(false)}
          onSubmit={(urls, model, title) => {
            setFeedOpen(false);
            void memory.deconstruct(urls, model, title);
          }}
        />
      )}
    </div>
  );
}
