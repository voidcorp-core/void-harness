import { compare } from './catalog.js';
import { installationText, type CheatSheet } from './document.js';
import { enhancement, styles } from './presentation.js';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const options = (values: readonly string[]): string => [...new Set(values)].sort(compare)
  .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');

export function renderHtml(document: CheatSheet): string {
  const entries = document.entries.map((entry, index) => `<article data-entry data-kind="${entry.type}" data-pack="${escapeHtml(entry.pack)}" data-runtimes="${entry.runtimes.join(' ')}" data-installed="${entry.availability.filter(fact => fact.state === 'installed').map(fact => fact.runtime).join(' ')}" aria-labelledby="entry-${index}">
<div class="entry-heading"><h2 id="entry-${index}">${escapeHtml(entry.name)}</h2><span class="kind">${entry.type}</span></div>
<p class="meta">${escapeHtml(entry.id)} · ${escapeHtml(entry.pack)} · ${entry.runtimes.join(', ') || 'Runtime undeclared'}</p>
<p>${escapeHtml(entry.description || 'Description not declared.')}</p>
${entry.invocations.map(invocation => `<div class="invocation"><span>${invocation.runtime}</span> <code>${escapeHtml(invocation.text)}</code><button type="button" data-copy hidden aria-label="Copy ${escapeHtml(entry.name)} for ${invocation.runtime}">Copy</button></div>`).join('')}
<ul class="facts">${entry.triggers.map(trigger => `<li>Trigger: ${escapeHtml(trigger)}</li>`).join('')}${entry.availability.map(fact => `<li><strong>${fact.runtime}: ${fact.state}</strong>. ${escapeHtml(fact.reason)}</li>`).join('')}</ul>
${entry.relatedIds.length === 0 ? '' : `<p class="meta">Same capability: ${entry.relatedIds.map(escapeHtml).join(', ')}</p>`}
</article>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'">
<title>void-harness · Cheat sheet</title><style>${styles}</style></head><body>
<a class="skip" href="#catalogue">Skip to catalogue</a>
<header><p class="eyebrow">void-harness / Field reference</p><h1>Find the capability you need.</h1>
<p>Explore the catalogue, check availability here, or search by what you want to do.</p>
<p class="installation">${installationText[document.installation]}</p></header>
<main><form id="filters" hidden><div class="filter-grid">
<label for="view">View<select id="view"><option value="catalogue">Complete catalogue</option><option value="here">Availability here</option><option value="intent">Find by intention</option></select></label>
<label for="search">Search <input id="search" type="search" placeholder="e.g. review, failing test, public API" aria-describedby="search-help"></label>
<label for="runtime">Runtime<select id="runtime"><option value="">All runtimes</option>${options(['claude', 'codex', 'cli'])}</select></label>
<label for="pack">Pack<select id="pack"><option value="">All packs</option>${options(document.entries.map(entry => entry.pack))}</select></label>
<label for="kind">Type<select id="kind"><option value="">All types</option>${options(document.entries.map(entry => entry.type))}</select></label>
</div><div class="filter-footer"><p id="search-help">Search names, descriptions, invocations and triggers.</p><button type="reset">Reset filters</button></div></form>
<div class="summary"><p id="count" role="status" aria-live="polite">${document.entries.length} entries</p><p>Specialists and their agents describe the same capability.</p></div>
<p id="empty" hidden>No matches. Try a shorter phrase or reset the filters.</p>
<p id="copy-status" role="status" aria-live="polite"></p>
<section id="catalogue" tabindex="-1" aria-label="Capability catalogue">${entries}</section>
</main><footer>Offline reference. This snapshot does not update itself. Regenerate it with void-harness cheatsheet.</footer>
<script>${enhancement}</script></body></html>\n`;
}
