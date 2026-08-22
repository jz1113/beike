'use client';

import React from 'react';
import { confirmAction } from '@/lib/confirmAction';
import {
  X, Plus, Loader2, Download, Trash2, Upload, FileSpreadsheet, ListPlus,
  CheckCircle2, RefreshCw, Play, Pause, FolderDown, Info
} from 'lucide-react';
import {
  BatchTaskItem,
  displayMediaSrc,
  handleImgError,
} from '@/features/collect/collectorShared';

export interface CollectorBatchPanelProps {
  batchInputMode: 'text' | 'file';
  setBatchInputMode: (v: 'text' | 'file') => void;
  batchTextarea: string;
  setBatchTextarea: (v: string) => void;
  handleAddTasksFromText: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDownloadCsvTemplate: (e: React.MouseEvent) => void;
  batchTasks: BatchTaskItem[];
  setBatchTasks: React.Dispatch<React.SetStateAction<BatchTaskItem[]>>;
  isBatchRunning: boolean;
  batchExporting: boolean;
  batchSuccessCount: number;
  batchFailedCount: number;
  batchPendingCount: number;
  batchRunningCount: number;
  handlePauseBatchTasks: () => void;
  handleStartBatchTasks: () => void;
  handleBatchDownloadAllSuccessTasks: () => void;
  handleDownloadSingleZip: (item: any) => void;
  executeSingleTask: (task: BatchTaskItem) => Promise<BatchTaskItem>;
  setPreviewImageUrl: (v: string | null) => void;
}

