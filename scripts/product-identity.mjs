// The product identity, for the plain-ESM scripts that cannot import TypeScript.
//
// It reads packages/core/data/identity.json relative to this file, never relative to the working
// directory: a guard that runs from a trusted checkout therefore reads the identity of that same
// checkout, never one a pull request brought along. The TypeScript accessor
// (packages/hook-runner/src/identity.ts) derives the same fields, and
// test/identity/product-identity.test.ts proves the two agree.

import { readFileSync } from 'node:fs';

const document = JSON.parse(
  readFileSync(new URL('../packages/core/data/identity.json', import.meta.url), 'utf8'),
);
const { owner, name } = document.repository;

export const PRODUCT_IDENTITY = Object.freeze({
  repository: Object.freeze({ owner, name }),
  repositorySlug: `${owner}/${name}`,
  repositoryUrl: `https://github.com/${owner}/${name}`,
  formerRepositorySlugs: Object.freeze(
    (document.repository.formerNames ?? []).map((former) => `${owner}/${former}`),
  ),
  packageName: document.packageName,
  formerPackages: Object.freeze(
    (document.formerPackages ?? []).map(({ name, lastMajor }) => Object.freeze({ name, lastMajor })),
  ),
  commands: Object.freeze({
    primary: document.commands.primary,
    aliases: Object.freeze([...document.commands.aliases]),
    deprecated: Object.freeze([...document.commands.deprecated]),
  }),
});
