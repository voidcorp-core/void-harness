import { describe, expect, it } from 'vitest';
import { shellWriteTargets } from './shell-writes.js';

// Write targets were only ever read from `file_path` and `apply_patch`, so a
// shell redirection wrote wherever it liked: `cat > .env` reached the disk with
// the protected-file rule never seeing a path at all. The floor was not weak
// there, it was absent, and CI was the only net.
describe('shellWriteTargets', () => {
  it('finds a truncating redirection', () => {
    expect(shellWriteTargets('cat foo > .env')).toEqual(['.env']);
  });

  it('finds an appending redirection', () => {
    expect(shellWriteTargets('echo x >> .env.local')).toEqual(['.env.local']);
  });

  it('finds a redirection written without a space', () => {
    expect(shellWriteTargets('cat foo >.env')).toEqual(['.env']);
  });

  it('finds a numbered and a merged redirection target', () => {
    expect(shellWriteTargets('build 2> errors.log')).toEqual(['errors.log']);
    expect(shellWriteTargets('build &> out.log')).toEqual(['out.log']);
  });

  // `2>&1` duplicates a descriptor. Reporting it as a file would block ordinary
  // commands on a path that does not exist.
  it('ignores a descriptor duplication', () => {
    expect(shellWriteTargets('build 2>&1')).toEqual([]);
    expect(shellWriteTargets('build >&2')).toEqual([]);
  });

  it('finds every target when a command redirects more than once', () => {
    expect(shellWriteTargets('run > out.log 2> err.log')).toEqual(['err.log', 'out.log']);
  });

  it('finds a tee target, appending or not', () => {
    expect(shellWriteTargets('echo x | tee .npmrc')).toEqual(['.npmrc']);
    expect(shellWriteTargets('echo x | tee -a id_rsa')).toEqual(['id_rsa']);
  });

  it('strips quotes around a redirected path', () => {
    expect(shellWriteTargets('cat foo > "my secret.txt"')).toEqual(['my secret.txt']);
    expect(shellWriteTargets("cat foo > '.env'")).toEqual(['.env']);
  });

  it('reports each target once', () => {
    expect(shellWriteTargets('a > x.log; b > x.log')).toEqual(['x.log']);
  });

  it('says nothing about a command that writes no file', () => {
    expect(shellWriteTargets('pnpm test')).toEqual([]);
    expect(shellWriteTargets('')).toEqual([]);
  });

  // A here-doc delimiter is not a path, and `>` inside a comparison is not a
  // redirection.
  it('does not mistake a here-doc or a comparison for a target', () => {
    expect(shellWriteTargets('cat <<EOF')).toEqual([]);
    expect(shellWriteTargets('test 3 > 2 && echo ok')).toEqual(['2']);
  });
});
