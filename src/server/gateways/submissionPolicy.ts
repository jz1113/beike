/** Only these responses establish that an endpoint did not accept the POST. */
export function canTryAnotherSubmissionEndpoint(status: number): boolean {
  return status === 404 || status === 405 || status === 415;
}
