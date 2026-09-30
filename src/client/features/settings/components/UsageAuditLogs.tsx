import { Download, FileSpreadsheet, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import type { getUsageLogs } from '@client/shared/utils/usageTracker';
import { formatUsageCost, formatUsageDate } from '../model/usageFormatting';

interface UsageAuditLogsProps {
  allLogs: ReturnType<typeof getUsageLogs>;
  handleExportCsv: () => void;
}

export function UsageAuditLogs({ allLogs, handleExportCsv }: UsageAuditLogsProps) {
  // 调用记录展开状态
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  // 流水类型过滤
  const [auditFilterType, setAuditFilterType] = useState<string>('all');
  // 流水展示条数
  const [auditDisplayCount, setAuditDisplayCount] = useState(30);

  const auditLogs = allLogs.filter(log => auditFilterType === 'all' || log.type === auditFilterType);

  return (
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
            aria-expanded={showAuditLogs} aria-controls="usage-audit-logs" onClick={() => setShowAuditLogs(prev => !prev)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
          >
            <span>{showAuditLogs ? '收起记录' : '展开记录'}</span>
            {showAuditLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 展开后的流水卡片 */}
      {showAuditLogs && (
        <div id="usage-audit-logs" className="space-y-3 pt-2 border-t border-slate-100 animate-fade-in">
          {/* 筛选小胶囊 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="text-[11px] text-slate-400">类型过滤:</span>
              {[
                { id: 'all', label: '全部' },
                { id: 'image', label: '生图' },
                { id: 'video', label: '生视频' },
                { id: 'chat', label: 'AI 对话' },
                { id: 'vision', label: '视觉分析' },
                { id: 'distill', label: '模型提炼' }
              ].map(tab => (
                <button
                  key={tab.id}
                  aria-pressed={auditFilterType === tab.id} onClick={() => { setAuditFilterType(tab.id); setAuditDisplayCount(30); }}
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
              展示最近 {Math.min(auditDisplayCount, auditLogs.length)} 条记录
            </span>
          </div>

          {/* 流水明细表格 */}
          <div className="overflow-x-auto border border-slate-200/80 rounded-xl divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] text-slate-500 font-semibold sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th scope="col" className="py-2 px-3">调用时间</th>
                  <th scope="col" className="py-2 px-3">模型与厂商</th>
                  <th scope="col" className="py-2 px-2.5">业务类型</th>
                  <th scope="col" className="py-2 px-3">吞吐量 / 规格</th>
                  <th scope="col" className="py-2 px-3 text-right">预估算力</th>
                  <th scope="col" className="py-2 px-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-sans">
                      {allLogs.length ? '当前类型暂无调用记录' : '暂无调用明细记录'}
                    </td>
                  </tr>
                ) : (
                  auditLogs
                    .slice(0, auditDisplayCount)
                    .map((log, idx) => {
                      const dateStr = formatUsageDate(log.timestamp);

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
                      } else if (log.type === 'distill') {
                        typeName = '模型提炼';
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
                                {log.mediaCount ?? (log.success !== false ? 1 : 0)} {log.type === 'video' ? '段视频' : '张图片'}
                              </span>
                            ) : (
                              <span className="font-mono text-[11px]">
                                {log.totalTokens ? `${log.totalTokens.toLocaleString()} Tokens` : '未记录 Token'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-600 font-bold text-xs">
                            {log.costUsd > 0 ? `${formatUsageCost(log.costUsd)} 算力` : '0.00 算力'}
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
          {auditLogs.length > auditDisplayCount && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setAuditDisplayCount(c => c + 50)}
                className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-all cursor-pointer"
              >
                加载更多历史流水 (还有 {auditLogs.length - auditDisplayCount} 条)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
