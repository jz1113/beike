'use client';
import { Link as LinkIcon } from 'lucide-react';
import { IMAGE_RATIO_ITEMS } from './promptBarConstants';
import { isGptImageModelId } from './gptImageGatewaySizes';
import { isDedicated4kUserModel } from '@/lib/modelAdapters/image/normalizeOpenAiImageModel';

interface Props {
  quickAspectId: string;
  setQuickAspectId: (id: string) => void;
  quickQuality: 'high' | 'medium' | 'low';
  setQuickQuality: (q: 'high' | 'medium' | 'low') => void;
  quickCount: number;
  setQuickCount: (n: number) => void;
  currentW: number;
  currentH: number;
  imageModelId?: string;
}

/** 图片模式：比例 / 质量 / 数量 / 尺寸参数面板 */
export default function PromptBarImageControls({
  quickAspectId,
  setQuickAspectId,
  quickQuality,
  setQuickQuality,
  quickCount,
  setQuickCount,
  currentW,
  currentH,
  imageModelId,
}: Props) {
  const isDedicated4k = isDedicated4kUserModel(imageModelId || '');
  const isGptImageStandard =
    isGptImageModelId(imageModelId) &&
    !isDedicated4k &&
    imageModelId?.toLowerCase() === 'gpt-image-2';
  const showStandard4kHint = isGptImageStandard && quickQuality === 'high';
  const showDedicated2kHint = isDedicated4k && quickQuality !== 'high';

  return (
    <>
      {/* Section 1: 选择比例 */}
      <div className="space-y-2.5">
        <div className="text-xs sm:text-sm font-bold text-slate-700">选择比例</div>
        <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1">
          {IMAGE_RATIO_ITEMS.map(r => {
            const isSelected = quickAspectId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setQuickAspectId(r.id)}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl transition-all cursor-pointer min-w-[48px] flex-1 ${
                  isSelected
                    ? 'bg-slate-100 border border-slate-400 text-slate-900 font-bold shadow-xs'
                    : 'hover:bg-slate-50 text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className="h-7 w-7 flex items-center justify-center text-current">
                  {r.iconType === 'smart' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="8" y="8" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
                    </svg>
                  )}
                  {r.iconType === 'ultrawide' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="1" y="8" width="22" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'wide169' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="7" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'wide32' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'wide43' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'square' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'tall34' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'tall23' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="6" y="3" width="12" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                  {r.iconType === 'tall916' && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  )}
                </div>
                <span className="text-xs mt-1.5 font-mono font-semibold">{r.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: 选择质量 */}
      <div className="space-y-2.5">
        <div className="text-xs sm:text-sm font-bold text-slate-700">选择质量</div>
        <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1.5">
          {[
            { id: 'low', label: '1K' },
            { id: 'medium', label: '2K ✦' },
            { id: 'high', label: '4K ✦' }
          ].map(q => {
            const isSelected = quickQuality === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setQuickQuality(q.id as 'high' | 'medium' | 'low')}
                className={`flex-1 py-2.5 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{q.label}</span>
              </button>
            );
          })}
        </div>
        {showStandard4kHint && (
          <p className="text-[11px] text-amber-700/90 leading-snug px-1">
            标准 GPT Image 2 选 4K 将传 quality=high 与官方 4K 尺寸（如 3840×2160），model 保持 gpt-image-2。
          </p>
        )}
        {showDedicated2kHint && (
          <p className="text-[11px] text-slate-500 leading-snug px-1">
            4K 专线（gpt-image-2-4k）固定真 4K 像素尺寸；1K/2K 档位仅对标准 GPT Image 2 生效。
          </p>
        )}
      </div>

      {/* Section 3: 选择生成数量 */}
      <div className="space-y-2.5">
        <div className="text-xs sm:text-sm font-bold text-slate-700">选择生成数量</div>
        <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1.5">
          {[1, 2, 3, 4].map(num => {
            const isSelected = quickCount === num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => setQuickCount(num)}
                className={`flex-1 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 4: 尺寸数值 */}
      <div className="space-y-2 pt-1">
        <div className="text-xs sm:text-sm font-bold text-slate-700">尺寸</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-mono text-slate-600 flex items-center justify-between shadow-2xs">
            <span className="text-slate-400 font-bold">W</span>
            <span className="font-extrabold text-slate-900 text-base">{currentW}</span>
          </div>
          <LinkIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-mono text-slate-600 flex items-center justify-between shadow-2xs">
            <span className="text-slate-400 font-bold">H</span>
            <span className="font-extrabold text-slate-900 text-base">{currentH}</span>
          </div>
          <span className="text-xs font-bold text-slate-400 font-mono">PX</span>
        </div>
      </div>
    </>
  );
}
