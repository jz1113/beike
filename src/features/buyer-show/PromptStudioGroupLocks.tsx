'use client';
import { ChevronDown, Film } from 'lucide-react';

export interface PromptStudioGroupLocksProps {
  workshopMode: string;
  masterScene: string;
  setMasterScene: (v: string) => void;
  identityBible: string;
  setIdentityBible: (v: string) => void;
  lookBible: string;
  setLookBible: (v: string) => void;
  styleBible: string;
  setStyleBible: (v: string) => void;
  productRole?: string | null;
  productFingerprint?: string;
  applyGroupLocksToPrompts: () => void;
  showToast: (msg: string) => void;
}

const PRODUCT_ROLE_LABELS: Record<string, string> = {
  worn_apparel: '服饰穿搭 · 服装外观只认商品图',
  worn_accessory: '配饰佩戴 · 配饰外观只认商品图',
  held_object: '手持展示 · 商品外观只认商品图',
  placed_object: '静物陈设 · 主体只认商品图',
};

export default function PromptStudioGroupLocks({
  workshopMode,
  masterScene,
  setMasterScene,
  identityBible,
  setIdentityBible,
  lookBible,
  setLookBible,
  styleBible,
  setStyleBible,
  productRole,
  productFingerprint,
  applyGroupLocksToPrompts,
  showToast,
}: PromptStudioGroupLocksProps) {
  return (
    <>
{workshopMode !== 'social_face_product_swap' && (
<details className="rounded-2xl bg-white border border-slate-200 group">
  <summary className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer list-none">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center text-xs font-bold flex-shrink-0">
        <Film className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-900">组级锁定 · Identity / Look / Scene</div>
        <p className="text-[11px] text-slate-500 truncate max-w-xl">
          {productRole
            ? PRODUCT_ROLE_LABELS[productRole] || productRole
            : masterScene || '分析后将写入主场景；展开可编辑后写回全部分镜'}
        </p>
      </div>
    </div>
    <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform flex-shrink-0" />
  </summary>
  <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
    {(productRole || productFingerprint) && (
      <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-[11px] text-emerald-900 space-y-0.5">
        {productRole && (
          <div>
            <span className="font-bold">跟品角色：</span>
            {PRODUCT_ROLE_LABELS[productRole] || productRole}
          </div>
        )}
        {productFingerprint && (
          <div className="text-emerald-800/90 line-clamp-2">
            <span className="font-bold">商品识别：</span>
            {productFingerprint}
          </div>
        )}
      </div>
    )}
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">主场景 master_scene</label>
      <textarea
        value={masterScene}
        onChange={(e) => setMasterScene(e.target.value)}
        rows={2}
        className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y"
        placeholder="全套统一主空间与光色关键词"
      />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">人设 identity</label>
        <textarea
          value={identityBible}
          onChange={(e) => setIdentityBible(e.target.value)}
          rows={2}
          className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y"
          placeholder="身份/正脸 ID 摘要"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">服饰 look</label>
        <textarea
          value={lookBible}
          onChange={(e) => setLookBible(e.target.value)}
          rows={2}
          className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y"
          placeholder="上装·下装·鞋履·配饰（服饰商品勿写颜色）"
        />
      </div>
    </div>
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">风格 style</label>
      <textarea
        value={styleBible}
        onChange={(e) => setStyleBible(e.target.value)}
        rows={2}
        className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y"
        placeholder="风格形容词 + 光线 + 真实写实"
      />
    </div>
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => {
          applyGroupLocksToPrompts();
          showToast('已将组级锁定写回全部分镜提示词');
        }}
        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
      >
        写回全部提示词
      </button>
    </div>
  </div>
</details>
)}
    </>
  );
}
