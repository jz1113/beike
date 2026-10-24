import { ShieldCheck } from 'lucide-react';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import type { CategorySkillState, CategorySkillVersion } from '@shared/contracts/categorySkills';

interface Props {
  version: CategorySkillVersion;
  state: CategorySkillState;
  groupNumbers?: Map<string, number>;
  busy: boolean;
  onPreview: (id: string) => void;
  onRun: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
}
export function CategorySkillVersionCard({ version, state, groupNumbers, busy, onPreview, onRun }: Props) {
  const validation = state.validations[version.id];
  const current = version.id === state.scope.activeVersionId;
  const trying = version.id === state.scope.trialVersionId;
  const compatible = version.parentVersionId === state.scope.activeVersionId;
  const memoryCurrent = !version.manifest.memoryFingerprint || version.manifest.memoryFingerprint === state.memory.fingerprint;
  const number = state.versions.length - state.versions.findIndex(item => item.id === version.id);
  return <article className={`rounded-xl border bg-white p-4 sm:p-5 dark:bg-[#18191c] ${current || trying ? 'border-indigo-300 dark:border-indigo-400/30' : 'border-slate-200 dark:border-white/10'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">版本 {number} <span className={`ml-2 rounded-md px-2 py-1 text-[11px] ${current ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300'}`}>{current ? '正式使用' : trying ? '正在试用' : compatible ? '可启用' : '历史版本'}</span></span>
      <time className="text-[11px] text-slate-500">{new Date(version.createdAt).toLocaleString()}</time>
    </div>
    <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-600 dark:text-slate-300">{version.summary}</p>
    <p className="mt-3 text-[11px] leading-5 text-slate-500">{version.manifest.samples.filter(sample => sample.role === 'training').length} 套学习依据 · {version.manifest.notes?.length || 0} 条经验快照</p>
    <details className="mt-3 text-xs"><summary className="cursor-pointer font-medium text-indigo-600 dark:text-indigo-300">查看完整提示词架构与构建技能</summary>
      <p className="mt-3 text-[11px] text-slate-500">模型：{version.model} · 记录：{version.id.slice(0, 8)}</p>
      <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans leading-6 dark:bg-black/20">{version.promptSnippet}</pre>
      <ul className="mt-3 space-y-3">{version.manifest.ruleEvidence?.map((evidence, index) => <li key={index} className="border-l-2 border-indigo-300 pl-3 leading-6">
        {evidence.rule}<span className="block text-slate-500">架构与适用条件：{evidence.condition}</span>
        <button type="button" onClick={() => onPreview(evidence.groupId)} className="text-indigo-500 underline">
          查看来源（{groupNumbers?.get(evidence.groupId) ? fullPromptGroupLabel(groupNumbers.get(evidence.groupId)) : '原图组'}）
        </button>
      </li>)}</ul>
      {Boolean(version.manifest.notes?.length) && <ul className="mt-4 list-disc pl-4 text-slate-500">{version.manifest.notes?.map(note => <li key={note.id}>{note.kind === 'avoid' ? '避坑' : '偏好'}：{note.content}</li>)}</ul>}
    </details>
    {!current && compatible && <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5">
      <p className="flex items-start gap-2 text-xs leading-6 text-slate-500"><ShieldCheck className="mt-1 h-3.5 w-3.5 shrink-0" />{!memoryCurrent ? '经验记忆已变化，请整理新版本后再试用。' : '可直接启用；成图对照为可选项。'}（{validation?.pairs || 0} 镜对照 / {validation?.products || 0} 款商品）</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || trying || !memoryCurrent} onClick={() => void onRun('trial', { versionId: version.id })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-40 dark:border-white/10">{trying ? '后续分析正在试用' : '试用这个版本'}</button>
        {validation?.passed ? (
          <button type="button" disabled={busy || !memoryCurrent} onClick={() => void onRun('publish', { versionId: version.id })} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">升级为正式技能</button>
        ) : (
          <button type="button" disabled={busy || !memoryCurrent} onClick={() => void onRun('activate', { versionId: version.id })} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">直接设为正式技能</button>
        )}
      </div>
    </div>}
  </article>;
}
