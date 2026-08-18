'use client';
import { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Sparkles, 
  Eye, 
  Lightbulb, 
  Wrench, 
  Image as ImageIcon, 
  Video, 
  Music, 
  Layers, 
  FileText, 
  Plus, 
  Minus, 
  Check, 
  ArrowUpDown,
  ChevronDown, 
  ChevronRight, 
  Sliders,
  CheckCheck,
  AlertCircle,
  Loader2,
  Building2,
  FolderPlus
} from 'lucide-react';
import { getModelIcon } from '@/components/common/ModelIcons';

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

export interface VendorMeta {
  id: string;
  name: string;
  shortLabel: string;
  iconBg: string;
  iconColor: string;
  matcher: (modelId: string, ownedBy?: string) => boolean;
}

// 🌟 16 大知名大模型厂商精准归类规则
export const VENDORS: VendorMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    shortLabel: 'O',
    iconBg: 'bg-emerald-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4') || 
             lower.startsWith('chatgpt') || lower.startsWith('dall-e') || lower.startsWith('text-embedding') || 
             lower.includes('whisper') || lower.startsWith('tts') || lower.startsWith('sora');
    }
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    shortLabel: 'A',
    iconBg: 'bg-amber-700',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('claude')
  },
  {
    id: 'google',
    name: 'Google (Gemini / Veo / Imagen)',
    shortLabel: 'G',
    iconBg: 'bg-blue-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('gemini') || lower.includes('gemma') || lower.includes('imagen') || lower.includes('veo') || lower.includes('palm');
    }
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    shortLabel: 'X',
    iconBg: 'bg-black',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('grok')
  },
  {
    id: 'bytedance',
    name: '字节跳动 (Seedream / 即梦 / 豆包)',
    shortLabel: '字',
    iconBg: 'bg-blue-500',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('seedream') || lower.includes('seedance') || lower.includes('doubao') || lower.includes('bytedance') || lower.includes('skylark');
    }
  },
  {
    id: 'flux',
    name: 'Black Forest Labs (Flux)',
    shortLabel: 'F',
    iconBg: 'bg-zinc-800',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('flux') || lower.includes('black-forest');
    }
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    shortLabel: 'M',
    iconBg: 'bg-indigo-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('midjourney') || lower.includes('mj_') || lower.includes('niji');
    }
  },
  {
    id: 'deepseek',
    name: '深度求索 (DeepSeek)',
    shortLabel: '深',
    iconBg: 'bg-blue-600',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('deepseek')
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM / CogView)',
    shortLabel: '智',
    iconBg: 'bg-blue-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('glm') || lower.includes('cogview') || lower.includes('cogvideo') || lower.includes('chatglm');
    }
  },
  {
    id: 'alibaba',
    name: '阿里巴巴 (通义千问 / 万相)',
    shortLabel: '阿',
    iconBg: 'bg-orange-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('qwen') || lower.includes('wanx') || lower.includes('tongyi') || lower.includes('dashscope');
    }
  },
  {
    id: 'meta',
    name: 'Meta (Llama)',
    shortLabel: 'L',
    iconBg: 'bg-sky-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('llama') || lower.includes('meta-');
    }
  },
  {
    id: 'stability',
    name: 'Stability AI (SD / SDXL)',
    shortLabel: 'S',
    iconBg: 'bg-purple-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('stable-diffusion') || lower.includes('sdxl') || lower.includes('sd-') || lower.includes('sd3') || lower.includes('stable-');
    }
  },
  {
    id: 'kuaishou',
    name: '快手 (可灵 Kling / 可图)',
    shortLabel: '快',
    iconBg: 'bg-red-500',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('kling') || lower.includes('kolors') || lower.includes('kwai');
    }
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi / Moonshot)',
    shortLabel: '月',
    iconBg: 'bg-emerald-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('moonshot') || lower.includes('kimi');
    }
  },
  {
    id: 'minimax',
    name: 'MiniMax (海螺 / abab)',
    shortLabel: 'M',
    iconBg: 'bg-rose-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('minimax') || lower.includes('abab');
    }
  },
  {
    id: 'other',
    name: '其他厂商 / 社区开源模型',
    shortLabel: '其',
    iconBg: 'bg-slate-500',
    iconColor: 'text-white',
    matcher: () => true
  }
];

