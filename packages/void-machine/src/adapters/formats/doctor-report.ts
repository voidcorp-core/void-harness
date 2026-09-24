// tdd-cover: e2e packages/void-machine/test/doctor-contract.test.ts
import type { DoctorReport } from '../../verticals/development/doctor.js';

export function renderDoctorJson(report: DoctorReport): string {
  return JSON.stringify({
    schemaVersion: 1,
    health: report.health,
    repository: report.paths?.repository ?? null, // allow-null: required nullable doctor-v1 key
    gitCommonDirectory: report.paths?.gitCommonDirectory ?? null, // allow-null: doctor-v1 key
    stateDirectory: report.paths?.stateDirectory ?? null, // allow-null: doctor-v1 key
    cacheDirectory: report.paths?.cacheDirectory ?? null, // allow-null: doctor-v1 key
    findings: report.findings,
  });
}

export function renderDoctorText(report: DoctorReport): string {
  const lines = [`void-machine doctor: ${report.health}`];
  for (const finding of report.findings) {
    lines.push(`${finding.code}: ${finding.problem}. Cause: ${finding.cause}. Repair: ${finding.repair}.`);
  }
  return lines.join('\n');
}
