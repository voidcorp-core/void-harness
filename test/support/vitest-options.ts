import { fileURLToPath } from 'node:url';

function supportFile(name: string): string {
  return fileURLToPath(new URL(name, import.meta.url));
}

export const sharedVitestTestOptions = {
  environment: 'node',
  globals: false,
  globalSetup: supportFile('./global-setup.ts'),
  setupFiles: [supportFile('./setup.ts')],
  testTimeout: 10_000,
};
