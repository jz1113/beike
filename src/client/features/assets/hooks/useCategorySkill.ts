import { useCallback, useEffect, useRef, useState } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { subscribeAssetInvalidation } from '@client/shared/api/assetLibraryCache';
import type { CategorySkillState } from '@shared/contracts/categorySkills';
import { changeCategorySkill, learnCategorySkill, readCategorySkill } from '../api/categorySkills';
import { canAutoLearn } from '../model/categoryAgent';

export function useCategorySkill(folderId: string, modelId: string, maxNewSamples: number, autoLearn = true) {
  const [state, setState] = useState<CategorySkillState | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const inflight = useRef(false);
  const refresh = useCallback(async () => {
    const requestController = controller.current;
    const signal = requestController?.signal;
    const workspace = getWorkspaceSecret();
    try {
      const next = await readCategorySkill(folderId, signal);
      if (controller.current === requestController && !signal?.aborted && getWorkspaceSecret() === workspace) { setState(next); setError(''); }
    } catch (error) {
      if (controller.current === requestController && !signal?.aborted && getWorkspaceSecret() === workspace) setError(error instanceof Error ? error.message : '技能读取失败');
    }
  }, [folderId]);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    setState(null); setError(''); setActionError(''); setNotice(''); setBusy(false); inflight.current = false;
    void refresh();
    const unsubscribe = subscribeAssetInvalidation(() => { void refresh(); });
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => { abort.abort(); unsubscribe(); window.clearInterval(timer); };
  }, [refresh]);
  const run = useCallback(async (action: string, payload: Record<string, unknown> = {}, force = true) => {
    if (inflight.current || !state) return false;
    inflight.current = true; setBusy(true); setActionError(''); setNotice('');
    const requestController = controller.current;
    const signal = requestController?.signal;
    const workspace = getWorkspaceSecret();
    try {
      let message = '';
      if (action === 'learn' || action === 'observe' || action === 'consolidate') {
        const result = await learnCategorySkill(folderId, modelId, force, maxNewSamples, action, signal);
        message = result.stage === 'running'
          ? `后台学习已启动；关闭窗口后仍会继续，当前还有 ${result.remaining} 组待读图。`
          : `本轮读取 ${result.analyzedGroups} 组，${result.stage === 'candidate' ? '已整理候选技能' : '观察已保存'}${result.remaining ? `；还有 ${result.remaining} 组待读图，可继续下一轮` : '；待读图组已处理完毕'}。`;
      } else {
        await changeCategorySkill(folderId, action, { revision: state.scope.revision, ...payload }, signal);
        if (action === 'edit') message = '已保存新候选版本，确认后可试用或设为正式技能。';
      }
      if (controller.current === requestController && !signal?.aborted && getWorkspaceSecret() === workspace) setNotice(message);
      return true;
    } catch (error) {
      if (controller.current === requestController && !signal?.aborted && getWorkspaceSecret() === workspace) setActionError(error instanceof Error ? error.message : '技能操作失败');
      return false;
    } finally {
      if (controller.current === requestController && !signal?.aborted && getWorkspaceSecret() === workspace) { inflight.current = false; setBusy(false); }
      if (controller.current === requestController && !signal?.aborted) await refresh();
    }
  }, [folderId, maxNewSamples, modelId, refresh, state]);
  useEffect(() => {
    if (!autoLearn || !state || !modelId || busy || error || actionError) return;
    if (canAutoLearn(state)) void run('learn', {}, false);
  }, [actionError, autoLearn, busy, error, modelId, run, state]);
  return { state, error: actionError || error, notice, busy, refresh, run };
}
