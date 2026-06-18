import { describe, expect, it } from 'vitest';
import { baseBranchFromSymbolicRef, evaluateBranchProtection } from './branch-protection.js';

// The durable A1 boundary is server-side branch protection on the base branch:
// the remote refuses non-PR pushes regardless of what the worker runs. The
// orchestrator confirms it at preflight via `gh api .../branches/<base>/protection`.
// This parse is STRICT (the gate refuses on a confirmed-unprotected base); only
// a genuinely indeterminate result (no auth, gh missing, network) degrades to a
// warning, never a silent pass.

describe('evaluateBranchProtection', () => {
  it('reports protected when gh returns a protection object', () => {
    const stdout = JSON.stringify({
      url: 'https://api.github.com/repos/o/r/branches/main/protection',
      required_pull_request_reviews: { required_approving_review_count: 1 },
      enforce_admins: { enabled: true },
    });
    expect(evaluateBranchProtection({ ok: true, stdout, stderr: '' })).toEqual({ kind: 'protected' });
  });

  it('reports unprotected on the GitHub "Branch not protected" 404', () => {
    // gh exits non-zero on a 4xx and prints the HTTP error to stderr.
    const result = evaluateBranchProtection({
      ok: false,
      stdout: '',
      stderr: 'gh: Branch not protected (HTTP 404)',
    });
    expect(result).toEqual({ kind: 'unprotected' });
  });

  it('reports unprotected when an exit-0 body carries the not-protected message', () => {
    const stdout = JSON.stringify({ message: 'Branch not protected', documentation_url: 'x' });
    expect(evaluateBranchProtection({ ok: true, stdout, stderr: '' })).toEqual({ kind: 'unprotected' });
  });

  it('is unknown (not unprotected) when access is forbidden', () => {
    const result = evaluateBranchProtection({
      ok: false,
      stdout: '',
      stderr: 'gh: Must have admin rights to Repository. (HTTP 403)',
    });
    expect(result.kind).toBe('unknown');
  });

  it('is unknown when gh is missing or the call errors with no signal', () => {
    const result = evaluateBranchProtection({ ok: false, stdout: '', stderr: 'gh: command not found' });
    expect(result.kind).toBe('unknown');
  });

  it('is unknown when an exit-0 body is not parseable JSON (strict parse)', () => {
    const result = evaluateBranchProtection({ ok: true, stdout: 'not json', stderr: '' });
    expect(result.kind).toBe('unknown');
  });

  it('is unknown on a 404 that is "Branch not found", not "not protected"', () => {
    // A wrong/missing branch must NOT be read as "unprotected" (false refusal).
    const result = evaluateBranchProtection({
      ok: false,
      stdout: '',
      stderr: 'gh: Not Found (HTTP 404)',
    });
    expect(result.kind).toBe('unknown');
  });
});

describe('baseBranchFromSymbolicRef', () => {
  it('strips the origin/ prefix from the resolved HEAD', () => {
    expect(baseBranchFromSymbolicRef('origin/main\n')).toBe('main');
  });

  it('handles a master default branch', () => {
    expect(baseBranchFromSymbolicRef('origin/master')).toBe('master');
  });

  it('returns undefined when the symbolic ref is empty or malformed', () => {
    expect(baseBranchFromSymbolicRef('')).toBeUndefined();
    expect(baseBranchFromSymbolicRef('main')).toBeUndefined();
  });
});
