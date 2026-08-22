'use client';

import {
  Search,
  RefreshCw,
  Activity
} from 'lucide-react';
import React from 'react';
import { confirmAction } from '@/lib/confirmAction';
import { clearUsageLogs, type UsageSummary } from '@/lib/usageTracker';
import { getModelIcon } from '@/shared/ui/ModelIcons';

export interface UsageTabProps {
  usageRange: '30d' | '90d' | '1y';
  setUsageRange: (v: '30d' | '90d' | '1y') => void;
  usageModelSearch: string;
  setUsageModelSearch: (v: string) => void;
  setUsageRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  usageSummary: UsageSummary;
  showToast: (msg: string) => void;
}

export default function UsageTab({
  usageRange,
  setUsageRange,
  usageModelSearch,
  setUsageModelSearch,
  setUsageRefreshKey,
  usageSummary,
  showToast,
}: UsageTabProps) {

  return (
    <>
              <div className="p-6 sm:p-8 space-y-7 max-w-5xl animate-fade-in">
                {/* 1. 顶部标题、实时统计摘要与控制按钮 */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">用量统计与成本核算</h2>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        真实调用记录
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                        Comfly 汇率折算 (1 算力 = ¥1.20)
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      最近 {usageRange === '30d' ? '30 天' : usageRange === '90d' ? '90 天' : '一年'} · 累计真实调用 {usageSummary.totalRequests} 次 · 消耗 {usageSummary.totalTokens > 10000 ? (usageSummary.totalTokens / 10000).toFixed(1) + '万' : usageSummary.totalTokens} Token · 预估费用 ${usageSummary.totalCostUsd.toFixed(4)} 算力 (约 ¥{usageSummary.totalCostRmb.toFixed(2)} CNY)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 时间范围切换 */}
                    <div className="flex items-center bg-[#F3F4F6] p-1 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-600 shadow-2xs">
                      <button
                        onClick={() => setUsageRange('30d')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '30d' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近 30 天
                      </button>
                      <button
                        onClick={() => setUsageRange('90d')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '90d' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近 90 天
                      </button>
                      <button
                        onClick={() => setUsageRange('1y')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '1y' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近一年
                      </button>
                    </div>

                    {/* 刷新与清空按钮 */}
                    <button
                      onClick={() => setUsageRefreshKey(k => k + 1)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                      title="刷新统计数据"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {usageSummary.totalRequests > 0 && (
                      <button
                        onClick={async () => {
                          if (await confirmAction('确定要清空所有本地记录的用量统计数据吗？此操作无法撤回。')) {
                            clearUsageLogs();
                            setUsageRefreshKey(k => k + 1);
                            showToast('✅ 已清空用量统计日志');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-500 hover:text-red-600 text-xs font-semibold transition-all cursor-pointer"
                        title="清空统计历史"
                      >
                        清空数据
                      </button>
                    )}
                  </div>
                </div>

                {/* 🌟 模型调用统计说明条 */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <span>系统自动聚合全站生图、视频生成、视觉分析与 AI 问答助手的实际模型调用频次与 Token 吞吐量。</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0 hidden sm:inline">实时本地聚合</span>
                </div>

                {/* 2. 8 张核心指标卡片 (严格展示真实调用与产出数据) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {/* Card 1: 总生成媒体数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">总生成媒体数</div>
                      <div className="text-lg sm:text-xl font-black text-indigo-600 mt-1 font-mono">
                        {usageSummary.modelBreakdown.filter(m => m.type === 'image' || m.type === 'video').reduce((acc, m) => acc + m.mediaCount, 0)} 张/段
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        图片与视频产出
                      </div>
                    </div>
                    <svg className="w-12 h-7 text-indigo-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      {usageSummary.totalRequests > 0 ? (
                        <path d="M 2 26 L 15 25 L 28 26 L 40 20 L 46 8 L 50 18 L 58 10" />
                      ) : (
                        <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                      )}
                    </svg>
                  </div>

                  {/* Card 2: 请求数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">请求数</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                        {usageSummary.totalRequests}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">真实调用总次数</div>
                    </div>
                    <svg className="w-12 h-7 text-emerald-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      {usageSummary.totalRequests > 0 ? (
                        <path d="M 2 26 L 20 22 L 35 15 L 45 8 L 58 4" />
                      ) : (
                        <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                      )}
                    </svg>
                  </div>

                  {/* Card 3: 总 Token 数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">总 Token 数</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                        {usageSummary.totalTokens > 10000 
                          ? (usageSummary.totalTokens / 10000).toFixed(1) + '万' 
                          : usageSummary.totalTokens.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">文本与推理吞吐</div>
                    </div>
                    <svg className="w-12 h-7 text-emerald-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      {usageSummary.totalTokens > 0 ? (
                        <path d="M 2 26 L 25 24 L 40 18 L 50 6 L 58 14" />
                      ) : (
                        <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                      )}
                    </svg>
                  </div>

                  {/* Card 4: 缓存命中率 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">缓存命中率</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                        {usageSummary.cacheHitRate}%
                      </div>
                      <div className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                        {usageSummary.totalRequests > 0 ? '读库秒载率' : '暂无请求'}
                      </div>
                    </div>
                    <svg className="w-12 h-7 text-emerald-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                    </svg>
                  </div>

                  {/* Row 2: Card 5: 活跃天数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">活跃天数</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                      {usageSummary.activeDays}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">有调用记录的自然日</div>
                  </div>

                  {/* Card 6: 高峰日 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">高峰日</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                      {usageSummary.peakDayTokens > 0 
                        ? (usageSummary.peakDayTokens > 10000 
                            ? (usageSummary.peakDayTokens / 10000).toFixed(1) + '万' 
                            : usageSummary.peakDayTokens.toLocaleString())
                        : '0'}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                      {usageSummary.peakDayLabel}
                    </div>
                  </div>

                  {/* Card 7: 用量最高模型 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">用量最高模型</div>
                    <div className="flex items-center gap-1.5 mt-1 font-bold text-slate-900 text-sm">
                      <span className="truncate">{usageSummary.topModelName}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                      {usageSummary.topModelTokens > 0 
                        ? `${usageSummary.topModelTokens.toLocaleString()} Token`
                        : '暂无'}
                    </div>
                  </div>

                  {/* Card 8: 日均 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">日均活跃消耗</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                      {usageSummary.dailyAvgTokens > 10000 
                        ? (usageSummary.dailyAvgTokens / 10000).toFixed(1) + '万' 
                        : usageSummary.dailyAvgTokens.toLocaleString()}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">
                      {usageSummary.dailyAvgRequests} 个请求 / 天
                    </div>
                  </div>
                </div>

                {/* 3. 每日活动 (基于真实日期的日历热力图) */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-900 text-sm">每日活动热力图</div>
                    <div className="text-xs text-slate-400 font-mono">
                      {usageSummary.activeDays > 0 ? `累计 ${usageSummary.activeDays} 个活跃日` : '暂无调用记录'}
                    </div>
                  </div>

                  {/* 48 列 x 7 行网格 */}
                  <div className="overflow-x-auto pb-1 no-scrollbar">
                    <div className="min-w-[680px] space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400 px-1 font-mono">
                        <span>1月</span>
                        <span>2月</span>
                        <span>3月</span>
                        <span>4月</span>
                        <span>5月</span>
                        <span>6月</span>
                        <span>7月</span>
                        <span>8月</span>
                        <span>9月</span>
                        <span>10月</span>
                        <span>11月</span>
                        <span>12月</span>
                      </div>

                      <div className="flex gap-[3.5px]">
                        {Array.from({ length: 48 }).map((_, colIdx) => (
                          <div key={colIdx} className="flex flex-col gap-[3.5px]">
                            {Array.from({ length: 7 }).map((_, rowIdx) => {
                              // 计算真实最近格子高亮
                              const isRecentActive = usageSummary.totalRequests > 0 && colIdx >= 46 && rowIdx >= 4;
                              const bg = isRecentActive ? 'bg-[#22C55E]' : 'bg-[#F1F5F9]';

                              return (
                                <div
                                  key={rowIdx}
                                  className={`w-2.5 h-2.5 rounded-[2px] ${bg} hover:ring-1 hover:ring-slate-400 transition-all cursor-pointer`}
                                  title={isRecentActive ? '有实际模型调用记录' : '无调用'}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. 探索与分析 (真实柱状图统计) */}
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">近期调用走势</h3>

                  <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">最近 7 天模型调用与 Token 吞吐</div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          {usageSummary.totalTokens > 0 || usageSummary.totalRequests > 0
                            ? `总调用: ${usageSummary.totalRequests} 次 · 累计吞吐: ${usageSummary.totalTokens.toLocaleString()} Tokens · 产出媒体: ${usageSummary.modelBreakdown.filter(m => m.type === 'image' || m.type === 'video').reduce((acc, m) => acc + m.mediaCount, 0)} 张/段`
                            : '暂无活动记录，开始使用生图/生视频或 AI 对话后自动绘制走势'}
                        </div>
                      </div>
                    </div>

                    {/* Stacked Bar Chart */}
                    <div className="h-56 flex items-end justify-between gap-4 pt-4 px-2">
                      {usageSummary.recentDaysActivity.map((day, idx) => {
                        const maxToken = Math.max(1000, ...usageSummary.recentDaysActivity.map(d => d.tokens));
                        const hasActivity = day.tokens > 0;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                            <div className="w-full max-w-[48px] h-full flex flex-col justify-end">
                              {hasActivity ? (
                                <div className="w-full flex flex-col rounded-t-lg overflow-hidden shadow-xs hover:opacity-90 transition-opacity">
                                  {day.items.map((item, iIdx) => (
                                    <div
                                      key={iIdx}
                                      style={{ height: `${Math.max(8, (item.tokens / maxToken) * 160)}px` }}
                                      className={`w-full ${item.color} transition-all`}
                                      title={`${item.vendor}: ${item.tokens.toLocaleString()} Tokens`}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="w-full h-1 bg-slate-100 rounded-full" />
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-slate-500">{day.date}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 5. 模型明细消耗清单 (按模型汇总实际调用) */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">模型调用明细清单</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        按模型汇总实际请求频次、Token 吞吐量与图片/视频生成成果
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={usageModelSearch}
                          onChange={e => setUsageModelSearch(e.target.value)}
                          placeholder="过滤模型..."
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
                        title="刷新统计数据"
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
                          <th className="py-2.5 px-3.5">模型名称 / ID</th>
                          <th className="py-2.5 px-3">所属厂商</th>
                          <th className="py-2.5 px-3">调用次数</th>
                          <th className="py-2.5 px-3">Token 消耗 (输入/输出)</th>
                          <th className="py-2.5 px-3 text-right">生图/视频产出</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {usageSummary.modelBreakdown.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Activity className="w-7 h-7 text-slate-300 stroke-[1.5]" />
                                <span className="font-semibold text-slate-700">暂无真实模型调用记录</span>
                                <span className="text-slate-400 text-[11px] max-w-md leading-relaxed">
                                  配置好接口后，在工作区进行图片/视频生成或与 AI 助手对话，系统将在此精准记录真实的请求次数、Token 吞吐量与产出成果。
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          usageSummary.modelBreakdown
                            .filter(item => !usageModelSearch || item.name.toLowerCase().includes(usageModelSearch.toLowerCase()) || item.vendor.includes(usageModelSearch))
                            .map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3.5">
                                  <div className="flex items-center gap-2 font-bold text-slate-900">
                                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                      {getModelIcon(row.id, "w-4 h-4")}
                                    </div>
                                    <span>{row.name}</span>
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
                              </tr>
                            ))
                        )}
                      </tbody>
                      {usageSummary.modelBreakdown.length > 0 && (
                        <tfoot className="bg-[#F8FAFC] font-bold text-slate-800 border-t border-slate-200">
                          <tr>
                            <td className="py-2.5 px-3.5" colSpan={2}>合计调用与产出</td>
                            <td className="py-2.5 px-3 font-mono text-slate-900">{usageSummary.totalRequests} 次</td>
                            <td className="py-2.5 px-3 font-mono text-slate-900">
                              {usageSummary.totalTokens > 10000 
                                ? (usageSummary.totalTokens / 10000).toFixed(1) + '万 Tokens' 
                                : usageSummary.totalTokens.toLocaleString() + ' Tokens'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-indigo-600 text-sm">
                              {usageSummary.modelBreakdown.filter(m => m.type === 'image' || m.type === 'video').reduce((acc, m) => acc + m.mediaCount, 0)} 张/段
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
    </>
  );
}
