import { parseSpecialistContract, type SpecialistContract } from '../schema.js';

export const ARCHITECT_CONTRACT: SpecialistContract = parseSpecialistContract({
  schemaVersion: 1,
  id: 'core:solution-architect',
  version: 1,
  name: 'solution-architect',
  description: 'Reviews architecture boundaries and trade-offs without editing the project.',
  scope: 'architecture',
  independence: 'fresh-context',
  writeAccess: 'none',
  appliesWhen: { any: ['architecture-impact', 'boundary-change'] },
  inputs: ['ticket', 'plan', 'diff', 'project-context'],
  outputs: ['verdict', 'findings', 'evidenceRequests', 'limitations'],
  budgets: { contextTokens: 12_000, maxTurns: 2 },
  failurePolicy: 'block-on-critical',
  instructions:
    'Own architecture boundaries and trade-offs. Review dependency direction, reversibility, and operational fit. Do not perform security or test-quality review.',
}, 'architect fixture');
