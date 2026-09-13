import { renderHtml } from './html.js';
import { installationText, type CheatSheet } from './document.js';
export type { CheatSheet } from './document.js';

function markdown(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+|~]/g, '\\$&')
    .replace(/https?:\/\//gi, value => value.replace(':', '&#58;'))
    .replace(/(^|\n)-/g, '$1\\-');
}

export function renderDocument(document: CheatSheet, format: 'html' | 'markdown' | 'json'): string {
  if (format === 'json') return `${JSON.stringify(document, undefined, 2)}\n`;
  if (format === 'html') return renderHtml(document);
  return [
    '# void-harness cheat sheet', '', installationText[document.installation], '',
    'Specialist roles and their agent implementations are linked entries of the same capability.', '',
    ...document.entries.flatMap(entry => [
      `## ${markdown(entry.name)}`, '',
      `${markdown(entry.id)} | ${entry.type} | ${markdown(entry.pack)} | ${entry.runtimes.join(', ') || 'runtime undeclared'}`, '',
      markdown(entry.description || 'Description not declared.'), '',
      ...entry.invocations.map(invocation => `- ${invocation.runtime}: ${markdown(invocation.text)}`),
      ...entry.triggers.map(trigger => `- Trigger: ${markdown(trigger)}`),
      ...entry.availability.map(fact => `- ${fact.runtime}: ${fact.state}. ${markdown(fact.reason)}`),
      ...entry.relatedIds.map(id => `- Same capability: ${markdown(id)}`), '',
    ]),
  ].join('\n');
}
