export function specialistCompletion(specialistId: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    specialistId,
    contractVersion: 2,
    completionId: `cmp_${specialistId.slice(5)}`,
    verdict: 'pass',
    findings: [],
    evidenceRequests: [],
    limitations: [],
  };
}
