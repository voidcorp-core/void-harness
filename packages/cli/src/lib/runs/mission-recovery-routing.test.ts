import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { canonicalJsonHash, type MissionSpecialistPlan } from '@voidcorp/mission-engine';
import { wireCodexAgents } from '../codex-agents.js';
import { resolveProjectRoots } from '../project-roots.js';
import { dispatchMissionSpecialists, planMission, recoverStoppedMission, recordMissionClosure } from '../../commands/mission.js';
import { recordSpecialistLifecycle } from './specialist-lifecycle.js';
import { appendMissionEvent, createMission, inspectMission, missionControllerRoutingHash, writeMissionControllerPlan } from './store.js';

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../core');
const ID = 'mis_0123456789abcdef0123456789abcdef';

it('keeps live preparation B authoritative after recovery instead of implementing from the old PASS panel A', async () => {
  const root = await mkdtemp(join(tmpdir(), 'void-recovery-routing-'));
  vi.stubEnv('CODEX_SESSION_ID', 'fixture-native-routing-session');
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    await wireCodexAgents(root, CORE);
    const body = '# Review CLI API\n\nReview the CLI API boundary and its implementation.\n';
    await writeFile(join(root, 'DEV-TEST.md'), body);
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'routing-fixture', scripts: { test: 'vitest run' } }));
    execFileSync('git', ['add', 'DEV-TEST.md', 'package.json'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Void Test', '-c', 'user.email=void@example.test',
      'commit', '--quiet', '-m', 'test: seed routing fixture'], { cwd: root });
    await writeFile(join(root, 'runtime.ts'), 'export const ready = true;\n');
    execFileSync('git', ['add', 'runtime.ts'], { cwd: root });
    const initial = await planMission(root, 'DEV-TEST.md');
    expect(initial.context).toEqual({ status: 'complete', issues: [] });
    const plan: MissionSpecialistPlan = { planHash: initial.planHash, context: initial.context,
      specialists: initial.specialists.map(value => ({ specialistId: value.specialistId,
        contractVersion: value.contractVersion, inputHash: value.proof.inputHash,
        state: value.state, stages: value.stages })) };
    const ticket = { path: 'DEV-TEST.md', contentHash: `sha256:${createHash('sha256').update(body).digest('hex')}` };
    await createMission(root, { missionId: ID, title: 'Recovery routing', mode: 'team',
      teamController: { planHash: plan.planHash, routingHash: missionControllerRoutingHash(plan, ticket),
        leadWriterId: 'writer:primary', runtime: 'codex', runtimeAttested: true } });
    await writeMissionControllerPlan(root, ID, plan, ticket);
    const roots = resolveProjectRoots(root);
    const input = { kind: 'dispatch' as const, missionId: ID, json: true };
    const dispatched = await dispatchMissionSpecialists(roots, input);
    expect(dispatched.action).toMatchObject({ kind: 'invoke-specialists' });
    expect(dispatched.envelopes.length).toBeGreaterThan(1);
    const original = (await inspectMission(root, ID, { dependencies: {} })).stream.events;
    for (const [index, initialEnvelope] of dispatched.envelopes.entries()) {
      // Reproduce the historical partial-panel bug: a never-started peer was
      // redispatched as round 2 after an earlier peer completed round 1.
      const envelope = index === 0 ? initialEnvelope : { ...initialEnvelope, reviewRound: 2 };
      if (index > 0) {
        const requested = original.find(event => event.kind === 'specialist.requested'
          && event.subject === envelope.specialistId);
        if (!requested || typeof requested.payload !== 'object' || requested.payload === null) {
          throw new Error('Real initial dispatch request required.');
        }
        await appendMissionEvent(root, ID, { source: 'void-harness:mission.dispatch',
          kind: 'specialist.requested', subject: envelope.specialistId, correlationId: ID,
          payload: { ...requested.payload, reviewRound: 2 } });
      }
      const contextId = `context_routing_${index}`;
      await recordSpecialistLifecycle(root, ID, { status: 'started', envelope, contextId });
      await recordSpecialistLifecycle(root, ID, { status: 'completed', envelope, contextId,
        completion: { schemaVersion: 1, specialistId: envelope.specialistId,
          contractVersion: envelope.contractVersion, completionId: `completion_routing_${index}`,
          verdict: 'pass', findings: [], evidenceRequests: [], limitations: [] } });
    }
    await recordMissionClosure(root, ID, 'controller-stop');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'routing-fixture',
      scripts: { test: 'vitest run', lint: 'tsc --noEmit' } }));
    const changed = await planMission(root, 'DEV-TEST.md');
    expect(changed.inputHash).not.toBe(initial.inputHash);
    const stream = (await inspectMission(root, ID, { dependencies: {} })).stream;
    const closure = stream.events.at(-1);
    if (!closure) throw new Error('Controller closure required.');
    const recovered = await recoverStoppedMission(roots, ID, { schemaVersion: 1,
      closureEventId: closure.eventId, expectedJournalHash: canonicalJsonHash(stream.events),
      disposition: { kind: 'controller-defect', defect: 'partial-fanout-round' } });
    expect(recovered.recorded).toBe(true);
    const receipt = (await inspectMission(root, ID, { dependencies: {} })).stream.events.at(-1)?.payload;
    expect(receipt).toMatchObject({ preservedCompletionEventIds: [],
      invalidatedCompletionEventIds: expect.any(Array), observation: {
        currentInputHashes: Object.fromEntries(changed.specialists.map(value =>
          [value.specialistId, value.proof.inputHash])) } });
    const resumed = await dispatchMissionSpecialists(roots, input);
    expect(resumed.action.kind).toBe('run-preparation-correction');
    expect(resumed.action.kind).not.toBe('run-lead-writer');
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true });
  }
});
