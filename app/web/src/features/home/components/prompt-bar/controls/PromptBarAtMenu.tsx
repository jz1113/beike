import type { RefObject } from 'react';
import { Plus, Check } from 'lucide-react';
import { proxyMediaUrl } from '@/lib/apiClient';
import type { SubjectItem } from '../../../data/promptBarConstants';

export interface PromptBarAtMenuProps {
  atMenuRef?: RefObject<HTMLDivElement | null>;
  isUp: boolean;
  atMenuQuery: string;
  allSubjects: SubjectItem[];
  activeSubjects: SubjectItem[];
  onCreateSubjectClick: () => void;
  onSelectSubject: (subject: SubjectItem) => void;
}

/** 🌟 双卡片发光交叠插画（1:1 还原设计图1） */
function AtMenuEmptyIllustration() {
  return (
    <div className="relative w-24 h-24 flex items-center justify-center my-2 select-none pointer-events-none">
      <svg
        className="w-24 h-24 overflow-visible"
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="atGlowBack" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#60A5FA" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#818CF8" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="atGlowFront" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0284C7" stopOpacity="0.8" />
          </linearGradient>
          <filter id="atCardGlow" x="-20%" y="-20%" width="140%" height="140%" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#38BDF8" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* 后层卡片：向左上方微倾斜 -8deg */}
        <g transform="rotate(-8 40 48)">
          <rect
            x="18"
            y="18"
            width="44"
            height="56"
            rx="12"
            stroke="url(#atGlowBack)"
            strokeWidth="1.8"
            fill="white"
            fillOpacity="0.75"
            filter="url(#atCardGlow)"
          />
        </g>

        {/* 前层卡片：正立居中 */}
        <rect
          x="30"
          y="20"
          width="46"
          height="58"
          rx="13"
          stroke="url(#atGlowFront)"
          strokeWidth="2"
          fill="white"
          fillOpacity="0.95"
          filter="url(#atCardGlow)"
        />

        {/* 前层卡片内衬：圆角微光容器 */}
        <rect
          x="38"
          y="28"
          width="30"
          height="42"
          rx="8"
          stroke="#BAE6FD"
          strokeWidth="1.2"
          strokeDasharray="3 2"
          fill="#F8FAFC"
          fillOpacity="0.6"
        />

        {/* 向上粗箭头（居中直观指示主体上传） */}
        <g stroke="#0284C7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M53 57V37" strokeWidth="2.4" />
          <path d="M45 45L53 37L61 45" strokeWidth="2.4" />
        </g>
      </svg>
    </div>
  );
}

export function PromptBarAtMenu({
  atMenuRef,
  isUp,
  atMenuQuery,
  allSubjects,
  activeSubjects,
  onCreateSubjectClick,
  onSelectSubject,
}: PromptBarAtMenuProps) {
  const hasSubjects = allSubjects.length > 0;

  const filteredSubjects = allSubjects.filter((sub, idx) => {
    if (!atMenuQuery.trim()) return true;
    const q = atMenuQuery.toLowerCase();
    const sName = sub.name.toLowerCase();
    const sNameNoExt = sub.name.replace(/\.[^/.]+$/, '').toLowerCase();
    return (
      sName.includes(q) ||
      sNameNoExt.includes(q) ||
      sub.id.toLowerCase().includes(q) ||
      `主体${idx + 1}`.includes(q) ||
      `图片${idx + 1}`.includes(q)
    );
  });

  return (
    <div
      ref={atMenuRef}
      className={`absolute left-0 ${
        isUp ? 'bottom-full mb-2.5 origin-bottom' : 'top-full mt-2 origin-top'
      } w-[272px] rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-4 z-50 animate-fade-in text-left select-none`}
    >
      {/* 顶部小标 */}
      <div className="flex items-center justify-between text-xs font-normal text-slate-400 select-none">
        <span>可能@的内容</span>
        {atMenuQuery && <span className="text-amber-600 font-normal">匹配: {atMenuQuery}</span>}
      </div>

      {!hasSubjects ? (
        /* 🌟 空态（1:1 还原图 1）: 双卡片发光插画 + 说明文案 + 浅灰大药丸按钮 */
        <div className="flex flex-col items-center justify-center pt-2 pb-1">
          <AtMenuEmptyIllustration />
          <div className="text-[13px] text-slate-500 font-normal mt-1.5 mb-4 text-center">
            你还没有创建过主体
          </div>
          <button
            type="button"
            onClick={onCreateSubjectClick}
            className="px-6 py-2.5 rounded-xl bg-[#F2F3F5] hover:bg-[#E5E7EB] text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 text-slate-800 stroke-[2.4]" />
            <span>创建主体</span>
          </button>
        </div>
      ) : (
        /* 🌟 列表态: 保留快捷新建 + 滚动主体列表 */
        <div className="space-y-2 mt-2">
          <button
            type="button"
            onClick={onCreateSubjectClick}
            className="w-full px-3 py-2 rounded-xl bg-[#F2F3F5] hover:bg-[#E5E7EB] text-slate-800 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-slate-800 stroke-[2.4]" />
            <span>创建主体</span>
          </button>

          <div className="max-h-52 overflow-y-auto scroll-contain space-y-1 pt-0.5">
            {filteredSubjects.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">
                无匹配主体
              </div>
            ) : (
              filteredSubjects.map((sub) => {
                const isCurrent = activeSubjects.some((s) => s.id === sub.id || s.url === sub.url);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onSelectSubject(sub)}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer ${
                      isCurrent ? 'bg-slate-100 font-bold text-slate-900' : 'hover:bg-slate-50 text-slate-700'
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
                        className="w-7 h-7 rounded-md object-cover flex-shrink-0 border border-slate-200 bg-white shadow-2xs"
                      />
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate text-xs font-medium text-slate-800">{sub.name}</div>
                      </div>
                    </div>
                    {isCurrent && <Check className="w-3.5 h-3.5 text-slate-700 flex-shrink-0 stroke-[2.5]" />}
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
