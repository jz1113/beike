import { Search, RefreshCw, Activity } from 'lucide-react';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { UsageSummary } from '@client/shared/utils/usageTracker';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import { formatUsageCost } from '../model/usageFormatting';

interface UsageModelBreakdownProps {
  usageSummary: UsageSummary;
  usageModelSearch: string;
  setUsageModelSearch: (value: string) => void;
  setUsageRefreshKey: Dispatch<SetStateAction<number>>;
  showToast: (message: string) => void;
}

export function UsageModelBreakdown({ usageSummary, usageModelSearch, setUsageModelSearch, setUsageRefreshKey, showToast }: UsageModelBreakdownProps) {
  // 模型明细排序：'calls' (按调用频次) | 'cost' (按预估算力)
  const [modelSortBy, setModelSortBy] = useState<'calls' | 'cost'>('calls');
  // 3. 模型明细排序处理
  const sortedModelBreakdown = useMemo(() => {
    return [...usageSummary.modelBreakdown].sort((a, b) => {
      if (modelSortBy === 'cost') {
        return b.costUsd - a.costUsd || b.calls - a.calls;
      }
      return b.calls - a.calls || b.costUsd - a.costUsd;
    });
  }, [usageSummary.modelBreakdown, modelSortBy]);

  const visibleModelBreakdown = useMemo(() => {
    const query = usageModelSearch.trim().toLowerCase();
    return sortedModelBreakdown.filter((item) => !query || [item.name, item.id, item.vendor].some(value => value.toLowerCase().includes(query)));
  }, [sortedModelBreakdown, usageModelSearch]);
  const visibleTotals = visibleModelBreakdown.reduce((total, model) => ({
    calls: total.calls + model.calls, tokens: total.tokens + model.totalTokens,
    media: total.media + model.mediaCount, cost: total.cost + model.costUsd, rmb: total.rmb + model.costRmb,
  }), { calls: 0, tokens: 0, media: 0, cost: 0, rmb: 0 });

  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">模型用量</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            各模型的调用、产出与预估费用
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 排序切换 */}
          <div className="flex items-center bg-[#F3F4F6] p-0.5 rounded-lg border border-slate-200/80 text-[11px] font-semibold text-slate-600">
            <button
              type="button"
              aria-pressed={modelSortBy === 'calls'} onClick={() => setModelSortBy('calls')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                modelSortBy === 'calls' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              按频次
            </button>
            <button
              type="button"
              aria-pressed={modelSortBy === 'cost'} onClick={() => setModelSortBy('cost')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                modelSortBy === 'cost' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              按算力
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={usageModelSearch}
              onChange={e => setUsageModelSearch(e.target.value)}
              aria-label="搜索模型名称、ID 或厂商" placeholder="搜索名称、ID 或厂商"
              className="pl-8.5 pr-3 py-1.5 rounded-xl bg-[#F3F4F6] text-xs text-slate-800 placeholder-slate-400 outline-none border border-transparent focus:border-slate-300 focus:bg-white transition-all shadow-2xs"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setUsageRefreshKey(k => k + 1);
              showToast('✅ 已重新刷新历史用量统计！');
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            aria-label="刷新统计数据" title="刷新统计数据"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>刷新</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200/80 rounded-xl divide-y divide-slate-100">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F8FAFC] text-slate-500 font-semibold">
            <tr>
              <th scope="col" className="py-2.5 px-3.5">模型名称 / ID</th>
              <th scope="col" className="py-2.5 px-3">所属厂商</th>
              <th scope="col" className="py-2.5 px-3">调用次数</th>
              <th scope="col" className="py-2.5 px-3">Token 消耗 (输入/输出)</th>
              <th scope="col" className="py-2.5 px-3 text-right">生图/视频产出</th>
              <th scope="col" className="py-2.5 px-3.5 text-right">预估消耗算力</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {visibleModelBreakdown.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Activity className="w-7 h-7 text-slate-300 stroke-[1.5]" />
                    <span className="font-semibold text-slate-700">{usageModelSearch.trim() ? '没有匹配的模型用量' : '暂无调用记录'}</span>
                    <span className="text-slate-400 text-[11px] max-w-md leading-relaxed">
                      {usageModelSearch.trim() ? '请调整搜索词，支持按模型名称、ID 和厂商搜索。' : '使用图片生成、视频生成或 AI 对话后，这里会显示调用统计。'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              visibleModelBreakdown
                .map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                          {getModelIcon(row.id, "w-4 h-4")}
                        </div>
                        <span>{row.name}<span className="block font-mono text-[10px] font-normal text-slate-500">{row.id}</span></span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-600">{row.vendor}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{row.calls} 次</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {row.totalTokens > 0 ? `${row.tokensIn.toLocaleString()} / ${row.tokensOut.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-indigo-600 font-semibold text-right">
                      {row.mediaCount > 0 && (row.type === 'image' || row.type === 'video') ? `${row.mediaCount} ${row.type === 'video' ? '段' : '张'}` : '-'}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono font-bold text-emerald-600 text-right">
                      {row.costUsd > 0 ? `${formatUsageCost(row.costUsd)} 算力` : '0.00 算力'}
                      <span className="text-[10px] text-slate-400 font-normal block sm:inline sm:ml-1">
                        (¥{formatUsageCost(row.costRmb)})
                      </span>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
          {visibleModelBreakdown.length > 0 && (
            <tfoot className="bg-[#F8FAFC] font-bold text-slate-800 border-t border-slate-200">
              <tr>
                <td className="py-2.5 px-3.5" colSpan={2}>{usageModelSearch.trim() ? '当前筛选合计' : '合计调用与产出'}</td>
                <td className="py-2.5 px-3 font-mono text-slate-900">{visibleTotals.calls} 次</td>
                <td className="py-2.5 px-3 font-mono text-slate-900">
                  {visibleTotals.tokens.toLocaleString() + ' Tokens'}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-indigo-600 text-sm">
                  {visibleTotals.media} 张/段
                </td>
                <td className="py-2.5 px-3.5 text-right font-mono text-emerald-600 text-sm font-black">
                  {formatUsageCost(visibleTotals.cost)} 算力
                  <span className="text-[10px] text-slate-400 font-normal block sm:inline sm:ml-1">
                    (¥{formatUsageCost(visibleTotals.rmb)})
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
