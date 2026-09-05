import { defineConfig } from 'vitest/config';
import { buildTestCatalog, createVitestProjects } from './test/support/test-catalog.js';
import { sharedVitestTestOptions } from './test/support/vitest-options.js';

const repositoryRoot = import.meta.dirname;

export default defineConfig({
  test: {
    ...sharedVitestTestOptions,
    projects: createVitestProjects(buildTestCatalog(repositoryRoot)),
  },
});
