import type { CanonicalEvent } from '../events/types.js';
import type {
  Finding,
  FindingLedger,
  FindingLedgerIssue,
  FindingSeverity,
} from './types.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function label(value: unknown, max = 512): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && !value.includes('\0');
}

function severity(value: unknown): value is FindingSeverity {
  return value === 'info'
    || value === 'low'
    || value === 'medium'
    || value === 'high'
    || value === 'critical';
}

function reported(value: unknown): Finding | undefined {
  const raw = record(value);
  if (
    raw === undefined
    || !label(raw['findingId'], 104)
    || !label(raw['ruleId'], 256)
    || !severity(raw['severity'])
    || !label(raw['title'])
    || typeof raw['blocking'] !== 'boolean'
    || typeof raw['waivable'] !== 'boolean'
    || !Array.isArray(raw['evidenceIds'])
    || raw['evidenceIds'].length > 128
    || !raw['evidenceIds'].every((id) => label(id, 104))
  ) {
    return undefined;
  }
  return {
    findingId: raw['findingId'],
    ruleId: raw['ruleId'],
    severity: raw['severity'],
    title: raw['title'],
    blocking: raw['blocking']
      || raw['severity'] === 'high'
      || raw['severity'] === 'critical',
    waivable: raw['waivable'],
    evidenceIds: raw['evidenceIds'],
    status: 'open',
  };
}

export function reduceFindings(
  events: readonly CanonicalEvent[],
): FindingLedger {
  const findings = new Map<string, Finding>();
  const issues: FindingLedgerIssue[] = [];
  for (const event of events) {
    if (event.kind === 'finding.reported') {
      const finding = reported(event.payload);
      if (finding === undefined) {
        issues.push({ code: 'invalid-finding-event', eventId: event.eventId });
      } else if (findings.has(finding.findingId)) {
        issues.push({
          code: 'duplicate-finding',
          findingId: finding.findingId,
        });
      } else {
        findings.set(finding.findingId, finding);
      }
      continue;
    }
    if (
      event.kind !== 'finding.resolved'
      && event.kind !== 'finding.exception.granted'
    ) {
      continue;
    }
    const payload = record(event.payload);
    const findingId = payload?.['findingId'];
    if (!label(findingId, 104)) {
      issues.push({ code: 'invalid-finding-event', eventId: event.eventId });
      continue;
    }
    const current = findings.get(findingId);
    if (current === undefined) {
      issues.push({ code: 'unknown-finding-transition', findingId });
      continue;
    }
    if (event.kind === 'finding.resolved') {
      const resolution = payload?.['resolution'];
      if (!label(resolution, 2_000)) {
        issues.push({ code: 'invalid-finding-event', eventId: event.eventId });
        continue;
      }
      findings.set(findingId, {
        ...current,
        status: 'resolved',
        resolution,
      });
      continue;
    }
    if (!current.waivable) {
      issues.push({ code: 'non-waivable-exception', findingId });
      continue;
    }
    const actor = payload?.['actor'];
    const reason = payload?.['reason'];
    if (!label(actor, 128) || !label(reason, 2_000)) {
      issues.push({ code: 'invalid-finding-event', eventId: event.eventId });
      continue;
    }
    findings.set(findingId, {
      ...current,
      status: 'excepted',
      exception: { actor, reason },
    });
  }
  return { findings: [...findings.values()], issues };
}
