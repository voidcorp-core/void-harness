import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { assessProfileFreshness, type DetectedTechnology } from './freshness.js';
import type {
  ProfileApplicability,
  ProfileDocument,
  ProfileFileSelectors,
} from './schema.js';

export interface ProfileProjectInput {
  readonly path: string;
  readonly technologies: readonly DetectedTechnology[];
}

export interface ProfileRoutingInput {
  readonly schemaVersion: 1;
  readonly status: 'complete' | 'degraded';
  readonly files: readonly string[];
  readonly projects: readonly ProfileProjectInput[];
}

export interface ProfileRoutingProof {
  readonly predicateId: string;
  readonly inputs: readonly string[];
  readonly inputHash: string;
}

export interface ProfileRoutingDecision {
  readonly profileId: string;
  readonly profileVersion: number;
  readonly state: 'applicable' | 'not-applicable' | 'degraded';
  readonly activePatternIds: readonly string[];
  readonly reasons: readonly string[];
  readonly sourceReviewRequired: boolean;
  readonly proof: ProfileRoutingProof;
}

interface FileContext {
  readonly file: string;
  readonly technologies: readonly DetectedTechnology[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function safePath(path: string, allowRoot = false): boolean {
  if (allowRoot && path === '.') return true;
  return path.length > 0
    && !path.startsWith('/')
    && path !== '..'
    && !path.startsWith('../')
    && !path.includes('/../')
    && !path.includes('\\')
    && posix.normalize(path) === path;
}

function validateInput(input: ProfileRoutingInput): void {
  if (input.schemaVersion !== 1) throw new Error('PROFILE_INPUT_INVALID: schemaVersion');
  if (input.status !== 'complete' && input.status !== 'degraded') {
    throw new Error('PROFILE_INPUT_INVALID: status');
  }
  if (!input.files.every((file) => safePath(file))) {
    throw new Error('PROFILE_INPUT_INVALID: changed files must be normalized project-relative paths');
  }
  if (!input.projects.every((project) => safePath(project.path, true))) {
    throw new Error('PROFILE_INPUT_INVALID: project paths must be normalized and project-relative');
  }
  if (new Set(input.projects.map((project) => project.path)).size !== input.projects.length) {
    throw new Error('PROFILE_INPUT_INVALID: duplicate project path');
  }
  for (const project of input.projects) {
    if (new Set(project.technologies.map((item) => item.id)).size !== project.technologies.length) {
      throw new Error(`PROFILE_INPUT_INVALID: duplicate technology in '${project.path}'`);
    }
  }
}

function owns(projectPath: string, file: string): boolean {
  return projectPath === '.' || file === projectPath || file.startsWith(`${projectPath}/`);
}

function mergeTechnologies(
  root: readonly DetectedTechnology[],
  local: readonly DetectedTechnology[],
): readonly DetectedTechnology[] {
  const merged = new Map<string, DetectedTechnology>();
  for (const technology of [...root, ...local]) merged.set(technology.id, technology);
  return Object.freeze([...merged.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function contexts(input: ProfileRoutingInput): readonly FileContext[] {
  const projects = [...input.projects].sort((left, right) =>
    right.path.length - left.path.length || left.path.localeCompare(right.path));
  const root = projects.find((project) => project.path === '.')?.technologies ?? [];
  return Object.freeze([...new Set(input.files)].sort().map((file) => {
    const owner = projects.find((project) => owns(project.path, file));
    return Object.freeze({
      file,
      technologies: mergeTechnologies(root, owner?.path === '.' ? [] : (owner?.technologies ?? [])),
    });
  }));
}

function filesMatch(selectors: ProfileFileSelectors, file: string): boolean {
  const base = posix.basename(file);
  const extension = posix.extname(base).toLowerCase();
  const segments = file.split('/');
  const hasSelectors = selectors.extensions.length > 0
    || selectors.names.length > 0
    || selectors.pathSegments.length > 0;
  return !hasSelectors
    || selectors.extensions.includes(extension)
    || selectors.names.includes(base)
    || selectors.pathSegments.some((segment) => segments.includes(segment));
}

function applies(rule: ProfileApplicability, context: FileContext): boolean {
  const detected = new Set(context.technologies.map((technology) => technology.id));
  return (rule.technologies.length === 0 || rule.technologies.some((technology) => detected.has(technology)))
    && filesMatch(rule.files, context.file);
}

function proof(profile: ProfileDocument, input: ProfileRoutingInput): ProfileRoutingProof {
  const inputs = Object.freeze([
    `files:${new Set(input.files).size}`,
    `projects:${input.projects.length}`,
    `status:${input.status}`,
  ]);
  return Object.freeze({
    predicateId: `profile:${profile.name}:detectors`,
    inputs,
    inputHash: hash({ profile, input: {
      schemaVersion: input.schemaVersion,
      status: input.status,
      files: [...new Set(input.files)].sort(),
      projects: [...input.projects]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((project) => ({
          path: project.path,
          technologies: [...project.technologies]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((technology) => ({
              ...technology,
              sources: [...technology.sources].sort(),
            })),
        })),
    } }),
  });
}

export function routeProfiles(
  profiles: readonly ProfileDocument[],
  input: ProfileRoutingInput,
  options: { readonly now: string },
): readonly ProfileRoutingDecision[] {
  validateInput(input);
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
    throw new Error('PROFILE_CATALOG_INVALID: duplicate profile id');
  }
  const fileContexts = contexts(input);
  return Object.freeze([...profiles]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((profile) => {
      const matching = profile.detectors.always
        ? fileContexts
        : fileContexts.filter((context) => applies(profile.detectors, context));
      const activePatternIds = matching.length === 0
        ? []
        : profile.patterns
          .filter((pattern) => fileContexts.some((context) => applies(pattern.appliesWhen, context)))
          .map((pattern) => pattern.id)
          .sort();
      if (matching.length === 0 && !profile.detectors.always) {
        return Object.freeze({
          profileId: profile.id,
          profileVersion: profile.version,
          state: 'not-applicable' as const,
          activePatternIds: Object.freeze([]),
          reasons: Object.freeze(['detectors-not-matched']),
          sourceReviewRequired: false,
          proof: proof(profile, input),
        });
      }
      const detected = matching.flatMap((context) => context.technologies);
      const freshness = assessProfileFreshness(profile, detected, options.now);
      const reasons = [...freshness.reasons];
      if (input.status === 'degraded') reasons.push('detection-incomplete');
      const degraded = reasons.length > 0;
      return Object.freeze({
        profileId: profile.id,
        profileVersion: profile.version,
        state: degraded ? 'degraded' as const : 'applicable' as const,
        activePatternIds: Object.freeze(activePatternIds),
        reasons: Object.freeze([...new Set(reasons)].sort()),
        sourceReviewRequired: degraded,
        proof: proof(profile, input),
      });
    }));
}
