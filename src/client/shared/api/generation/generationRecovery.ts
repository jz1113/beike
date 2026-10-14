/** A transport failure is not proof that a billable generation failed. */
export const SUBMISSION_RECOVERY_HINT = '提交结果待核对，正在查询原任务；请勿重复生成';
export const GENERATION_QUERY_RETRY_HINT = '任务状态暂时无法查询，正在继续核对原任务…';

export function generationRecoveryError(message: string): Error {
  return Object.assign(new Error(message), { retryable: false, recoveryRequired: true });
}

export function requiresGenerationRecovery(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'recoveryRequired' in error
    && error.recoveryRequired === true;
}
