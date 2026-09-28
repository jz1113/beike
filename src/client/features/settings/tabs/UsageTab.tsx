import { Search, RefreshCw, Activity, Download, FileSpreadsheet, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { getUsageLogs, clearUsageLogs, type UsageSummary } from '@client/shared/utils/usageTracker';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import GatewayBalanceCard from '../components/GatewayBalanceCard';
import { UsageHeatmapPanel } from './UsageHeatmapPanel';
import { type GatewayUserInfo } from '../hooks/useGatewayUser';

export interface UsageTabProps {
  usageRange: '30d' | '90d' | '1y';
  setUsageRange: (v: '30d' | '90d' | '1y') => void;
  usageModelSearch: string;
  setUsageModelSearch: (v: string) => void;
  setUsageRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  usageSummary: UsageSummary;
  showToast: (msg: string) => void;
  // 网关账户与实时余额看板相关参数
  gatewayUserId?: string;
  gatewaySystemToken?: string;
  gatewayUserInfo?: GatewayUserInfo | null;
  isGatewayLoading?: boolean;
  isGatewayConfigured?: boolean;
  isGatewayLowBalance?: boolean;
  gatewayLastUpdated?: string | null;
  gatewayError?: string | null;
  onRefreshGatewayUser?: (silent?: boolean) => Promise<boolean>;
  onSaveGatewayCredentials?: (id: string, token: string) => Promise<boolean>;
  onClearGatewayCredentials?: () => Promise<void>;
}

export default function UsageTab({
  usageRange,
  setUsageRange,
  usageModelSearch,
  setUsageModelSearch,
  setUsageRefreshKey,
  usageSummary,
  showToast,
  gatewayUserId = '',
  gatewaySystemToken = '',
  gatewayUserInfo = null,
  isGatewayLoading = false,
  isGatewayConfigured = false,
  isGatewayLowBalance = false,
  gatewayLastUpdated = null,
  gatewayError = null,
  onRefreshGatewayUser,
  onSaveGatewayCredentials,
  onClearGatewayCredentials,
}: UsageTabProps) {
  // 模型明细排序：'calls' (按调用频次) | 'cost' (按预估算力)
  const [modelSortBy, setModelSortBy] = useState<'calls' | 'cost'>('calls');
  // 调用记录展开状态
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  // 流水类型过滤
  const [auditFilterType, setAuditFilterType] = useState<string>('all');
  // 流水展示条数
  const [auditDisplayCount, setAuditDisplayCount] = useState(30);

  // 1. 获取本地记录的真实调用明细流水 (按时间倒序)
  const allLogs = getUsageLogs();

  // 2. 导出 CSV 功能 (带 UTF-8 BOM，防止 Excel 中文乱码)
  const handleExportCsv = () => {
    if (!allLogs || allLogs.length === 0) {
      showToast('暂无可用调用日志供导出');
      return;
    }
    const headers = ['记录编号', '调用时间', '模型名称', '模型ID', '所属厂商', '业务类型', '输入Token', '输出Token', '总Token', '产出媒体数', '预估算力', '折算人民币(元)', '调用结果'];
    const typeLabels: Record<string, string> = {
      image: '图片生成',
      video: '视频生成',
      chat: 'AI对话问答',
      vision: '视觉分析',
      distill: '模型提炼'
    };
    const rows = allLogs.map((l, index) => [
      `#${index + 1}`,
      new Date(l.timestamp).toLocaleString('zh-CN'),
      `"${(l.modelName || l.modelId).replace(/"/g, '""')}"`,
      `"${l.modelId.replace(/"/g, '""')}"`,
      `"${(l.provider || 'Comfly 网关').replace(/"/g, '""')}"`,
      typeLabels[l.type] || l.type,
      l.promptTokens || 0,
      l.completionTokens || 0,
      l.totalTokens || 0,
      l.mediaCount || 0,
      l.costUsd.toFixed(2),
      l.costRmb.toFixed(2),
      l.success ? '成功' : '失败'
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beike_usage_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ 已导出全量调用记录审计 CSV');
  };

  // 3. 模型明细排序处理
  const sortedModelBreakdown = useMemo(() => {
    return [...usageSummary.modelBreakdown].sort((a, b) => {
      if (modelSortBy === 'cost') {
        return b.costUsd - a.costUsd || b.calls - a.calls;
      }
      return b.calls - a.calls || b.costUsd - a.costUsd;
    });
  }, [usageSummary.modelBreakdown, modelSortBy]);

  return (
    <>
      <div className="settings-usage space-y-6 animate-fade-in">
                {/* 1. 顶部标题、实时统计摘要与控制按钮 */}
                <div className="settings-usage-toolbar">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">使用概览</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">本机调用记录与预估费用</p>
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

                    {/* 导出记录 按钮 */}
                    {allLogs.length > 0 && (
                      <button
                        onClick={handleExportCsv}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200/80 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                        title="导出全量调用明细记录为 CSV 表格进行财务级对账"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>导出记录</span>
                      </button>
                    )}

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

        {/* 🌟 0. 网关账户与实时余额全景看板 */}
        {onRefreshGatewayUser && onSaveGatewayCredentials && onClearGatewayCredentials && (
          <GatewayBalanceCard
            userId={gatewayUserId}
            systemToken={gatewaySystemToken}
            userInfo={gatewayUserInfo}
            isLoading={isGatewayLoading}
            isConfigured={isGatewayConfigured}
            isLowBalance={isGatewayLowBalance}
            lastUpdated={gatewayLastUpdated}
            error={gatewayError}
            onRefresh={onRefreshGatewayUser}
            onSaveCredentials={onSaveGatewayCredentials}
            onClearCredentials={onClearGatewayCredentials}
            showToast={showToast}
          />
        )}
                <div className="settings-usage-metrics">
                  {[
                    { label: '调用次数', value: usageSummary.totalRequests.toLocaleString(), unit: '次' },
                    { label: '预估费用', value: `¥${usageSummary.totalCostRmb.toFixed(2)}`, unit: `${usageSummary.totalCostUsd.toFixed(2)} 算力` },
                    { label: 'Token 用量', value: usageSummary.totalTokens.toLocaleString(), unit: 'tokens' },
                    { label: '生成媒体', value: usageSummary.modelBreakdown.filter(m => m.type === 'image' || m.type === 'video').reduce((sum, m) => sum + m.mediaCount, 0).toLocaleString(), unit: '张 / 段' },
                  ].map(metric => <div key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.unit}</span></div>)}
                </div>
                <details className="settings-usage-more"><summary>更多统计与计费说明</summary><div className="settings-usage-secondary">
                  <div><span>活跃天数</span><strong>{usageSummary.activeDays} 天</strong></div>
                  <div><span>缓存命中率</span><strong>{usageSummary.cacheHitRate}%</strong></div>
                  <div><span>日均调用 / Token</span><strong>{usageSummary.dailyAvgRequests} 次 / {usageSummary.dailyAvgTokens.toLocaleString()}</strong></div>
                  <div><span>高峰日 · {usageSummary.peakDayLabel}</span><strong>{usageSummary.peakDayTokens > 0 ? `${usageSummary.peakDayTokens.toLocaleString()} tokens` : `${usageSummary.peakDayRequests || 0} 次`}</strong></div>
                  <div><span>用量最高模型</span><strong>{usageSummary.topModelName || '暂无'}</strong><span>{usageSummary.topModelTokens.toLocaleString()} tokens</span></div>
                </div><p className="text-xs text-slate-500 leading-6 mt-4">本机统计与网关账户余额分别记录。预估费用按 1 算力 = ¥1.20 折算，实际扣费以渠道账单为准。</p></details>

                <UsageHeatmapPanel usageSummary={usageSummary} />

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
                      {(usageSummary.recentDaysActivity || []).map((day, idx) => {
                        const maxToken = Math.max(1000, ...(usageSummary.recentDaysActivity || []).map(d => d.tokens));
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
                      <h3 className="font-bold text-slate-900 text-sm">模型用量</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        各模型的调用、产出与预估费用
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* 排序切换 */}
                      <div className="flex items-center bg-[#F3F4F6] p-0.5 rounded-lg border border-slate-200/80 text-[11px] font-semibold text-slate-600">
                        <button
                          type="button"
                          onClick={() => setModelSortBy('calls')}
                          className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                            modelSortBy === 'calls' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                          }`}
                        >
                          按频次
                        </button>
                        <button
                          type="button"
                          onClick={() => setModelSortBy('cost')}
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
                          <th className="py-2.5 px-3.5 text-right">预估消耗算力</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {sortedModelBreakdown.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Activity className="w-7 h-7 text-slate-300 stroke-[1.5]" />
                                <span className="font-semibold text-slate-700">暂无调用记录</span>
                                <span className="text-slate-400 text-[11px] max-w-md leading-relaxed">
                                  使用图片生成、视频生成或 AI 对话后，这里会显示调用统计。
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          sortedModelBreakdown
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
                                <td className="py-2.5 px-3.5 font-mono font-bold text-emerald-600 text-right">
                                  {row.costUsd > 0 ? `${row.costUsd.toFixed(2)} 算力` : '0.00 算力'}
                                  <span className="text-[10px] text-slate-400 font-normal block sm:inline sm:ml-1">
                                    (¥{row.costRmb.toFixed(2)})
                                  </span>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                      {sortedModelBreakdown.length > 0 && (
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
                            <td className="py-2.5 px-3.5 text-right font-mono text-emerald-600 text-sm font-black">
                              {usageSummary.totalCostUsd.toFixed(2)} 算力
                              <span className="text-[10px] text-slate-400 font-normal block sm:inline sm:ml-1">
                                (¥{usageSummary.totalCostRmb.toFixed(2)})
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* 6. 🌟 实时调用审计流水 (逐笔透明对账抽屉) */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">调用记录</h3>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-semibold border border-slate-200">
                            共 {allLogs.length} 条本地流水
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          查看每次调用的模型、Token 用量与预估费用
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {allLogs.length > 0 && (
                        <button
                          type="button"
                          onClick={handleExportCsv}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          title="下载全部流水为 CSV 文件"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-600" />
                          <span>导出 CSV</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAuditLogs(prev => !prev)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      >
                        <span>{showAuditLogs ? '收起记录' : '展开记录'}</span>
                        {showAuditLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* 展开后的流水卡片 */}
                  {showAuditLogs && (
                    <div className="space-y-3 pt-2 border-t border-slate-100 animate-fade-in">
                      {/* 筛选小胶囊 */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <span className="text-[11px] text-slate-400">类型过滤:</span>
                          {[
                            { id: 'all', label: '全部' },
                            { id: 'image', label: '生图' },
                            { id: 'video', label: '生视频' },
                            { id: 'chat', label: 'AI 对话' },
                            { id: 'vision', label: '视觉分析' }
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setAuditFilterType(tab.id)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                auditFilterType === tab.id
                                  ? 'bg-slate-900 text-white shadow-2xs'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          展示最近 {Math.min(auditDisplayCount, allLogs.length)} 条记录
                        </span>
                      </div>

                      {/* 流水明细表格 */}
                      <div className="overflow-x-auto border border-slate-200/80 rounded-xl divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F8FAFC] text-slate-500 font-semibold sticky top-0 z-10 shadow-2xs">
                            <tr>
                              <th className="py-2 px-3">调用时间</th>
                              <th className="py-2 px-3">模型与厂商</th>
                              <th className="py-2 px-2.5">业务类型</th>
                              <th className="py-2 px-3">吞吐量 / 规格</th>
                              <th className="py-2 px-3 text-right">预估算力</th>
                              <th className="py-2 px-3 text-center">状态</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                            {allLogs.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-sans">
                                  暂无调用明细记录
                                </td>
                              </tr>
                            ) : (
                              allLogs
                                .filter(l => auditFilterType === 'all' || l.type === auditFilterType)
                                .slice(0, auditDisplayCount)
                                .map((log, idx) => {
                                  const dateStr = new Date(log.timestamp).toLocaleString('zh-CN', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit'
                                  });

                                  let typeBadge = 'bg-slate-100 text-slate-600 border-slate-200';
                                  let typeName = '通用调用';
                                  if (log.type === 'image') {
                                    typeBadge = 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
                                    typeName = '图片生成';
                                  } else if (log.type === 'video') {
                                    typeBadge = 'bg-amber-50 text-amber-700 border-amber-200';
                                    typeName = '视频生成';
                                  } else if (log.type === 'chat') {
                                    typeBadge = 'bg-blue-50 text-blue-700 border-blue-200';
                                    typeName = 'AI 对话';
                                  } else if (log.type === 'vision') {
                                    typeBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                    typeName = '视觉分析';
                                  }

                                  return (
                                    <tr key={log.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                      <td className="py-2 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                                        {dateStr}
                                      </td>
                                      <td className="py-2 px-3 font-sans">
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                                            {getModelIcon(log.modelId, 'w-3.5 h-3.5')}
                                          </div>
                                          <span className="font-bold text-slate-900 text-xs truncate max-w-[130px] sm:max-w-[180px]">
                                            {log.modelName || log.modelId}
                                          </span>
                                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 text-[10px] font-mono border border-slate-200/60 shrink-0">
                                            {log.provider || '网关'}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-2 px-2.5">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge} whitespace-nowrap`}>
                                          {typeName}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 text-xs font-sans">
                                        {log.type === 'image' || log.type === 'video' ? (
                                          <span className="font-semibold text-indigo-700 font-mono">
                                            {log.mediaCount || 1} {log.type === 'video' ? '段视频' : '张图片'}
                                          </span>
                                        ) : (
                                          <span className="font-mono text-[11px]">
                                            {log.totalTokens ? `${log.totalTokens.toLocaleString()} Tokens` : '流式输出'}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-right text-emerald-600 font-bold text-xs">
                                        {log.costUsd > 0 ? `${log.costUsd.toFixed(2)} 算力` : '0.00 算力'}
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {log.success !== false ? (
                                          <span className="inline-flex items-center gap-0.5 text-emerald-600 text-[11px] font-sans font-medium">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>成功</span>
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-0.5 text-rose-500 text-[11px] font-sans font-medium">
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>失败</span>
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* 翻页加载更多 */}
                      {allLogs.length > auditDisplayCount && (
                        <div className="text-center pt-1">
                          <button
                            type="button"
                            onClick={() => setAuditDisplayCount(c => c + 50)}
                            className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
                          >
                            加载更多历史流水 (还有 {allLogs.length - auditDisplayCount} 条)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
    </>
  );
}
