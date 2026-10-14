import { RefreshCw, Download } from 'lucide-react';
import React, { useMemo } from 'react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { getUsageLogs, getUsageSummary, clearUsageLogs, type UsageSummary } from '@client/shared/utils/usageTracker';
import { UsageModelBreakdown } from '../components/UsageModelBreakdown';
import { UsageAuditLogs } from '../components/UsageAuditLogs';
import GatewayBalanceCard from '../components/GatewayBalanceCard';
import { UsageHeatmapPanel } from './UsageHeatmapPanel';
import { type GatewayUserInfo } from '../hooks/useGatewayUser';
import { buildUsageCsv, formatUsageCost, localDateKey } from '../model/usageFormatting';

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
  onClearGatewayCredentials?: () => Promise<boolean>;
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
  // 1. 获取本地记录的真实调用明细流水 (按时间倒序)
  const allLogs = useMemo(() => {
    void usageSummary; // Summary changes refresh the local log snapshot.
    return getUsageLogs();
  }, [usageSummary]);

  // 2. 导出 CSV 功能 (带 UTF-8 BOM，防止 Excel 中文乱码)
  const handleExportCsv = () => {
    if (!allLogs || allLogs.length === 0) {
      showToast('暂无可用调用日志供导出');
      return;
    }
    const csvContent = buildUsageCsv(allLogs);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beike_usage_audit_${localDateKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ 已导出全量调用记录审计 CSV');
  };

  const heatmapSummary = useMemo(() => { void usageSummary; return getUsageSummary('1y'); }, [usageSummary]);


  return (
    <>
      <div className="settings-usage space-y-6 animate-fade-in [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-indigo-500">
                {/* 1. 顶部标题、实时统计摘要与控制按钮 */}
                <div className="settings-usage-toolbar">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">创作档案</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">本机创作足迹、调用记录与预估消耗</p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 时间范围切换 */}
                    <div className="flex items-center bg-[#F3F4F6] p-1 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-600 shadow-2xs">
                      <button
                        aria-pressed={usageRange === '30d'} onClick={() => setUsageRange('30d')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '30d' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近 30 天
                      </button>
                      <button
                        aria-pressed={usageRange === '90d'} onClick={() => setUsageRange('90d')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '90d' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近 90 天
                      </button>
                      <button
                        aria-pressed={usageRange === '1y'} onClick={() => setUsageRange('1y')}
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
                        title="导出全量调用明细记录为 CSV 表格进行用量核对"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>导出记录</span>
                      </button>
                    )}

                    {/* 刷新与清空按钮 */}
                    <button
                      onClick={() => setUsageRefreshKey(k => k + 1)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                      aria-label="刷新统计数据" title="刷新统计数据"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {usageSummary.totalRequests > 0 && (
                      <button
                        onClick={async () => {
                          if (await confirmAction('确定要清空所有本地记录的用量统计数据吗？此操作无法撤回。')) {
                            try { clearUsageLogs(); setUsageRefreshKey(k => k + 1); showToast('已清空用量统计日志。'); }
                            catch { showToast('用量日志清空失败，请重试。'); }
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
                    { label: '预估费用', value: `¥${formatUsageCost(usageSummary.totalCostRmb)}`, unit: `${formatUsageCost(usageSummary.totalCostUsd)} 算力` },
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
                </div><p className="text-xs text-slate-500 leading-6 mt-4">本机统计与网关账户余额分别记录。预估人民币按调用时汇率记录，实际扣费以渠道账单为准。</p></details>

                <UsageHeatmapPanel usageSummary={heatmapSummary} />

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

        <UsageModelBreakdown
          usageSummary={usageSummary}
          usageModelSearch={usageModelSearch}
          setUsageModelSearch={setUsageModelSearch}
          setUsageRefreshKey={setUsageRefreshKey}
          showToast={showToast}
        />
        <UsageAuditLogs allLogs={allLogs} handleExportCsv={handleExportCsv} />
              </div>
    </>
  );
}
