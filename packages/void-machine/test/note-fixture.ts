import type { Clock, ExecutionRequest, NoteDependencies } from './note-subject.js';

export function manualClock() {
  let elapsed = 0;
  let next = 0;
  const alarms = new Map<number, { at: number; fire: () => void }>();
  const clock: Clock = {
    schedule(delayMs, fire) {
      const id = ++next;
      alarms.set(id, { at: elapsed + delayMs, fire });
      return () => { alarms.delete(id); };
    },
  };
  return {
    clock,
    pending: () => alarms.size,
    advance(delayMs: number) {
      elapsed += delayMs;
      for (const [id, alarm] of [...alarms]) {
        if (alarm.at <= elapsed) { alarms.delete(id); alarm.fire(); }
      }
    },
  };
}

export function noteFixture() {
  const timer = manualClock();
  const input = { requestId: 'request-current', question: 'Compare the two supplied proposals.',
    sources: [
      { sourceId: 'a', title: 'Proposal A', text: 'Proposal A costs ten units and lasts two days.' },
      { sourceId: 'b', title: 'Proposal B', text: 'Proposal B costs six units and lasts four days.' },
    ] };
  const evidence = [
    { sourceId: 'a', quote: 'costs ten units' },
    { sourceId: 'b', quote: 'costs six units' },
  ];
  const extraction = { evidence, limitations: [] };
  const note = { title: 'Proposal comparison', summary: 'A costs ten units; B costs six units.',
    evidence, limitations: ['No quality assessment was supplied.'] };
  const requests: Array<{ route: string; request: ExecutionRequest }> = [];
  const dependencies: NoteDependencies = {
    clock: timer.clock, timeoutMs: 10,
    executionIds: { extraction: 'extract-current', synthesis: 'synthesize-current' },
    extract: async (request) => {
      requests.push({ route: 'configured-extractor', request });
      return { kind: 'result', executionId: request.executionId, payload: extraction };
    },
    synthesize: async (request) => {
      requests.push({ route: 'configured-synthesizer', request });
      return { kind: 'result', executionId: request.executionId, payload: note };
    },
  };
  return { input, extraction, note, requests, dependencies, timer };
}
