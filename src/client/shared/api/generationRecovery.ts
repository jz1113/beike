/** A transport failure is not proof that a billable generation failed. */
export function generationRecoveryError(message: string): Error {
  return Object.assign(new Error(message), { retryable: false, recoveryRequired: true });
}

export function requiresGenerationRecovery(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'recoveryRequired' in error
    && error.recoveryRequired === true;
}
