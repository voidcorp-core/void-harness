import type { EvidenceOutput } from '@voidcorp/mission-engine';

const MAX_OUTPUT_BYTES = 8 * 1024;
const SECRET_OPTION =
  /^--?(?:api[-_]?key|auth|authorization|password|passwd|secret|token)$/i;
const SECRET_ASSIGNMENT =
  /(\b(?:api[-_]?key|auth|authorization|password|passwd|secret|token)\b\s*[:=]\s*)([^\s&,;]+)/gi;
const URL_SECRET =
  /([?&](?:api[-_]?key|auth|password|secret|token)=)([^&#\s]+)/gi;
const BEARER = /(\bBearer\s+)[A-Za-z0-9._~+/-]{6,}/gi;
const KNOWN_TOKEN =
  /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9_]{8,}|npm_[A-Za-z0-9]{8,}|pypi-[A-Za-z0-9_-]{8,}|sk-(?:ant-)?[A-Za-z0-9_-]{8,}|sk_live_[A-Za-z0-9_-]{8,}|xox[a-z]-[A-Za-z0-9-]{8,})\b/g;
const PRIVATE_KEY =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const SECRET_ENV_KEY =
  /(?:API[_-]?KEY|AUTH|CREDENTIAL|PASSWORD|PASSWD|PRIVATE[_-]?KEY|SECRET|TOKEN)/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncateUtf8(value: string, bytes: number): string {
  const input = Buffer.from(value, 'utf8');
  if (input.byteLength <= bytes) return value;
  return input.subarray(0, bytes).toString('utf8');
}

export function collectKnownSecrets(
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] {
  return Object.entries(env)
    .filter(([key, value]) =>
      SECRET_ENV_KEY.test(key)
      && value !== undefined
      && value.length >= 4
      && value.length <= 4_096
    )
    .map(([, value]) => value ?? '')
    .sort((left, right) => right.length - left.length);
}

export function redactText(
  value: string,
  secrets: readonly string[] = collectKnownSecrets(),
): string {
  let redacted = value;
  for (const secret of [...new Set(secrets)].sort(
    (left, right) => right.length - left.length,
  )) {
    if (secret.length >= 4) {
      redacted = redacted.replace(
        new RegExp(escapeRegExp(secret), 'g'),
        '[REDACTED]',
      );
    }
  }
  return redacted
    .replace(URL_SECRET, '$1[REDACTED]')
    .replace(BEARER, '$1[REDACTED]')
    .replace(SECRET_ASSIGNMENT, '$1[REDACTED]')
    .replace(KNOWN_TOKEN, '[REDACTED]')
    .replace(PRIVATE_KEY, '[REDACTED]');
}

export function redactArgv(
  argv: readonly string[],
  secrets: readonly string[] = collectKnownSecrets(),
): readonly string[] {
  const output: string[] = [];
  let redactNext = false;
  for (const argument of argv) {
    if (redactNext) {
      output.push('[REDACTED]');
      redactNext = false;
      continue;
    }
    const separator = argument.indexOf('=');
    const option = separator === -1 ? argument : argument.slice(0, separator);
    if (SECRET_OPTION.test(option)) {
      if (separator === -1) {
        output.push(argument);
        redactNext = true;
      } else {
        output.push(`${option}=[REDACTED]`);
      }
      continue;
    }
    output.push(redactText(argument, secrets));
  }
  return output;
}

export function redactOutput(
  stdout: string,
  stderr: string,
  secrets: readonly string[] = collectKnownSecrets(),
): EvidenceOutput {
  const safeStdout = redactText(stdout, secrets);
  const safeStderr = redactText(stderr, secrets);
  const stdoutBytes = Math.min(
    Buffer.byteLength(safeStdout, 'utf8'),
    MAX_OUTPUT_BYTES,
  );
  const boundedStdout = truncateUtf8(safeStdout, stdoutBytes);
  const remaining = Math.max(
    0,
    MAX_OUTPUT_BYTES - Buffer.byteLength(boundedStdout, 'utf8'),
  );
  const boundedStderr = truncateUtf8(safeStderr, remaining);
  return {
    stdout: boundedStdout,
    stderr: boundedStderr,
    truncated: boundedStdout !== safeStdout || boundedStderr !== safeStderr,
  };
}
