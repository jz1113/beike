import { Check, Circle } from 'lucide-react';
import type { SalesWorkflowStep } from '../model/salesWorkspaceView';

const STAGES = {
  product: { title: '从一款商品开始', detail: '采集商品链接或上传图片，选好本次参考图，再设置创作规则。' },
  plan: { title: '检查口播与画面节奏', detail: '核对商品事实、每段口播和时长。确认脚本后，再准备需要的素材。' },
  assets: { title: '准备并确认素材图片', detail: '只补齐缺失素材；已有任务优先查询。检查商品细节后确认图片。' },
  video: { title: '定稿后，单独确认出片', detail: '按真实图片生成完整提示词，检查模型能力后，再提交一条整段视频。' },
  result: { title: '查看成片与生成记录', detail: '查看任务状态、预览成片或复制发布文案。未完成的任务可继续查询。' },
};

export function SalesStageSummary({ step, checks }: { step: SalesWorkflowStep; checks: { label: string; done: boolean }[] }) {
  const stage = STAGES[step];
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
