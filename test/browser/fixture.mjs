import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as base, expect } from '@playwright/test';

assert.ok(process.env.RUNNER_TEMP, 'RUNNER_TEMP is required');
const root = join(process.env.RUNNER_TEMP, 'cheatsheet-fixture');
const evidence = JSON.parse(readFileSync(join(root, 'evidence.json'), 'utf8'));
export const documents = {};
export const urls = {};
for (const name of ['absent', 'installed']) {
  const json = readFileSync(join(root, `${name}.json`));
  const html = readFileSync(join(root, `${name}.html`));
  assert.equal(createHash('sha256').update(html).digest('hex'), evidence.documents[name].htmlSha256);
  assert.equal(createHash('sha256').update(json).digest('hex'), evidence.documents[name].jsonSha256);
  documents[name] = JSON.parse(json.toString());
  urls[name] = pathToFileURL(join(root, `${name}.html`)).href;
}

export const test = base.extend({
  // Track attempted external requests even though offline mode/CSP already block them.
  observations: [async ({ context, page }, use) => {
    const errors = [];
    const unexpectedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    context.on('request', request => {
      if (!Object.values(urls).includes(request.url())) unexpectedRequests.push(request.url());
    });
    await use();
    expect(errors, 'uncaught page errors').toEqual([]);
    expect(unexpectedRequests, 'document requested an external resource').toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function capture(page, testInfo, name) {
  const screenshot = await page.screenshot({ animations: 'disabled' });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
}
