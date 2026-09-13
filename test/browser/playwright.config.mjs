import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'this suite runs only on isolated GitHub CI');
assert.ok(process.env.RUNNER_TEMP, 'RUNNER_TEMP is required');
const evidence = JSON.parse(readFileSync(join(process.env.RUNNER_TEMP,
  'cheatsheet-fixture', 'evidence.json'), 'utf8'));
assert.equal(evidence.sourceSha, process.env.GATE_SHA);

// Version-matched reference: microsoft/playwright v1.63.0, docs/src/test-configuration-js.md.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  globalTimeout: 300_000,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  metadata: evidence,
  use: {
    browserName: 'chromium',
    headless: true,
    offline: true,
    serviceWorkers: 'block',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
