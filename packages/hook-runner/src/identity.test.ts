import { describe, expect, it } from 'vitest';
import { parseProductIdentity, PRODUCT_IDENTITY, productSetting } from './identity.js';

const valid = {
  repository: { owner: 'acme', name: 'tool' },
  packageName: 'acmetool',
  commands: { primary: 'acme-tool', aliases: ['at'], deprecated: ['old-tool'] },
  markers: { namespace: 'acme-tool', deprecated: ['old-tool'] },
  environment: { prefix: 'ACME_TOOL_', deprecated: ['OLD_TOOL_'] },
};

describe('parseProductIdentity', () => {
  it('derives the slug and the URLs from the owner and the name', () => {
    const identity = parseProductIdentity(valid);
    expect(identity.repositorySlug).toBe('acme/tool');
    expect(identity.repositoryUrl).toBe('https://github.com/acme/tool');
    expect(identity.packageName).toBe('acmetool');
    expect(identity.commands.primary).toBe('acme-tool');
  });

  it('keeps the slugs the repository was known by, which GitHub redirects for git but not for actions', () => {
    const identity = parseProductIdentity({ ...valid, repository: { owner: 'acme', name: 'tool', formerNames: ['old'] } });
    expect(identity.formerRepositorySlugs).toEqual(['acme/old']);
    expect(parseProductIdentity(valid).formerRepositorySlugs).toEqual([]);
  });

  it('refuses a document whose repository is missing a name', () => {
    expect(() => parseProductIdentity({ ...valid, repository: { owner: 'acme' } })).toThrow(/repository\.name/);
  });

  it('refuses a command declared both current and deprecated', () => {
    const commands = { primary: 'acme-tool', aliases: ['at'], deprecated: ['at'] };
    expect(() => parseProductIdentity({ ...valid, commands })).toThrow(/at/);
  });

  it('refuses a slug segment GitHub would not accept', () => {
    expect(() => parseProductIdentity({ ...valid, repository: { owner: 'acme', name: 'a/b' } })).toThrow(/repository\.name/);
  });
});

describe('PRODUCT_IDENTITY', () => {
  it('names one primary command and keeps it out of the deprecated list', () => {
    expect(PRODUCT_IDENTITY.commands.deprecated).not.toContain(PRODUCT_IDENTITY.commands.primary);
    expect(PRODUCT_IDENTITY.repositorySlug.split('/')).toHaveLength(2);
  });
});

describe('packageFor', () => {
  const identity = parseProductIdentity({ ...valid, formerPackages: [{ name: 'oldtool', lastMajor: 3 }] });

  it('names the package a release was published under', () => {
    expect(identity.packageFor('3.8.0')).toBe('oldtool');
    expect(identity.packageFor('0.4.1')).toBe('oldtool');
    expect(identity.packageFor('4.0.0')).toBe('acmetool');
  });

  it('falls back to the current package when the version is not one', () => {
    expect(identity.packageFor('x.y.z')).toBe('acmetool');
    expect(identity.packageFor('latest')).toBe('acmetool');
  });

  it('refuses a former package without a last major', () => {
    expect(() => parseProductIdentity({ ...valid, formerPackages: [{ name: 'oldtool' }] })).toThrow(/lastMajor/);
  });
});

describe('managed markers', () => {
  const { markers } = parseProductIdentity(valid);

  it('writes every managed block under the current namespace', () => {
    expect(markers.agentDoc.current).toEqual({ begin: '<!-- acme-tool:begin -->', end: '<!-- acme-tool:end -->' });
    expect(markers.contextContinuity.current).toEqual({
      begin: '<!-- acme-tool:context-continuity:begin -->',
      end: '<!-- acme-tool:context-continuity:end -->',
    });
    expect(markers.gitignore.current).toEqual({ begin: '# acme-tool:begin', end: '# acme-tool:end' });
  });

  it('recognizes the current pair first, then every deprecated one, so a consumer block written before a rename is found', () => {
    expect(markers.agentDoc.recognized).toEqual([
      { begin: '<!-- acme-tool:begin -->', end: '<!-- acme-tool:end -->' },
      { begin: '<!-- old-tool:begin -->', end: '<!-- old-tool:end -->' },
    ]);
    expect(markers.gitignore.recognized.map((pair) => pair.begin)).toEqual(['# acme-tool:begin', '# old-tool:begin']);
  });

  it('refuses a namespace that would break the comment it sits in', () => {
    expect(() => parseProductIdentity({ ...valid, markers: { namespace: 'a -->', deprecated: [] } })).toThrow(/markers\.namespace/);
  });

  it('refuses a namespace declared both current and deprecated', () => {
    expect(() => parseProductIdentity({ ...valid, markers: { namespace: 'x', deprecated: ['x'] } })).toThrow(/x/);
  });
});

describe('productSetting', () => {
  const identity = parseProductIdentity(valid);

  it('reads the setting under the current prefix', () => {
    expect(productSetting({ ACME_TOOL_NO_TRIM: '1' }, 'NO_TRIM', identity)).toBe('1');
  });

  it('still honors the deprecated prefix, so an override set before the rename keeps working', () => {
    expect(productSetting({ OLD_TOOL_NO_TRIM: '1' }, 'NO_TRIM', identity)).toBe('1');
  });

  it('lets the current name win when both are set', () => {
    expect(productSetting({ OLD_TOOL_TRIM_BYTES: '10', ACME_TOOL_TRIM_BYTES: '20' }, 'TRIM_BYTES', identity)).toBe('20');
    expect(productSetting({ OLD_TOOL_TRIM_BYTES: '10', ACME_TOOL_TRIM_BYTES: '' }, 'TRIM_BYTES', identity)).toBe('');
  });

  it('answers undefined when neither is set', () => {
    expect(productSetting({ UNRELATED: '1' }, 'NO_TRIM', identity)).toBeUndefined();
  });

  it('refuses a malformed prefix, which would read a variable nobody set', () => {
    expect(() => parseProductIdentity({ ...valid, environment: { prefix: 'acme', deprecated: [] } })).toThrow(/environment\.prefix/);
  });

  it('defaults to the product identity', () => {
    const name = `${PRODUCT_IDENTITY.environment.prefix}PROBE`;
    expect(productSetting({ [name]: 'yes' }, 'PROBE')).toBe('yes');
  });
});
