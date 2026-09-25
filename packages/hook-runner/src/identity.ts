// The product's identity: which repository hosts it, which npm package ships it, which commands
// start it. It is written once, in packages/core/data/identity.json, and read here by every
// TypeScript consumer. The import is bundled into the CLI and into the hook runtime, so an
// installed copy carries the identity of the release that built it and reads no file at run time.
//
// Manifests that cannot import (package.json, plugin.json, workflows) repeat the values; the
// identity contract test fails the moment one of them disagrees with this source.
import document from '../../core/data/identity.json' with { type: 'json' };

export interface ProductIdentity {
  readonly repository: { readonly owner: string; readonly name: string };
  /** `owner/name`, the form GitHub, gh and the Actions context use. */
  readonly repositorySlug: string;
  readonly repositoryUrl: string;
  /** Slugs the repository carried before a rename. GitHub redirects git and web traffic to the new
   * name, but not a workflow's `uses:`, so a reference to one of these is broken, not merely old. */
  readonly formerRepositorySlugs: readonly string[];
  readonly packageName: string;
  /** Names the package was published under before, each up to and including its last major. */
  readonly formerPackages: readonly FormerPackage[];
  /** The package a given release was published under; the current one for anything else. */
  readonly packageFor: (version: string) => string;
  readonly commands: {
    readonly primary: string;
    readonly aliases: readonly string[];
    /** Still installed and still working, with a one-line notice on stderr. */
    readonly deprecated: readonly string[];
  };
}

export interface FormerPackage {
  readonly name: string;
  readonly lastMajor: number;
}

// GitHub owner and repository names, npm package names and bin names all fit this shape; a
// slash or a space in any of them would silently change what a guard compares.
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== undefined && value !== null && !Array.isArray(value); // allow-null: narrowing parsed JSON
}

function segment(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SEGMENT.test(value)) {
    throw new Error(`product identity: ${field} must be a lowercase name without separators`);
  }
  return value;
}

function segments(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`product identity: ${field} must be a list`);
  return value.map((entry, index) => segment(entry, `${field}[${index}]`));
}

function formerPackages(value: unknown): readonly FormerPackage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('product identity: formerPackages must be a list');
  return value.map((entry: unknown, index) => {
    const record = isRecord(entry) ? entry : {};
    const lastMajor = record['lastMajor'];
    if (typeof lastMajor !== 'number' || !Number.isInteger(lastMajor) || lastMajor < 0) {
      throw new Error(`product identity: formerPackages[${index}].lastMajor must be a whole number`);
    }
    return { name: segment(record['name'], `formerPackages[${index}].name`), lastMajor };
  });
}

const MAJOR = /^(0|[1-9]\d*)\.\d+\.\d+/;

/** Validate an identity document and derive the forms every consumer needs. Throws on any doubt. */
export function parseProductIdentity(value: unknown): ProductIdentity {
  if (!isRecord(value)) throw new Error('product identity: document must be an object');
  const repository = isRecord(value['repository']) ? value['repository'] : {};
  const owner = segment(repository['owner'], 'repository.owner');
  const name = segment(repository['name'], 'repository.name');
  const formerNames =
    repository['formerNames'] === undefined ? [] : segments(repository['formerNames'], 'repository.formerNames');
  const commands = isRecord(value['commands']) ? value['commands'] : {};
  const primary = segment(commands['primary'], 'commands.primary');
  const aliases = segments(commands['aliases'], 'commands.aliases');
  const deprecated = segments(commands['deprecated'], 'commands.deprecated');
  const current = [primary, ...aliases];
  const clash = deprecated.find((command) => current.includes(command));
  if (clash !== undefined) throw new Error(`product identity: ${clash} is both current and deprecated`);
  const packageName = segment(value['packageName'], 'packageName');
  const former = formerPackages(value['formerPackages']);
  // A version under several former names belongs to the oldest name that still covered it.
  const byLastMajor = [...former].sort((left, right) => left.lastMajor - right.lastMajor);
  const packageFor = (version: string): string => {
    const match = MAJOR.exec(version);
    if (match === null) return packageName;
    const major = Number(match[1]);
    return byLastMajor.find((entry) => major <= entry.lastMajor)?.name ?? packageName;
  };
  return {
    repository: { owner, name },
    repositorySlug: `${owner}/${name}`,
    repositoryUrl: `https://github.com/${owner}/${name}`,
    formerRepositorySlugs: formerNames.map((former) => `${owner}/${former}`),
    packageName,
    formerPackages: former,
    packageFor,
    commands: { primary, aliases, deprecated },
  };
}

export const PRODUCT_IDENTITY: ProductIdentity = parseProductIdentity(document);
