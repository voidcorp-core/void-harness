const mode = process.argv[2] ?? 'success';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (mode === 'success') {
    process.stdout.write(JSON.stringify({
      is_error: false,
      structured_output: { evidence: [{ sourceId: 'a', quote: 'fixture' }] },
      modelUsage: { 'fixture-model': { inputTokens: input.length } },
      session_id: 'fixture-session',
    }));
    return;
  }
  if (mode === 'extract') {
    process.stdout.write(JSON.stringify({
      is_error: false,
      structured_output: {
        evidence: [
          { sourceId: 'a', quote: 'alpha' },
          { sourceId: 'b', quote: 'beta' },
        ],
        limitations: [],
      },
      modelUsage: { 'fixture-extract': { inputTokens: input.length } },
      session_id: 'fixture-extract-session',
    }));
    return;
  }
  if (mode === 'synthesis') {
    process.stdout.write(JSON.stringify({
      is_error: false,
      structured_output: {
        title: 'Fixture note', summary: 'Both sources were inspected.',
        evidence: [
          { sourceId: 'a', quote: 'alpha' },
          { sourceId: 'b', quote: 'beta' },
        ],
        limitations: [],
      },
      modelUsage: { 'fixture-synthesis': { inputTokens: input.length } },
      session_id: 'fixture-synthesis-session',
    }));
    return;
  }
  if (mode === 'malformed-json') { process.stdout.write('{"broken"'); return; }
  if (mode === 'invalid-utf8') { process.stdout.write(Buffer.from([0xc3, 0x28])); return; }
  if (mode === 'nonzero') { process.stderr.write('fixture failure'); process.exitCode = 7; return; }
  if (mode === 'schema-error') {
    process.stdin.destroy();
    process.stderr.write('Error: --json-schema is not a valid JSON Schema: no schema with key or ref "https://json-schema.org/draft/2020-12/schema"');
    process.exitCode = 1;
    return;
  }
  if (mode === 'native-error') { process.stdout.write(JSON.stringify({ is_error: true })); return; }
  if (mode === 'native-process-error') {
    process.stdout.write(JSON.stringify({
      is_error: true, subtype: 'error_during_execution', result: 'authentication unavailable',
    }));
    process.exitCode = 1;
    return;
  }
  if (mode === 'oversized') { process.stdout.write('x'.repeat(300_000)); return; }
});

if (mode === 'hang') {
  process.stdin.resume();
}
if (mode === 'ignore-sigterm') {
  process.on('SIGTERM', () => {});
  process.stdin.resume();
}
if (mode === 'stdin-closed') {
  process.stdin.destroy();
  setTimeout(() => process.exitCode = 1, 100);
}
