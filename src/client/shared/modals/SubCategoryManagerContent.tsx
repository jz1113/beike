import { X, Sparkles, CheckCircle2, UploadCloud, RotateCcw, Layers, Trash2, ArrowRight } from 'lucide-react';
import type { SubCategoryDef, SubCategoryConsolidationResult } from '@shared/domain/products/productCategory';

interface SubCategoryManagerContentProps {
  modalTab: 'manage' | 'import';
  setModalTab: (tab: 'manage' | 'import') => void;
  categoriesList: SubCategoryDef[];
  consolidationResult: SubCategoryConsolidationResult | null;
  setConsolidationResult: (result: SubCategoryConsolidationResult | null) => void;
  importText: string;
  setImportText: (text: string) => void;
  importMode: 'append' | 'replace';
  setImportMode: (mode: 'append' | 'replace') => void;
  parsedPreview: SubCategoryDef[];
  handleApplyConsolidation: () => void;
  handleConsolidateCurrent: () => void;
  handleConsolidateImport: () => void;
  handleResetDefaults: () => void;
  handleDeleteItem: (id: string) => void;
  handleInsertTemplate: () => void;
  handleDoImport: () => void;
}

export function SubCategoryManagerContent({
  modalTab,
  setModalTab,
  categoriesList,
  consolidationResult,
  setConsolidationResult,
  importText,
  setImportText,
  importMode,
  setImportMode,
  parsedPreview,
  handleApplyConsolidation,
  handleConsolidateCurrent,
  handleConsolidateImport,
  handleResetDefaults,
  handleDeleteItem,
  handleInsertTemplate,
  handleDoImport,
}: SubCategoryManagerContentProps) {
  return (
    <>
      {/* 🌟 智能语义聚类与查重预览面板（若激活） */}
      {consolidationResult && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 via-indigo-50/30 to-amber-50/20 border border-purple-200 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span>智能聚类规整建议</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">
                    {consolidationResult.originalCount} ➔ {consolidationResult.consolidatedCount} 个标准类目
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  已按身体解剖机位部位与饰品形态聚类，碎片名称已沉淀至反推匹配词库。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConsolidationResult(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white/60 cursor-pointer"
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 规整结果分组卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[180px] overflow-y-auto p-1 bg-white/70 rounded-xl border border-purple-100">
            {consolidationResult.groups.map((group) => (
              <div
                key={group.clusterId}
                className="p-2.5 rounded-xl border border-purple-100 bg-white space-y-1 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-purple-950 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    {group.category.label}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-medium">
                    部位: {group.category.anatomy}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500">
                  <span className="text-slate-400">吸收原类目: </span>
                  {group.absorbedLabels.map((itemLabel) => (
                    <span
                      key={itemLabel}
                      className="inline-block text-[10px] px-1.5 py-0.2 mr-1 mb-1 rounded bg-slate-100 text-slate-700"
                    >
                      {itemLabel}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConsolidationResult(null)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              放弃规整
            </button>
            <button
              type="button"
              onClick={handleApplyConsolidation}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>应用此规整结果</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: 当前类目清单管理 */}
      {modalTab === 'manage' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">已生效类目清单</span>
              <span className="text-[11px] text-slate-400">({categoriesList.length} 个)</span>
            </div>
            <div className="flex items-center gap-2">
              {categoriesList.length > 2 && (
                <button
                  type="button"
                  onClick={handleConsolidateCurrent}
                  className="text-[11px] text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100/80 px-2.5 py-1 rounded-lg border border-purple-200/60 flex items-center gap-1 cursor-pointer transition-colors font-medium"
                  title="智能合并零散碎片类目，按身体部位规整并去重关键词"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>智能规整去重</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalTab('import')}
                className="text-[11px] text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-200/60 flex items-center gap-1 cursor-pointer transition-colors font-medium"
              >
                <UploadCloud className="w-3.5 h-3.5 text-amber-600" />
                <span>批量导入</span>
              </button>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-[11px] text-slate-500 hover:text-slate-800 px-2 py-1 flex items-center gap-1 cursor-pointer transition-colors"
                title="恢复为系统预设类目表"
              >
                <RotateCcw className="w-3 h-3" />
                <span>恢复默认</span>
              </button>
            </div>
          </div>

          {categoriesList.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-600 font-bold">当前暂无二级细分类目</p>
              <p className="text-[11px] text-slate-400 mt-1">
                点击右上角「批量导入」即可一键快速填入推荐模板
              </p>
              <button
                type="button"
                onClick={() => setModalTab('import')}
                className="mt-3 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>去批量导入</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto p-1">
              {categoriesList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between p-3 rounded-xl border border-slate-200/80 bg-white hover:border-amber-300 hover:shadow-xs transition-all group"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-800 truncate">{item.label}</span>
                      {item.anatomy && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-medium shrink-0 border border-amber-200/60">
                          部位: {item.anatomy}
                        </span>
                      )}
                      {item.isCustom && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-50 text-indigo-600 font-medium shrink-0 border border-indigo-200/60">
                          自定义
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-1">
                      关键词: {item.keywords.slice(0, 4).join(', ')}
                      {item.keywords.length > 4 ? ` 等${item.keywords.length}个` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-slate-300 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors opacity-60 group-hover:opacity-100 cursor-pointer shrink-0"
                    title="删除此项"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 批量文本导入区 */}
      {modalTab === 'import' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-amber-600" />
                <span>批量导入二级细分类目</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                每行一个二级类目。支持在冒号后补充别名与关键词，系统将自动关联对应特写部位与反推锚点。
              </p>
            </div>
            <button
              type="button"
              onClick={handleInsertTemplate}
              className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1 rounded-xl border border-amber-200/60 transition-colors shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>填入推荐模板</span>
            </button>
          </div>

          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={9}
            placeholder={`项链/锁骨链: 吊坠, 颈链, choker, 锁骨链\n手镯/手串: 叮当镯, 串珠, 佛珠, 玉镯\n戒指/指环: 钻戒, 对戒, 尾戒\n耳饰/耳环: 耳钉, 耳坠, 耳夹\n发簪/发饰: 发夹, 发冠, 头饰, 步摇`}
            className="soft-textarea w-full p-3.5 text-xs font-mono resize-y leading-relaxed"
          />

          {/* 导入模式配置与预览 */}
          <div className="flex items-center justify-between pt-1 gap-3 flex-wrap">
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="text-[11px] font-medium text-slate-500">导入策略:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <span>追加合并</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="text-amber-600 focus:ring-amber-500"
                />
                <span>完全覆盖</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              {parsedPreview.length > 0 && (
                <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  已识别 {parsedPreview.length} 个类目
                </span>
              )}
              <button
                type="button"
                onClick={handleConsolidateImport}
                disabled={!importText.trim()}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/60 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1"
                title="在导入前进行智能语义归类"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>智能规整预览</span>
              </button>
              <button
                type="button"
                onClick={handleDoImport}
                disabled={!importText.trim()}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-2xs disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>确认导入生效</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
