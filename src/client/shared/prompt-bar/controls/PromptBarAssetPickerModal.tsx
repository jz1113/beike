import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  Plus,
  Maximize2,
  Check,
} from 'lucide-react';
import { useAppStore } from '@client/store';

export interface PromptBarAssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSelect?: (mediaUrls: string[]) => void;
}

// 模拟一些初始资产与本地素材，若 store 中有真实生成任务则优先展示真实生成素材
const MOCK_PRESET_ASSETS = [
  { id: 'mat-1', title: '12335496499212.mp4', url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600&auto=format&fit=crop&q=80', duration: '7s', isVideo: true, type: 'ai' },
  { id: 'mat-2', title: '12336941720588.mp4', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80', duration: '3s', isVideo: true, type: 'ai' },
  { id: 'mat-3', title: '12335514780172.mp4', url: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=600&auto=format&fit=crop&q=80', duration: '3s', isVideo: true, type: 'ai' },
  { id: 'mat-4', title: '12336815976204.mp4', url: 'https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?w=600&auto=format&fit=crop&q=80', duration: '3s', isVideo: true, type: 'ai' },
  { id: 'mat-5', title: 'character_001', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80', isVideo: false, type: 'upload' },
  { id: 'mat-6', title: 'character_003', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80', isVideo: false, type: 'upload' },
  { id: 'mat-7', title: 'character_002', url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80', isVideo: false, type: 'upload' },
  { id: 'mat-8', title: 'style_003', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80', isVideo: false, type: 'ai' },
  { id: 'mat-9', title: 'style_002', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80', isVideo: false, type: 'ai' },
  { id: 'mat-10', title: 'style_001', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80', isVideo: false, type: 'ai' },
  { id: 'mat-11', title: 'style_004', url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80', isVideo: false, type: 'ai' },
];

export const PromptBarAssetPickerModal: React.FC<PromptBarAssetPickerModalProps> = ({
  isOpen,
  onClose,
  onConfirmSelect,
}) => {
  // 顶层主标签：素材库 | 资产库 (图2 vs 图3)
  const [activeMainTab, setActiveMainTab] = useState<'materials' | 'assets'>('materials');

  // 素材库子状态 (图2)
  const [materialSourceTab, setMaterialSourceTab] = useState<'ai' | 'upload'>('ai');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 资产库子状态 (图3)
  const [assetCategory, setAssetCategory] = useState<'role' | 'product' | 'file'>('role');

  // 从真实 Store 读取已生成的任务媒体
  const generationTasks = useAppStore((s) => s.generationTasks);

  // 整合素材列表
  const allMaterials = useMemo(() => {
    const list = [...MOCK_PRESET_ASSETS];
    if (generationTasks && generationTasks.length > 0) {
      generationTasks.forEach((t) => {
        const url = t.resultUrl || (t.images && t.images[0]) || '';
        if (url) {
          list.unshift({
            id: t.id,
            title: t.title || `${t.id.slice(0, 14)}.mp4`,
            url,
            duration: t.mediaType === 'video' ? '5s' : undefined,
            isVideo: t.mediaType === 'video',
            type: 'ai',
          });
        }
      });
    }
    return list;
  }, [generationTasks]);

  // 过滤素材
  const filteredMaterials = useMemo(() => {
    return allMaterials.filter((item) => {
      if (item.type !== materialSourceTab) return false;
      if (searchQuery.trim() && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [allMaterials, materialSourceTab, searchQuery]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;
    const selectedUrls: string[] = [];
    allMaterials.forEach((item) => {
      if (selectedIds.has(item.id) && item.url) {
        selectedUrls.push(item.url);
      }
    });

    if (onConfirmSelect) {
      onConfirmSelect(selectedUrls);
    } else {
      selectedUrls.forEach((url) => {
        useAppStore.getState().addQuickRefImage(url);
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-[28px] shadow-[0_24px_60px_rgba(0,0,0,0.18)] border border-slate-200/80 p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 1. 顶栏：左侧【素材库 | 资产库】Tab，右侧搜索框 */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveMainTab('materials')}
              className={`relative pb-1 text-sm font-semibold transition-colors cursor-pointer ${
                activeMainTab === 'materials'
                  ? 'text-slate-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              素材库
              {activeMainTab === 'materials' && (
                <span className="absolute bottom-[-13px] left-0 right-0 h-[2.5px] bg-slate-900 rounded-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('assets')}
              className={`relative pb-1 text-sm font-semibold transition-colors cursor-pointer ${
                activeMainTab === 'assets'
                  ? 'text-slate-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              资产库
              {activeMainTab === 'assets' && (
                <span className="absolute bottom-[-13px] left-0 right-0 h-[2.5px] bg-slate-900 rounded-full" />
              )}
            </button>
          </div>

          {/* 右侧：搜索资产 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索资产"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 sm:w-56 pl-8 pr-3 py-1.5 rounded-full bg-slate-100/90 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 transition-all"
            />
          </div>
        </div>

        {/* 🌟 2. 素材库视图（图 2 状态） */}
        {activeMainTab === 'materials' && (
          <div className="flex flex-col gap-3 flex-1 min-h-[380px]">
            {/* 次级控制行 */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-full text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>平铺视图</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                <span className="text-slate-200">|</span>
                <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-full">
                  <button
                    type="button"
                    onClick={() => setMaterialSourceTab('ai')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      materialSourceTab === 'ai'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    AI 生成
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaterialSourceTab('upload')}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      materialSourceTab === 'upload'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    我上传的
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>筛选</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                <button
                  type="button"
                  className="text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>排序</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              </div>
            </div>

            {/* 素材网格 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3.5 overflow-y-auto max-h-[50vh] pr-1 py-1">
              {filteredMaterials.map((mat) => {
                const isSelected = selectedIds.has(mat.id);
                return (
                  <div
                    key={mat.id}
                    onClick={() => toggleSelect(mat.id)}
                    className="flex flex-col group cursor-pointer"
                  >
                    <div
                      className={`relative aspect-[16/10] rounded-xl overflow-hidden border bg-slate-100 transition-all ${
                        isSelected
                          ? 'border-indigo-600 ring-2 ring-indigo-500/60 shadow-sm'
                          : 'border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={mat.url}
                        alt={mat.title}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-102"
                      />

                      {/* 左上角选择框 */}
                      <div
                        className={`absolute top-1.5 left-1.5 w-4 h-4 rounded flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-black/30 border border-white/60 group-hover:bg-black/50'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      {/* 视频左下角时长 */}
                      {mat.isVideo && mat.duration && (
                        <div className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/60 text-white text-[9px] font-medium leading-none">
                          {mat.duration}
                        </div>
                      )}

                      {/* Hover 全屏小图标 */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                        <div className="p-1 rounded-md bg-black/50 text-white">
                          <Maximize2 className="w-3 h-3" />
                        </div>
                      </div>
                    </div>

                    <span className="text-[11px] text-slate-600 truncate mt-1 group-hover:text-slate-900">
                      {mat.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 🌟 3. 资产库视图（图 3 状态） */}
        {activeMainTab === 'assets' && (
          <div className="flex flex-col gap-3 flex-1 min-h-[380px]">
            {/* 次级控制行 */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 bg-slate-100/80 p-0.5 rounded-full">
                <button
                  type="button"
                  onClick={() => setAssetCategory('role')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    assetCategory === 'role'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  角色
                </button>
                <button
                  type="button"
                  onClick={() => setAssetCategory('product')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    assetCategory === 'product'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  商品
                </button>
                <button
                  type="button"
                  onClick={() => setAssetCategory('file')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    assetCategory === 'file'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  文件
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>类别</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                <button
                  type="button"
                  className="text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>排序</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                <span className="text-slate-200">|</span>
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>新增</span>
                </button>
              </div>
            </div>

            {/* 空态区 (图 3 同款居中空态) */}
            <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-400 text-xs">
              <span>
                我的暂无{assetCategory === 'role' ? '角色' : assetCategory === 'product' ? '商品' : '文件'}
              </span>
            </div>
          </div>
        )}

        {/* 🌟 4. 底部操作栏：取消与添加按钮 */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className={`px-6 py-2 rounded-full text-xs font-medium transition-all ${
              selectedIds.size > 0
                ? 'bg-slate-900 text-white hover:bg-black cursor-pointer shadow-xs'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
};
