import { describe, expect, it } from 'vitest';
import { riskSignalsFromDiff } from './merge-risk.js';

describe('riskSignalsFromDiff', () => {
  it('counts files and flags nothing for a neutral diff', () => {
    const r = riskSignalsFromDiff(['README.md', 'src/lib/util.ts']);
    expect(r).toEqual({ fileCount: 2, touchesUi: false, touchesSecurity: false, touchesMigration: false });
  });

  it('flags security for auth paths, env secrets, keys, and credentials', () => {
    expect(riskSignalsFromDiff(['src/lib/auth/session.ts']).touchesSecurity).toBe(true);
    expect(riskSignalsFromDiff(['.env.local']).touchesSecurity).toBe(true);
    expect(riskSignalsFromDiff(['deploy/tls/server.pem']).touchesSecurity).toBe(true);
    expect(riskSignalsFromDiff(['config/db-credentials.ts']).touchesSecurity).toBe(true);
  });

  it('does NOT flag security for safe .env variants', () => {
    expect(riskSignalsFromDiff(['.env.example']).touchesSecurity).toBe(false);
    expect(riskSignalsFromDiff(['.env.template']).touchesSecurity).toBe(false);
  });

  it('flags migration for .sql, migrations dirs, and drizzle', () => {
    expect(riskSignalsFromDiff(['db/migrations/0001_init.sql']).touchesMigration).toBe(true);
    expect(riskSignalsFromDiff(['drizzle/schema.ts']).touchesMigration).toBe(true);
    expect(riskSignalsFromDiff(['packages/db/migration/step.ts']).touchesMigration).toBe(true);
  });

  it('flags UI for tsx/jsx, component dirs, the app route dir, and styles', () => {
    expect(riskSignalsFromDiff(['src/components/Button.tsx']).touchesUi).toBe(true);
    expect(riskSignalsFromDiff(['app/(dash)/page.tsx']).touchesUi).toBe(true);
    expect(riskSignalsFromDiff(['ui/styles/main.css']).touchesUi).toBe(true);
  });

  it('does NOT confuse apps/ (monorepo) with the app/ route dir', () => {
    expect(riskSignalsFromDiff(['apps/web/src/server/db.ts']).touchesUi).toBe(false);
  });

  it('sets multiple flags when one file matches multiple categories', () => {
    const r = riskSignalsFromDiff(['src/auth/rls.sql']);
    expect(r.touchesSecurity).toBe(true);
    expect(r.touchesMigration).toBe(true);
    expect(r.touchesUi).toBe(false);
  });

  it('flags a category when any file in the diff matches it', () => {
    const r = riskSignalsFromDiff(['README.md', 'src/components/Modal.tsx', 'CHANGELOG.md']);
    expect(r).toEqual({ fileCount: 3, touchesUi: true, touchesSecurity: false, touchesMigration: false });
  });
});
