import type { CategorySkillState } from '@shared/contracts/categorySkills';

export function canConsolidate(state: CategorySkillState): boolean {
  return state.memory.learned > 0 || state.memory.notes.length > 0;
}

export function canAutoLearn(state: CategorySkillState): boolean {
  const { scope, memory } = state;
  if (!scope.autoAnalyze || scope.runningToken || scope.error || scope.trialVersionId || scope.lastAttempt === state.attemptFingerprint) return false;
  if (memory.pending === 0 && !canConsolidate(state)) return false;
  if (!state.versions.length) return memory.pending > 0 || canConsolidate(state);
  return memory.pending > 0 || state.feedbackChanged || state.memoryChanged || (memory.pending === 0 && state.needsConsolidation);
}

export function categoryNextStep(state: CategorySkillState): { label: string; detail: string } {
  const { scope, memory } = state;
  if (scope.runningToken) return { label: '正在学习', detail: `本轮已完成 ${scope.progress} 套观察，完成后会保存记忆。` };
  if (scope.error) return { label: '需要处理', detail: scope.error };
  if (scope.trialVersionId) return { label: '试用验证', detail: '候选技能正在试用，可直接设为正式技能，也可先生成成图对照。' };
  const candidate = state.versions.find(version => version.id !== scope.activeVersionId && version.parentVersionId === scope.activeVersionId && version.manifest.memoryFingerprint === memory.fingerprint);
  if (candidate) return { label: '有可启用的技能', detail: '新经验已整理为候选版，可直接设为正式技能，或先试用对比。' };
  if (memory.pending) return { label: '有新图可学', detail: `还有 ${memory.pending} 套待观察。读图会记住方法，单个不适用图组会记录原因并跳过。` };
  if (!canConsolidate(state)) return { label: '积累参考', detail: '读完一套有效参考图，或添加手动经验，即可整理技能。' };
  if (state.needsConsolidation) return { label: '可以整理技能', detail: '观察、经验或反馈已更新，可以整理新的候选技能。' };
  return { label: '记忆已保存', detail: '继续投喂参考图，或为生成结果评分，让下一版有明确的改进依据。' };
}
