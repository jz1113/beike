import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { BatchProductItem } from '../model/batchTypes';
import {
  analyzePromotedGroup, approvePromotedGroup, loadMotherReplacement,
  replacePromotedGroup, type MotherReplacementState, type PromotedGroupCandidate,
} from '../api/promoteGroup';
import { reviewedFourShotGroup, reviewedGroupSignature } from '../model/generation/generationHelpers';
import { stableAssetCode } from '@shared/domain/assets/assetSampling';
import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { getCachedAssetsSync, invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';

type Preview = { groupIndex: number; signature: string; candidate: PromotedGroupCandidate; images: string[] };

export function WorkshopPromoteGroup({ item, visionModel }: { item: BatchProductItem; visionModel: string }) {
  const [busyGroup, setBusyGroup] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [savedGroups, setSavedGroups] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [replacement, setReplacement] = useState<MotherReplacementState | null>(null);
  useEffect(() => {
    let active = true;
    setReplacement(null);
    if (item.appliedFullPromptId) {
      void loadMotherReplacement(item.appliedFullPromptId).then(state => {
        if (active) setReplacement(state);
      }).catch(() => {
        if (active) {
          setReplacement(null);
          setError('读取来源母组换图状态失败，请刷新后再提炼图组');
        }
      });
    }
    return () => { active = false; };
  }, [item.appliedFullPromptId]);
  const current = (item.tasks || []).filter((task) => task.resultStatus !== 'superseded');
  const maxShot = Math.max(0, ...current.map((task) => task.shot_no));
  const groupIndices = Array.from({ length: Math.floor(maxShot / 4) }, (_, index) => index);
  if (!groupIndices.length) return null;

  const analyze = async (groupIndex: number) => {
    const tasks = reviewedFourShotGroup(item, groupIndex);
    if (!tasks || busyGroup !== null) return;
    setBusyGroup(groupIndex);
    setError('');
    try {
      const candidate = await analyzePromotedGroup({ item, groupIndex, tasks, visionModel });
      const signature = reviewedGroupSignature(tasks);
      if (candidate.reviewStatus === 'approved') {
        invalidateGlobalAssetCache();
        if (item.appliedFullPromptId) {
          void loadMotherReplacement(item.appliedFullPromptId).then(setReplacement).catch(() => null);
        }
        setSavedGroups((groups) => [...new Set([...groups, signature])]);
      } else {
        setPreview({ groupIndex, signature, candidate, images: tasks.map((task) => task.resultUrl!) });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图组提炼失败');
    } finally {
      setBusyGroup(null);
    }
  };

  const approve = async (action: 'publish' | 'replace') => {
    if (!preview || busyGroup !== null) return;
    const currentTasks = reviewedFourShotGroup(item, preview.groupIndex);
    if (reviewedGroupSignature(currentTasks) !== preview.signature) {
      setError('这组成图或审核状态已变化，请重新提炼当前四镜');
      return;
    }
    setBusyGroup(preview.groupIndex);
    setError('');
    try {
      if (action === 'replace') {
        if (preview.groupIndex !== 0 || !replacement?.replaceable) throw new Error('当前母组不能再次替换图片');
        await replacePromotedGroup(preview.candidate);
        setReplacement({ ...replacement, replaced: true, replaceable: false, replacedAt: new Date().toISOString() });
      } else {
        await approvePromotedGroup(preview.candidate);
      }
      invalidateGlobalAssetCache();
      setSavedGroups((groups) => [...new Set([...groups, preview.signature])]);
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '确认图组失败');
    } finally {
      setBusyGroup(null);
    }
  };

  const group = preview?.candidate.data.content_groups;
  const firstGroup = Array.isArray(group) && group[0] && typeof group[0] === 'object'
    ? group[0] as Record<string, unknown> : {};
  const summary = String(preview?.candidate.data.content_summary || preview?.candidate.data.contentSummary || '');
  const architecture = String(firstGroup.architecture_summary || firstGroup.architectureSummary || '');
  const sourceGroupNumber = item.appliedFullPromptDisplayNumber
    ?? getCachedAssetsSync('full_prompt').find(group => group.id === item.appliedFullPromptId)?.displayNumber;
  const sourceGroupName = !item.appliedFullPromptId ? '当前图组母本'
    : `母本 ${sourceGroupNumber ? fullPromptGroupLabel(sourceGroupNumber) : `#${stableAssetCode('R', item.appliedFullPromptId)}`}`;

  return <>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200/65 bg-indigo-50/30 px-3 py-2.5 text-xs">
      <span className="font-semibold text-slate-800 dark:text-slate-100">满意图组沉淀</span>
      <span className="text-slate-500 dark:text-slate-400">四镜全部点“采用”后，可重析入库；首组还可用于原母本的一次性换图。</span>
      {replacement?.replaced && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">来源母组已换图</span>}
      <div className="ml-auto flex flex-wrap gap-2">
        {groupIndices.map((groupIndex) => {
          const tasks = reviewedFourShotGroup(item, groupIndex);
          const saved = savedGroups.includes(reviewedGroupSignature(tasks));
          return <button key={groupIndex} type="button" disabled={!tasks || busyGroup !== null || saved}
            onClick={() => void analyze(groupIndex)}
            title={!tasks ? '请先将本组四张有效成图全部标记为采用' : undefined}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white/70 px-2.5 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#18191c]/95">
            {busyGroup === groupIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {saved ? '已处理' : groupIndex === 0 ? '提炼原四镜' : `提炼衍生四镜 ${groupIndex}`}
          </button>;
        })}
      </div>
    </div>
    {!preview && error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    {preview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && busyGroup === null) setPreview(null); }}>
      <section role="dialog" aria-modal="true" aria-label="确认衍生图组入库" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/95 p-5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#18191c]">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">确认四镜成图</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">来自 {sourceGroupName} · 本次成图第 {preview.groupIndex + 1} 组。可新增衍生母本；首组也可审核后替换来源母组图片一次。</p></div>
          <button type="button" aria-label="关闭" disabled={busyGroup !== null} onClick={() => setPreview(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/70 dark:text-slate-400"><X className="h-4 w-4" /></button>
        </div>
        {preview.groupIndex === 0 && replacement?.replaceable && replacement.sourceImages.length === 4 && <>
          <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">来源母组 · 当前展示图</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {replacement.sourceImages.map((url, index) => <div key={index} className="aspect-[3/4] overflow-hidden rounded-lg bg-slate-100 dark:bg-white/10"><LazyProxyImage src={url} alt={`原母组镜头 ${index + 1}`} thumb width={240} className="h-full w-full !object-contain" /></div>)}
          </div>
        </>}
        <p className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">本次已采用的生成图</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {preview.images.map((url, index) => <div key={url} className="aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-transparent dark:border-white/10"><LazyProxyImage src={url} alt={`分镜 ${preview.groupIndex * 4 + index + 1}`} thumb width={240} className="h-full w-full !object-contain" /></div>)}
        </div>
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200/75 bg-transparent p-3 text-xs leading-5 text-slate-700 dark:text-slate-200">
          {summary && <p><strong>内容概括：</strong>{summary}</p>}
          {architecture && <p className="whitespace-pre-wrap"><strong>可复用镜头架构：</strong>{architecture}</p>}
          {!summary && !architecture && <p>四镜分析完成。确认后将这组构图、场景和动作提炼为新母本。</p>}
          {preview.candidate.previewShots.map((shot, index) => <details key={index} className="border-t border-slate-200/70 pt-2 dark:border-white/10">
            <summary className="cursor-pointer font-semibold">镜头 {index + 1} · {shot.title || '查看反推提示词'}</summary>
            <p className="mt-1 whitespace-pre-wrap">{shot.reverse_prompt_zh || shot.reverse_prompt || '未返回逐镜提示词'}</p>
          </details>)}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
        <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">替换将保留母组编号并更新四张展示图及其反推提示词，旧图不再作为母组图片保存；每个母组仅可替换一次。新增衍生母本则保留原母组不变。</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busyGroup !== null} onClick={() => setPreview(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 dark:border-white/10">暂不入库</button>
          {preview.groupIndex === 0 && replacement?.replaceable && <button type="button" disabled={busyGroup !== null || reviewedGroupSignature(reviewedFourShotGroup(item, preview.groupIndex)) !== preview.signature}
            onClick={() => void approve('replace')} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busyGroup !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />}替换来源母组图（仅一次）
          </button>}
          <button type="button" disabled={busyGroup !== null || reviewedGroupSignature(reviewedFourShotGroup(item, preview.groupIndex)) !== preview.signature}
            onClick={() => void approve('publish')} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${preview.groupIndex === 0 && replacement?.replaceable ? 'border border-indigo-200 bg-white text-indigo-700 dark:bg-[#18191c]' : 'bg-indigo-600 text-white'}`}>
            {busyGroup !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />}新增衍生母本
          </button>
        </div>
      </section>
    </div>}
  </>;
}
