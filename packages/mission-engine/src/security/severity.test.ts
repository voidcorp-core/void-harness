import { describe, expect, it } from 'vitest';
import {
  classifySecurityFinding,
  judgeScan,
  NON_WAIVABLE_CLASSES,
  type SecurityClass,
  type SecurityMode,
} from './severity.js';

const MODES: SecurityMode[] = ['fast', 'team', 'fortress', 'prelaunch'];

describe('three classes are never waivable, in any mode', () => {
  it('names exactly the three the doctrine forbids waiving', () => {
    expect([...NON_WAIVABLE_CLASSES].sort()).toEqual([
      'destructive-migration-without-recovery',
      'secret-exposure',
      'tenant-isolation',
    ]);
  });

  it('refuses to waive them even in fast mode', () => {
    for (const securityClass of NON_WAIVABLE_CLASSES) {
      for (const mode of MODES) {
        const verdict = classifySecurityFinding({ securityClass, reportedSeverity: 'low', mode });

        expect(verdict.waivable, `${securityClass}/${mode}`).toBe(false);
        expect(verdict.blocking, `${securityClass}/${mode}`).toBe(true);
      }
    }
  });

  it('raises a severity the scanner under-reported rather than trusting it', () => {
    // A scanner calling a leaked credential `low` must not make it low. The
    // class carries the floor; the report only ever argues upward.
    const verdict = classifySecurityFinding({
      securityClass: 'secret-exposure',
      reportedSeverity: 'info',
      mode: 'fast',
    });

    expect(verdict.severity).toBe('critical');
    expect(verdict.rationale).toMatch(/floor/i);
  });

  it('says why it cannot be waived, so the refusal is not a bare no', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'tenant-isolation',
      reportedSeverity: 'high',
      mode: 'team',
    });

    expect(verdict.rationale).toMatch(/tenant/i);
  });
});

describe('an ordinary class', () => {
  it('keeps the reported severity when it sits above the class floor', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'dependency',
      reportedSeverity: 'high',
      mode: 'team',
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
        mode: 'fast',
      });

      expect(verdict.severity, reported).toBe(reported);
    }
  });

  it('is waivable, which is what makes the three exceptions mean something', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'dependency',
      reportedSeverity: 'medium',
      mode: 'team',
    });

    expect(verdict.waivable).toBe(true);
  });
});

describe('the mode sets what blocks, not what may be waived', () => {
  it('blocks a medium finding in fortress but not in fast', () => {
    const shape = { securityClass: 'injection' as SecurityClass, reportedSeverity: 'medium' as const };

    expect(classifySecurityFinding({ ...shape, mode: 'fortress' }).blocking).toBe(true);
    expect(classifySecurityFinding({ ...shape, mode: 'fast' }).blocking).toBe(false);
  });

  it('blocks critical everywhere, because no mode is a reason to ship one', () => {
    for (const mode of MODES) {
      const verdict = classifySecurityFinding({
        securityClass: 'injection',
        reportedSeverity: 'critical',
        mode,
      });

      expect(verdict.blocking, mode).toBe(true);
    }
  });

  it('leaves informational findings non-blocking in every mode', () => {
    for (const mode of MODES) {
      expect(
        classifySecurityFinding({ securityClass: 'misconfiguration', reportedSeverity: 'info', mode })
          .blocking,
        mode,
      ).toBe(false);
    }
  });
});

describe('an unclassified finding', () => {
  it('is treated as unknown rather than as harmless', () => {
    const verdict = classifySecurityFinding({
      securityClass: 'unknown',
      reportedSeverity: 'info',
      mode: 'team',
    });

    // Nobody decided this is safe; nobody decided it is not. It stays visible.
    expect(verdict.severity).toBe('medium');
    expect(verdict.rationale).toMatch(/not classified|unknown/i);
  });

  it('blocks in fortress, where an unexplained finding is not acceptable', () => {
    expect(
      classifySecurityFinding({ securityClass: 'unknown', reportedSeverity: 'info', mode: 'fortress' })
        .blocking,
    ).toBe(true);
  });
});

describe('judgeScan — an incomplete scan is never green', () => {
  it('is green only when the scan actually completed', () => {
    for (const mode of MODES) {
      expect(judgeScan({ completeness: 'complete', mode, missingTools: [] }).verdict, mode).toBe('green');
    }
  });

  it('degrades a partial scan in every mode', () => {
    for (const mode of MODES) {
      const judged = judgeScan({ completeness: 'partial', mode, missingTools: [] });

      expect(judged.verdict, mode).not.toBe('green');
    }
  });

  it('blocks a missing tool in fortress and prelaunch, degrades it elsewhere', () => {
    expect(judgeScan({ completeness: 'tool-missing', mode: 'fortress', missingTools: ['zap'] }).verdict).toBe(
      'blocked',
    );
    expect(judgeScan({ completeness: 'tool-missing', mode: 'prelaunch', missingTools: ['zap'] }).verdict).toBe(
      'blocked',
    );
    expect(judgeScan({ completeness: 'tool-missing', mode: 'fast', missingTools: ['zap'] }).verdict).toBe(
      'degraded',
    );
  });

  it('names the missing tool, because "degraded" alone is not actionable', () => {
    const judged = judgeScan({ completeness: 'tool-missing', mode: 'team', missingTools: ['zap', 'semgrep'] });

    expect(judged.detail).toContain('zap');
    expect(judged.detail).toContain('semgrep');
  });

  it('blocks an errored scan everywhere, since a crash proves nothing', () => {
    for (const mode of MODES) {
      expect(judgeScan({ completeness: 'errored', mode, missingTools: [] }).verdict, mode).toBe('blocked');
    }
  });

  it('refuses to call a scan complete while it also reports a missing tool', () => {
    // A contradiction between the two inputs is resolved against the run, not
    // in its favour: something was not measured.
    const judged = judgeScan({ completeness: 'complete', mode: 'team', missingTools: ['zap'] });

    expect(judged.verdict).not.toBe('green');
    expect(judged.detail).toMatch(/contradic|missing/i);
  });
});
