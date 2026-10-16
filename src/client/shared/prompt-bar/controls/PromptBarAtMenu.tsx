import { useMemo, type RefObject } from 'react';
import { Plus } from 'lucide-react';
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
  onCreateSubjectClick?: (category?: SubjectCategory) => void;
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
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(true, isUp, anchorRef, 320);

  // 跨分类搜索过滤（基于真实上传或添加的主体，绝不自行伪造预置假数据）
  const isSearching = Boolean(atMenuQuery.trim());
  const filteredSubjects = useMemo(() => {
    return allSubjects.filter((sub, idx) => {
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
  }, [allSubjects, atMenuQuery, isSearching]);

  return (
    <div
      ref={(node) => {
        panelRef.current = node;
        if (atMenuRef) atMenuRef.current = node;
      }}
      style={panelStyle}
      role="dialog"
      aria-label="选择主体或素材"
      className={`absolute left-3 sm:left-4 ${
        opensUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
      } w-64 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.04)] p-1.5 z-50 text-left select-none animate-fade-in`}
    >
      {/* 🌟 顶部小标题（与系统浅色风格统一） */}
      <div className="text-[11px] font-medium text-slate-400 px-2.5 pt-1.5 pb-1 tracking-wide">
        可能@的内容
      </div>

      {/* 🌟 快捷操作项：+ 创建主体 */}
      <button
        type="button"
        onClick={() => {
          onCreateSubjectClick?.();
          onClose?.();
        }}
        className="w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 text-[13px] font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-50 transition-colors cursor-pointer group"
      >
        <Plus className="w-4 h-4 text-slate-400 group-hover:text-slate-800 stroke-[2.2] transition-colors" />
        <span>创建主体</span>
      </button>

      {/* 🌟 真实主体列表区（绝无自行虚构项） */}
      {filteredSubjects.length > 0 ? (
        <div className="mt-1 max-h-60 overflow-y-auto space-y-0.5 pr-0.5">
          {filteredSubjects.map((sub) => {
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
                className={`w-full p-1.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer text-left group ${
                  isSelected
                    ? 'bg-slate-100 text-slate-950 font-medium'
                    : 'hover:bg-slate-50 text-slate-700 hover:text-slate-950'
                }`}
              >
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0 flex items-center justify-center">
                  <img
                    src={sub.url}
                    alt={sub.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.dataset.hasRetried && sub.url && !sub.url.startsWith('data:')) {
                        target.dataset.hasRetried = 'true';
                        target.src = proxyMediaUrl(sub.url);
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="truncate text-left text-[13px] font-normal text-slate-800 group-hover:text-slate-950 flex-1">
                  {sub.name || '未命名主体'}
                </span>
              </button>
            );
          })}
        </div>
      ) : isSearching ? (
        <div className="py-4 px-2 text-center text-xs text-slate-400">
          未找到匹配主体
        </div>
      ) : null}
    </div>
  );
}

export default PromptBarAtMenu;
