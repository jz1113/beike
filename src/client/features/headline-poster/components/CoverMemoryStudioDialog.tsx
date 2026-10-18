import { useState, useEffect } from 'react';
import { ArrowLeft, BrainCircuit, History, Layers, Loader2, X } from 'lucide-react';
import { CoverMemoryGraphCanvas } from './memory/CoverMemoryGraphCanvas';
import { CoverMemoryAuditDrawer } from './memory/CoverMemoryAuditDrawer';
import { CoverMultiImageBatchUploader } from './memory/CoverMultiImageBatchUploader';
import { CoverBranchDetailPopover } from './memory/CoverBranchDetailPopover';
import { deconstructQueue, type DeconstructTask } from '../model/coverDeconstructQueue';
import { assimilateOrDraftStyle } from '../model/coverSkillCompiler';
import {
  addStyleCorrection,
  deleteStyleCorrection,
  getAllCoverStyles,
  getStyleCorrections,
  setActiveCoverStyleId,
} from '../model/coverMemoryStorage';
import type { CoverStyleSkill, CoverCorrection } from '../model/coverSkillTypes';

interface Props {
  activeStyleId: string;
  onSelectStyle: (styleId: string) => void;
  onClose: () => void;
}

export function CoverMemoryStudioDialog({ activeStyleId, onSelectStyle, onClose }: Props) {
  const [styles, setStyles] = useState<CoverStyleSkill[]>(() => getAllCoverStyles());
  const [corrections, setCorrections] = useState<CoverCorrection[]>(() => getStyleCorrections(activeStyleId));
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [queueTasks, setQueueTasks] = useState<DeconstructTask[]>([]);

  // 监听后台反推队列
  useEffect(() => {
    const unsubscribe = deconstructQueue.subscribe((tasks) => {
      setQueueTasks(tasks);
      // 检查最新完成的任务，执行自动聚类沉淀
      const latestCompleted = tasks.find((t) => t.status === 'completed' && t.result);
      if (latestCompleted?.result) {
        assimilateOrDraftStyle(latestCompleted.result);
        setStyles(getAllCoverStyles());
      }
    });
    return unsubscribe;
  }, []);

  const activeStyle = styles.find((s) => s.id === activeStyleId) || styles[0];

  const handleSelectStyle = (id: string) => {
    setActiveCoverStyleId(id);
    onSelectStyle(id);
    setCorrections(getStyleCorrections(id));
  };

  const handleAddCorrection = (rule: string) => {
    addStyleCorrection({
      id: 'corr-' + Date.now(),
      styleId: activeStyle.id,
      negativeRule: rule,
      reason: '人工避坑添加',
      createdAt: Date.now(),
    });
    setCorrections(getStyleCorrections(activeStyle.id));
  };

  const handleDeleteCorrection = (id: string) => {
    deleteStyleCorrection(id);
    setCorrections(getStyleCorrections(activeStyle.id));
  };

  const runningCount = queueTasks.filter((t) => t.status === 'running' || t.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#FDFBF7] dark:bg-[#121214] text-slate-900 dark:text-white animate-fade-in select-none">
      {/* 顶部极简图谱工具栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-white/10 px-5 bg-white/80 dark:bg-[#161619]/80 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            title="返回封面工作台"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <BrainCircuit className="h-4 w-4" />
            </div>
            <span className="text-sm font-black tracking-tight">封面记忆图谱</span>
          </div>

          {/* 切换风格下拉 */}
          <div className="ml-3 flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-1">
            <span className="text-[11px] text-slate-400 font-medium">聚焦风格:</span>
            <select
              value={activeStyle.id}
              onChange={(e) => handleSelectStyle(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            >
              {styles.map((s) => (
                <option key={s.id} value={s.id} className="bg-white dark:bg-[#1C1C20]">
                  {s.name} ({s.badge})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 右侧动作按钮组 */}
        <div className="flex items-center gap-2.5">
          {runningCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>后台反推中 ({runningCount})</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsUploaderOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition-all"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>投喂样张群组</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAuditDrawerOpen(!isAuditDrawerOpen)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${isAuditDrawerOpen ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}
          >
            <History className="h-3.5 w-3.5" />
            <span>记忆审计</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* 主体图谱画布区 */}
      <main className="relative flex-1 overflow-hidden">
        <CoverMemoryGraphCanvas
          activeStyle={activeStyle}
          corrections={corrections}
          selectedBranch={selectedBranch}
          onSelectBranch={(branchKey) => {
            setSelectedBranch(selectedBranch === branchKey ? null : branchKey);
          }}
        />

        {/* 选定分支浮动详情 */}
        <CoverBranchDetailPopover
          branchKey={selectedBranch}
          activeStyle={activeStyle}
          corrections={corrections}
          onClose={() => setSelectedBranch(null)}
          onAddCorrection={handleAddCorrection}
          onDeleteCorrection={handleDeleteCorrection}
        />

        {/* 右侧记忆审计抽屉 */}
        <CoverMemoryAuditDrawer
          isOpen={isAuditDrawerOpen}
          onClose={() => setIsAuditDrawerOpen(false)}
        />
      </main>

      {/* 多图群组投喂模态弹窗 */}
      <CoverMultiImageBatchUploader
        isOpen={isUploaderOpen}
        onClose={() => {
          setIsUploaderOpen(false);
          setStyles(getAllCoverStyles());
        }}
      />
    </div>
  );
}
