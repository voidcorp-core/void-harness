import AxeBuilder from '@axe-core/playwright';
import { capture, documents, expect, test, urls } from './fixture.mjs';

test('renders the complete installed catalogue accessibly at the target viewport', async ({ page }, info) => {
  await page.goto(urls.installed);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find the capability you need.');
  await expect(page.getByRole('article')).toHaveCount(documents.installed.entries.length);
  await expect(page.getByText('Local installation evidence found.', { exact: false })).toBeVisible();
  for (const label of ['View', 'Search', 'Runtime', 'Pack', 'Type']) {
    await expect(page.getByRole(label === 'Search' ? 'searchbox' : 'combobox', { name: label, exact: true })).toBeVisible();
  }
  const violations = (await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations;
  expect(violations).toEqual([]);
  await capture(page, info, 'catalogue');
});

test('combines filters, explains no matches, and resets the complete catalogue', async ({ page }, info) => {
  await page.goto(urls.installed);
  await page.getByRole('combobox', { name: 'Runtime', exact: true }).selectOption('codex');
  await page.getByRole('combobox', { name: 'Pack', exact: true }).selectOption('core');
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('skill');
  await page.getByLabel('Search', { exact: true }).fill('tdd');
  await expect(page.getByRole('heading', { name: 'void-tdd', exact: true })).toBeVisible();
  const visible = page.getByRole('article');
  expect(await visible.count()).toBeGreaterThan(0);
  for (const entry of await visible.all()) {
    await expect(entry).toHaveAttribute('data-kind', 'skill');
    await expect(entry).toHaveAttribute('data-pack', 'core');
    await expect(entry).toHaveAttribute('data-runtimes', /codex/);
  }
  await page.getByLabel('Search', { exact: true }).fill('unmatchable-qa-532');
  await expect(visible).toHaveCount(0);
  await expect(page.getByText('No matches. Try a shorter phrase or reset the filters.')).toBeVisible();
  await capture(page, info, 'empty-state');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(visible).toHaveCount(documents.installed.entries.length);
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Runtime', exact: true })).toHaveValue('');
});

test('distinguishes installed availability from an absent consumer installation', async ({ page }, info) => {
  await page.goto(urls.installed);
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('here');
  const installedCount = documents.installed.entries.filter(entry =>
    entry.availability.some(fact => fact.state === 'installed')).length;
  expect(installedCount).toBeGreaterThan(0);
  await expect(page.getByRole('article')).toHaveCount(installedCount);
  await expect(page.getByText('Showing confirmed installed assets. Runtime execution remains unverified.')).toBeVisible();
  await capture(page, info, 'availability-here');
  await page.goto(urls.absent);
  await expect(page.getByText('No local installation was found.', { exact: false })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(documents.absent.entries.length);
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('here');
  const absentCount = documents.absent.entries.filter(entry =>
    entry.availability.some(fact => fact.state === 'installed')).length;
  await expect(page.getByRole('article')).toHaveCount(absentCount);
});

test('finds capabilities from realistic task phrases', async ({ page }) => {
  await page.goto(urls.installed);
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('intent');
  await expect(page.getByText('Describe your task in a few words.', { exact: false })).toBeVisible();
  for (const [phrase, heading] of [
    ['failing test', 'void-debug'], ['public API', 'void-api-and-interface-design'],
    ['review', 'independent-code-reviewer'],
  ]) {
    await page.getByLabel('Search', { exact: true }).fill(phrase);
    const matches = page.getByRole('heading', { name: heading, exact: true });
    expect(await matches.count()).toBeGreaterThan(0);
    for (const match of await matches.all()) await expect(match).toBeVisible();
  }
});

test('distinguishes a disabled skill from a pack that was not installed', async ({ page }) => {
  await page.goto(urls.installed);
  const disabled = page.getByRole('article', { name: 'void-tdd', exact: true });
  await expect(disabled.getByText('claude: disabled', { exact: true })).toBeVisible();
  await expect(disabled.getByText('codex: installed', { exact: true })).toBeVisible();
  const inactive = documents.installed.entries.find(entry => entry.type === 'skill'
    && entry.availability.some(fact => fact.runtime === 'claude' && fact.state === 'inactive-pack'));
  expect(inactive).toBeDefined();
  await expect(page.getByRole('article', { name: inactive.name, exact: true })
    .getByText('claude: inactive-pack', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('here');
  await page.getByRole('combobox', { name: 'Runtime', exact: true }).selectOption('claude');
  await expect(disabled).toHaveCount(0);
  await expect(page.getByRole('article', { name: inactive.name, exact: true })).toHaveCount(0);
});

test('supports keyboard entry, skip navigation, and stable focus while filtering', async ({ page }, info) => {
  await page.goto(urls.installed);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to catalogue' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Capability catalogue' })).toBeFocused();
  await page.goto(urls.installed);
  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'View', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  const search = page.getByLabel('Search', { exact: true });
  await expect(search).toBeFocused();
  await page.keyboard.type('tdd');
  await expect(search).toBeFocused();
  await expect(page.getByRole('heading', { name: 'void-tdd', exact: true })).toBeVisible();
  expect(await search.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await capture(page, info, 'keyboard-focus');
});

test('selects the command and announces failure when clipboard permission is denied', async ({ page }, info) => {
  // Permission failure is an explicit browser-boundary double, never a real clipboard grant.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: {
      writeText: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); },
    } });
  });
  await page.goto(urls.installed);
  await page.getByLabel('Search', { exact: true }).fill('void-tdd');
  const article = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'void-tdd', exact: true }),
  });
  const copy = article.getByRole('button', { name: 'Copy void-tdd for codex', exact: true });
  const command = await copy.evaluate(button => button.parentElement.querySelector('code').textContent);
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Clipboard unavailable.' })).toBeVisible();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(command);
  await expect(copy).toBeFocused();
  await capture(page, info, 'clipboard-denied');
});

