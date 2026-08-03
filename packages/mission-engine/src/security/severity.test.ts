import { describe, expect, it } from 'vitest';
import {
  classifySecurityFinding,
  describeSecurityPosture,
  judgeScan,
  NON_WAIVABLE_CLASSES,
  type SecurityClass,
  type SecurityPosture,
} from './severity.js';

/** Every combination, because mode and phase are independent by construction. */
const POSTURES: SecurityPosture[] = [
  { mode: 'fast', prelaunch: false },
  { mode: 'team', prelaunch: false },
  { mode: 'fortress', prelaunch: false },
  { mode: 'fast', prelaunch: true },
  { mode: 'team', prelaunch: true },
  { mode: 'fortress', prelaunch: true },
];

const label = (posture: SecurityPosture): string => describeSecurityPosture(posture);

describe('three classes are never waivable, in any posture', () => {
  it('names exactly the three the doctrine forbids waiving', () => {
    expect([...NON_WAIVABLE_CLASSES].sort()).toEqual([
      'destructive-migration-without-recovery',
      'secret-exposure',
      'tenant-isolation',
    ]);
  });

  it('refuses to waive them even in fast mode', () => {
    for (const securityClass of NON_WAIVABLE_CLASSES) {
      for (const posture of POSTURES) {
        const verdict = classifySecurityFinding({ securityClass, reportedSeverity: 'low', posture });

        expect(verdict.waivable, `${securityClass}/${label(posture)}`).toBe(false);
        expect(verdict.blocking, `${securityClass}/${label(posture)}`).toBe(true);
      }
    }
  });

  it('raises a severity the scanner under-reported rather than trusting it', () => {
    // A scanner calling a leaked credential `low` must not make it low. The
    // class carries the floor; the report only ever argues upward.
    const verdict = classifySecurityFinding({
      securityClass: 'secret-exposure',
      reportedSeverity: 'info',
      posture: { mode: 'fast', prelaunch: false },
    });

    expect(verdict.severity).toBe('critical');
    expect(verdict.rationale).toMatch(/floor/i);
  });

  it('says why it cannot be waived, so the refusal is not a bare no', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'tenant-isolation',
      reportedSeverity: 'high',
      posture: { mode: 'team', prelaunch: false },
    });

    expect(verdict.rationale).toMatch(/tenant/i);
  });
});

describe('an ordinary class', () => {
  it('keeps the reported severity when it sits above the class floor', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'dependency',
      reportedSeverity: 'high',
      posture: { mode: 'team', prelaunch: false },
    });

    expect(verdict.severity).toBe('high');
  });

  it('never lowers what a scanner reported', () => {
    // The report can argue upward, never downward: a finding that looks minor
    // to a rule may be severe in context, and the reverse is a silent downgrade.
    for (const reported of ['low', 'medium', 'high', 'critical'] as const) {
      const verdict = classifySecurityFinding({
        securityClass: 'misconfiguration',
        reportedSeverity: reported,
        posture: { mode: 'fast', prelaunch: false },
      });

      expect(verdict.severity, reported).toBe(reported);
    }
  });

  it('is waivable, which is what makes the three exceptions mean something', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'dependency',
      reportedSeverity: 'medium',
      posture: { mode: 'team', prelaunch: false },
    });

    expect(verdict.waivable).toBe(true);
  });
});

describe('the mode sets what blocks, not what may be waived', () => {
  it('blocks a medium finding in fortress but not in fast', () => {
    const shape = { securityClass: 'injection' as SecurityClass, reportedSeverity: 'medium' as const };

    expect(
      classifySecurityFinding({ ...shape, posture: { mode: 'fortress', prelaunch: false } }).blocking,
    ).toBe(true);
    expect(classifySecurityFinding({ ...shape, posture: { mode: 'fast', prelaunch: false } }).blocking).toBe(
      false,
    );
  });

  it('blocks critical everywhere, because no posture is a reason to ship one', () => {
    for (const posture of POSTURES) {
      const verdict = classifySecurityFinding({
        securityClass: 'injection',
        reportedSeverity: 'critical',
        posture,
      });

      expect(verdict.blocking, label(posture)).toBe(true);
    }
  });

  it('leaves informational findings non-blocking in every posture', () => {
    for (const posture of POSTURES) {
      expect(
        classifySecurityFinding({ securityClass: 'misconfiguration', reportedSeverity: 'info', posture })
          .blocking,
        label(posture),
      ).toBe(false);
    }
  });
});

