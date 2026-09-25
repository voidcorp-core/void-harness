import { describe, expect, it } from 'vitest';
import { parseProductIdentity, PRODUCT_IDENTITY } from './identity.js';

const valid = {
  repository: { owner: 'acme', name: 'tool' },
  packageName: 'acmetool',
  commands: { primary: 'acme-tool', aliases: ['at'], deprecated: ['old-tool'] },
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
