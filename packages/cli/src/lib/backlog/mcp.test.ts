import { describe, expect, it } from 'vitest';
import { hasLinearMcpServer } from './mcp.js';

describe('hasLinearMcpServer', () => {
  it('is true when a server keyed "linear" is declared', () => {
    const raw = JSON.stringify({
      mcpServers: { linear: { type: 'http', url: 'https://mcp.linear.app/mcp' } },
    });
    expect(hasLinearMcpServer(raw)).toBe(true);
  });

  it('is false when .mcp.json is absent (undefined input)', () => {
    expect(hasLinearMcpServer(undefined)).toBe(false);
  });

  it('is false when no "linear" server is declared', () => {
    const raw = JSON.stringify({ mcpServers: { gmail: { type: 'http', url: 'x' } } });
    expect(hasLinearMcpServer(raw)).toBe(false);
  });

  it('is false (not a throw) on malformed JSON', () => {
    expect(hasLinearMcpServer('{ not json')).toBe(false);
  });
});
