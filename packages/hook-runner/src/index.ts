export {
  classifyMaterialized,
  DERIVED_LOAD_BEARING,
  derivedIgnoreEntries,
  isOwnedDerived,
  LOCAL_ENTRIES,
  MATERIALIZED_OWNERSHIP,
  type Ownership,
  VOID_DIR,
  VOID_LOCAL_DIR,
  gitignoreBlock,
  isLocalEntry,
  legacyVoidPath,
  patchGitignore,
  pendingMigrations,
  voidDir,
  voidLocalDir,
  voidLocalPath,
  voidLocalReadPath,
} from './void-layout.js';
export {
  MAX_EVENT_LOG_BYTES,
  writeSequencedEvent,
  writeSequencedEventOnce,
  type IdempotentSequencedWriteOptions,
  type SequencedWriteOptions,
  type SequencedWriteResult,
} from './sequenced-writer.js';
export {
  discoverProjectRoot,
  evaluateRule,
  MAX_HOOK_INPUT_BYTES,
  parseHookText,
  parseHookPayload,
  type EvaluateRuleOptions,
  type RuleName,
} from './enforcement/runner.js';
export {
  compareFreshness,
  type Freshness,
  type FreshnessVerdict,
} from './freshness/compare.js';
export {
  CACHE_TTL_MS,
  cacheFilePath,
  readFreshnessCache,
  writeFreshnessCache,
  type FreshnessCacheEntry,
} from './freshness/cache.js';
export {
  DEFAULT_REGISTRY,
  NPM_PACKAGE,
  fetchLatestVersion,
  resolveRegistry,
} from './freshness/registry.js';
export { freshnessNotice, resolveFreshness, type InstallSource } from './freshness/notice.js';
export { readNpmrc } from './freshness/npmrc.js';
