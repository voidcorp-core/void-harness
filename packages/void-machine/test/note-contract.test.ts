import { describe, expect, it } from 'vitest';
import { noteFixture } from './note-fixture.js';
import { type ExecutionRequest, runNote } from './note-subject.js';

describe('non-Git note relay with asynchronous untrusted agent observations', () => {
  it('routes sources to extraction and admitted extraction to a distinct synthesis function', async () => {
    const f = noteFixture();
    const outcome = await runNote(f.input, f.dependencies);
    expect(outcome).toEqual({ kind: 'completed', note: f.note });
    expect(f.requests.map(({ route }) => route)).toEqual([
      'configured-extractor', 'configured-synthesizer',
    ]);
    expect(f.requests[0]?.request).toMatchObject({
      executionId: 'extract-current', timeoutMs: 10,
      input: { question: f.input.question, sources: f.input.sources },
    });
    expect(f.requests[1]?.request).toMatchObject({
      executionId: 'synthesize-current', timeoutMs: 10,
      input: { question: f.input.question, sources: f.input.sources, extraction: f.extraction },
    });
    expect(f.requests.every(({ request }) => request.instruction.length > 0)).toBe(true);
    expect(f.requests.every(({ request }) => request.signal.aborted === false)).toBe(true);
    expect(f.timer.pending()).toBe(0);
  });

  it.each(['wrong', 'old', 'missing'] as const)('refuses an extraction observation with %s executionId', async (mode) => {
    const f = noteFixture();
    const extract = async () => ({ kind: 'result', payload: f.extraction,
      ...(mode === 'missing' ? {} : { executionId: mode === 'old' ? 'extract-previous' : 'other' }) });
    const outcome = await runNote(f.input, { ...f.dependencies, extract });
    expect(outcome).toMatchObject({ kind: 'stopped', stage: 'extraction',
      issue: { code: 'execution.uncorrelated', owner: 'extractor' },
      cancellation: 'not-requested' });
    expect(f.requests).toEqual([]);
    expect(f.timer.pending()).toBe(0);
  });

  it('rejects the previous extraction executionId when returned by synthesis', async () => {
    const f = noteFixture();
    const synthesize = async () => ({ kind: 'result', executionId: 'extract-current', payload: f.note });
    expect(await runNote(f.input, { ...f.dependencies, synthesize })).toMatchObject({
      kind: 'stopped', stage: 'synthesis', issue: { code: 'execution.uncorrelated' },
    });
    expect(f.requests).toHaveLength(1);
    expect(f.timer.pending()).toBe(0);
  });

  it.each(['extraction', 'synthesis'] as const)('bounds a never-resolving %s and requests cancellation without claiming termination', async (stage) => {
    const f = noteFixture();
    let received: ExecutionRequest | undefined;
    const never = (request: ExecutionRequest): Promise<unknown> => {
      received = request;
      return new Promise(() => {});
    };
    const dependencies = stage === 'extraction'
      ? { ...f.dependencies, extract: never } : { ...f.dependencies, synthesize: never };
    const pending = runNote(f.input, dependencies);
    // The synthesis call follows promise admission; flush without wall-time sleeps.
    for (let turn = 0; turn < 10 && received === undefined; turn += 1) await Promise.resolve();
    expect(received).toBeDefined();
    expect(f.timer.pending()).toBe(1);
    f.timer.advance(10);
    expect(await pending).toMatchObject({ kind: 'stopped', stage,
      issue: { code: 'execution.timeout', cause: expect.any(String),
        owner: stage === 'extraction' ? 'extractor' : 'synthesizer', action: expect.any(String) },
      cancellation: 'requested-unconfirmed' });
    expect(received?.signal.aborted).toBe(true);
    expect(f.timer.pending()).toBe(0);
    expect(f.requests).toHaveLength(stage === 'extraction' ? 0 : 1);
  });

  it('arms the caller deadline before handing control to the executor', async () => {
    const f = noteFixture();
    let armedAtEntry = false;
    const extract = async (request: ExecutionRequest) => {
      armedAtEntry = f.timer.pending() === 1;
      return { kind: 'result', executionId: request.executionId, payload: f.extraction };
    };
    expect(await runNote(f.input, { ...f.dependencies, extract })).toMatchObject({ kind: 'completed' });
    expect(armedAtEntry).toBe(true);
  });

  it('refuses a nominal result with invalid payload before dispatching synthesis', async () => {
    const f = noteFixture();
    const extract = async (request: ExecutionRequest) => ({
      kind: 'result', executionId: request.executionId, payload: 'I succeeded',
    });
    expect(await runNote(f.input, { ...f.dependencies, extract })).toMatchObject({
      kind: 'stopped', stage: 'extraction', issue: { code: 'extraction.invalid' },
    });
    expect(f.requests).toEqual([]);
  });

  it.each(['unknown-source', 'invented-quote', 'missing-source'] as const)('rejects a note with %s evidence', async (mode) => {
    const f = noteFixture();
    const evidence = mode === 'missing-source' ? f.note.evidence.slice(0, 1)
      : [{ sourceId: mode === 'unknown-source' ? 'invented' : 'a', quote: 'Invented claim' },
        ...f.note.evidence.slice(1)];
    const synthesize = async (request: ExecutionRequest) => ({
      kind: 'result', executionId: request.executionId, payload: { ...f.note, evidence },
    });
    expect(await runNote(f.input, { ...f.dependencies, synthesize })).toMatchObject({
      kind: 'stopped', stage: 'synthesis', issue: { code: 'note.invalid' },
    });
  });

  it.each(['unavailable', 'interrupted', 'failed'] as const)('surfaces executor %s with a cause, owner and action instead of retrying', async (kind) => {
    const f = noteFixture();
    let calls = 0;
    const extract = async (request: ExecutionRequest) => {
      calls += 1;
      return { kind, executionId: request.executionId, cause: 'Fixture unavailable',
        action: 'Provide an available fixture route' };
    };
    expect(await runNote(f.input, { ...f.dependencies, extract })).toMatchObject({
      kind: 'stopped', stage: 'extraction', issue: { code: `execution.${kind}`,
        cause: 'Fixture unavailable', owner: 'extractor', action: 'Provide an available fixture route' },
    });
    expect(calls).toBe(1);
    expect(f.requests).toEqual([]);
    expect(f.timer.pending()).toBe(0);
  });

  it('converts a thrown execution failure without accepting a result or exposing exception contents', async () => {
    const f = noteFixture();
    const extract = async () => { throw new Error('private transport details'); };
    const outcome = await runNote(f.input, { ...f.dependencies, extract });
    expect(outcome).toMatchObject({ kind: 'stopped', stage: 'extraction',
      issue: { code: 'execution.failed', owner: 'extractor', action: expect.any(String) } });
    expect(JSON.stringify(outcome)).not.toContain('private transport details');
    expect(f.requests).toEqual([]);
    expect(f.timer.pending()).toBe(0);
  });

  it('rejects a malformed observation envelope independently from payload validation', async () => {
    const f = noteFixture();
    const extract = async () => ({ executionId: 'extract-current', kind: 'made-up', payload: f.extraction });
    expect(await runNote(f.input, { ...f.dependencies, extract })).toMatchObject({
      kind: 'stopped', stage: 'extraction', issue: { code: 'execution.invalid-observation' },
    });
    expect(f.requests).toEqual([]);
  });

  it.each(['empty-question', 'duplicate-sources', 'oversized-source', 'same-execution-ids', 'zero-deadline'] as const)('rejects %s before invoking agents or arming timeouts', async (mode) => {
    const f = noteFixture();
    const input = mode === 'empty-question' ? { ...f.input, question: '' }
      : mode === 'duplicate-sources' ? { ...f.input, sources: [f.input.sources[0], f.input.sources[0]] }
      : mode === 'oversized-source' ? { ...f.input, sources: f.input.sources.map((source) => ({
        ...source, text: 'é'.repeat(32_769),
      })) } : f.input;
    const dependencies = mode === 'zero-deadline' ? { ...f.dependencies, timeoutMs: 0 }
      : mode === 'same-execution-ids' ? { ...f.dependencies,
        executionIds: { extraction: 'same', synthesis: 'same' } } : f.dependencies;
    expect(await runNote(input, dependencies)).toMatchObject({ kind: 'stopped', stage: 'input',
      issue: { code: 'input.invalid', owner: 'caller' } });
    expect(f.requests).toEqual([]);
    expect(f.timer.pending()).toBe(0);
  });
});
