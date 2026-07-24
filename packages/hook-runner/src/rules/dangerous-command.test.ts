import { describe, expect, it } from 'vitest';
import { dangerousCommand } from './dangerous-command.js';

describe('dangerousCommand', () => {
  it.each([
    ['rm -rf /', 'recursive delete'],
    ['rm -Rf $HOME/', 'recursive delete'],
    [':(){ :|:& };:', 'fork bomb'],
    ['dd if=/dev/zero of=/dev/sda', 'raw-device'],
    ['chmod -R 777 ~/', 'permission'],
    ['git push --force origin main', 'force'],
    ['git apply --unsafe-paths x.patch', 'unsafe'],
    ['psql -c "DROP TABLE users"', 'destructive SQL'],
  ])('blocks %s', (command, evidence) => {
    const verdict = dangerousCommand(command);
    expect(verdict.allow).toBe(false);
    expect(verdict.evidence.join(' ')).toContain(evidence);
  });

  it.each([
    'rm -rf ./dist',
    'rm -rf $HOME/projects',
    'git push --force-with-lease origin feature',
    'git commit -m "document --exec"',
    'pnpm test',
  ])('allows %s', (command) => {
    expect(dangerousCommand(command).allow).toBe(true);
  });
});
