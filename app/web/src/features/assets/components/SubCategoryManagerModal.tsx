import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Layers,
  Trash2,
  RotateCcw,
  UploadCloud,
  CheckCircle2,
  Sparkles,
  FolderTree,
  ListFilter,
  ArrowRight,
} from 'lucide-react';
import {
  type SubCategoryDef,
  type ActionCategoryId,
  type SubCategoryConsolidationResult,
  getSubCategoriesForCategory,
  saveSubCategoriesForCategory,
  resetSubCategoriesForCategory,
  importSubCategoriesFromText,
  consolidateSubCategoriesLocally,
} from '@beike/domain/productCategoryHelpers';

export interface SubCategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCategoryId?: ActionCategoryId;
  onCategoriesChanged?: (categoryId: ActionCategoryId, list: SubCategoryDef[]) => void;
}

const CATEGORY_OPTIONS: Array<{ id: ActionCategoryId; label: string; icon: string; desc: string }> = [
  { id: 'jewelry', label: '珠宝首饰', icon: '💍', desc: '项链、手镯、戒指、耳饰等' },
  { id: 'digital_3c', label: '手机数码', icon: '📱', desc: '手机、耳机、穿戴手表等' },
  { id: 'apparel', label: '服饰穿搭', icon: '👗', desc: '上衣、下装、鞋包、配饰等' },
];

const JEWELRY_TEMPLATE = `项链/锁骨链: 吊坠, 颈链, choker, 锁骨链, 项坠, 毛衣链, 珍珠项链
手镯/手串: 叮当镯, 串珠, 佛珠, 玉镯, 金手镯, 手链, 银手镯, 翡翠手镯
戒指/指环: 钻戒, 对戒, 尾戒, 排戒, 纯银戒指, 黄金戒指
耳饰/耳环: 耳钉, 耳坠, 耳夹, 耳线, 流苏耳环
发簪/发饰: 发夹, 发冠, 头饰, 步摇, 抓夹, 盘发发簪
胸针/别针: 领针, 徽章, 领花, 别针
腕表/手表: 机械表, 石英表, 链带表, 表盘, 表带`;

const DIGITAL_TEMPLATE = `智能手机: 折叠屏, 旗舰机, 手机背板, 屏幕特写, 摄像头模组
无线耳机: 入耳式, 头戴式耳机, 充电仓, 耳塞, 挂耳式
智能手表: 运动手环, 智能表盘, 表带, 旋钮特写
平板电脑: 手写笔, 平板背板, 支架保护套
游戏数码: 掌机, 游戏手柄, 摇杆特写, RGB氛围灯`;

const APPAREL_TEMPLATE = `领口锁骨: V领, 圆领, 方领, 翻领, 连帽, 立领
袖口手部: 泡泡袖, 束口袖, 喇叭袖, 衬衫袖口, 挽袖
腰部腰线: 收腰, 腰带, 褶皱, 束腰, 高腰线
裙摆裤脚: 飘逸裙摆, 阔腿裤脚, 开叉裙边, 拖地裤
上装内搭: T恤, 衬衫, 针织衫, 卫衣, 吊带
下装长短: 阔腿裤, 牛仔裤, 半身裙, 连衣裙, 短裤
鞋履鞋靴: 运动鞋, 高跟鞋, 短靴, 凉鞋, 帆布鞋
箱包手袋: 单肩包, 斜挎包, 托特包, 双肩包, 手拿包`;

