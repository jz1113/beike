import { useState } from 'react';
import { ArrowLeft, CircleHelp, List, RefreshCw } from 'lucide-react';
import { PosterDialogFrame } from './PosterDialogFrame';
import { CoverMemoryGraphCanvas } from './memory/CoverMemoryGraphCanvas';
import { CoverMemoryAuditDrawer } from './memory/CoverMemoryAuditDrawer';
import { CoverExperienceVersions } from './memory/CoverExperienceVersions';
import type { SaveCoverFeedback } from './memory/CoverUsageFeedback';
import { CoverSampleMemoryList } from './memory/CoverSampleMemoryList';
import type { CoverMemoryBranch, CoverMemoryEntry, CoverMemoryResponse, CoverMemorySample } from '@shared/contracts/coverMemory';

interface Props {
  memory: CoverMemoryResponse;
  error: string | null;
  busy: boolean;
  feeding: boolean;
  onClose: () => void;
  onSetStatus: (entry: CoverMemoryEntry, status: CoverMemoryEntry['status']) => void;
  onAddCorrection: (rule: string) => void;
  onClearTrash: () => void;
  onRetry: (sample: CoverMemorySample) => void;
  onRefresh: () => void;
  onRestoreRevision: (id: string) => Promise<boolean>;
  onSaveFeedback: SaveCoverFeedback;
}

export function CoverMemoryStudioDialog({ memory, error, busy, feeding, onClose, onSetStatus, onAddCorrection, onClearTrash, onRetry, onRefresh, onRestoreRevision, onSaveFeedback }: Props) {
  const [selected, setSelected] = useState<CoverMemoryBranch | null>(null);
  const [view, setView] = useState<'branches' | 'samples' | 'versions'>('branches');
  const [helpOpen, setHelpOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const restore = (entry: CoverMemoryEntry) => {
    onSetStatus(entry, entry.source === 'correction' ? 'adopted' : 'pending');
  };

  return (
    <PosterDialogFrame label="封面记忆" onClose={onClose} backdropClassName="fixed inset-0 z-[120] bg-[#101014] text-white" className="flex h-full w-full flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5" aria-label="返回封面"><ArrowLeft className="h-4 w-4" /></button>
          <span className="text-sm font-black">封面记忆</span>
          <div className="relative">
            <button type="button" onClick={() => setHelpOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5" aria-label="封面记忆说明"><CircleHelp className="h-4 w-4" /></button>
            {helpOpen && (
              <div className="absolute left-0 top-11 z-30 w-80 rounded-2xl border border-white/10 bg-[#1b1b1e] p-4 text-xs leading-5 text-slate-200 shadow-2xl">
                <p className="font-bold">生成封面时会用到这里的已采纳记忆。</p>
                <p className="mt-2">把封面投喂给右下角的小怪兽，一次一张，逐张保留自己的特点。生成时只用全局纠正和其中一张已采纳样张。待确认的条目不会进入生成。采纳与纠正会保存经验版本，成图反馈帮助后续选样。这是经验库的持续积累；模型和内置 Skill 文件不会自行训练或改写。</p>
              </div>
            )}
          </div>
          {feeding && <span className="text-xs text-amber-200">反推中</span>}
        </div>
        <div className="flex items-center gap-2">
          {([['branches', '分支'], ['samples', '样张'], ['versions', '版本']] as const).map(([id, label]) => <button type="button" key={id} onClick={() => setView(id)} className={`h-9 rounded-xl border px-3 text-xs font-bold ${view === id ? 'border-amber-400 text-amber-200' : 'border-white/10 bg-white/5'}`}>{label}</button>)}
          <button type="button" onClick={onRefresh} disabled={busy} className="h-9 rounded-xl border border-white/10 px-3 disabled:opacity-40" aria-label="刷新封面记忆"><RefreshCw className="h-4 w-4" /></button>
          <button type="button" onClick={() => setAuditOpen((value) => !value)} className={`flex h-9 w-9 items-center justify-center rounded-xl border ${auditOpen ? 'border-amber-400 text-amber-200' : 'border-white/10'} bg-white/5`} aria-label="引用记录"><List className="h-4 w-4" /></button>
        </div>
      </header>
      {error && <p className="px-4 text-xs text-rose-300">{error}</p>}
      <main className="relative min-h-0 flex-1">
        {view === 'versions' ? <CoverExperienceVersions revisions={memory.revisions} busy={busy} onRestore={onRestoreRevision} /> : view === 'samples' ? (
          <CoverSampleMemoryList samples={memory.samples} entries={memory.entries} busy={busy} onSetStatus={onSetStatus} onRetry={onRetry} />
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
            onSaveFeedback={onSaveFeedback}
          />
        )}
      </main>

    </PosterDialogFrame>
  );
}
