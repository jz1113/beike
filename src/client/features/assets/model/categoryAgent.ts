import type { CategorySkillState } from '@shared/contracts/categorySkills';

export function canConsolidate(state: CategorySkillState): boolean {
  return state.memory.holdout >= 3 && state.memory.learned + Math.min(state.memory.holdout, Math.max(3, Math.floor(state.scope.minSamples / 5))) >= state.scope.minSamples;
}

export function canAutoLearn(state: CategorySkillState): boolean {
  const { scope, memory } = state;
  if (!scope.autoAnalyze || scope.runningToken || scope.error || scope.trialVersionId || scope.lastAttempt === state.attemptFingerprint) return false;
  if (memory.learned + memory.pending + memory.holdout < scope.minSamples) return false;
  if (memory.pending === 0 && !canConsolidate(state)) return false;
  if (!state.versions.length) return memory.pending > 0 || memory.learned > 0;
  return memory.pending >= 5 || state.feedbackChanged || state.memoryChanged || (memory.pending === 0 && state.needsConsolidation);
}

export function categoryNextStep(state: CategorySkillState): { label: string; detail: string } {
  const { scope, memory } = state;
  if (scope.runningToken) return { label: '正在学习', detail: `本轮已完成 ${scope.progress} 套观察，完成后会保存记忆。` };
  if (scope.error) return { label: '需要处理', detail: scope.error };
  if (scope.trialVersionId) return { label: '试用验证', detail: '候选技能正在试用。请在工坊生成对照图，并在成图上提交四项评分。' };
  const candidate = state.versions.find(version => version.id !== scope.activeVersionId && version.parentVersionId === scope.activeVersionId && version.manifest.memoryFingerprint === memory.fingerprint);
  if (candidate) return { label: '有待验证的技能', detail: '新经验已整理为候选版，试用并完成成图对照后才能升级。' };
  if (memory.pending) return { label: '有新图可学', detail: `还有 ${memory.pending} 套待观察。读图会记住方法，单个不适用图组会记录原因并跳过。` };
  if (!canConsolidate(state)) return { label: '积累参考', detail: `继续投喂同一细分的四图组。整理技能需足够的已学样本和至少 3 套独立验证图组。` };
  if (state.needsConsolidation) return { label: '可以整理技能', detail: '观察、经验或反馈已更新，可以整理新的候选技能。' };
  return { label: '记忆已保存', detail: '继续投喂参考图，或为生成结果评分，让下一版有明确的改进依据。' };
}
