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
  if (mode === 'malformed-json') { process.stdout.write('{"broken"'); return; }
  if (mode === 'invalid-utf8') { process.stdout.write(Buffer.from([0xc3, 0x28])); return; }
  if (mode === 'nonzero') { process.stderr.write('fixture failure'); process.exitCode = 7; return; }
  if (mode === 'native-error') { process.stdout.write(JSON.stringify({ is_error: true })); return; }
  if (mode === 'oversized') { process.stdout.write('x'.repeat(300_000)); return; }
});

if (mode === 'hang') {
  process.stdin.resume();
}
