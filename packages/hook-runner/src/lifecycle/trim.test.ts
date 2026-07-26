import { describe, expect, it } from 'vitest';
import {
  extractToolOutput,
  planOutputTrim,
} from './trim.js';

describe('extractToolOutput', () => {
  it('normalizes string, object and MCP content-block responses', () => {
    expect(extractToolOutput({
      tool_name: 'Bash',
      tool_response: 'ok',
    })).toEqual({ tool: 'Bash', text: 'ok' });
    expect(extractToolOutput({
      tool_name: 'shell',
      tool_response: { stdout: 'out', stderr: 'err' },
    })?.text).toBe('out\nerr');
    expect(extractToolOutput({
      tool_name: 'mcp__server__call',
      tool_response: { content: [{ type: 'text', text: 'payload' }] },
    })?.text).toBe('payload');
  });

  it('rejects non-trimmable tools and malformed responses', () => {
    expect(extractToolOutput({ tool_name: 'Read', tool_response: 'x' })).toBeUndefined();
    expect(extractToolOutput(null)).toBeUndefined();
  });
});

describe('planOutputTrim', () => {
  it('keeps small outputs untouched and trims large outputs by UTF-8 bytes', () => {
    expect(planOutputTrim('small', {
      tool: 'Bash',
      thresholdBytes: 100,
      spillPath: '.void/outputs/a.log',
    })).toBeUndefined();

    const plan = planOutputTrim('é'.repeat(7_000), {
      tool: 'Bash',
      thresholdBytes: 12_000,
      spillPath: '.void/outputs/a.log',
    });
    expect(plan?.originalBytes).toBe(14_000);
    expect(plan?.updatedToolOutput).toContain('.void/outputs/a.log');
  });

  it('preserves error evidence from the elided middle within a bounded view', () => {
    const text = `${'a'.repeat(8_000)}\nError: hidden failure\n${'b'.repeat(8_000)}`;
    const plan = planOutputTrim(text, {
      tool: 'mcp__server__call',
      thresholdBytes: 1_000,
      spillPath: '.void/outputs/mcp.log',
    });
    expect(plan?.updatedToolOutput).toContain('Error: hidden failure');
    expect(plan?.updatedToolOutput.length).toBeLessThan(9_000);
  });
});
