export interface ProfileTechnologyRange {
  readonly id: string;
  readonly minimumVersion: string;
  readonly maximumVersionExclusive: string;
}

export interface ProfileFileSelectors {
  readonly extensions: readonly string[];
  readonly names: readonly string[];
  readonly pathSegments: readonly string[];
}

export interface ProfileApplicability {
  readonly technologies: readonly string[];
  readonly files: ProfileFileSelectors;
}

export interface ProfilePattern {
  readonly id: string;
  readonly appliesWhen: ProfileApplicability;
  readonly guidance: string;
}

export interface ProfileDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly technologies: readonly ProfileTechnologyRange[];
  readonly detectors: ProfileApplicability & { readonly always: boolean };
  readonly sources: readonly { readonly title: string; readonly url: string }[];
  readonly reviewedAt: string;
  readonly expiresAfterDays: number;
  readonly invariants: readonly string[];
  readonly patterns: readonly ProfilePattern[];
}

export type ProfileParseResult =
  | { readonly ok: true; readonly value: ProfileDocument }
  | { readonly ok: false; readonly issue: { readonly path: string; readonly message: string } };

const ID = /^[a-z0-9]+(?:(?:[:-])[a-z0-9]+)*$/;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXTENSION = /^\.[a-z0-9][a-z0-9+.-]{0,15}$/i;
const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const PATH_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

function fail(path: string, message: string): never {
  throw Object.assign(new Error(message), { profilePath: path });
}

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'must be an object');
  }
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  return result;
}

