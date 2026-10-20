import type { VideoSalesCategory } from '@shared/domain/video-sales';
import { SALES_SKILL_OPTIONS, salesCategoryForSkill, salesSkillId, type SalesSkillId } from '../model/fashionSalesSkill';
import { SalesCreationRule } from './SalesCreationRule';
import { salesDividerClass, salesFocusClass, salesGroupClass, salesInputClass, salesLabelClass, salesSectionTitleClass } from './salesSurface';

interface Props {
  productName: string;
  brand: string;
  priceLabel: string;
  category: VideoSalesCategory;
  sellingPoints: string;
  disabled: boolean;
  onOpenRules: () => void;
  onChange: (patch: { productName?: string; brand?: string; priceLabel?: string; category?: VideoSalesCategory; sellingPoints?: string }) => void;
}

export function SalesProductFields({ productName, brand, priceLabel, category, sellingPoints, disabled, onOpenRules, onChange }: Props) {
  return (
    <section className={`${salesGroupClass} ${salesDividerClass}`}>
      <h2 className={salesSectionTitleClass}>商品资料</h2>
      <label className={salesLabelClass}>商品名称<span className="ml-1 text-[10px] font-normal text-slate-400">必填</span>
        <input value={productName} placeholder="填写可核实的商品名称" disabled={disabled} onChange={(event) => onChange({ productName: event.target.value })} className={salesInputClass} />
      </label>
      <label className={salesLabelClass}>创作技能
        <select value={salesSkillId(category)} disabled={disabled} onChange={(event) => onChange({ category: salesCategoryForSkill(event.target.value as SalesSkillId) })} className={salesInputClass}>
          {SALES_SKILL_OPTIONS.map((skill) => <option key={skill.id} value={skill.id} className="bg-white text-slate-900 dark:bg-[#1B1B1E] dark:text-slate-100">{skill.label}</option>)}
        </select>
      </label>
      <SalesCreationRule category={category} onOpenRules={onOpenRules} />
      <label className={salesLabelClass}>已知卖点<span className="ml-1 text-[10px] font-normal text-slate-400">可选</span>
        <textarea rows={3} value={sellingPoints} placeholder="只填写有依据的卖点，留空时由商品资料提炼" disabled={disabled} onChange={(event) => onChange({ sellingPoints: event.target.value })} className={`${salesInputClass} resize-y leading-6`} />
      </label>
      <details className="rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
        <summary className={`cursor-pointer rounded text-xs font-medium text-slate-500 dark:text-slate-400 ${salesFocusClass}`}>补充品牌与价格 · 可选</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={salesLabelClass}>品牌<input value={brand} disabled={disabled} onChange={(event) => onChange({ brand: event.target.value })} className={salesInputClass} /></label>
          <label className={salesLabelClass}>价格<input value={priceLabel} disabled={disabled} onChange={(event) => onChange({ priceLabel: event.target.value })} className={salesInputClass} /></label>
        </div>
      </details>
    </section>
  );
}
