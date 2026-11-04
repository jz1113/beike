import { useState } from 'react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';
import type { SalesStudioAssetCatalog } from '../api/salesProduction';
import { findSalesAssetDraftJob, readSalesAssetDraft, restoreSalesAssetDraftJob, salesAssetDraftKey, writeSalesAssetDraft } from '../model/salesAssetDraft';
import type { SalesAssetSection } from '../model/salesWorkspace';

export function useSalesAssetDraftRecovery(kind: SalesAssetSection, catalog: SalesStudioAssetCatalog, ready: boolean) {
  const [workspace] = useState(getWorkspaceSecret);
  const [jobs, setJobs] = useState<SalesAssetViewJob[]>([]);
  const [jobsReady, setJobsReady] = useState(false);
  const [, changed] = useState(0);
  const [error, setError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const key = kind === 'persona' || kind === 'scene' ? salesAssetDraftKey(workspace, kind) : '';
  const draft = key ? readSalesAssetDraft(key) : null;
  const job = findSalesAssetDraftJob(draft, kind, jobs);
  const assetId = draft?.assetId || draft?.request?.assetId || job?.assetId;
  const persona = kind === 'persona' ? catalog.personas.find((item) => item.id === assetId) : undefined;
  const scene = kind === 'scene' ? catalog.scenes.find((item) => item.id === assetId) : undefined;
  const active = job && job.status !== 'completed' && job.status !== 'failed';
  const checking = Boolean(assetId && (!ready || !persona && !scene && draft?.request && !jobsReady));
  const orphaned = Boolean(assetId && !checking && !persona && !scene && !active);
  const images = new Set([...Object.values(draft?.views || {}), ...Object.values(draft?.request?.images || {}), draft?.creation?.referenceImageUrl].filter(Boolean)).size;
  const hasDraft = Boolean(draft && (draft.fields.name?.trim() || images || draft.request));
  const title = checking ? '正在核对草稿' : orphaned ? '关联资产已删除的草稿' : persona || scene ? '已入库资产的暂存编辑' : active ? '生成中的草稿' : '未入库草稿';
  const description = checking ? '正在核对关联资产，请稍候。' : orphaned ? '本机暂存内容仍保留。放弃草稿后可新建，不会恢复已删除资产。'
    : persona || scene ? '继续编辑将更新原资产，不会重复入库。' : active ? '后台生成仍在进行，继续编辑可查看原任务。'
      : `${images ? `${images} 张参考图已暂存` : draft?.request ? '生成任务已暂存' : '填写内容已暂存'}，继续编辑后保存到资产库。`;

  const prepare = () => {
    if (checking || orphaned) return false;
    if (key && JSON.stringify(readSalesAssetDraft(key)) !== JSON.stringify(draft)) {
      setError('草稿已更新，请重新打开。'); changed((value) => value + 1); return false;
    }
    if (draft && job) {
      try { writeSalesAssetDraft(key, restoreSalesAssetDraftJob(draft, job)); }
      catch { setError('草稿恢复失败，本机内容已保留，请重试。'); return false; }
    }
    setError(''); return true;
  };
  const discard = async () => {
    if (!key || discarding) return false;
    setDiscarding(true); setError('');
    try {
      const original = localStorage.getItem(key);
      if (!await confirmAction({ title: '放弃本机草稿？', description: '只清除当前本机草稿，已入库资产、后台任务和图片文件会保留。', confirmText: '放弃草稿', danger: true })) return false;
      if (localStorage.getItem(key) !== original) { setError('草稿已更新，请重新确认后再放弃。'); return false; }
      localStorage.removeItem(key); changed((value) => value + 1); return true;
    } catch { setError('本机草稿清除失败，内容已保留，请重试。'); return false; }
    finally { setDiscarding(false); }
  };
  return { draft, hasDraft, persona, scene, checking, orphaned, title, description, error, discarding, prepare, discard,
    onJobsLoaded: (next: SalesAssetViewJob[]) => { setJobs(next); setJobsReady(true); } };
}
