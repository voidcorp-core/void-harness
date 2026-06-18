import { describe, expect, it } from 'vitest';
import { parseFlags, resolveConfig } from './config.js';

describe('parseFlags', () => {
  it('returns an empty object for no args', () => {
    expect(parseFlags([])).toEqual({});
  });

  it('parses value flags in --name value form', () => {
    const flags = parseFlags(['--target', 'Backlog', '--max', '5', '--max-failures', '3']);
    expect(flags.targetState).toBe('Backlog');
    expect(flags.maxIterations).toBe(5);
    expect(flags.maxFailures).toBe(3);
  });

  it('parses value flags in --name=value form', () => {
    const flags = parseFlags(['--scope=Team Sesame', '--model=opus']);
    expect(flags.linearScope).toBe('Team Sesame');
    expect(flags.model).toBe('opus');
  });

  it('parses boolean flags', () => {
    const flags = parseFlags(['--auto-merge', '--allow-api', '--no-stream', '--dry-run', '--full-auto']);
    expect(flags.autoMerge).toBe(true);
    expect(flags.allowApi).toBe(true);
    expect(flags.stream).toBe(false);
    expect(flags.dryRun).toBe(true);
    expect(flags.fullAuto).toBe(true);
  });

  it('ignores a non-numeric value for a numeric flag', () => {
    expect(parseFlags(['--max', 'lots']).maxIterations).toBeUndefined();
  });
});

describe('resolveConfig precedence flags > env > file > defaults', () => {
  const empty = { flags: {}, env: {}, file: undefined } as const;

  it('returns defaults when every source is empty', () => {
    const cfg = resolveConfig(empty);
    expect(cfg).toEqual({
      linearScope: 'the default Linear team backlog',
      targetState: 'Todo',
      reviewState: 'In Review',
      branchPrefix: 'auto/',
      maxIterations: 20,
      maxFailures: 2,
      model: undefined,
      autoMerge: false,
      allowApi: false,
      stream: true,
      dryRun: false,
      fullAuto: false,
    });
  });

  it('file overrides defaults', () => {
    const cfg = resolveConfig({ flags: {}, env: {}, file: { targetState: 'Backlog', maxIterations: 7 } });
    expect(cfg.targetState).toBe('Backlog');
    expect(cfg.maxIterations).toBe(7);
  });

  it('env overrides file', () => {
    const cfg = resolveConfig({
      flags: {},
      env: { TARGET_STATE: 'Ready', MAX_ITERATIONS: '9' },
      file: { targetState: 'Backlog', maxIterations: 7 },
    });
    expect(cfg.targetState).toBe('Ready');
    expect(cfg.maxIterations).toBe(9);
  });

  it('flags override env', () => {
    const cfg = resolveConfig({
      flags: { targetState: 'Doing', maxIterations: 3 },
      env: { TARGET_STATE: 'Ready', MAX_ITERATIONS: '9' },
      file: { targetState: 'Backlog', maxIterations: 7 },
    });
    expect(cfg.targetState).toBe('Doing');
    expect(cfg.maxIterations).toBe(3);
  });

  it('falls through an invalid env number to the file value', () => {
    const cfg = resolveConfig({ flags: {}, env: { MAX_ITERATIONS: 'NaN' }, file: { maxIterations: 7 } });
    expect(cfg.maxIterations).toBe(7);
  });

  it('treats an empty model as undefined', () => {
    expect(resolveConfig({ flags: {}, env: { MODEL: '' }, file: undefined }).model).toBeUndefined();
    expect(resolveConfig({ flags: { model: 'opus' }, env: {}, file: undefined }).model).toBe('opus');
  });

  it('reads AUTO_MERGE=1 from env as true', () => {
    expect(resolveConfig({ flags: {}, env: { AUTO_MERGE: '1' }, file: undefined }).autoMerge).toBe(true);
    expect(resolveConfig({ flags: {}, env: { AUTO_MERGE: '0' }, file: undefined }).autoMerge).toBe(false);
  });

  it('maps UNSAFE_FULL_AUTO=1 from env to fullAuto', () => {
    expect(resolveConfig({ flags: {}, env: { UNSAFE_FULL_AUTO: '1' }, file: undefined }).fullAuto).toBe(true);
  });
});
