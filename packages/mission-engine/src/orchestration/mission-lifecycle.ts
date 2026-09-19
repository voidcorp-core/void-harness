import type { CanonicalEvent, JsonValue } from '../events/types.js';

export type MissionLifecycle =
  | { readonly status: 'open'; readonly episodeId: string }
  | { readonly status: 'closed'; readonly episodeId: string; readonly closure: CanonicalEvent }
  | { readonly status: 'invalid'; readonly reasons: readonly string[] };

function isRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function field(payload: JsonValue, key: string): JsonValue | undefined {
  return isRecord(payload) ? payload[key] : undefined;
}

function invalid(reason: string): MissionLifecycle {
  return { status: 'invalid', reasons: [reason] };
}

/** Projects episode identity only. Recovery admission and receipt proofs belong to recovery. */
export function projectMissionLifecycle(events: readonly CanonicalEvent[]): MissionLifecycle {
  const first = events[0];
  if (first?.kind !== 'mission.started' || first.seq !== 1) {
    return invalid('Mission must begin with its single mission.started event; inspect the journal');
  }
  let state: MissionLifecycle = { status: 'open', episodeId: first.eventId };
  const seen = new Set<string>();
  for (const [index, current] of events.entries()) {
    if (current.seq !== index + 1 || seen.has(current.eventId)
      || current.missionId !== first.missionId || current.correlationId !== first.missionId) {
      return invalid('Mission journal has inconsistent ordering or identity; reconcile original events');
    }
    seen.add(current.eventId);
    if (index === 0) continue;
    if (current.kind === 'mission.started') {
      return invalid('Mission has more than one start; retain the original identity');
    }
    if (current.kind === 'mission.closed') {
      if (state.status !== 'open') return invalid('Mission episode is already closed');
      const episode = field(current.payload, 'episodeId');
      const reason = field(current.payload, 'reason');
      if ((episode === undefined ? state.episodeId !== first.eventId : episode !== state.episodeId)
        || !['completed', 'controller-stop', 'interrupted', 'abandoned'].includes(String(reason))) {
        return invalid('Closure does not identify the active episode or a supported reason');
      }
      state = { status: 'closed', episodeId: state.episodeId, closure: current };
    }
    if (current.kind === 'mission.recovered') {
      if (state.status !== 'closed' || field(state.closure.payload, 'reason') !== 'controller-stop') {
        return invalid('Only an active controller-stop closure may be recovered');
      }
      if (field(current.payload, 'schemaVersion') !== 1
        || field(current.payload, 'closureEventId') !== state.closure.eventId
        || field(current.payload, 'previousEpisodeId') !== state.episodeId
        || field(current.payload, 'priorJournalLastSeq') !== current.seq - 1
        || !/^sha256:[a-f0-9]{64}$/.test(String(field(current.payload, 'priorJournalHash')))) {
        return invalid('Recovery receipt does not match its closure and journal prefix');
      }
      state = { status: 'open', episodeId: current.eventId };
    }
  }
  return state;
}
