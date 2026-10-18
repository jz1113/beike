import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { usePptStore } from '../store/usePptStore';

export const PptOutlineStage: React.FC = () => {
  const {
    outlinePages,
    updateOutlinePages,
    generateOutline,
    isGeneratingOutline,
    generateDetails,
    isGeneratingDetail,
    setStage,
  } = usePptStore();

  const [vibeInput, setVibeInput] = useState('');

  const handleTitleChange = (idx: number, newTitle: string) => {
    const next = [...outlinePages];
    next[idx] = { ...next[idx], title: newTitle, takeaway: newTitle };
    updateOutlinePages(next);
  };

  const handlePointChange = (pageIdx: number, pointIdx: number, text: string) => {
    const next = [...outlinePages];
    const pts = [...next[pageIdx].points];
    pts[pointIdx] = text;
    next[pageIdx] = { ...next[pageIdx], points: pts };
    updateOutlinePages(next);
  };

  const handleAddPoint = (pageIdx: number) => {
    const next = [...outlinePages];
    next[pageIdx] = { ...next[pageIdx], points: [...next[pageIdx].points, '新支撑论据点'] };
    updateOutlinePages(next);
  };

  const handleRemovePoint = (pageIdx: number, pointIdx: number) => {
    const next = [...outlinePages];
    const pts = next[pageIdx].points.filter((_, i) => i !== pointIdx);
    next[pageIdx] = { ...next[pageIdx], points: pts };
    updateOutlinePages(next);
  };

  const handleAddPage = () => {
    const nextIdx = outlinePages.length + 1;
    const newPage = {
      pageIndex: nextIdx,
      title: '新论断页面：阐述核心战略价值',
      takeaway: '新论断页面：阐述核心战略价值',
      points: ['核心支撑数据', '行业实践对比'],
    };
    updateOutlinePages([...outlinePages, newPage]);
  };

  const handleDeletePage = (pageIdx: number) => {
    if (outlinePages.length <= 1) return;
    const next = outlinePages
      .filter((_, i) => i !== pageIdx)
      .map((p, i) => ({ ...p, pageIndex: i + 1 }));
    updateOutlinePages(next);
  };

  const handleSendVibe = () => {
    if (!vibeInput.trim() || isGeneratingOutline) return;
    generateOutline(vibeInput.trim());
    setVibeInput('');
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-transparent">
      {/* 左侧：大纲工作区 + Vibe 输入 */}
      <div className="w-full md:w-1/2 flex flex-col border-r border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-[#141417]/80 backdrop-blur-md">
        {/* 顶部操作区 */}
        <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>论断式大纲树</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-semibold">
                共 {outlinePages.length} 页
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">每页第一句为核心论断结论，下方为证据支撑</p>
          </div>
          <button
            type="button"
            onClick={handleAddPage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/15 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>添加页面</span>
          </button>
        </div>

        {/* 中间：可编辑大纲卡片流 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {outlinePages.map((page, pageIdx) => (
            <div
              key={page.pageIndex}
              className="group rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C21] p-3.5 shadow-xs transition-all hover:border-indigo-500/40"
            >
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-white/10 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {page.pageIndex}
                </span>

                <div className="flex-1 min-w-0 space-y-2">
                  {/* 标题（Takeaway） */}
                  <input
                    type="text"
                    value={page.title}
                    onChange={(e) => handleTitleChange(pageIdx, e.target.value)}
                    className="w-full font-bold text-sm text-slate-900 dark:text-white bg-transparent px-1.5 py-0.5 rounded hover:bg-slate-50 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-[#25252A] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />

                  {/* 要点列表 */}
                  <div className="space-y-1.5 pl-2 border-l-2 border-slate-100 dark:border-white/5">
                    {page.points.map((point, ptIdx) => (
                      <div key={ptIdx} className="flex items-center gap-2 group/pt">
                        <span className="text-slate-400 text-xs">•</span>
                        <input
                          type="text"
                          value={point}
                          onChange={(e) => handlePointChange(pageIdx, ptIdx, e.target.value)}
                          className="flex-1 text-xs text-slate-600 dark:text-slate-300 bg-transparent px-1 py-0.5 rounded hover:bg-slate-50 dark:hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePoint(pageIdx, ptIdx)}
                          className="opacity-0 group-hover/pt:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleAddPoint(pageIdx)}
                      className="text-[11px] text-indigo-500 hover:text-indigo-400 flex items-center gap-1 pt-0.5"
                    >
                      <Plus className="h-3 w-3" />
                      <span>添加支撑证据</span>
                    </button>
                  </div>
                </div>

                {outlinePages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDeletePage(pageIdx)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 底部：Vibe 口头修改对话栏 */}
        <div className="p-3 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-[#101014]/80">
          <div className="flex items-center gap-2 bg-white dark:bg-[#1E1E24] rounded-xl border border-slate-200 dark:border-white/10 p-1.5 shadow-xs">
            <Sparkles className="h-4 w-4 text-indigo-500 ml-2 shrink-0" />
            <input
              type="text"
              value={vibeInput}
              onChange={(e) => setVibeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendVibe()}
              placeholder="用自然语言口头调整大纲，例如：把第3页改成竞品横向对比..."
              className="flex-1 bg-transparent text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none px-2"
            />
            <button
              type="button"
              disabled={!vibeInput.trim() || isGeneratingOutline}
              onClick={handleSendVibe}
              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-all shadow-xs"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 右侧：16:9 幻灯片节奏预览大屏 */}
      <div className="w-full md:w-1/2 flex flex-col overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">幻灯片视觉脉络</span>
          <span className="text-xs text-slate-400">大纲确认后将一键推导逐页视觉排版</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {outlinePages.map((page) => (
            <div
              key={page.pageIndex}
              className="aspect-[16/9] rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1A1F] p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-bold">
                    PAGE {page.pageIndex}
                  </span>
                  {page.pageIndex === 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                      封面
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">
                  {page.title}
                </h3>
              </div>

              <div className="space-y-1">
                {page.points.slice(0, 2).map((pt, i) => (
                  <p key={i} className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    • {pt}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部向导切换按钮 */}
        <div className="pt-6 mt-auto flex items-center justify-between border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setStage('input')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>返回灵感设定</span>
          </button>

          <button
            type="button"
            disabled={isGeneratingDetail}
            onClick={() => generateDetails()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
          >
            {isGeneratingDetail ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在细化页面描述...</span>
              </>
            ) : (
              <>
                <span>下一步：细化页面编排</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
