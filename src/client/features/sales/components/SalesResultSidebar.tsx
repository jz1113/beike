import type { SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { salesActualReferences } from '@shared/domain/sales';
import MarkdownCodeBlock from '@client/shared/ui/markdown/MarkdownCodeBlock';
import { SalesPromptReferences } from './SalesPromptReferences';
import { SalesScriptOutline } from './salesPlanning';
import { SalesVideoMaterials } from './SalesVideoMaterials';
import { salesCardClass, salesSectionTitleClass } from './salesChrome';

export function SalesResultSidebar({ script, productImages }: { script: VideoSalesScript; productImages: SalesImageRef[] }) {
  let references: ReturnType<typeof salesActualReferences> = [];
  try { references = salesActualReferences(script, productImages); } catch { /* 方案尚未完成时仍展示脚本与可用素材。 */ }
  return <div className="space-y-5">
    <SalesScriptOutline script={script} productImages={productImages} showPlannedAssets={false} />
    <SalesVideoMaterials script={script} productImages={productImages} />
    <section aria-label="完整视频提示词" className="border-t border-slate-200/70 pt-5 dark:border-white/10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={salesSectionTitleClass}>完整视频提示词</h2>
        <span className="text-[11px] text-slate-400">{script.fullPrompt?.trim() ? '已生成' : '未生成'}</span>
      </div>
      {script.fullPrompt?.trim() ? <MarkdownCodeBlock code={script.fullPrompt} renderedCode={<SalesPromptReferences prompt={script.fullPrompt} references={references} />} /> : <div className={`${salesCardClass} p-3 text-xs leading-6 text-slate-500 dark:text-slate-400`}>视频提示词将在素材确认后生成。</div>}
    </section>
  </div>;
}
