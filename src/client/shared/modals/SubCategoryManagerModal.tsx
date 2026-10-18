import { useState, useEffect, useMemo } from 'react';
import { SubCategoryManagerContent } from './SubCategoryManagerContent';
import {
  X,
  UploadCloud,
  CheckCircle2,
  FolderTree,
  ListFilter,
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
} from '@shared/domain/products/productCategory';

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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-label="二级类目管理" className="w-full max-w-[720px] max-h-[90vh] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] flex flex-col animate-in zoom-in-95 duration-150 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
        {/* 标题栏 */}
        <div className="flex items-center justify-between gap-5 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100">
              <FolderTree className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight">二级类目管理</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">维护细分类目和关键词，自动同步至反推与筛选。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer dark:hover:bg-white/10"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 模式分栏导航与大品类切换栏 */}
        <div className="flex items-center justify-between gap-3 border-y border-slate-100 px-5 py-2.5 sm:px-6 flex-wrap dark:border-white/10">
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
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/80 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-300 dark:hover:bg-white/10 dark:border-white/10 dark:bg-[#18191c]'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-normal ${
                      isSelected ? 'bg-amber-700/50 text-amber-100' : 'bg-slate-100 text-slate-500 dark:text-slate-400 dark:bg-white/10'
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
                  ? 'bg-white text-slate-900 shadow-2xs dark:text-slate-100 dark:bg-[#18191c]'
                  : 'text-slate-600 hover:text-slate-900 dark:hover:text-white dark:text-slate-300'
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
                  ? 'bg-white text-slate-900 shadow-2xs dark:text-slate-100 dark:bg-[#18191c]'
                  : 'text-slate-600 hover:text-slate-900 dark:hover:text-white dark:text-slate-300'
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
            className={`mx-5 mt-3 flex items-center justify-between gap-2 rounded-xl px-3.5 py-2 text-xs animate-in fade-in duration-100 sm:mx-6 ${
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 sm:px-6">
          <SubCategoryManagerContent
            modalTab={modalTab}
            setModalTab={setModalTab}
            categoriesList={categoriesList}
            consolidationResult={consolidationResult}
            setConsolidationResult={setConsolidationResult}
            importText={importText}
            setImportText={setImportText}
            importMode={importMode}
            setImportMode={setImportMode}
            parsedPreview={parsedPreview}
            handleApplyConsolidation={handleApplyConsolidation}
            handleConsolidateCurrent={handleConsolidateCurrent}
            handleConsolidateImport={handleConsolidateImport}
            handleResetDefaults={handleResetDefaults}
            handleDeleteItem={handleDeleteItem}
            handleInsertTemplate={handleInsertTemplate}
            handleDoImport={handleDoImport}
          />
        </div>

        {/* 底栏 */}
        <footer className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs sm:px-6 dark:border-white/10 dark:bg-[#18181b]">
          <span className="text-[11px] text-slate-400">
            {modalTab === 'manage' ? '管理已配置生效的二级类目' : '批量解析导入二级类目与特征词'}
          </span>
          <div className="flex items-center gap-2">
            {modalTab === 'import' && (
              <button
                type="button"
                onClick={() => setModalTab('manage')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer dark:text-slate-300"
              >
                返回列表
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 cursor-pointer dark:hover:bg-slate-200"
            >
              完成并关闭
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
