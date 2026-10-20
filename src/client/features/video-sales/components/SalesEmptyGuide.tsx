import { Clapperboard, FileText, Images, Video } from 'lucide-react';
import type { VideoSalesCategory } from '@shared/domain/video-sales';
import { SalesCreationRule } from './SalesCreationRule';
import { salesCardClass } from './salesSurface';

interface Props { kind: 'plan' | 'result' | 'assets' | 'video'; category?: VideoSalesCategory; onOpenRules?: () => void }
const CONTENT = {
  plan: { title: '先确认商品，再编写口播', input: '商品资料、当前颜色和参考图', output: '口播时间轴与素材计划', icon: FileText, steps: ['确认本次商品颜色与可用图片', '设置目标时长、画幅和多模态模型', '编写脚本后，分步确认素材与视频'] },
  assets: { title: '脚本确认后，准备素材图片', input: '有效脚本与素材计划', output: '实际图片与校验状态', icon: Images, steps: ['先完成商品确认与口播脚本', '仅生成脚本需要的人物、场景或关键帧', '素材通过校验后，再进入视频定稿'] },
  video: { title: '素材完成后，定稿整段视频', input: '已校验素材与视频模型配置', output: '一条完整视频提示词', icon: Clapperboard, steps: ['先完成必要素材与校验', '按实际图片与模型能力定稿提示词', '定稿后单独确认付费生成，整段一次出片'] },
  result: { title: '成片与任务状态会显示在这里', input: '已明确确认的视频生成任务', output: '可预览、下载的完整视频', icon: Video, steps: ['先完成素材与视频定稿', '单独确认生成一条整段视频', '已有回执优先查询，不重复提交'] },
};

export function SalesEmptyGuide({ kind, category, onOpenRules }: Props) {
  const content = CONTENT[kind];
  const Icon = content.icon;
  return <div className="flex min-h-full items-center justify-center p-4 sm:p-6"><section aria-label="当前阶段说明" className="w-full max-w-lg py-8">
    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20"><Icon className="h-5 w-5" aria-hidden /></span>
    <h2 className="text-lg font-semibold leading-8">{content.title}</h2>
    <dl className={`mt-5 grid gap-4 p-4 sm:grid-cols-2 ${salesCardClass}`}>{[['输入', content.input], ['产出', content.output]].map(([label, value]) => <div key={label}><dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 text-[13px] leading-6">{value}</dd></div>)}</dl>
    {kind === 'plan' && category && onOpenRules && <div className="mt-5"><SalesCreationRule category={category} onOpenRules={onOpenRules} /></div>}
    <ol className="mt-5 space-y-3 text-xs leading-6 text-slate-500 dark:text-slate-400">{content.steps.map((step, index) => <li key={step} className="flex gap-2.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 text-[10px] dark:bg-white/5">{index + 1}</span><span>{step}</span></li>)}</ol>
  </section></div>;
}
