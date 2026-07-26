import { z } from 'zod';

export const MAX_SPECIALIST_OUTPUT_BYTES = 64 * 1024;

const slug = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

const specialistContractSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^core:[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.number().int().positive().max(10_000),
  name: slug,
  description: boundedText(200),
  scope: slug,
  independence: z.literal('fresh-context'),
  writeAccess: z.literal('none'),
  appliesWhen: z.strictObject({
    any: z.array(slug).min(1).max(16),
  }),
  inputs: z.array(slug).min(1).max(16),
  outputs: z.tuple([
    z.literal('verdict'),
    z.literal('findings'),
    z.literal('evidenceRequests'),
    z.literal('limitations'),
  ]),
  budgets: z.strictObject({
    contextTokens: z.number().int().min(1_000).max(128_000),
    maxTurns: z.number().int().min(1).max(12),
  }),
  failurePolicy: z.literal('block-on-critical'),
  instructions: boundedText(8_000),
}).superRefine((contract, context) => {
  if (contract.id !== `core:${contract.name}`) {
    context.addIssue({
      code: 'custom',
      path: ['id'],
      message: `must equal core:${contract.name}`,
    });
  }
});

const evidencePath = z.string().min(1).max(500).superRefine((path, context) => {
  const segments = path.replaceAll('\\', '/').split('/');
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || segments.includes('..')) {
    context.addIssue({ code: 'custom', message: 'must be repository-relative without traversal' });
  }
});

const specialistCompletionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  specialistId: z.string().regex(/^core:[a-z0-9]+(?:-[a-z0-9]+)*$/),
  contractVersion: z.number().int().positive().max(10_000),
  completionId: z.string().min(8).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  verdict: z.enum(['pass', 'changes-requested', 'blocked', 'degraded']),
  findings: z.array(z.strictObject({
    id: slug,
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    summary: boundedText(500),
    evidence: z.array(z.strictObject({
      path: evidencePath,
      line: z.number().int().positive().max(10_000_000),
      detail: boundedText(1_000),
    })).min(1).max(16),
    recommendation: boundedText(1_000),
  })).max(32),
  evidenceRequests: z.array(boundedText(1_000)).max(16),
  limitations: z.array(boundedText(1_000)).max(16),
}).superRefine((completion, context) => {
  if (
    (completion.verdict === 'blocked' || completion.verdict === 'degraded')
    && completion.limitations.length === 0
  ) {
    context.addIssue({
      code: 'custom',
      path: ['limitations'],
      message: `${completion.verdict} completions must state at least one limitation`,
    });
  }
});

export type SpecialistContract = z.infer<typeof specialistContractSchema>;
export type SpecialistCompletion = z.infer<typeof specialistCompletionSchema>;

export interface SpecialistSafety {
  readonly readOnly: 'enforced' | 'declared';
  readonly isolation: 'fresh-context';
  readonly teamMode: 'available' | 'degraded';
  readonly limitations: readonly string[];
}

export interface CompiledSpecialist {
  readonly name: string;
  readonly relativePath: string;
  readonly content: string;
  readonly instructions: string;
  readonly safety: SpecialistSafety;
}

function issueText(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length === 0 ? '(root)' : issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function parseSpecialistContract(input: unknown, source: string): SpecialistContract {
  const result = specialistContractSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`SPECIALIST_CONTRACT_INVALID: ${source}: ${issueText(result.error)}`);
  }
  return result.data;
}

export function parseSpecialistCompletion(
  body: string,
  contract: SpecialistContract,
  acceptedCompletionIds: readonly string[],
): SpecialistCompletion {
  if (body.trim() === '') throw new Error('SPECIALIST_OUTPUT_INVALID: output is empty');
  if (new TextEncoder().encode(body).byteLength > MAX_SPECIALIST_OUTPUT_BYTES) {
    throw new Error(`SPECIALIST_OUTPUT_INVALID: output exceeds ${MAX_SPECIALIST_OUTPUT_BYTES} bytes`);
  }
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SPECIALIST_OUTPUT_INVALID: invalid JSON: ${message}`);
  }
  const result = specialistCompletionSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`SPECIALIST_OUTPUT_INVALID: ${issueText(result.error)}`);
  }
  if (result.data.specialistId !== contract.id) {
    throw new Error(
      `SPECIALIST_OUTPUT_INVALID: wrong specialist '${result.data.specialistId}', expected '${contract.id}'`,
    );
  }
  if (result.data.contractVersion !== contract.version) {
    throw new Error(
      `SPECIALIST_OUTPUT_INVALID: wrong contract version ${result.data.contractVersion}, expected ${contract.version}`,
    );
  }
  if (acceptedCompletionIds.includes(result.data.completionId)) {
    throw new Error(`SPECIALIST_OUTPUT_INVALID: duplicate completion '${result.data.completionId}'`);
  }
  return result.data;
}

function title(name: string): string {
  return name
    .split('-')
    .map((part) => part === 'qa' ? 'QA' : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

export function renderSpecialistInstructions(contract: SpecialistContract): string {
  const outputExample = JSON.stringify({
    schemaVersion: 1,
    specialistId: contract.id,
    contractVersion: contract.version,
    completionId: '<unique-id>',
    verdict: 'pass|changes-requested|blocked|degraded',
    findings: [{
      id: '<finding-id>',
      severity: 'critical|high|medium|low',
      summary: '<concise finding>',
      evidence: [{ path: '<repo-relative path>', line: 1, detail: '<observed evidence>' }],
      recommendation: '<bounded action>',
    }],
    evidenceRequests: ['<missing evidence>'],
    limitations: ['<unavailable tool or proof>'],
  });
  return [
    `# ${title(contract.name)}`,
    '',
    `Canonical contract: \`${contract.id}\` v${contract.version}.`,
    '',
    'Work in a fresh context. Stay read-only. Inspect only the supplied inputs and repository evidence. Do not delegate, edit files, run processes, or use the network.',
    '',
    '## Scope',
    '',
    contract.instructions,
    '',
    '## Applicability',
    '',
    'Run when any condition matches:',
    ...contract.appliesWhen.any.map((condition) => `- ${condition}`),
    '',
    '## Inputs',
    '',
    ...contract.inputs.map((input) => `- ${input}`),
    '',
    '## Budget',
    '',
    `- Context tokens: ${contract.budgets.contextTokens}`,
    `- Maximum turns: ${contract.budgets.maxTurns}`,
    `- Failure policy: ${contract.failurePolicy}`,
    '',
    'This contract is identical for manual and orchestrated invocation.',
    '',
    '## Required output',
    '',
    'Your final response is consumed directly by JSON.parse. Return exactly one raw JSON object. Do not use Markdown, a code fence, headings, or surrounding prose. The first character must be `{` and the last must be `}`:',
    outputExample,
    '',
    'Use an empty array when a collection has no entries. Echo this specialist id and contract version exactly. A completion id may be accepted only once. If required evidence or isolation is unavailable, use `degraded` or `blocked` and explain it in `limitations`.',
  ].join('\n');
}
