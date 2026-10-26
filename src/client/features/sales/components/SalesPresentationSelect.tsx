import type { VideoSalesMode } from '@shared/domain/sales';

const PRESENTATIONS = [
  { value: 'live_presenter', label: '人物讲解', description: '人物对镜头亲口讲解，展示段可搭配画外音。' },
  { value: 'product_closeup', label: '商品展示＋旁白', description: '商品、手部、背影或不露脸上身展示，搭配画外音，由脚本安排画面。' },
] as const;

export function SalesPresentationSelect({ value, disabled, className, showDescription, onChange }: {
  value: VideoSalesMode;
  disabled: boolean;
  className: string;
  showDescription?: boolean;
  onChange: (value: VideoSalesMode) => void;
}) {
  // Project legacy voiceover modes into one choice without rewriting saved plans or their revisions.
  const presentation = PRESENTATIONS[value === 'live_presenter' ? 0 : 1];
  return <>
    <select aria-label="呈现方式" aria-description={presentation.description} title={presentation.description} value={presentation.value} disabled={disabled} className={className} onChange={(event) => onChange(event.target.value as VideoSalesMode)}>
      {PRESENTATIONS.map((option) => <option key={option.value} value={option.value} className="bg-white text-slate-900 dark:bg-[#1B1B1E] dark:text-slate-100">{option.label}</option>)}
    </select>
    {showDescription && <span className="mt-1 block text-[11px] font-normal leading-5 text-slate-500 dark:text-slate-400">{presentation.description}</span>}
  </>;
}
