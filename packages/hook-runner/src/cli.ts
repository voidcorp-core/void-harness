import {
  discoverProjectRoot,
  evaluateRule,
  MAX_HOOK_INPUT_BYTES,
  parseHookText,
  parseHookPayload,
  type RuleName,
} from './enforcement/runner.js';
import { recordRuntimeEventFromCli } from './record.js';

const RULES = new Set<RuleName>([
  'dangerous-command',
  'protected-file',
  'secret-content',
  'tdd-order',
]);

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const raw of process.stdin) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
    bytes += chunk.byteLength;
    if (bytes > MAX_HOOK_INPUT_BYTES) throw new Error('HOOK_INPUT_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function writeVerdict(
  verdict: ReturnType<typeof evaluateRule>,
  write: (message: string) => void,
): void {
  if (verdict.code === 'ALLOW' || verdict.code === 'OVERRIDE') return;
  const evidence = verdict.evidence.length === 0
    ? ''
    : `\n${verdict.evidence.map((item) => `- ${item}`).join('\n')}`;
  write(`${verdict.code}: ${verdict.message}${evidence}\n`);
}

async function main(): Promise<void> {
  const input = await readStdin();
  if (process.argv[2] !== 'enforce' && process.argv[2] !== 'enforce-ci') {
    try {
      await recordRuntimeEventFromCli(
        parseHookPayload(input),
        process.argv,
        process.env,
      );
    } catch {
      // Telemetry is advisory and must never block a runtime tool call.
    }
    return;
  }

  try {
    const rule = process.argv[3];
    if (!RULES.has(rule as RuleName)) throw new Error('UNKNOWN_ENFORCEMENT_RULE');
    const rawInput = process.argv[2] === 'enforce-ci'
      ? {
          tool_name: 'Write',
          tool_input: {
            file_path: process.argv[4] ?? '',
            content: parseHookText(input),
          },
        }
      : parseHookPayload(input);
    const verdict = evaluateRule(
      rule as RuleName,
      rawInput,
      {
        root: process.env['VOID_PROJECT_ROOT']
          ?? process.env['CLAUDE_PROJECT_DIR']
          ?? discoverProjectRoot(process.cwd()),
        env: process.env,
      },
    );
    writeVerdict(verdict, (message) => process.stderr.write(message));
    if (!verdict.allow) process.exitCode = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ENFORCEMENT_ERROR';
    process.stderr.write(`HOOK_INPUT_REJECTED: ${message}\n`);
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ENFORCEMENT_ERROR';
  process.stderr.write(`HOOK_RUNNER_FAILED: ${message}\n`);
  process.exitCode = process.argv[2] === 'enforce' ? 2 : 0;
});
