import type { GraphModel } from '../model/types.js';
import type { CapabilityCert, Certification, EvalReportLite } from './types.js';

const cmpId = (a: CapabilityCert, b: CapabilityCert): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Build the frozen certification manifest by joining the capability contract (from the graph model)
 * with the eval reports. Pure and deterministic. The **honesty invariant** — `effective` is produced
 * only when ALL hold, never inferred or faked:
 *   1. the capability is structurally `verified` (effective implies verified);
 *   2. a real eval report for it exists with verdict `skill-helps`;
 *   3. the report's `delta` is a finite number (an upstream NaN serializes to a JSON nil, never a proof);
 *   4. the capability declares EXACTLY ONE eval target cell — so the delta attributes unambiguously.
 * A multi-target capability stays un-`effective` until eval reports carry cell identity (Phase E);
 * blindly stamping the delta on the first target would certify cell B's proof as cell A's.
 */
export function buildCertification(
  model: GraphModel,
  reports: readonly EvalReportLite[],
  harnessVersion: string,
): Certification {
  const byName = new Map(reports.map((r) => [r.skill, r]));
  const capabilities = model.nodes
    .filter((n) => n.type === 'skill')
    .map((n): CapabilityCert => {
      const runtimes = n.runtimes ?? [];
      const evalTargets = n.evalTargets ?? [];
      const verified = Boolean(n.owner && runtimes.length > 0);
      const report = byName.get(n.name);
      const cell = evalTargets.length === 1 ? evalTargets[0] : undefined;
      const effective =
        verified && cell && report?.verdict === 'skill-helps' && Number.isFinite(report.delta)
          ? { cells: [{ ...cell, delta: report.delta }] }
          : undefined;
      return {
        id: n.id,
        ...(n.owner ? { owner: n.owner } : {}),
        runtimes,
        ...(n.enforcement ? { enforcement: n.enforcement } : {}),
        evalTargets,
        proof: { verified, ...(effective ? { effective } : {}) },
      };
    })
    .sort(cmpId);
  return { schemaVersion: 1, harnessVersion, capabilities };
}

/** Stable, deterministic serialization (sorted capabilities, 2-space, trailing newline) so the
 * committed `certification.json` diffs cleanly and the freshness gate can compare byte-for-byte. */
export function serializeCertification(cert: Certification): string {
  return `${JSON.stringify(cert, null, 2)}\n`;
}
