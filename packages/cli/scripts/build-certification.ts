// Build the frozen certification manifest `packages/harness-graph/certification.json` by joining the
// committed graph model (capability contract) with the eval-harness JSON reports (proof). Monorepo-
// only, mirrors build-decisions-index: default writes the artifact, `--check` fails on drift (CI gate).
// Today there are no eval JSON reports, so every capability ships `verified` with zero `effective` —
// the honest current state; effective populates in Phase E when the paid evals run and emit JSON.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCertification, serializeCertification } from '@voidcorp/harness-graph';
import type { Certification, EvalReportLite, GraphModel } from '@voidcorp/harness-graph';

const here = dirname(fileURLToPath(import.meta.url));
const pkgs = resolve(here, '..', '..'); // packages/
const repoRoot = resolve(pkgs, '..');
const modelPath = resolve(pkgs, 'harness-graph', 'model.json');
const certPath = resolve(pkgs, 'harness-graph', 'certification.json');
const reportsDir = resolve(repoRoot, 'apps', 'eval-harness', 'reports');
const cliPkgPath = resolve(pkgs, 'cli', 'package.json');

const isVerdict = (s: string): s is EvalReportLite['verdict'] =>
  s === 'skill-helps' || s === 'no-signal' || s === 'skill-hurts';

/** Shape-guard a parsed report before it enters the join (house style, cf. behavior/parse.ts).
 * The pure builder already fails safe on a bad delta/verdict; this adds the observability the
 * builder can't — a malformed report file is surfaced, not silently swallowed. */
function isEvalReportLite(v: unknown): v is EvalReportLite {
  if (typeof v !== 'object' || v === null) return false; // allow-null: JSON.parse yields null; the `in` checks below would throw on it
  return (
    'skill' in v &&
    typeof v.skill === 'string' &&
    'delta' in v &&
    typeof v.delta === 'number' &&
    Number.isFinite(v.delta) &&
    'verdict' in v &&
    typeof v.verdict === 'string' &&
    isVerdict(v.verdict)
  );
}

function loadReports(): EvalReportLite[] {
  if (!existsSync(reportsDir)) return [];
  const out: EvalReportLite[] = [];
  for (const f of readdirSync(reportsDir).sort()) {
    // deterministic order: a duplicate skill would otherwise resolve by filesystem order
    if (!f.endsWith('.json')) continue;
    const parsed: unknown = JSON.parse(readFileSync(join(reportsDir, f), 'utf8'));
    if (isEvalReportLite(parsed)) out.push(parsed);
    else process.stderr.write(`certification: ignoring malformed eval report ${f}\n`);
  }
  return out;
}

const model: GraphModel = JSON.parse(readFileSync(modelPath, 'utf8'));
const version: unknown = JSON.parse(readFileSync(cliPkgPath, 'utf8')).version;
if (typeof version !== 'string' || version === '') {
  process.stderr.write(`certification: cannot read a harness version from ${cliPkgPath}\n`);
  process.exit(1);
}
const cert: Certification = buildCertification(model, loadReports(), version);
const serialized = serializeCertification(cert);

const check = process.argv.includes('--check');
if (check) {
  const onDisk = existsSync(certPath) ? readFileSync(certPath, 'utf8') : '';
  if (onDisk !== serialized) {
    process.stderr.write('certification.json is stale — run `pnpm certification:build` and commit.\n');
    process.exit(1);
  }
  process.stdout.write(`certification:check — in sync (${cert.capabilities.length} capabilities).\n`);
} else {
  writeFileSync(certPath, serialized);
  const effective = cert.capabilities.filter((c) => c.proof.effective).length;
  process.stdout.write(
    `certification:build — wrote ${cert.capabilities.length} capabilities (${effective} effective) @ ${version}.\n`,
  );
}
