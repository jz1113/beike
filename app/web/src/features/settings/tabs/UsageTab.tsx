import { buildUsageHeatmap } from '../usageHeatmap';

import { Search, RefreshCw, Activity, Download, FileSpreadsheet, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { confirmAction } from '@/lib/confirmAction';
import { getUsageLogs, clearUsageLogs, type UsageSummary } from '@/lib/usageTracker';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { settingsPanelPad } from '@/shared/ui/layoutClasses';
import GatewayBalanceCard from '../components/GatewayBalanceCard';
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
  // 实时调用明细流水展开状态
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  // 流水类型过滤
  const [auditFilterType, setAuditFilterType] = useState<string>('all');
  // 流水展示条数
  const [auditDisplayCount, setAuditDisplayCount] = useState(30);

  // 1. 获取本地记录的真实调用明细流水 (按时间倒序)
  const allLogs = useMemo(() => {
    return getUsageLogs();
  }, [usageSummary]);

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

  // 热力图展示时间跨度切换：近 1 年全景 (53周) / 近半年 (26周) / 近 3 个月 (13周)
  const [heatmapRange, setHeatmapRange] = useState<'year' | 'half_year' | 'quarter'>('year');

  // 当前鼠标悬停的某一天（Codex 即时微详情透视）
  const [hoveredDay, setHoveredDay] = useState<{
    dateKey: string;
    dayName: string;
    count: number;
    tokens: number;
    costUsd: number;
    costRmb: number;
    isToday: boolean;
    isFuture: boolean;
  } | null>(null);

  // 4. Codex / GitHub 级严谨自然日历热力图生成算法 (以周一为自然周起始，严谨对齐月份与年份)
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // 4. 自然日历热力图生成算法 (当前自然年全景/近半年/近3个月，严格防字符重叠)
  const heatmapData = useMemo(() => buildUsageHeatmap({ heatmapActiveMap: usageSummary.heatmapActiveMap, heatmapDetailsMap: usageSummary.heatmapDetailsMap }, heatmapRange, currentYear), [heatmapRange, currentYear, usageSummary.heatmapActiveMap, usageSummary.heatmapDetailsMap]);

  return (
    <>
      <div className={`${settingsPanelPad} space-y-7 max-w-5xl animate-fade-in`}>
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
                      最近 {usageRange === '30d' ? '30 天' : usageRange === '90d' ? '90 天' : '一年'} · 累计真实调用 {usageSummary.totalRequests} 次 · 消耗 {usageSummary.totalTokens > 10000 ? (usageSummary.totalTokens / 10000).toFixed(1) + '万' : usageSummary.totalTokens} Token · 预估费用 {usageSummary.totalCostUsd.toFixed(2)} 算力 (约 ¥{usageSummary.totalCostRmb.toFixed(2)} CNY)
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

                    {/* 导出审计 CSV 按钮 */}
                    {allLogs.length > 0 && (
                      <button
                        onClick={handleExportCsv}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200/80 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                        title="导出全量调用明细记录为 CSV 表格进行财务级对账"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>导出审计 CSV</span>
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

                {/* 🌟 模型调用统计说明条 (双轨对账说明) */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/30 border border-slate-200/80 text-xs text-slate-700 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100/70 border border-indigo-200/70 flex items-center justify-center text-indigo-700 shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <div className="leading-relaxed">
                      <span className="font-semibold text-slate-800">全站调用实时审计：</span>
                      <span>自动拦截并精准记录全站生图、视频生成、视觉分析与 AI 问答助手的实际调用次数、Token 吞吐量与任务时长，支持展开查看每笔流水与导出 Excel 对账。</span>
                    </div>
                  </div>
                  <span className="text-[10.5px] font-mono font-medium text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200/60 shrink-0 hidden md:inline">
                    双轨数据透明对账
                  </span>
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
                        : (usageSummary.totalRequests > 0 ? `${usageSummary.peakDayRequests || usageSummary.totalRequests} 次` : '0')}
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
                        : (usageSummary.modelBreakdown[0] ? `${usageSummary.modelBreakdown[0].calls} 次调用` : '暂无')}
                    </div>
                  </div>

                  {/* Card 8: 日均 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">日均活跃消耗</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                      {usageSummary.dailyAvgTokens > 0
                        ? (usageSummary.dailyAvgTokens > 10000 
                            ? (usageSummary.dailyAvgTokens / 10000).toFixed(1) + '万' 
                            : usageSummary.dailyAvgTokens.toLocaleString())
                        : `${usageSummary.dailyAvgRequests} 次`}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">
                      {usageSummary.dailyAvgRequests} 个请求 / 天
                    </div>
                  </div>
                </div>

                {/* 3. 每日活动热力图 (Codex / GitHub 级严谨像素对齐与交互透视) */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">每日活动热力图</span>
                      
                      {/* 时间跨度切换微胶囊分段器 */}
                      <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/70 text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => setHeatmapRange('year')}
                          className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                            heatmapRange === 'year'
                              ? 'bg-white text-slate-900 shadow-2xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {currentYear} 年度
                        </button>
                        <button
                          type="button"
                          onClick={() => setHeatmapRange('half_year')}
                          className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                            heatmapRange === 'half_year'
                              ? 'bg-white text-slate-900 shadow-2xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          近半年
                        </button>
                        <button
                          type="button"
                          onClick={() => setHeatmapRange('quarter')}
                          className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                            heatmapRange === 'quarter'
                              ? 'bg-white text-slate-900 shadow-2xs font-bold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          近 3 个月
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 font-mono flex items-center gap-3">
                      <span>累计 <strong className="text-slate-900">{usageSummary.activeDays}</strong> 个活跃日</span>
                      <span>总调用 <strong className="text-slate-900">{usageSummary.totalRequests}</strong> 次</span>
                    </div>
                  </div>

                  {/* Codex 风格网格主体 */}
                  <div className="w-full overflow-x-auto pb-1 no-scrollbar select-none">
                    <div className="min-w-[700px] flex gap-2">
                      {/* 1. 左侧星期刻度 (以周一为第 1 行，精确等高垂直对齐) */}
                      <div className="flex flex-col justify-between pt-5 pb-0.5 text-[9px] font-mono text-slate-400 w-6 shrink-0 text-right pr-1 select-none">
                        <span className="h-3 leading-3">周一</span>
                        <span className="h-3 leading-3 opacity-0">二</span>
                        <span className="h-3 leading-3">周三</span>
                        <span className="h-3 leading-3 opacity-0">四</span>
                        <span className="h-3 leading-3">周五</span>
                        <span className="h-3 leading-3 opacity-0">六</span>
                        <span className="h-3 leading-3 opacity-0">日</span>
                      </div>

                      {/* 2. 周网格矩阵 */}
                      <div className="flex-1 flex flex-col space-y-1">
                        {/* 月份刻度行：使用 relative + absolute 定位，保证与下方网格列 100% 像素级对齐且不发生任何撑开与文字重叠 */}
                        <div className="flex gap-[3px] text-[10px] text-slate-400 font-mono h-4 items-center">
                          {heatmapData.map((week, wIdx) => (
                            <div key={wIdx} className="flex-1 min-w-[9px] relative h-4">
                              {week.monthLabel ? (
                                <span className="absolute left-0 top-0 whitespace-nowrap font-bold text-slate-500 text-[10px] leading-4 pointer-events-none">
                                  {week.monthLabel}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>

                        {/* 列 x 7 行网格 */}
                        <div className="flex gap-[3px] w-full">
                          {heatmapData.map((week, colIdx) => (
                            <div key={colIdx} className="flex-1 flex flex-col gap-[3px] min-w-[9px]">
                              {week.days.map((day, rowIdx) => {
                                // Codex 标准翠绿色彩阶体系
                                let bg = 'bg-[#EBEDF0]';
                                if (day.isFuture) {
                                  bg = 'bg-slate-50/40 border border-dashed border-slate-200/60 opacity-30';
                                } else if (day.count > 15) {
                                  bg = 'bg-[#216E39]';
                                } else if (day.count > 5) {
                                  bg = 'bg-[#30A14E]';
                                } else if (day.count > 2) {
                                  bg = 'bg-[#40C463]';
                                } else if (day.count > 0) {
                                  bg = 'bg-[#9BE9A8]';
                                }

                                const isHovered = hoveredDay?.dateKey === day.dateKey;
                                const todayRing = day.isToday ? 'ring-1.5 ring-indigo-600/90 ring-offset-1' : '';

                                return (
                                  <div
                                    key={rowIdx}
                                    onMouseEnter={() => !day.isFuture && setHoveredDay(day)}
                                    onMouseLeave={() => setHoveredDay(null)}
                                    className={`aspect-square w-full rounded-[2.5px] ${bg} ${todayRing} ${
                                      day.isFuture
                                        ? 'cursor-not-allowed'
                                        : 'cursor-pointer hover:ring-2 hover:ring-slate-900/60 transition-all duration-75 hover:scale-125 hover:z-20'
                                    } ${isHovered ? 'ring-2 ring-slate-900 shadow-xs scale-125 z-20' : ''}`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 3. 底部动态微详情状态栏与图例 */}
                    <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100 text-[11px] text-slate-500 font-mono flex-wrap gap-2">
                      {/* 左侧：即时透视当日模型调用 */}
                      <div className="flex items-center gap-2 min-h-[22px]">
                        {hoveredDay ? (
                          <div className="flex items-center gap-2 text-slate-900 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/80 animate-fade-in">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="font-bold">
                              {hoveredDay.dateKey} ({hoveredDay.dayName}{hoveredDay.isToday ? ' · 今天' : ''})
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-emerald-700">{hoveredDay.count} 次真实调用</span>
                            {hoveredDay.tokens > 0 && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-700">
                                  {hoveredDay.tokens > 10000 ? (hoveredDay.tokens / 10000).toFixed(1) + '万' : hoveredDay.tokens.toLocaleString()} Token
                                </span>
                              </>
                            )}
                            {hoveredDay.costUsd > 0 && (
                              <>
                                <span className="text-slate-400">·</span>
                                <span className="font-bold text-indigo-700">
                                  {hoveredDay.costUsd.toFixed(2)} 算力 (¥{hoveredDay.costRmb.toFixed(2)})
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10.5px]">
                            💡 提示：鼠标移入方格可即时透视指定日期的真实模型调用与算力消耗
                          </span>
                        )}
                      </div>

                      {/* 右侧：Codex 标准色阶图例 */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto text-[10.5px] text-slate-400">
                        <span>少</span>
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#EBEDF0]" title="0 次调用" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#9BE9A8]" title="1 - 2 次调用" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#40C463]" title="3 - 5 次调用" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#30A14E]" title="6 - 15 次调用" />
                        <div className="w-2.5 h-2.5 rounded-[2px] bg-[#216E39]" title=">15 次调用" />
                        <span>多</span>
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
                      <h3 className="font-bold text-slate-900 text-sm">模型调用明细清单</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        按模型汇总实际请求频次、Token 吞吐量、生成成果与预估算力消耗
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
                                <span className="font-semibold text-slate-700">暂无真实模型调用记录</span>
                                <span className="text-slate-400 text-[11px] max-w-md leading-relaxed">
                                  配置好接口后，在工作区进行图片/视频生成或与 AI 助手对话，系统将在此精准记录真实的请求次数、Token 吞吐量与产出成果。
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
                          <h3 className="font-bold text-slate-900 text-sm">实时调用明细流水</h3>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-semibold border border-slate-200">
                            共 {allLogs.length} 条本地流水
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          客户端毫秒级拦截记录，随时核对单笔调用的模型、Token 吞吐与精确扣费
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
                        <span>{showAuditLogs ? '收起明细流水' : '展开审计流水'}</span>
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
