import { useCallback, useEffect, useRef, useState } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import type { CategorySkillState } from '@shared/contracts/categorySkills';
import { changeCategorySkill, learnCategorySkill, readCategorySkill } from '../api/categorySkills';

export function useCategorySkill(folderId: string, modelId: string) {
  const [state, setState] = useState<CategorySkillState | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
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
    setState(null); setError(''); setActionError(''); setBusy(false); inflight.current = false;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => { abort.abort(); window.clearInterval(timer); };
  }, [refresh]);
  const run = useCallback(async (action: string, payload: Record<string, unknown> = {}, force = true) => {
    if (inflight.current || !state) return;
    inflight.current = true; setBusy(true); setActionError('');
    const requestController = controller.current;
    const signal = requestController?.signal;
    const workspace = getWorkspaceSecret();
    try {
      if (action === 'learn') await learnCategorySkill(folderId, modelId, force, signal);
      else await changeCategorySkill(folderId, action, { revision: state.scope.revision, ...payload }, signal);
    } catch (error) {
      if (controller.current === requestController && !signal?.aborted && getWorkspaceSecret() === workspace) setActionError(error instanceof Error ? error.message : '技能操作失败');
    } finally {
      if (controller.current === requestController && !signal?.aborted && getWorkspaceSecret() === workspace) { inflight.current = false; setBusy(false); }
      if (controller.current === requestController && !signal?.aborted) await refresh();
    }
  }, [folderId, modelId, refresh, state]);
  useEffect(() => {
    if (!state || !modelId || busy || error || actionError) return;
    const { scope, dataset } = state;
    if (!scope.autoAnalyze || scope.runningToken || scope.lastAttempt === state.attemptFingerprint || dataset.samples.length < scope.minSamples || scope.trialVersionId) return;
    if (state.versions.length && state.pendingSamples < 5 && !state.feedbackChanged) return;
    void run('learn', {}, false);
  }, [actionError, busy, error, modelId, run, state]);
  return { state, error: actionError || error, busy, refresh, run };
}