test('reflows at 320 pixels and retains controls with doubled text', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(urls.installed);
  await page.getByLabel('Search', { exact: true }).fill('void-tdd');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const control of await page.getByRole('button').all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await capture(page, info, 'reflow-320');
  // Freeze measured sizes first so descendants are not doubled a second time through inheritance.
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll('body, body *')).map(element =>
      [element, Number.parseFloat(getComputedStyle(element).fontSize)]);
    for (const [element, size] of sizes) element.style.fontSize = `${size * 2}px`;
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.getByLabel('Search', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(documents.installed.entries.length);
  await capture(page, info, 'text-200-percent');
});

test('prints the complete catalogue even after a screen filter', async ({ page }, info) => {
  await page.goto(urls.installed);
  await page.getByLabel('Search', { exact: true }).fill('unmatchable-qa-532');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  // Print CSS restores hidden articles; accessible-role queries may still honor the hidden attribute.
  const printed = await page.locator('article').evaluateAll(entries =>
    entries.filter(entry => getComputedStyle(entry).display !== 'none').length);
  expect(printed).toBe(documents.installed.entries.length);
  await expect(page.getByRole('button', { name: 'Reset filters' })).toBeHidden();
  await capture(page, info, 'print-layout');
  await info.attach('print.pdf', { body: await page.pdf({ format: 'A4', printBackground: true }),
    contentType: 'application/pdf' });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps the full catalogue readable without enhancement controls', async ({ page }, info) => {
    await page.goto(urls.installed);
    await expect(page.getByRole('article')).toHaveCount(documents.installed.entries.length);
    await expect(page.getByRole('heading', { name: 'void-tdd', exact: true })).toBeVisible();
    await expect(page.getByLabel('Search', { exact: true })).toBeHidden();
    await expect(page.getByRole('button')).toHaveCount(0);
    await capture(page, info, 'no-javascript');
  });
});
