#!/usr/bin/env node
import { appendFileSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Every launch is counted in the child cwd, the only channel the CLI does not filter.
const modelIndex = process.argv.indexOf('--model');
const model = modelIndex >= 0 ? process.argv[modelIndex + 1] : '';
const sessionIndex = process.argv.indexOf('--session-id');
const session = sessionIndex >= 0 ? process.argv[sessionIndex + 1] : '';
appendFileSync(join(process.cwd(), 'calls.log'), `${model}\n`);
appendFileSync(join(process.cwd(), 'sessions.log'), `${model} ${session}\n`);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (model === 'fixture-fail') {
    process.stdout.write(JSON.stringify({ is_error: true, subtype: 'error_during_execution' }));
    process.exitCode = 1;
    return;
  }
  if (model === 'fixture-crash') {
    // The wrapper execs this script, so the parent is the Machine process itself.
    process.kill(process.ppid, 'SIGKILL');
    return;
  }
  if (model === 'fixture-extract-lock') {
    // Make every mission directory of ./store read-only before the result returns.
    const store = join(process.cwd(), 'store');
    if (existsSync(store)) {
      for (const mission of readdirSync(store)) chmodSync(join(store, mission), 0o500);
    }
  }
  const extraction = model.startsWith('fixture-extract');
  const structuredOutput = extraction
    ? { evidence: [{ sourceId: 'a', quote: 'alpha' }, { sourceId: 'b', quote: 'beta' }], limitations: [] }
    : { title: 'CLI fixture note', summary: 'Both sources were inspected.',
      evidence: [{ sourceId: 'a', quote: 'alpha' }, { sourceId: 'b', quote: 'beta' }], limitations: [] };
  const respond = () => process.stdout.write(JSON.stringify({
    is_error: false, structured_output: structuredOutput,
    modelUsage: { model, inputBytes: Buffer.byteLength(input), envKeys: Object.keys(process.env).sort() },
    // Reports the session it was asked to use, as the native CLI does.
    session_id: session,
  }));
  if (model !== 'fixture-hold' && model !== 'fixture-extract-hold') { respond(); return; }
  // Explicit barrier: answer only once the test writes ./release. The deadline is a
  // failure guard, never a success path; a removed test root also ends the wait.
  const deadline = Date.now() + 8000;
  const poll = () => {
    if (existsSync(join(process.cwd(), 'release'))) { respond(); return; }
    if (Date.now() > deadline || !existsSync(join(process.cwd(), 'calls.log'))) {
      process.exitCode = 1;
      return;
    }
    setTimeout(poll, 10);
  };
  poll();
});
