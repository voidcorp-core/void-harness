import {
  installedSkillNames,
  type LivenessVerdict,
  livenessVerdict,
  readMissionJournals,
  type ResolutionVerdict,
  resolutionVerdict,
} from '@voidcorp/hook-runner';
import type { CheckResult } from './prerequisites.js';

/**
 * What `doctor` reports about the invocation surface.
 *
 * The session banner has room for one name list; this has room for the evidence
 * behind it. The ratio of activations to tool calls is shown here and judged
 * nowhere: four values observed across the whole corpus (0 %, 0.25 %, 0.7 %, 2 %)
 * define no normal, and a threshold invented on top of them would cry wrong and
 * then be turned off.
 */
export interface InvocationObservation {
  readonly resolution: ResolutionVerdict;
  readonly liveness: LivenessVerdict;
  readonly installedSkills: number;
}

const NAME = 'invocation surface';

/** Read the project's journals and installed skills. Touches the filesystem. */
export function observeInvocation(root: string): InvocationObservation {
  const journals = readMissionJournals(root);
  const installed = installedSkillNames(root);
  return {
    resolution: resolutionVerdict(journals, installed),
    liveness: livenessVerdict(journals),
    installedSkills: installed.size,
  };
}

function ratio(liveness: LivenessVerdict): string {
  if (liveness.toolCalls === 0) return '0 %';
  return `${((liveness.skillCalls / liveness.toolCalls) * 100).toFixed(1)} %`;
}

function evidence(observation: InvocationObservation): string {
  const { liveness } = observation;
  if (liveness.missions === 0) {
    return `${observation.installedSkills} skill(s) installed, no working mission recorded yet`;
  }
  return (
    `${observation.installedSkills} skill(s) installed, ${liveness.skillCalls} activation(s) `
    + `across ${liveness.toolCalls} tool calls (${ratio(liveness)}) over ${liveness.missions} working mission(s)`
  );
}

/** The `doctor` line for the invocation surface. Pure. */
export function judgeInvocation(observation: InvocationObservation): CheckResult {
  const faults: string[] = [];
  if (!observation.resolution.ok) {
    faults.push(
      `${observation.resolution.unresolved.length} recorded name(s) no longer resolve: `
      + observation.resolution.unresolved.join(', '),
    );
  }
  if (!observation.liveness.ok) {
    faults.push(
      `no skill fired across ${observation.liveness.missions} working mission(s) `
      + `and ${observation.liveness.toolCalls} tool calls`,
    );
  }
  if (faults.length === 0) {
    return { name: NAME, ok: true, status: 'pass', message: evidence(observation) };
  }
  return {
    name: NAME,
    ok: false,
    status: 'fail',
    // Both faults, never the first alone: they have different causes, and fixing
    // one would otherwise reveal the other only on the next run.
    message: `${faults.join('; ')}; ${evidence(observation)}`,
    fix: 'check that the named skills exist under .claude/skills or .agents/skills, then reinstall with `void-harness update`',
  };
}
