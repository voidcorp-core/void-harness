#!/usr/bin/env node
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const modelIndex = process.argv.indexOf('--model');
  const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : '';
  if (model === 'fixture-fail') {
    process.stdout.write(JSON.stringify({ is_error: true, subtype: 'error_during_execution' }));
    process.exitCode = 1;
    return;
  }
  const structuredOutput = model === 'fixture-extract'
    ? { evidence: [{ sourceId: 'a', quote: 'alpha' }, { sourceId: 'b', quote: 'beta' }], limitations: [] }
    : { title: 'CLI fixture note', summary: 'Both sources were inspected.',
      evidence: [{ sourceId: 'a', quote: 'alpha' }, { sourceId: 'b', quote: 'beta' }], limitations: [] };
  process.stdout.write(JSON.stringify({
    is_error: false, structured_output: structuredOutput,
    modelUsage: { model, inputBytes: Buffer.byteLength(input), envKeys: Object.keys(process.env).sort() },
    session_id: `fixture-${model}-session`,
  }));
});
