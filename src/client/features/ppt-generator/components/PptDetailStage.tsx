import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  FileEdit,
  Layout,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { usePptStore } from '../store/usePptStore';

export const PptDetailStage: React.FC = () => {
  const {
    pages,
    updatePageDetail,
    generateAllSlides,
    isGeneratingSlides,
    setStage,
  } = usePptStore();

  const [activePageIdx, setActivePageIdx] = useState(1);
  const activePage = pages.find((p) => p.pageIndex === activePageIdx) || pages[0];

  if (!activePage) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-transparent">
      {/* 左侧：页面导航栏 */}
      <div className="w-full md:w-72 shrink-0 border-r border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-[#141417]/80 backdrop-blur-md flex flex-col">
        <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">幻灯片分页列表</h2>
          <span className="text-xs text-slate-400 font-mono">{pages.length} PAGES</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {pages.map((p) => {
            const isSelected = p.pageIndex === activePageIdx;
            return (
              <button
                key={p.pageIndex}
                type="button"
                onClick={() => setActivePageIdx(p.pageIndex)}
                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 ${
                  isSelected
                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-500/30 dark:text-indigo-200 shadow-xs'
                    : 'hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                  isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-500'
                }`}>
                  {p.pageIndex}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{p.title}</p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {p.detail.layoutEmphasis || '标准构图排版'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 右侧：单页字段严格解耦编辑区 */}
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded font-bold bg-indigo-500/10 text-indigo-500">
                第 {activePage.pageIndex} 页
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {activePage.title}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              文字、素材、版式与口播彻底解耦；页面文字将被直接渲染到最终幻灯片画面中
            </p>
          </div>
        </div>

        {/* 字段 1：页面文字（逐字渲染） */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-[#16161A]/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-indigo-500 font-semibold text-xs uppercase tracking-wider">
            <FileEdit className="h-4 w-4" />
            <span>页面文字（逐字渲染在 PPT 画面上）</span>
          </div>
          <textarea
            rows={5}
            value={activePage.detail.contentText}
            onChange={(e) => updatePageDetail(activePage.pageIndex, { contentText: e.target.value })}
            placeholder="支持 Markdown 格式直接书写正文、数据点或公式..."
            className="w-full resize-none font-mono text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1E24] p-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* 字段 2：版式与视觉重点 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-[#16161A]/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-amber-500 font-semibold text-xs uppercase tracking-wider">
              <Layout className="h-4 w-4" />
              <span>版式结构与视觉重心</span>
            </div>
            <textarea
              rows={3}
              value={activePage.detail.layoutEmphasis || ''}
              onChange={(e) => updatePageDetail(activePage.pageIndex, { layoutEmphasis: e.target.value })}
              placeholder="例如：左文右图卡片结构，第一眼聚焦左侧大数字，右侧图表作为呼应..."
              className="w-full resize-none text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1E24] p-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-[#16161A]/80 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-emerald-500 font-semibold text-xs uppercase tracking-wider">
              <Eye className="h-4 w-4" />
              <span>配图需求与素材指定</span>
            </div>
            <textarea
              rows={3}
              value={activePage.detail.visualAssets || ''}
              onChange={(e) => updatePageDetail(activePage.pageIndex, { visualAssets: e.target.value })}
              placeholder="例如：科技感折线图展现年化增长 80%，无杂乱背景..."
              className="w-full resize-none text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1E24] p-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* 字段 3：演讲者备注 */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-[#16161A]/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-slate-500 font-semibold text-xs uppercase tracking-wider dark:text-slate-400">
            <MessageSquare className="h-4 w-4" />
            <span>演讲者备注（仅供现场口播参考，不渲染到画面中）</span>
          </div>
          <input
            type="text"
            value={activePage.detail.speakerNotes || ''}
            onChange={(e) => updatePageDetail(activePage.pageIndex, { speakerNotes: e.target.value })}
            placeholder="演讲要点、逻辑过渡与展开案例..."
            className="w-full text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E1E24] px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>

        {/* 底部导航切换按钮 */}
        <div className="pt-4 mt-auto flex items-center justify-between border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setStage('outline')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>返回大纲调整</span>
          </button>

          <button
            type="button"
            disabled={isGeneratingSlides}
            onClick={() => generateAllSlides()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>开始全量幻灯片渲染</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
