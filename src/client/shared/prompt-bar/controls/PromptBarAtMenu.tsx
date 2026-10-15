import { useState, type RefObject } from 'react';
import {
  Image as ImageIcon,
  User,
  Package,
  ChevronRight,
  Plus,
  Check,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SubjectItem } from '@client/shared/prompt-bar/promptBarConstants';
import { usePromptBarPopoverLayout } from '../hooks/usePromptBarPopoverLayout';

export type SubjectCategory = 'material' | 'character' | 'product';

export interface PromptBarAtMenuProps {
  atMenuRef?: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<HTMLElement | null>;
  isUp: boolean;
  atMenuQuery: string;
  allSubjects: SubjectItem[];
  activeSubjects: SubjectItem[];
  onCreateSubjectClick: (category?: SubjectCategory) => void;
  onSelectSubject: (subject: SubjectItem) => void;
  onClose?: () => void;
}

export function PromptBarAtMenu({
  atMenuRef,
  anchorRef,
  isUp,
  atMenuQuery,
  allSubjects,
  activeSubjects,
  onCreateSubjectClick,
  onSelectSubject,
  onClose,
}: PromptBarAtMenuProps) {
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(true, isUp, anchorRef, 240);
  const [activeCategory, setActiveCategory] = useState<SubjectCategory | null>('character');

  // 分类归类算法
  const categorizeSubject = (sub: SubjectItem): SubjectCategory => {
    const text = (sub.name || '').toLowerCase();
    if (text.includes('人') || text.includes('模') || text.includes('角') || text.includes('avatar') || text.includes('portrait')) {
      return 'character';
    }
    if (text.includes('商') || text.includes('品') || text.includes('货') || text.includes('机') || text.includes('服') || text.includes('鞋') || text.includes('product') || text.includes('item')) {
      return 'product';
    }
    return 'material';
  };

  const categories: Array<{ id: SubjectCategory; label: string; icon: typeof ImageIcon }> = [
    { id: 'material', label: '素材', icon: ImageIcon },
    { id: 'character', label: '角色', icon: User },
    { id: 'product', label: '商品', icon: Package },
  ];

  // 如果有 query 搜索，跨分类过滤
  const isSearching = Boolean(atMenuQuery.trim());
  const filteredSubjects = allSubjects.filter((sub, idx) => {
    if (!isSearching) return true;
    const q = atMenuQuery.toLowerCase();
    const sName = (sub.name || '').toLowerCase();
    return (
      sName.includes(q) ||
      sub.id.toLowerCase().includes(q) ||
      `主体${idx + 1}`.includes(q) ||
      `图片${idx + 1}`.includes(q)
    );
  });

  const getSubjectsByCategory = (cat: SubjectCategory) => {
    const list = filteredSubjects.filter((sub) => categorizeSubject(sub) === cat);
    // 如果该分类下没有，但全部主体里有未归类的，在素材中展示剩余项
    if (cat === 'material') {
      const rest = filteredSubjects.filter(
        (sub) => categorizeSubject(sub) !== 'character' && categorizeSubject(sub) !== 'product'
      );
      return rest;
    }
    return list;
  };

  const currentCategoryList = activeCategory ? getSubjectsByCategory(activeCategory) : [];

  return (
    <div
      ref={(node) => {
        panelRef.current = node;
        if (atMenuRef) atMenuRef.current = node;
      }}
      style={panelStyle}
      role="dialog"
      aria-label="选择主体或素材"
      className={`absolute left-0 ${
        opensUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
      } flex items-start z-50 animate-fade-in text-left select-none`}
    >
      {/* 🌟 一级分类菜单（1:1 还原图3：素材>、角色>、商品>） */}
      <div className="w-44 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1.5 space-y-0.5">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          const count = getSubjectsByCategory(cat.id).length;

          return (
            <button
              key={cat.id}
              type="button"
              onMouseEnter={() => setActiveCategory(cat.id)}
              onClick={() => setActiveCategory(cat.id)}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer group ${
                isActive
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'text-slate-700 hover:text-slate-950 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-700'
                  }`}
                />
                <span className="text-[13px]">{cat.label}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                {count > 0 && <span className="text-[10px] text-slate-400 font-mono">{count}</span>}
                <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
              </div>
            </button>
          );
        })}
      </div>

      {/* 🌟 二级主体列表浮层 */}
      {activeCategory && (
        <div className="ml-1.5 w-60 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.14)] p-2 space-y-1.5 animate-fade-in">
          <div className="flex items-center justify-between px-1.5 py-0.5 text-xs">
            <span className="text-slate-400 font-medium">
              {categories.find((c) => c.id === activeCategory)?.label}库
            </span>
            <button
              type="button"
              onClick={() => onCreateSubjectClick(activeCategory)}
              className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-medium cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>新建</span>
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
            {currentCategoryList.length === 0 ? (
              <div className="py-6 px-2 text-center space-y-2">
                <p className="text-xs text-slate-400">暂无{categories.find((c) => c.id === activeCategory)?.label}资产</p>
                <button
                  type="button"
                  onClick={() => onCreateSubjectClick(activeCategory)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>立即添加</span>
                </button>
              </div>
            ) : (
              currentCategoryList.map((sub) => {
                const isSelected = activeSubjects.some((s) => s.id === sub.id || s.url === sub.url);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectSubject(sub);
                      onClose?.();
                    }}
                    className={`w-full px-2 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer group ${
                      isSelected ? 'bg-slate-100 text-slate-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={sub.url}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.dataset.hasRetried && sub.url) {
                            target.dataset.hasRetried = 'true';
                            target.src = proxyMediaUrl(sub.url);
                          }
                        }}
                        className="w-7 h-7 rounded-lg object-cover flex-shrink-0 border border-slate-200 bg-slate-50 shadow-2xs"
                      />
                      <span className="truncate text-left max-w-[130px]">{sub.name || '未命名资产'}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default PromptBarAtMenu;