describe('pre-launch is a phase of the project, not a mode of the mission', () => {
  // The two are independent: a team-mode mission can be days from launch, and a
  // fortress mission can be nowhere near one. Collapsing them into a single
  // enum made those states inexpressible.
  const shape = { securityClass: 'injection' as SecurityClass, reportedSeverity: 'medium' as const };

  it('hardens a mode that would otherwise let a medium finding through', () => {
    expect(classifySecurityFinding({ ...shape, posture: { mode: 'fast', prelaunch: false } }).blocking).toBe(
      false,
    );
    expect(classifySecurityFinding({ ...shape, posture: { mode: 'fast', prelaunch: true } }).blocking).toBe(
      true,
    );
  });

  it('never softens a mode that already blocks lower', () => {
    // Pre-launch may only tighten. If it could loosen, the phase closest to
    // shipping would be the one that lets the most through.
    for (const posture of POSTURES) {
      const strictest = classifySecurityFinding({ ...shape, posture: { ...posture, prelaunch: true } });
      const asIs = classifySecurityFinding({ ...shape, posture });

      expect(strictest.blocking || !asIs.blocking, label(posture)).toBe(true);
    }
  });

  it('names both dimensions in its rationale, so a verdict can be traced', () => {
    const verdict = classifySecurityFinding({ ...shape, posture: { mode: 'team', prelaunch: true } });

    expect(verdict.rationale).toContain('team');
    expect(verdict.rationale).toMatch(/pre-launch/i);
  });

  it('describes an ordinary posture by its mode alone', () => {
    expect(describeSecurityPosture({ mode: 'fortress', prelaunch: false })).toBe('fortress');
  });
});

describe('an unclassified finding', () => {
  it('is treated as unknown rather than as harmless', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'unknown',
      reportedSeverity: 'info',
      posture: { mode: 'team', prelaunch: false },
    });

    // Nobody decided this is safe; nobody decided it is not. It stays visible.
    expect(verdict.severity).toBe('medium');
    expect(verdict.rationale).toMatch(/not classified|unknown/i);
  });

  it('blocks in fortress, where an unexplained finding is not acceptable', () => {
    expect(
      classifySecurityFinding({
        securityClass: 'unknown',
        reportedSeverity: 'info',
        posture: { mode: 'fortress', prelaunch: false },
      }).blocking,
    ).toBe(true);
  });
});

describe('judgeScan — an incomplete scan is never green', () => {
  it('is green only when the scan actually completed', () => {
    for (const posture of POSTURES) {
      expect(judgeScan({ completeness: 'complete', posture, missingTools: [] }).verdict, label(posture)).toBe(
        'green',
      );
    }
  });

  it('degrades a partial scan in every posture', () => {
    for (const posture of POSTURES) {
      const judged = judgeScan({ completeness: 'partial', posture, missingTools: [] });

      expect(judged.verdict, label(posture)).not.toBe('green');
    }
  });

  it('blocks a missing tool in fortress and before a launch, degrades it elsewhere', () => {
    expect(
      judgeScan({
        completeness: 'tool-missing',
        posture: { mode: 'fortress', prelaunch: false },
        missingTools: ['zap'],
      }).verdict,
    ).toBe('blocked');
    expect(
      judgeScan({
        completeness: 'tool-missing',
        posture: { mode: 'fast', prelaunch: true },
        missingTools: ['zap'],
      }).verdict,
    ).toBe('blocked');
    expect(
      judgeScan({
        completeness: 'tool-missing',
        posture: { mode: 'fast', prelaunch: false },
        missingTools: ['zap'],
      }).verdict,
    ).toBe('degraded');
  });

  it('names the missing tool, because "degraded" alone is not actionable', () => {
    const judged = judgeScan({
      completeness: 'tool-missing',
      posture: { mode: 'team', prelaunch: false },
      missingTools: ['zap', 'semgrep'],
    });

    expect(judged.detail).toContain('zap');
    expect(judged.detail).toContain('semgrep');
  });

  it('blocks an errored scan everywhere, since a crash proves nothing', () => {
    for (const posture of POSTURES) {
      expect(judgeScan({ completeness: 'errored', posture, missingTools: [] }).verdict, label(posture)).toBe(
        'blocked',
      );
    }
  });

  it('refuses to call a scan complete while it also reports a missing tool', () => {
    // A contradiction between the two inputs is resolved against the run, not
    // in its favour: something was not measured.
    const judged = judgeScan({
      completeness: 'complete',
      posture: { mode: 'team', prelaunch: false },
      missingTools: ['zap'],
    });

    expect(judged.verdict).not.toBe('green');
    expect(judged.detail).toMatch(/contradic|missing/i);
  });
});