// 根据模型 ID 识别所属厂商
export function identifyVendor(modelId: string, ownedBy?: string): VendorMeta {
  for (const v of VENDORS) {
    if (v.id === 'other') continue;
    if (v.matcher(modelId, ownedBy)) {
      return v;
    }
  }
  return VENDORS.find(v => v.id === 'other')!;
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
  const [selectedTypeTab, setSelectedTypeTab] = useState<'all' | 'text' | 'image' | 'embedding' | 'audio' | 'video'>('all');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
  const [collapsedVendors, setCollapsedVendors] = useState<Record<string, boolean>>({});

  // 1. 统计各类型数量
  const typeCounts = useMemo(() => {
    let text = 0, image = 0, embedding = 0, audio = 0, video = 0;
    allGatewayModels.forEach(m => {
      if (m.isImage || m.category === 'image') image++;
      else if (m.isVideo || m.category === 'video') video++;
      else if (m.isAudio || m.category === 'audio') audio++;
      else if (m.isEmbedding || m.category === 'embedding') embedding++;
      else text++;
    });
    return {
      all: allGatewayModels.length,
      text,
      image,
      embedding,
      audio,
      video
    };
  }, [allGatewayModels]);

  // 2. 按厂商对全量模型建立分组索引
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

  // 3. 统计各厂商模型数量
  const vendorCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allGatewayModels.length };
    VENDORS.forEach(v => {
      counts[v.id] = (vendorGroupMap.get(v.id) || []).length;
    });
    return counts;
  }, [allGatewayModels, vendorGroupMap]);

  // 4. 根据类型筛选、厂商筛选、关键词搜索得出最终分组
  const filteredVendorGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result: { vendor: VendorMeta; models: GatewayModelItem[] }[] = [];

    VENDORS.forEach(vendor => {
      if (selectedVendorId !== 'all' && vendor.id !== selectedVendorId) return;

      const rawModels = vendorGroupMap.get(vendor.id) || [];
      const matched = rawModels.filter(m => {
        // 类型过滤
        if (selectedTypeTab === 'image' && !(m.isImage || m.category === 'image')) return false;
        if (selectedTypeTab === 'text' && (m.isImage || m.isVideo || m.isAudio || m.isEmbedding)) return false;
        if (selectedTypeTab === 'embedding' && !(m.isEmbedding || m.category === 'embedding')) return false;
        if (selectedTypeTab === 'audio' && !(m.isAudio || m.category === 'audio')) return false;
        if (selectedTypeTab === 'video' && !(m.isVideo || m.category === 'video')) return false;

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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-fade-in select-none font-sans">
      <div className="w-full max-w-4xl lg:max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col h-[90vh] max-h-[860px] overflow-hidden">
        
        {/* 🌟 1. 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>网关模型库 (按厂商分组)</span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs sm:text-[13px] font-mono font-bold border border-indigo-200">
                {allGatewayModels.length} 款模型
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onAddAllUsefulModels}
              className="text-xs sm:text-sm font-bold text-slate-700 hover:text-indigo-600 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-indigo-50 transition-colors cursor-pointer"
              title="一键将网关中所有的生图与视觉模型添加到工作区"
            >
              <CheckCheck className="w-4 h-4 text-indigo-600" />
              <span>一键接入核心生图/视觉模型</span>
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

        {/* 🌟 2. 搜索与筛选工具条 */}
        <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-100 space-y-3.5 flex-shrink-0">
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

          {/* 厂商横向导航胶囊栏 (Cherry Studio 厂商过滤标签) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs sm:text-[13.5px]">
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
                  <div className={`w-4 h-4 rounded-full ${vendor.iconBg} ${vendor.iconColor} text-[9px] font-bold flex items-center justify-center`}>
                    {vendor.shortLabel}
                  </div>
                  <span>{vendor.name.split(' ')[0]}</span>
                  <span className={`text-xs font-mono font-bold ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 类型筛选 Tab (全部 / 图片 / 文本 / 视频 / 嵌入) */}
          <div className="flex items-center gap-2 text-xs sm:text-[13px] pt-0.5">
            {[
              { id: 'all', label: '全部类型', count: typeCounts.all, icon: null },
              { id: 'image', label: '生图/图片', count: typeCounts.image, icon: <ImageIcon className="w-3.5 h-3.5 text-purple-600" /> },
              { id: 'text', label: '文本/对话', count: typeCounts.text, icon: <FileText className="w-3.5 h-3.5 text-blue-600" /> },
              { id: 'video', label: '视频模型', count: typeCounts.video, icon: <Video className="w-3.5 h-3.5 text-pink-600" /> },
              { id: 'embedding', label: '向量嵌入', count: typeCounts.embedding, icon: <Layers className="w-3.5 h-3.5 text-emerald-600" /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedTypeTab(tab.id as any)}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  selectedTypeTab === tab.id
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                <span className="text-xs text-slate-400 font-mono">({tab.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* 🌟 3. 厂商分组模型列表区 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
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
                        <div className={`w-6 h-6 rounded-lg ${vendor.iconBg} ${vendor.iconColor} text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-2xs`}>
                          {vendor.shortLabel}
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

                      <div className="flex items-center gap-2.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleAddAllFromVendor(models)}
                          className="text-xs font-bold text-slate-700 hover:text-indigo-600 hover:bg-white px-3 py-1.5 rounded-xl border border-slate-200 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="一键接入此厂商下的所有模型"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-indigo-500" />
                          <span>接入此厂商全部</span>
                        </button>

                        <div className="p-1 text-slate-400">
                          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
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
                              className={`px-3.5 py-2.5 rounded-xl transition-all flex items-center justify-between gap-3 ${
                                isAdded 
                                  ? 'bg-indigo-50/40 hover:bg-indigo-50/70' 
                                  : 'hover:bg-[#F9FAFB]'
                              }`}
                            >
                              {/* 模型图标与 ID (清晰大字号) */}
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-center flex-shrink-0">
                                  {getModelIcon(model.id, "w-4.5 h-4.5")}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-slate-900 font-semibold text-sm sm:text-[14.5px] truncate">
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

                              {/* 能力图标徽章 (舒适字号) */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
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

                              {/* 接入操作按钮 */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => onToggleAddModel(model)}
                                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
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
