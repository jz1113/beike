import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  X, 
  Search, 
  Sparkles, 
  Eye, 
  Lightbulb, 
  Wrench, 
  Image as ImageIcon, 
  Video, 
  Plus, 
  Check, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  CheckCheck,
  AlertCircle,
  Loader2,
  Building2,
  FolderPlus
} from 'lucide-react';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { settingsModalShell, settingsPanelPad, settingsTouchBtn } from '@/shared/ui/layoutClasses';
import { inferWorkflowCapabilitiesFromId } from '@beike/domain/workflowModels';
import { VENDORS, identifyVendor, type VendorMeta } from '@beike/domain/vendorRegistry';

export interface GatewayModelItem {
  id: string;
  name: string;
  shortName: string;
  category: 'text' | 'image' | 'video' | 'audio' | 'embedding';
  isVision: boolean;
  isThinking: boolean;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  isEmbedding: boolean;
  isTool: boolean;
  owned_by?: string;
  isCustom?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allGatewayModels: GatewayModelItem[];
  activeModelIds: Set<string>;
  onToggleAddModel: (model: GatewayModelItem) => void;
  onAddAllUsefulModels: () => void;
  isLoading?: boolean;
}

export default function GatewayModelModal({
  isOpen,
  onClose,
  allGatewayModels = [],
  activeModelIds,
  onToggleAddModel,
  onAddAllUsefulModels,
  isLoading = false
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeTab, setSelectedTypeTab] = useState<'all' | 'image' | 'multimodal' | 'video'>('all');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
  const [collapsedVendors, setCollapsedVendors] = useState<Record<string, boolean>>({});

  // 🌟 厂商胶囊横向滚动状态与引用
  const vendorRowRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkVendorScroll = () => {
    if (vendorRowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = vendorRowRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    checkVendorScroll();
    const el = vendorRowRef.current;
    if (el) {
      el.addEventListener('scroll', checkVendorScroll, { passive: true });
      window.addEventListener('resize', checkVendorScroll);
      return () => {
        el.removeEventListener('scroll', checkVendorScroll);
        window.removeEventListener('resize', checkVendorScroll);
      };
    }
  }, [allGatewayModels, isOpen]);

  const handleScrollVendors = (direction: 'left' | 'right') => {
    if (vendorRowRef.current) {
      const amount = direction === 'left' ? -320 : 320;
      vendorRowRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // 1. 按厂商对全量模型建立分组索引
  const vendorGroupMap = useMemo(() => {
    const map = new Map<string, GatewayModelItem[]>();
    VENDORS.forEach(v => map.set(v.id, []));

    allGatewayModels.forEach(m => {
      const vendor = identifyVendor(m.id, m.owned_by);
      const list = map.get(vendor.id) || [];
      list.push(m);
      map.set(vendor.id, list);
    });

    return map;
  }, [allGatewayModels]);

  // 2. 统计各厂商模型数量 (支持关键词搜索联动)
  const vendorCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    const q = searchQuery.toLowerCase().trim();

    VENDORS.forEach(v => {
      const raw = vendorGroupMap.get(v.id) || [];
      const matched = raw.filter(m => {
        if (q) {
          return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
        }
        return true;
      });
      counts[v.id] = matched.length;
      counts.all += matched.length;
    });
    return counts;
  }, [vendorGroupMap, searchQuery]);

  // 3. 统计各类型数量 (🌟 核心修复：严格与当前选中的厂商及搜索关键词实时联动)
  const typeCounts = useMemo(() => {
    let list: GatewayModelItem[] = [];
    if (selectedVendorId === 'all') {
      list = allGatewayModels;
    } else {
      list = vendorGroupMap.get(selectedVendorId) || [];
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(m => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    }

    let image = 0, multimodal = 0, video = 0;
    list.forEach(m => {
      const caps = inferWorkflowCapabilitiesFromId(m.id);
      if (caps.isImage || m.category === 'image') {
        image++;
      } else if (caps.isVideo || m.category === 'video') {
        video++;
      } else if (caps.isMultimodal) {
        multimodal++;
      }
    });

    return {
      all: list.length,
      image,
      multimodal,
      video
    };
  }, [allGatewayModels, vendorGroupMap, selectedVendorId, searchQuery]);

  // 4. 根据类型筛选、厂商筛选、关键词搜索得出最终分组
  const filteredVendorGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result: { vendor: VendorMeta; models: GatewayModelItem[] }[] = [];

    VENDORS.forEach(vendor => {
      if (selectedVendorId !== 'all' && vendor.id !== selectedVendorId) return;

      const rawModels = vendorGroupMap.get(vendor.id) || [];
      const matched = rawModels.filter(m => {
        // 类型过滤：生图 / 多模态 / 视频
        if (selectedTypeTab === 'image' && !(m.isImage || m.category === 'image')) return false;
        if (selectedTypeTab === 'video' && !(m.isVideo || m.category === 'video')) return false;
        if (selectedTypeTab === 'multimodal') {
          const caps = inferWorkflowCapabilitiesFromId(m.id);
          if (!caps.isMultimodal) return false;
        }

        // 关键词搜索
        if (q) {
          return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
        }
        return true;
      });

      if (matched.length > 0) {
        result.push({
          vendor,
          models: matched
        });
      }
    });

    return result;
  }, [vendorGroupMap, selectedVendorId, selectedTypeTab, searchQuery]);

  // 统计匹配总数
  const totalMatchedCount = useMemo(() => {
    return filteredVendorGroups.reduce((acc, g) => acc + g.models.length, 0);
  }, [filteredVendorGroups]);

  // 切换折叠
  const toggleCollapse = (vendorId: string) => {
    setCollapsedVendors(prev => ({ ...prev, [vendorId]: !prev[vendorId] }));
  };

  // 一键接入该厂商全部匹配模型
  const handleAddAllFromVendor = (models: GatewayModelItem[]) => {
    models.forEach(m => {
      if (!activeModelIds.has(m.id)) {
        onToggleAddModel(m);
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 md:p-3 xl:p-4 animate-fade-in select-none font-sans">
      <div
        data-settings-modal
        className={`${settingsModalShell} max-w-[min(92vw,900px)] bg-white shadow-2xl border border-slate-100 flex flex-col overflow-hidden`}
      >
        
        {/* 🌟 1. 顶部标题栏 */}
        <div className="px-4 md:px-6 py-3.5 md:py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-base md:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap min-w-0">
              <span>网关模型库 (按厂商分组)</span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-mono font-bold border border-indigo-200">
                {allGatewayModels.length} 款模型
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <button
              onClick={onAddAllUsefulModels}
              className="text-xs md:text-sm font-bold text-slate-700 hover:text-indigo-600 flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-xl bg-slate-100 hover:bg-indigo-50 transition-colors cursor-pointer"
              title="一键将网关中所有的生图与视觉模型添加到工作区"
            >
              <CheckCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="hidden sm:inline">一键接入核心生图/视觉模型</span>
              <span className="sm:hidden">一键接入</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="关闭 (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className={`${settingsPanelPad} bg-slate-50/70 border-b border-slate-100 space-y-3.5 flex-shrink-0`}>
          {/* 搜索框 */}
          <div className="relative">
            <Search className="w-4.5 h-4.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索模型 ID 或关键字 (如 gpt-4o, claude-opus-5, gemini-3.1, seedream, flux, grok)..."
              className="w-full pl-11 pr-14 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm sm:text-[14.5px] font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-2xs"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs sm:text-sm font-bold"
              >
                清空
              </button>
            )}
          </div>

          {/* 厂商横向导航胶囊栏 (Cherry Studio 厂商过滤标签 + 左右导航滚动 + 滚轮横向滑动) */}
          <div className="relative group/vendor-row">
            {/* 左滚动箭头 */}
            {canScrollLeft && (
              <div className="absolute left-0 top-0 bottom-1 z-10 flex items-center pr-3 bg-gradient-to-r from-slate-50 via-slate-50/90 to-transparent">
                <button
                  type="button"
                  onClick={() => handleScrollVendors('left')}
                  className="w-7 h-7 rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
                  title="向前滚动厂商"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 厂商胶囊横向滚动列表 */}
            <div 
              ref={vendorRowRef}
              onWheel={(e) => {
                if (e.deltaY !== 0 && vendorRowRef.current) {
                  vendorRowRef.current.scrollLeft += e.deltaY;
                }
              }}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs sm:text-[13.5px] scroll-smooth px-0.5"
            >
              <button
                onClick={() => setSelectedVendorId('all')}
                className={`px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  selectedVendorId === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                <span>全部厂商</span>
                <span className={`text-xs font-mono font-bold ${selectedVendorId === 'all' ? 'text-slate-300' : 'text-slate-400'}`}>
                  {vendorCounts.all}
                </span>
              </button>

              {VENDORS.filter(v => (vendorCounts[v.id] || 0) > 0).map(vendor => {
                const count = vendorCounts[vendor.id] || 0;
                const isSelected = selectedVendorId === vendor.id;

                return (
                  <button
                    key={vendor.id}
                    onClick={() => setSelectedVendorId(vendor.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap flex-shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-xs'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                      {getModelIcon(vendor.id, 'w-full h-full')}
                    </div>
                    <span>{vendor.name.split(' ')[0]}</span>
                    <span className={`text-xs font-mono font-bold ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 右滚动箭头 */}
            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-1 z-10 flex items-center pl-3 bg-gradient-to-l from-slate-50 via-slate-50/90 to-transparent">
                <button
                  type="button"
                  onClick={() => handleScrollVendors('right')}
                  className="w-7 h-7 rounded-full bg-white shadow-md border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
                  title="向后滚动厂商"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 类型筛选 Tab (严格对应：全部 / 生图 / 多模态 / 视频) */}
          <div className="flex items-center gap-2 text-xs sm:text-[13px] pt-0.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: '全部类型', count: typeCounts.all, icon: null },
              { id: 'image', label: '生图', count: typeCounts.image, icon: <ImageIcon className="w-3.5 h-3.5 text-purple-600" /> },
              { id: 'multimodal', label: '多模态', count: typeCounts.multimodal, icon: <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> },
              { id: 'video', label: '视频', count: typeCounts.video, icon: <Video className="w-3.5 h-3.5 text-pink-600" /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedTypeTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedTypeTab === tab.id
                    ? 'bg-slate-200 text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span className="text-xs text-slate-400 font-mono font-bold">({tab.count})</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto ${settingsPanelPad} space-y-4`}>
          {isLoading ? (
            <div className="py-28 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-9 h-9 animate-spin text-indigo-600" />
              <span className="text-sm font-bold text-slate-600">正在从网关拉取 850+ 全量模型列表...</span>
            </div>
          ) : filteredVendorGroups.length === 0 ? (
            <div className="py-24 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">未找到匹配的大模型</p>
              <p className="text-xs text-slate-400">请尝试更换搜索词或切换厂商/类型筛选 Tab</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredVendorGroups.map(({ vendor, models }) => {
                const isCollapsed = collapsedVendors[vendor.id];
                const addedCountInVendor = models.filter(m => activeModelIds.has(m.id)).length;

                return (
                  <div 
                    key={vendor.id}
                    className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs"
                  >
                    {/* 厂商分组 Header (带展开收起与一键接入) */}
                    <div 
                      onClick={() => toggleCollapse(vendor.id)}
                      className="px-4.5 py-3 bg-[#F9FAFB] hover:bg-[#F3F4F6] border-b border-slate-100 flex items-center justify-between transition-colors cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 bg-white border border-slate-200/80 p-0.5 shadow-2xs">
                          {getModelIcon(vendor.id, 'w-full h-full')}
                        </div>
                        <span className="text-sm sm:text-base font-bold text-slate-900">{vendor.name}</span>
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-bold">
                          {models.length} 款模型
                        </span>
                        {addedCountInVendor > 0 && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                            已接入 {addedCountInVendor}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddAllFromVendor(models);
                          }}
                          className="text-xs font-bold text-slate-700 hover:text-indigo-600 hover:bg-white px-3 py-1.5 rounded-xl border border-slate-200 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="一键接入此厂商下的所有模型"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-indigo-500" />
                          <span>接入此厂商全部</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollapse(vendor.id);
                          }}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 transition-all cursor-pointer shadow-2xs"
                          title={isCollapsed ? "点击展开模型列表" : "点击收起模型列表"}
                        >
                          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* 厂商所属模型网格 */}
                    {!isCollapsed && (
                      <div className="p-2.5 divide-y divide-slate-100">
                        {models.map(model => {
                          const isAdded = activeModelIds.has(model.id);

                          return (
                            <div
                              key={model.id}
                              className={`px-3 md:px-3.5 py-2.5 rounded-xl transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 lg:gap-3 ${
                                isAdded 
                                  ? 'bg-indigo-50/40 hover:bg-indigo-50/70' 
                                  : 'hover:bg-[#F9FAFB]'
                              }`}
                            >
                              {/* 模型图标与 ID */}
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-center flex-shrink-0">
                                  {getModelIcon(model.id, "w-4.5 h-4.5")}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-slate-900 font-semibold text-sm truncate">
                                      {model.id}
                                    </span>
                                    {model.name && model.name !== model.id && (
                                      <span className="text-xs text-slate-400 truncate hidden sm:inline">
                                        ({model.name})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 能力图标徽章 */}
                              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap pl-10 lg:pl-0">
                                {model.isVision && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                                    <Eye className="w-3 h-3" />
                                    <span>视觉</span>
                                  </span>
                                )}
                                {model.isThinking && (
                                  <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold flex items-center gap-1">
                                    <Lightbulb className="w-3 h-3" />
                                    <span>思考</span>
                                  </span>
                                )}
                                {model.isImage && (
                                  <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3" />
                                    <span>生图</span>
                                  </span>
                                )}
                                {model.isTool && (
                                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1">
                                    <Wrench className="w-3 h-3" />
                                    <span>函数</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0 pl-10 lg:pl-0">
                                <button
                                  onClick={() => onToggleAddModel(model)}
                                  className={`${settingsTouchBtn} px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                    isAdded
                                      ? 'bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200'
                                      : 'bg-slate-900 hover:bg-indigo-600 text-white shadow-2xs'
                                  }`}
                                >
                                  {isAdded ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                                      <span>已接入</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
                                      <span>接入</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          )}
        </div>

        {/* 🌟 4. 底部固化操作栏 */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-slate-600 flex-shrink-0">
          <span>
            共匹配 <strong className="text-slate-900 font-mono font-bold">{totalMatchedCount}</strong> 款模型 | 已接入 <strong className="text-indigo-600 font-mono font-bold">{activeModelIds.size}</strong> 款模型到系统
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer shadow-xs active:scale-95"
          >
            完成选择
          </button>
        </div>
      </div>
    </div>
  );
}
