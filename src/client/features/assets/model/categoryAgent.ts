import type { CategorySkillState } from '@shared/contracts/categorySkills';

export function categoryReadCount(state: CategorySkillState, maxNewSamples: number): number {
  return Math.min(state.memory.pending, maxNewSamples);
}

export function canConsolidate(state: CategorySkillState): boolean {
  return state.memory.learned > 0 || state.memory.notes.length > 0;
}

export function canAutoLearn(state: CategorySkillState): boolean {
  const { scope, memory } = state;
  if ((memory.stale ?? 0) > 0 || (memory.failed ?? 0) > 0) return false;
  if (!scope.autoAnalyze || scope.runningToken || scope.error || scope.trialVersionId || scope.lastAttempt === state.attemptFingerprint) return false;
  if (memory.pending === 0 && !canConsolidate(state)) return false;
  if (!state.versions.length) return memory.pending > 0 || canConsolidate(state);
  return memory.pending > 0 || state.feedbackChanged || state.memoryChanged || (memory.pending === 0 && state.needsConsolidation);
}

export function categoryNextStep(state: CategorySkillState): { label: string; detail: string } {
  const { scope, memory } = state;
  if (scope.runningToken) return { label: '后台学习中', detail: `本轮已完成 ${scope.progress} 套观察；关闭窗口不会中断，服务端会继续保存结果。` };
  if (scope.error) return { label: '需要处理', detail: `${scope.error} 已完成的观察会保留，重试只处理未完成的图组。` };
  if (memory.stale) return { label: '需要重新学习', detail: `${memory.stale} 组原图、反推词或学习指令已变更，旧观察已保留；请手动开始分批重学。` };
  if (memory.failed) return { label: '读图待重试', detail: `${memory.failed} 组读取失败，成功观察已保留；重试只读取失败和未完成的图组。` };
  if (scope.trialVersionId) return { label: '试用验证', detail: '候选技能正在试用，可直接设为正式技能，也可先生成成图对照。' };
  const candidate = state.versions.find(version => version.id !== scope.activeVersionId && version.parentVersionId === scope.activeVersionId && version.manifest.memoryFingerprint === memory.fingerprint);
  if (candidate) return { label: '有可启用的技能', detail: '新经验已整理为候选版；候选不会自动发布，请先试用或完成实际成图对照。' };
  if (memory.pending) return { label: '有新图可学', detail: `还有 ${memory.pending} 套待处理。已成功观察且输入未变的图组会复用，不会重复调用模型。` };
  if (!canConsolidate(state)) return { label: '积累参考', detail: '读完一套有效参考图，或添加手动经验，即可整理技能。' };
  if (state.needsConsolidation) return { label: '可以整理技能', detail: '观察、经验或反馈已更新，可以整理新的候选技能。' };
  return { label: '记忆已保存', detail: '自动学习只会按当前页面触发一轮；继续投喂参考图或评分后，再开始下一轮。' };
}
