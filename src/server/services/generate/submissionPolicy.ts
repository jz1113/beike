/** Only these responses prove that a generation endpoint rejected the POST. */
export function canTryAnotherSubmissionEndpoint(status: number): boolean {
  return status === 404 || status === 405 || status === 415;
}