function text(value: unknown, path: string, max = 500): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    return fail(path, `must be a non-empty trimmed string of at most ${max} characters`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return fail(path, `must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function list<T>(
  value: unknown,
  path: string,
  maximum: number,
  parse: (item: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value) || value.length > maximum) {
    return fail(path, `must be an array of at most ${maximum} items`);
  }
  return Object.freeze(value.map((item, index) => parse(item, `${path}[${index}]`)));
}

function unique(values: readonly string[], path: string): readonly string[] {
  if (new Set(values).size !== values.length) fail(path, 'must not contain duplicates');
  return values;
}

function id(value: unknown, path: string): string {
  const result = text(value, path, 80);
  if (!ID.test(result)) fail(path, 'must be a lower-case identifier');
  return result;
}

function semver(value: unknown, path: string): string {
  const result = text(value, path, 32);
  if (!VERSION.test(result)) fail(path, 'must be an exact x.y.z version');
  return result;
}

export function compareProfileVersions(left: string, right: string): number {
  const a = VERSION.exec(left);
  const b = VERSION.exec(right);
  if (!a || !b) throw new Error('PROFILE_VERSION_INVALID: comparison requires exact x.y.z versions');
  for (let index = 1; index <= 3; index += 1) {
    const leftPart = BigInt(a[index]!);
    const rightPart = BigInt(b[index]!);
    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }
  return 0;
}

function selectors(value: unknown, path: string): ProfileFileSelectors {
  const input = record(value, path, ['extensions', 'names', 'pathSegments']);
  const extensions = unique(list(input['extensions'], `${path}.extensions`, 32, (item, itemPath) => {
    const result = text(item, itemPath, 16);
    if (!EXTENSION.test(result)) fail(itemPath, 'must be a safe file extension');
    return result.toLowerCase();
  }), `${path}.extensions`);
  const names = unique(list(input['names'], `${path}.names`, 32, (item, itemPath) => {
    const result = text(item, itemPath, 128);
    if (!FILE_NAME.test(result)) fail(itemPath, 'must be a safe file name');
    return result;
  }), `${path}.names`);
  const pathSegments = unique(list(input['pathSegments'], `${path}.pathSegments`, 32, (item, itemPath) => {
    const result = text(item, itemPath, 64);
    if (!PATH_SEGMENT.test(result) || result === '.' || result === '..') {
      fail(itemPath, 'must be a safe path segment');
    }
    return result;
  }), `${path}.pathSegments`);
  return Object.freeze({ extensions, names, pathSegments });
}

function applicability(value: unknown, path: string): ProfileApplicability {
  const input = record(value, path, ['technologies', 'files']);
  const technologies = unique(
    list(input['technologies'], `${path}.technologies`, 32, id),
    `${path}.technologies`,
  );
  return Object.freeze({ technologies, files: selectors(input['files'], `${path}.files`) });
}

function parse(value: unknown): ProfileDocument {
  const input = record(value, '$', [
    'schemaVersion', 'id', 'version', 'name', 'technologies', 'detectors',
    'sources', 'reviewedAt', 'expiresAfterDays', 'invariants', 'patterns',
  ]);
  if (input['schemaVersion'] !== 1) fail('$.schemaVersion', 'must equal 1');
  const profileId = id(input['id'], '$.id');
  const profileName = text(input['name'], '$.name', 80);
  if (!NAME.test(profileName)) fail('$.name', 'must be a lower-case slug');
  const technologies = list(input['technologies'], '$.technologies', 32, (item, path) => {
    const technology = record(item, path, ['id', 'minimumVersion', 'maximumVersionExclusive']);
    const minimumVersion = semver(technology['minimumVersion'], `${path}.minimumVersion`);
    const maximumVersionExclusive = semver(
      technology['maximumVersionExclusive'],
      `${path}.maximumVersionExclusive`,
    );
    if (compareProfileVersions(minimumVersion, maximumVersionExclusive) >= 0) {
      fail(path, 'minimumVersion must be lower than maximumVersionExclusive');
    }
    return Object.freeze({
      id: id(technology['id'], `${path}.id`),
      minimumVersion,
      maximumVersionExclusive,
    });
  });
  unique(technologies.map((item) => item.id), '$.technologies');
  const detectorInput = record(input['detectors'], '$.detectors', ['always', 'technologies', 'files']);
  if (typeof detectorInput['always'] !== 'boolean') fail('$.detectors.always', 'must be a boolean');
  const detectorApplicability = applicability({
    technologies: detectorInput['technologies'],
    files: detectorInput['files'],
  }, '$.detectors');
  const declared = new Set(technologies.map((item) => item.id));
  for (const technology of detectorApplicability.technologies) {
    if (!declared.has(technology)) fail('$.detectors.technologies', `undeclared technology '${technology}'`);
  }
  const sources = list(input['sources'], '$.sources', 16, (item, path) => {
    const source = record(item, path, ['title', 'url']);
    const url = text(source['url'], `${path}.url`, 500);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return fail(`${path}.url`, 'must be a valid HTTPS URL');
    }
    if (parsed.protocol !== 'https:') fail(`${path}.url`, 'must use HTTPS');
    return Object.freeze({ title: text(source['title'], `${path}.title`, 120), url });
  });
  if (sources.length === 0) fail('$.sources', 'must contain at least one official source');
  const reviewedAt = text(input['reviewedAt'], '$.reviewedAt', 10);
  const reviewedDate = new Date(`${reviewedAt}T00:00:00Z`);
  if (
    !DATE.test(reviewedAt)
    || Number.isNaN(reviewedDate.valueOf())
    || reviewedDate.toISOString().slice(0, 10) !== reviewedAt
  ) {
    fail('$.reviewedAt', 'must be an ISO calendar date');
  }
  const invariants = unique(list(input['invariants'], '$.invariants', 64, (item, path) =>
    text(item, path, 500)), '$.invariants');
  const patterns = list(input['patterns'], '$.patterns', 64, (item, path) => {
    const pattern = record(item, path, ['id', 'appliesWhen', 'guidance']);
    const appliesWhen = applicability(pattern['appliesWhen'], `${path}.appliesWhen`);
    for (const technology of appliesWhen.technologies) {
      if (!declared.has(technology)) fail(`${path}.appliesWhen.technologies`, `undeclared technology '${technology}'`);
    }
    return Object.freeze({
      id: id(pattern['id'], `${path}.id`),
      appliesWhen,
      guidance: text(pattern['guidance'], `${path}.guidance`, 1_000),
    });
  });
  unique(patterns.map((item) => item.id), '$.patterns');
  return Object.freeze({
    schemaVersion: 1,
    id: profileId,
    version: integer(input['version'], '$.version', 1, 1_000),
    name: profileName,
    technologies,
    detectors: Object.freeze({ always: detectorInput['always'], ...detectorApplicability }),
    sources,
    reviewedAt,
    expiresAfterDays: integer(input['expiresAfterDays'], '$.expiresAfterDays', 1, 730),
    invariants,
    patterns,
  });
}

export function parseProfile(value: unknown): ProfileParseResult {
  try {
    return Object.freeze({ ok: true, value: parse(value) });
  } catch (error) {
    const path = typeof error === 'object' && error !== null && 'profilePath' in error
      ? String(error.profilePath)
      : '$';
    const message = error instanceof Error ? error.message : String(error);
    return Object.freeze({ ok: false, issue: Object.freeze({ path, message: `${path}: ${message}` }) });
  }
}
