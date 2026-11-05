import type { CreationSkillFlow } from '../model/creationSkillFlows';
import type { SkillExampleInput } from '../model/builtinSkillPreviews';

export function CreationSkillFlowGuide({ flow, example, onExample }: { flow: CreationSkillFlow; example?: SkillExampleInput; onExample: () => void }) {
  return <section aria-label="如何使用" className="space-y-4 border-t border-slate-200/70 pt-4 dark:border-white/[0.08]">
    <ol className="flex gap-3 text-xs text-slate-600 dark:text-neutral-300">{flow.steps.map((step, index) =>
      <li key={step} className="flex min-w-0 flex-1 items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] dark:bg-white/10">{index + 1}</span><span className="pt-0.5">{step}</span></li>)}</ol>
    <dl className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><dt className="text-xs font-medium text-slate-900 dark:text-white">准备什么</dt><dd className="text-xs leading-6 text-slate-500 dark:text-neutral-400">{flow.inputHint}</dd></div><div className="space-y-1"><dt className="text-xs font-medium text-slate-900 dark:text-white">你会得到</dt><dd className="text-xs leading-6 text-slate-500 dark:text-neutral-400">{flow.output}</dd></div></dl>
    <div className="rounded-xl border border-slate-200 p-3.5 text-xs leading-6 dark:border-white/10">
      {example && <div className="mb-3 flex items-center gap-3"><div className="flex gap-2">{example.referenceImages.map((url, index) => <img key={url} src={url} alt={`示例参考素材 ${index + 1}`} loading="lazy" className="h-12 w-16 rounded-lg bg-slate-100 object-contain dark:bg-white/5" />)}</div><span className="text-slate-500 dark:text-neutral-400">示例参考素材 · {example.referenceImages.length} 张</span></div>}
      <p className="text-slate-600 dark:text-neutral-300">{example?.prompt || flow.example}</p>
      <button type="button" onClick={onExample} className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">{example ? '使用示例' : '试试这个'} →</button>
      {example && <p className="mt-2 text-[11px] text-slate-400 dark:text-neutral-500">将参考素材与提示词一起带入，可修改后发送。</p>}
    </div>
  </section>;
}
