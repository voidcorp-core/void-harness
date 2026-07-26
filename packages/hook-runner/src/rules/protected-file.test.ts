import { describe, expect, it } from 'vitest';
import { protectedFile } from './protected-file.js';

describe('protectedFile', () => {
  it.each([
    'apps/web/.env',
    'CONFIG/.ENV.LOCAL',
    'certs/server.pem',
    '/home/u/.ssh/id_rsa',
    'pnpm-lock.yaml',
    '.git/config',
    'src/Credentials.ts',
  ])('blocks %s', (path) => {
    expect(protectedFile([path]).allow).toBe(false);
  });

  it.each([
    '.env.example',
    'src/feature.ts',
    'docs/byo-credentials.md',
  ])('allows %s', (path) => {
    expect(protectedFile([path]).allow).toBe(true);
  });
});