export default function CollectorBatchPanel({
  batchInputMode,
  setBatchInputMode,
  batchTextarea,
  setBatchTextarea,
  handleAddTasksFromText,
  fileInputRef,
  handleDownloadCsvTemplate,
  batchTasks,
  setBatchTasks,
  isBatchRunning,
  batchExporting,
  batchSuccessCount,
  batchFailedCount,
  batchPendingCount,
  batchRunningCount,
  handlePauseBatchTasks,
  handleStartBatchTasks,
  handleBatchDownloadAllSuccessTasks,
  handleDownloadSingleZip,
  executeSingleTask,
  setPreviewImageUrl,
}: CollectorBatchPanelProps) {
  return (
            <div className="max-w-5xl mx-auto space-y-5">
              {/* 导入与配置面板 */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchInputMode('text')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${batchInputMode === 'text'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      <span>多链接批量粘贴</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBatchInputMode('file')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${batchInputMode === 'file'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>表格 / 文件批量导入</span>
                    </button>
                  </div>

                  <span className="text-xs text-slate-400">
                    支持 .csv / .xlsx / .txt / 多行粘贴，自动去重与平台识别
                  </span>
                </div>

                {/* 模式 A：多链接文本框粘贴 */}
                {batchInputMode === 'text' ? (
                  <div className="space-y-3">
                    <textarea
                      rows={4}
                      value={batchTextarea}
                      onChange={(e) => setBatchTextarea(e.target.value)}
                      placeholder={`在此批量粘贴多行链接或商品 ID（支持回车换行或逗号分隔，一次可贴 10~50+ 条）：\nhttps://item.jd.com/1000123456.html\nhttps://detail.tmall.com/item.htm?id=68888888\nhttps://www.xiaohongshu.com/discovery/item/66a12b...`}
                      className="w-full p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all shadow-inner resize-y"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        提示：系统将智能嗅探每一行的 URL 和纯数字 ID，无需手动去除多余汉字
                      </span>
                      <button
                        type="button"
                        onClick={handleAddTasksFromText}
                        disabled={!batchTextarea.trim()}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${!batchTextarea.trim()
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                          }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>解析并加入任务队列</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 模式 B：文件拖拽上传 */
                  <div className="space-y-3">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="p-6 sm:p-7 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/30 flex flex-col items-center justify-center text-center cursor-pointer transition-all space-y-2.5 group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800">
                        点击或拖拽上传表格文件 (.xlsx / .csv / .txt)
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-lg leading-relaxed">
                        系统将自动扫描并提取表格中包含的所有商品链接列或社媒 URL
                      </p>

                      {/* 🌟 表头说明与格式展示 (清晰展示表格表头与下载模板) */}
                      <div
                        onClick={e => e.stopPropagation()}
                        className="mt-2 w-full max-w-xl p-3.5 rounded-xl bg-white/95 border border-slate-200/90 shadow-2xs text-left cursor-default space-y-2.5"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-blue-600" />
                            <span>推荐表格列名 (表头规范)：</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleDownloadCsvTemplate}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="点击下载标准 CSV 表格模板"
                          >
                            <Download className="w-3 h-3" />
                            <span>📥 下载标准表格模板 (.csv)</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10.5px]">
                          <div className="p-2 rounded-lg bg-blue-50/70 border border-blue-100/90 text-blue-950">
                            <div className="font-bold flex items-center gap-1">
                              <span>商品链接</span>
                              <span className="text-[9px] px-1 rounded bg-blue-200 text-blue-800 font-sans">必填</span>
                            </div>
                            <div className="text-[9.5px] text-blue-600/90 truncate mt-0.5">支持各平台URL/ID</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-800">
                            <div className="font-bold flex items-center gap-1">
                              <span>商品名称</span>
                              <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-600 font-sans">选填</span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5">如：手机/服饰</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-800">
                            <div className="font-bold flex items-center gap-1">
                              <span>所属平台</span>
                              <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-600 font-sans">选填</span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5">京东/淘宝/小红书</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-800">
                            <div className="font-bold flex items-center gap-1">
                              <span>备注说明</span>
                              <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-600 font-sans">选填</span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5">自定义标记/分类</div>
                          </div>
                        </div>

                        <div className="text-[10.5px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                          💡 <span className="font-semibold text-slate-700">智能嗅探无强限制：</span>表格无论包含多少列、表头命名为何（如 <code className="text-blue-700 bg-blue-50 px-1 rounded">URL</code> / <code className="text-blue-700 bg-blue-50 px-1 rounded">链接</code> / <code className="text-blue-700 bg-blue-50 px-1 rounded">Link</code> / <code className="text-blue-700 bg-blue-50 px-1 rounded">商品地址</code>），只要单元格内含有商品网址或纯 ID，系统均能 100% 自动识别、去重并批量加入任务队列。
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 任务队列状态看板 */}
              {batchTasks.length > 0 && (
                <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4 animate-fade-in">
                  {/* 进度与控制头部 */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">批量任务队列</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                          共 {batchTasks.length} 个任务
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-emerald-600 font-bold">✅ 成功: {batchSuccessCount}</span>
                        <span className="text-rose-600 font-bold">❌ 失败: {batchFailedCount}</span>
                        <span className="text-amber-600 font-bold">⏳ 待处理: {batchPendingCount}</span>
                        {batchRunningCount > 0 && <span className="text-blue-600 font-bold animate-pulse">⚡ 进行中: {batchRunningCount}</span>}
                      </div>
                    </div>

                    {/* 控制按钮组 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isBatchRunning ? (
                        <button
                          type="button"
                          onClick={handlePauseBatchTasks}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>暂停采集</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStartBatchTasks}
                          disabled={batchPendingCount === 0 && batchFailedCount === 0}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${batchPendingCount === 0 && batchFailedCount === 0
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25'
                            }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{batchFailedCount > 0 && batchPendingCount === 0 ? '重试失败项' : '全部开始采集'}</span>
                        </button>
                      )}

                      {/* 🌟 一键批量打包下载所有成功商品为 ZIP */}
                      <button
                        type="button"
                        onClick={handleBatchDownloadAllSuccessTasks}
                        disabled={batchSuccessCount === 0 || batchExporting}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${batchSuccessCount === 0 || batchExporting
                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                          }`}
                        title="将所有成功采集的商品按文件夹结构打包为一个总 ZIP 文件"
                      >
                        {batchExporting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>正在打包下载...</span>
                          </>
                        ) : (
                          <>
                            <FolderDown className="w-3.5 h-3.5" />
                            <span>一键批量打包下载 ({batchSuccessCount}款)</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmAction('确定要清空当前批量任务列表吗？')) {
                            setBatchTasks([]);
                          }
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                        title="清空队列"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 进度条 */}
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${(batchSuccessCount / batchTasks.length) * 100}%` }}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${(batchFailedCount / batchTasks.length) * 100}%` }}
                    />
                    <div
                      className="h-full bg-blue-500 animate-pulse transition-all duration-300"
                      style={{ width: `${(batchRunningCount / batchTasks.length) * 100}%` }}
                    />
                  </div>

                  {/* 任务列表详情 */}
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                    {batchTasks.map((task, idx) => (
                      <div key={task.id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-5 text-slate-400 font-mono text-center flex-shrink-0">{idx + 1}</span>

                          {/* 封面或平台图标 */}
                          {displayMediaSrc(task.coverImage) ? (
                            <img
                              src={displayMediaSrc(task.coverImage)}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => handleImgError(e, task.coverImage)}
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200 flex-shrink-0 cursor-pointer"
                              onClick={() => setPreviewImageUrl(task.coverImage!)}
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 uppercase flex-shrink-0 text-[10px]">
                              {task.platform}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-slate-900 break-words whitespace-normal leading-snug">
                                {task.title || task.url}
                              </span>
                              {task.images && (
                                <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                                  {task.images.length} 张图
                                </span>
                              )}
                            </div>
                            {task.error && (
                              <p className="text-[11px] text-rose-600 truncate mt-0.5">
                                失败原因: {task.error}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* 状态徽标与单项操作 */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {task.status === 'pending' && (
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                              等待中
                            </span>
                          )}
                          {task.status === 'running' && (
                            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>采集解析中...</span>
                            </span>
                          )}
                          {task.status === 'success' && (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>采集成功</span>
                            </span>
                          )}
                          {task.status === 'failed' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setBatchTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'running' } : t));
                                const updated = await executeSingleTask(task);
                                setBatchTasks(prev => prev.map(t => t.id === task.id ? updated : t));
                              }}
                              className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 hover:bg-rose-100 transition-colors cursor-pointer"
                              title="点击重新采集此项"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>重试</span>
                            </button>
                          )}

                          {/* 单独打包下载 */}
                          {task.status === 'success' && task.images && task.images.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleDownloadSingleZip(task)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
                              title="单独下载该商品 ZIP"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* 移除 */}
                          <button
                            type="button"
                            onClick={() => setBatchTasks(prev => prev.filter(t => t.id !== task.id))}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

  );
}
