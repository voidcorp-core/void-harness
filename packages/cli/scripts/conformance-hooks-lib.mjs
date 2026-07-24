const MODES = Object.freeze({
  claude: Object.freeze(['claude']),
  codex: Object.freeze(['codex']),
  both: Object.freeze(['claude', 'codex']),
});

export function runtimesForMode(mode) {
  const runtimes = MODES[mode];
  if (runtimes === undefined) {
    throw new Error(`hook conformance unknown runtime mode: ${String(mode)}`);
  }
  return [...runtimes];
}

function parseLine(line, lineNumber) {
  try {
    const parsed = JSON.parse(line);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('expected an object');
    }
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parse error';
    throw new Error(
      `hook conformance invalid JSON at line ${lineNumber}: ${detail}`,
    );
  }
}

export function assertCanonicalHookReplay(body, options) {
  const lines = body.split(/\r?\n/).filter((line) => line !== '');
  if (lines.length === 0) {
    throw new Error('hook conformance emitted no canonical events');
  }

  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    const event = parseLine(line, index + 1);
    const expectedSeq = index + 1;
    if (event.schemaVersion !== 1) {
      throw new Error(`hook conformance expected schemaVersion 1 at seq ${expectedSeq}`);
    }
    if (event.seq !== expectedSeq) {
      throw new Error(
        `hook conformance expected seq ${expectedSeq}, received ${String(event.seq)}`,
      );
    }
    if (
      event.missionId !== options.missionId
      || event.correlationId !== options.missionId
    ) {
      throw new Error(`hook conformance mission mismatch at seq ${expectedSeq}`);
    }
    if (
      typeof event.eventId !== 'string'
      || !event.eventId.startsWith('evt_')
      || typeof event.ts !== 'string'
      || Number.isNaN(Date.parse(event.ts))
    ) {
      throw new Error(`hook conformance invalid event identity at seq ${expectedSeq}`);
    }
    seen.add(`${String(event.source)}:${String(event.kind)}`);
  }

  for (const runtime of options.runtimes) {
    for (const kind of ['runtime.tool.started', 'hook.completed']) {
      const proof = `runtime:${runtime}:${kind}`;
      if (!seen.has(proof)) {
        throw new Error(`hook conformance missing ${proof}`);
      }
    }
  }
}
