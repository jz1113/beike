import { useState } from 'react';
import { ArrowLeft, CircleHelp, List } from 'lucide-react';
import { CoverMemoryGraphCanvas } from './memory/CoverMemoryGraphCanvas';
import { CoverMemoryAuditDrawer } from './memory/CoverMemoryAuditDrawer';
import { CoverSampleMemoryList } from './memory/CoverSampleMemoryList';
import type { CoverMemoryBranch, CoverMemoryEntry, CoverMemoryResponse } from '@shared/contracts/coverMemory';

interface Props {
  memory: CoverMemoryResponse;
  error: string | null;
  busy: boolean;
  feeding: boolean;
  onClose: () => void;
  onSetStatus: (entry: CoverMemoryEntry, status: CoverMemoryEntry['status']) => void;
  onAddCorrection: (rule: string) => void;
  onClearTrash: () => void;
  onRetry: (imageUrls: string[], model: string, title: string) => void;
}

export function CoverMemoryStudioDialog({ memory, error, busy, feeding, onClose, onSetStatus, onAddCorrection, onClearTrash, onRetry }: Props) {
  const [selected, setSelected] = useState<CoverMemoryBranch | null>(null);
  const [view, setView] = useState<'branches' | 'samples'>('branches');
  const [helpOpen, setHelpOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const restore = (entry: CoverMemoryEntry) => {
    onSetStatus(entry, entry.source === 'correction' ? 'adopted' : 'pending');
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#101014] text-white">
      <header className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5" aria-label="返回封面"><ArrowLeft className="h-4 w-4" /></button>
          <span className="text-sm font-black">封面记忆</span>
          <div className="relative">
            <button type="button" onClick={() => setHelpOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5" aria-label="封面记忆说明"><CircleHelp className="h-4 w-4" /></button>
            {helpOpen && (
              <div className="absolute left-0 top-11 z-30 w-80 rounded-2xl border border-white/10 bg-[#1b1b1e] p-4 text-xs leading-5 text-slate-200 shadow-2xl">
                <p className="font-bold">生成封面时会用到这里的已采纳记忆。</p>
                <p className="mt-2">把封面投喂给右下角的小怪兽，一次一张，逐张保留自己的特点。生成时只用全局纠正和其中一张已采纳样张。待确认的条目不会进入生成。多图一起反推的旧记录仍保留，标为旧版分组反推。</p>
              </div>
            )}
          </div>
          {feeding && <span className="text-xs text-amber-200">反推中</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setView((current) => current === 'branches' ? 'samples' : 'branches')} className="rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold">{view === 'branches' ? '按样张' : '按分支'}</button>
          <button type="button" onClick={() => setAuditOpen((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-xl border ${auditOpen ? 'border-amber-400 text-amber-200' : 'border-white/10'} bg-white/5`} aria-label="引用记录"><List className="h-4 w-4" /></button>
        </div>
      </header>
      {error && <p className="px-4 text-xs text-rose-300">{error}</p>}
      <main className="relative min-h-0 flex-1">
        {view === 'samples' ? (
          <CoverSampleMemoryList samples={memory.samples} entries={memory.entries} busy={busy} onSetStatus={onSetStatus} />
        ) : (
          <CoverMemoryGraphCanvas
            entries={memory.entries}
            samples={memory.samples}
            selected={selected}
            onSelect={setSelected}
            onSetStatus={onSetStatus}
            onAddCorrection={onAddCorrection}
            busy={busy}
          />
        )}
        {auditOpen && (
          <CoverMemoryAuditDrawer
            usages={memory.usages}
            entries={memory.entries}
            busy={busy}
            onClose={() => setAuditOpen(false)}
            onRestore={restore}
            onClearTrash={onClearTrash}
          />
        )}
      </main>
      {memory.samples.some((sample) => sample.status === 'failed') && (
        <div className="absolute bottom-5 right-5 z-20 max-w-sm rounded-2xl border border-rose-400/30 bg-[#1a1a1e] p-3 text-xs">
          {memory.samples.filter((sample) => sample.status === 'failed').slice(0, 3).map((sample) => (
            <div key={sample.id} className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate">{sample.title || '样张'}：{sample.error || '反推失败'}</span>
              <button type="button" disabled={busy} className="shrink-0 font-bold text-amber-200" onClick={() => onRetry(sample.imageUrls, sample.model, sample.title)}>重试</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
