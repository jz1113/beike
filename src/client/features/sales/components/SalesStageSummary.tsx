import { Check, Circle } from 'lucide-react';
import type { SalesWorkflowStep } from '../model/salesWorkspaceView';

const STAGES = {
  product: { title: '从一款商品开始', detail: '采集商品与 SKU 规格，AI 提炼卖点并选好参考图，在底部设置创作参数后生成口播脚本。' },
  plan: { title: '核对口播脚本与分镜视频提示词', detail: '已根据提炼卖点生成每段口播、视频提示词与所需素材图计划；确认后进入下一步生成所需图片。' },
  assets: { title: '生成并确认所需素材图片', detail: '按脚本规划生成人物、场景或关键帧参考图；检查商品细节无误后确认图片。' },
  video: { title: '绑定实图定稿，确认生成视频', detail: '将已生成的参考图（图片1、图片2…）与脚本合成为最终整段视频提示词，确认后生成完整视频。' },
  result: { title: '查看成片与生成记录', detail: '查看任务状态、预览成片或复制发布文案。未完成的任务可继续查询。' },
};

export function SalesStageSummary({ step, checks }: { step: SalesWorkflowStep; checks: { label: string; done: boolean }[] }) {
  const stage = STAGES[step];
  if (step === 'product') return <section aria-label="当前制作阶段" className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-white/[0.08]">
    <h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">确认后生成口播脚本</h2>
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5">{checks.map(({ label, done }) => <li key={label} className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
      {done ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}<span>{label}</span><span className="sr-only">{done ? '，已完成' : '，待完成'}</span>
    </li>)}</ul>
  </section>;
  return <section aria-label="当前制作阶段" className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-white/10">
    <h2 className="text-sm font-semibold">{stage.title}</h2>
    <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{stage.detail}</p>
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
      {checks.map(({ label, done }) => <li key={label} className={`inline-flex items-center gap-1.5 text-[11px] ${done ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}`}>
        {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}<span>{label}</span><span className="sr-only">{done ? '，已完成' : '，待完成'}</span>
      </li>)}
    </ul>
  </section>;
}
