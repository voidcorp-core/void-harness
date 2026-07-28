import { describe, expect, it } from 'vitest';
import { checkGlyph, checkShowsFix } from './doctor-render.js';

describe('checkGlyph', () => {
  it('marks a passing check as passed', () => {
    expect(checkGlyph({ name: 'x', ok: true, message: '' })).toBe('pass');
  });

  it('marks a failing check as failed', () => {
    expect(checkGlyph({ name: 'x', ok: false, message: '' })).toBe('fail');
  });

  it('marks an undetermined check as unknown', () => {
    expect(checkGlyph({ name: 'x', ok: true, status: 'unknown', message: '' })).toBe('unknown');
  });

  it('does not dress an advisory finding as a clean pass', () => {
    // "0.17.0 installed, 2.1.0 published" behind a green tick reads as reassurance.
    expect(checkGlyph({ name: 'x', ok: true, status: 'advisory', message: '' })).toBe('advisory');
  });
});

describe('checkShowsFix', () => {
  it('shows the fix for a failing check', () => {
    expect(checkShowsFix({ name: 'x', ok: false, message: '', fix: 'do it' })).toBe(true);
  });

  it('shows the fix for an advisory check, which exists to be acted on', () => {
    expect(checkShowsFix({ name: 'x', ok: true, status: 'advisory', message: '', fix: 'do it' })).toBe(true);
  });

  it('stays quiet when a check passes cleanly', () => {
    expect(checkShowsFix({ name: 'x', ok: true, message: '', fix: 'do it' })).toBe(false);
  });

  it('stays quiet when there is no fix to give', () => {
    expect(checkShowsFix({ name: 'x', ok: false, message: '' })).toBe(false);
    expect(checkShowsFix({ name: 'x', ok: true, status: 'advisory', message: '' })).toBe(false);
  });
});
