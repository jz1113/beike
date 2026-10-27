import type { CategorySkillState } from '@shared/contracts/categorySkills';
import { categoryReadCount } from '../../model/categoryAgent';

export function CategoryLearningSummary({ state, maxNewSamples }: { state: CategorySkillState; maxNewSamples: number }) {
  const { dataset, memory } = state;
  const roundCount = categoryReadCount(state, maxNewSamples);
  const freshPending = Math.max(0, memory.pending - (memory.stale ?? 0) - (memory.failed ?? 0));
  const pipeline = [
    ['1', '新增或变更资料'],
    ['2', '逐组读图并保存'],
    ['3', '整理候选技能'],
    ['4', '试用与实图对照'],
    ['5', '人工确认启用'],
  ];
  const counts = [
    { label: '图组总数', count: dataset.total },
    { label: '已记住', count: memory.learned },
    { label: '待读图', count: Math.max(0, memory.pending - (memory.stale ?? 0) - (memory.failed ?? 0)) },
    ...(memory.stale ? [{ label: '需重新学习', count: memory.stale }] : []),
    ...(memory.failed ? [{ label: '失败待重试', count: memory.failed }] : []),
    ...(memory.rejected ? [{ label: '读图后不适用', count: memory.rejected }] : []),
    ...(memory.holdout ? [{ label: '独立验证', count: memory.holdout }] : []),
    ...(dataset.duplicates ? [{ label: '重复来源', count: dataset.duplicates }] : []),
    ...(dataset.excluded ? [{ label: '未纳入学习', count: dataset.excluded }] : []),
  ];
  return <div aria-label="类目读图统计" className="border-t border-slate-100 px-4 py-3 text-xs dark:border-white/[0.06]">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,1fr)]">
      <div>
        <p className="font-semibold text-slate-700 dark:text-slate-200">技能学习流程</p>
        <ol className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {pipeline.map(([step, label], index) => <li key={step} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">{step}</span>
            <span className="truncate">{label}</span>
            {index < pipeline.length - 1 && <span className="sr-only">之后</span>}
          </li>)}
        </ol>
      </div>
      <div className="rounded-lg bg-indigo-50/70 px-3 py-2.5 leading-5 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200">
        <p className="font-semibold">本轮只处理新增或需要补齐的组</p>
        <p className="mt-0.5 text-[11px]">成功观察且原图、反推词、学习指令都未变的组会直接复用，不会重复读图。</p>
      </div>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 xl:grid-cols-8">
      {counts.map(({ label, count }) => <div key={label} className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
        <dt className="truncate text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="shrink-0 font-semibold tabular-nums">{count} 组</dd>
      </div>)}
      <div className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-white/[0.04]"><dt className="truncate text-slate-500 dark:text-slate-400">手动经验</dt><dd className="shrink-0 font-semibold tabular-nums">{memory.notes.length} 条</dd></div>
    </dl>
    <p className="mt-3 leading-5 text-slate-500 dark:text-slate-400">
      {roundCount > 0
        ? `本轮最多读取 ${roundCount} 组（${roundCount * 4} 张原图）${memory.pending > roundCount ? '，其余待处理组需手动开始下一轮' : ''}。其中新增 ${freshPending} 组，需重学 ${memory.stale ?? 0} 组，失败待重试 ${memory.failed ?? 0} 组。`
        : '当前没有待处理图组；整理技能会使用已保存的观察和手动经验。自动学习开启时也只会自动启动一轮，不会无限重跑。'}
    </p>
    {(memory.stale ?? 0) > 0 && <p className="mt-1 leading-5 text-amber-600 dark:text-amber-300">原图、反推词或学习指令已更新：{memory.stale ?? 0} 组需重新学习。旧观察保留，重学不会整库重读。</p>}
    {(memory.failed ?? 0) > 0 && <p className="mt-1 leading-5 text-amber-600 dark:text-amber-300">失败组会单独保留，点击重试后只补读失败和未完成的组，已成功的观察不会重复调用模型。</p>}
    {(dataset.excluded > 0 || dataset.duplicates > 0) && <p className="mt-1 leading-5 text-slate-500 dark:text-slate-400">重复来源仅学习一次；资料不完整、生成来源、未发布或类目不符的图组不纳入本轮学习。</p>}
  </div>;
}
