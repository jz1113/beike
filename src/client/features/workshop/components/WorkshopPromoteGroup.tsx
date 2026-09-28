import { useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { BatchProductItem } from '../model/batchTypes';
import {
  analyzePromotedGroup, approvePromotedGroup, type PromotedGroupCandidate,
} from '../model/generation/promoteGroup';
import { reviewedFourShotGroup, reviewedGroupSignature } from '../model/generation/reviewedGroup';

type Preview = { groupIndex: number; signature: string; candidate: PromotedGroupCandidate; images: string[] };

export function WorkshopPromoteGroup({ item, visionModel }: { item: BatchProductItem; visionModel: string }) {
  const [busyGroup, setBusyGroup] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [savedGroups, setSavedGroups] = useState<string[]>([]);
  const [error, setError] = useState('');
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

  const approve = async () => {
    if (!preview || busyGroup !== null) return;
    const currentTasks = reviewedFourShotGroup(item, preview.groupIndex);
    if (reviewedGroupSignature(currentTasks) !== preview.signature) {
      setError('这组成图或审核状态已变化，请重新提炼当前四镜');
      return;
    }
    setBusyGroup(preview.groupIndex);
    setError('');
    try {
      await approvePromotedGroup(preview.candidate);
      setSavedGroups((groups) => [...new Set([...groups, preview.signature])]);
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '确认入库失败');
    } finally {
      setBusyGroup(null);
    }
  };

  const group = preview?.candidate.data.content_groups;
  const firstGroup = Array.isArray(group) && group[0] && typeof group[0] === 'object'
    ? group[0] as Record<string, unknown> : {};
  const summary = String(preview?.candidate.data.content_summary || preview?.candidate.data.contentSummary || '');
  const architecture = String(firstGroup.architecture_summary || firstGroup.architectureSummary || '');

  return <>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200/65 bg-indigo-50/30 px-3 py-2.5 text-xs">
      <span className="font-semibold text-slate-800">满意图组沉淀</span>
      <span className="text-slate-500">四镜全部点“采用”后，可提炼为新母本。</span>
      <div className="ml-auto flex flex-wrap gap-2">
        {groupIndices.map((groupIndex) => {
          const tasks = reviewedFourShotGroup(item, groupIndex);
          const saved = savedGroups.includes(reviewedGroupSignature(tasks));
          return <button key={groupIndex} type="button" disabled={!tasks || busyGroup !== null || saved}
            onClick={() => void analyze(groupIndex)}
            title={!tasks ? '请先将本组四张有效成图全部标记为采用' : undefined}
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white/70 px-2.5 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45">
            {busyGroup === groupIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {saved ? '已入库' : `提炼第 ${groupIndex + 1} 组`}
          </button>;
        })}
      </div>
    </div>
    {!preview && error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    {preview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && busyGroup === null) setPreview(null); }}>
      <section role="dialog" aria-modal="true" aria-label="确认衍生图组入库" className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-slate-50/95 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-base font-semibold text-slate-900">确认衍生母本</h3><p className="mt-1 text-xs text-slate-500">来自 {item.appliedFullPromptTitle || '当前图组母本'} · 第 {preview.groupIndex + 1} 组。确认后才加入提示词资产库。</p></div>
          <button type="button" aria-label="关闭" disabled={busyGroup !== null} onClick={() => setPreview(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/70"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {preview.images.map((url, index) => <div key={url} className="aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-transparent"><LazyProxyImage src={url} alt={`分镜 ${preview.groupIndex * 4 + index + 1}`} thumb width={240} className="h-full w-full !object-contain" /></div>)}
        </div>
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200/75 bg-transparent p-3 text-xs leading-5 text-slate-700">
          {summary && <p><strong>内容概括：</strong>{summary}</p>}
          {architecture && <p className="whitespace-pre-wrap"><strong>可复用镜头架构：</strong>{architecture}</p>}
          {!summary && !architecture && <p>四镜分析完成。确认后将这组构图、场景和动作提炼为新母本。</p>}
          {preview.candidate.previewShots.map((shot, index) => <details key={index} className="border-t border-slate-200/70 pt-2">
            <summary className="cursor-pointer font-semibold">镜头 {index + 1} · {shot.title || '查看反推提示词'}</summary>
            <p className="mt-1 whitespace-pre-wrap">{shot.reverse_prompt_zh || shot.reverse_prompt || '未返回逐镜提示词'}</p>
          </details>)}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
        <p className="mt-3 text-[11px] leading-5 text-slate-500">仅保存这组四镜母本；具体商品外观仍以今后生成时上传的商品图为准。</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={busyGroup !== null} onClick={() => setPreview(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">暂不入库</button>
          <button type="button" disabled={busyGroup !== null || reviewedGroupSignature(reviewedFourShotGroup(item, preview.groupIndex)) !== preview.signature}
            onClick={() => void approve()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {busyGroup !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />}确认加入资产库
          </button>
        </div>
      </section>
    </div>}
  </>;
}
