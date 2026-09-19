// tdd-cover: e2e packages/cli/src/lib/runs/mission-recovery.test.ts
import {
  type CanonicalEvent,
  projectMissionLifecycle,
  validatedRecoveredReviewEvents,
} from '@voidcorp/mission-engine';

/** A recovery opens an episode only when its receipt reproduces the original admission. */
export function observedMissionLifecycle(events: readonly CanonicalEvent[]) {
  const recovered = validatedRecoveredReviewEvents(events);
  if (!recovered.ok) throw new Error(`MISSION_RECOVERY_INVALID: ${recovered.reasons.join('; ')}`);
  const lifecycle = projectMissionLifecycle(events);
  if (lifecycle.status === 'invalid') {
    throw new Error(`MISSION_LIFECYCLE_INVALID: ${lifecycle.reasons.join('; ')}`);
  }
  return lifecycle;
}

export function requireOpenMission(events: readonly CanonicalEvent[]): void {
  if (observedMissionLifecycle(events).status === 'closed') {
    throw new Error('MISSION_CLOSED: transition is no longer accepted; inspect its closure and recovery options');
  }
}
