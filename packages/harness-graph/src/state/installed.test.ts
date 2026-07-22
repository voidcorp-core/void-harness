import { describe, expect, it } from 'vitest';
import { capabilityPackDir, installedCapabilityIds } from './installed.js';

describe('capabilityPackDir', () => {
  it('returns the pack dir for a pack-scoped id, undefined for core', () => {
    expect(capabilityPackDir('skill:pack-monorepo/service-package')).toBe('pack-monorepo');
    expect(capabilityPackDir('skill:pack-nextjs/route-group-decision')).toBe('pack-nextjs');
    expect(capabilityPackDir('skill:tdd')).toBeUndefined();
    expect(capabilityPackDir('agent:code-explorer')).toBeUndefined();
  });
});

describe('installedCapabilityIds', () => {
  const ids = [
    'skill:tdd', // core
    'agent:code-explorer', // core
    'skill:pack-monorepo/service-package',
    'skill:pack-nextjs/route-group-decision',
    'skill:pack-react/form-pattern',
  ];

  it('installs core always, plus only the activated packs', () => {
    const installed = installedCapabilityIds(ids, new Set(['pack-monorepo']));
    expect([...installed].sort()).toEqual(
      ['agent:code-explorer', 'skill:pack-monorepo/service-package', 'skill:tdd'].sort(),
    );
  });

  it('with no packs activated, only core is installed', () => {
    const installed = installedCapabilityIds(ids, new Set());
    expect([...installed].sort()).toEqual(['agent:code-explorer', 'skill:tdd'].sort());
  });

  it('with every pack activated, everything is installed', () => {
    const installed = installedCapabilityIds(ids, new Set(['pack-monorepo', 'pack-nextjs', 'pack-react']));
    expect(installed.size).toBe(ids.length);
  });
});