export default function SubCategoryManagerModal({
  isOpen,
  onClose,
  defaultCategoryId = 'jewelry',
  onCategoriesChanged,
}: SubCategoryManagerModalProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<ActionCategoryId>(defaultCategoryId);
  const [modalTab, setModalTab] = useState<'manage' | 'import'>('manage');
  const [categoriesList, setCategoriesList] = useState<SubCategoryDef[]>([]);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [consolidationResult, setConsolidationResult] = useState<SubCategoryConsolidationResult | null>(null);

  // 加载所选一级品类的二级类目
  const loadCategories = (catId: ActionCategoryId) => {
    const list = getSubCategoriesForCategory(catId);
    setCategoriesList(list);
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedCategoryId(defaultCategoryId);
      loadCategories(defaultCategoryId);
      setStatusMsg(null);
      setConsolidationResult(null);
      setModalTab('manage');
    }
  }, [isOpen, defaultCategoryId]);

  useEffect(() => {
    loadCategories(selectedCategoryId);
    setConsolidationResult(null);
  }, [selectedCategoryId]);

  // 实时预览将要解析的导入文本
  const parsedPreview = useMemo(() => {
    if (!importText.trim()) return [];
    return importSubCategoriesFromText(selectedCategoryId, importText, 'replace');
  }, [selectedCategoryId, importText]);

  if (!isOpen) return null;

  // 执行智能聚类规整（对当前已有类目）
  const handleConsolidateCurrent = () => {
    if (categoriesList.length === 0) {
      setStatusMsg({ text: '当前暂无可规整的二级类目', type: 'info' });
      return;
    }
    const res = consolidateSubCategoriesLocally(selectedCategoryId, categoriesList);
    setConsolidationResult(res);
  };

  // 执行智能聚类规整（对输入框待导入的文本）
  const handleConsolidateImport = () => {
    if (!importText.trim()) {
      setStatusMsg({ text: '请先在文本框中输入或粘贴类目内容', type: 'error' });
      return;
    }
    const parsed = importSubCategoriesFromText(selectedCategoryId, importText, 'replace');
    const res = consolidateSubCategoriesLocally(selectedCategoryId, parsed);
    setConsolidationResult(res);
  };

  // 确认应用规整结果
  const handleApplyConsolidation = () => {
    if (!consolidationResult) return;
    saveSubCategoriesForCategory(selectedCategoryId, consolidationResult.consolidatedCategories);
    setCategoriesList(consolidationResult.consolidatedCategories);
    setImportText('');
    setStatusMsg({
      text: `✨ 智能规整完成！已将 ${consolidationResult.originalCount} 个碎片类目归纳为 ${consolidationResult.consolidatedCount} 个标准大类并沉淀特征词。`,
      type: 'success',
    });
    onCategoriesChanged?.(selectedCategoryId, consolidationResult.consolidatedCategories);
    setConsolidationResult(null);
    setModalTab('manage');
  };

  // 执行批量导入
  const handleDoImport = () => {
    if (!importText.trim()) {
      setStatusMsg({ text: '请先在文本框中输入或粘贴类目内容', type: 'error' });
      return;
    }

    try {
      const updated = importSubCategoriesFromText(selectedCategoryId, importText, importMode);
      saveSubCategoriesForCategory(selectedCategoryId, updated);
      setCategoriesList(updated);
      setImportText('');
      setStatusMsg({
        text: `✅ 成功导入并保存 ${updated.length} 个二级类目！已实时同步至反推引擎与筛选栏。`,
        type: 'success',
      });
      onCategoriesChanged?.(selectedCategoryId, updated);
      setModalTab('manage');
    } catch {
      setStatusMsg({ text: '导入解析失败，请检查文本格式', type: 'error' });
    }
  };

  // 单条删除
  const handleDeleteItem = (subId: string) => {
    const next = categoriesList.filter((item) => item.id !== subId);
    saveSubCategoriesForCategory(selectedCategoryId, next);
    setCategoriesList(next);
    setStatusMsg({ text: '已移除该二级类目', type: 'info' });
    onCategoriesChanged?.(selectedCategoryId, next);
  };

  // 一键恢复默认
  const handleResetDefaults = () => {
    if (window.confirm('确定要恢复该品类的系统默认二级类目表吗？自定义类目将被重置。')) {
      const defaults = resetSubCategoriesForCategory(selectedCategoryId);
      setCategoriesList(defaults);
      setStatusMsg({ text: '已恢复系统默认类目表', type: 'success' });
      onCategoriesChanged?.(selectedCategoryId, defaults);
    }
  };

  // 快速插入预设模板
  const handleInsertTemplate = () => {
    if (selectedCategoryId === 'jewelry') {
      setImportText(JEWELRY_TEMPLATE);
    } else if (selectedCategoryId === 'digital_3c') {
      setImportText(DIGITAL_TEMPLATE);
    } else {
      setImportText(APPAREL_TEMPLATE);
    }
    setStatusMsg({ text: '已填入推荐类目模板，确认后可直接点击导入', type: 'info' });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-800">二级类目表管理与导入</h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  反推+筛选全链路联动
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                为一级品类配置二级细分类目与解剖部位，反推图集时强约束打标并联动筛选
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 模式分栏导航与大品类切换栏 */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-slate-100 bg-slate-50/40 gap-3 flex-wrap">
          {/* 一级品类切换 Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {CATEGORY_OPTIONS.map((cat) => {
              const isSelected = selectedCategoryId === cat.id;
              const count = getSubCategoriesForCategory(cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border select-none ${
                    isSelected
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/80 hover:text-slate-800'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-normal ${
                      isSelected ? 'bg-amber-700/50 text-amber-100' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 模式切换 Segmented Control：类目清单 vs 批量导入 */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-xl text-xs select-none">
            <button
              type="button"
              onClick={() => setModalTab('manage')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                modalTab === 'manage'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>类目清单 ({categoriesList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setModalTab('import')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                modalTab === 'import'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>批量导入</span>
            </button>
          </div>
        </div>

        {/* 提示消息 */}
        {statusMsg && (
          <div
            className={`mx-6 mt-3 px-3.5 py-2 rounded-xl text-xs flex items-center justify-between gap-2 animate-in fade-in duration-100 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : statusMsg.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMsg(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                className="w-full text-xs font-mono p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 bg-slate-50/50 resize-y leading-relaxed"
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
        </div>

        {/* 底栏 */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 text-xs">
          <span className="text-[11px] text-slate-400">
            {modalTab === 'manage' ? '管理已配置生效的二级类目' : '批量解析导入二级类目与特征词'}
          </span>
          <div className="flex items-center gap-2">
            {modalTab === 'import' && (
              <button
                type="button"
                onClick={() => setModalTab('manage')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
              >
                返回列表
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer"
            >
              完成并关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
