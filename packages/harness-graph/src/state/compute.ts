import type { CapabilityCert } from '../certification/types.js';
import type {
  CapabilityState,
  CapabilityStateName,
  Certification,
  LocalSignals,
  ProjectState,
  RuntimeState,
} from './types.js';

/** Normalize a raw telemetry count to a clean non-negative integer. Corrupt input — NaN (note
 * `NaN <= 0` is false, which would otherwise fall through to a higher state), Infinity, negative, or
 * fractional — collapses to 0/floor so bad telemetry can never silently promote a capability's state
 * (and never persists a non-integer into `usedCount`). */
function normalizeCount(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Derive one capability's state as the highest level reached on the linear lifecycle
 * `available -> installed -> verified -> used -> effective`. Each level implies the ones before it
 * (a used-but-unverified capability caps at `installed`). `effective` requires BOTH a certified
 * effective proof AND real local use here — a certified-but-unused-here capability stays below it,
 * which is the "installed is not fully available" intent (spec §2). */
function deriveState(cap: CapabilityCert, installed: boolean, usedCount: number): CapabilityStateName {
  if (!installed) return 'available';
  if (!cap.proof.verified) return 'installed';
  if (usedCount <= 0) return 'verified';
  if (!cap.proof.effective) return 'used';
  return 'effective';
}

const byName = (a: RuntimeState, b: RuntimeState): number =>
  a.runtime < b.runtime ? -1 : a.runtime > b.runtime ? 1 : 0;

/**
 * Join the frozen certification (repo-authored proof) with local signals into the deterministic,
 * offline `ProjectState`. Pure — no I/O, no model call, no clock (`generatedAt` is stamped by the
 * shell). The runtime list is the union of every declared runtime and every detected one, each
 * flagged detected/undetected.
 */
export function computeProjectState(
  cert: Certification,
  signals: LocalSignals,
  harnessVersion: string,
): ProjectState {
  const capabilities: CapabilityState[] = cert.capabilities.map((cap) => {
    const installed = signals.installedIds.has(cap.id);
    const usedCount = normalizeCount(signals.usedCounts.get(cap.id));
    const state = deriveState(cap, installed, usedCount);
    const effectiveCells = state === 'effective' ? cap.proof.effective?.cells : undefined;
    return {
      id: cap.id,
      state,
      verified: cap.proof.verified,
      usedCount,
      ...(effectiveCells ? { effectiveCells } : {}),
    };
  });

  const known = new Set<string>(signals.runtimesDetected);
  for (const cap of cert.capabilities) for (const r of cap.runtimes) known.add(r);
  const runtimes: RuntimeState[] = [...known]
    .map((runtime) => ({ runtime, detected: signals.runtimesDetected.has(runtime) }))
    .sort(byName);

  return { schemaVersion: 1, harnessVersion, capabilities, runtimes };
}
