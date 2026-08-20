// Names the harness used to ship, and what took each one over.
//
// The invocation check judges a recorded name against the skills installed on
// disk. That question has a blind spot the disk cannot fill: a runtime resolves
// skills from several providers, and only some of them are ours. A consumer's
// journal carries `defuddle`, `impeccable` and `artifact-capabilities` beside
// `session-handoff` and `ticket-runner`, and the first three resolve perfectly
// -- somewhere the harness does not install into. Reporting them told the
// operator to reinstall a harness that would never make them appear, and a red
// verdict nobody can extinguish is a red verdict everybody learns to skip past,
// carrying the real findings down with it.
//
// So the register answers the only question the harness may answer: was this
// name ever ours? A live skill answers from the disk; a name listed here
// answered yes and no longer does; anything else is not ours to judge.
//
// Every entry was read from this repository's own history (`git log
// --diff-filter=R -M` over the skills, plus the deletions and the commands that
// became skills), never recalled. Chains are resolved to their end:
// `backlog-batch` became `backlog-autopilot` and then `autopilot`, and it is
// `autopilot` that helps whoever types the dead name today. A sibling test
// asserts every replacement is still shipped, because the register rots exactly
// when a replacement is itself renamed, and it would rot in silence.

/** Retired skill name -> the skill that carries its work now, if any. */
export const RETIRED_SKILLS: Readonly<Record<string, string | undefined>> = {
  'accessibility-first': 'void-accessibility',
  'adr-workflow': 'void-decide',
  'autonomous-backlog-loop': 'void-autopilot',
  'backlog-autopilot': 'void-autopilot',
  'backlog-batch': 'void-autopilot',
  brainstorming: 'void-brainstorm',
  'capture-rule': 'void-learn',
  'claude-md-authoring': 'void-claude-md',
  compounding: 'void-learn',
  'context-management': 'void-context',
  'harness-evolution': 'void-learn',
  'learning-capture': 'void-learn',
  'migrations-safety': 'void-migrations',
  refactoring: 'void-refactor',
  'session-handoff': 'void-checkpoint',
  'systematic-debugging': 'void-debug',
  'ticket-runner': 'void-implement',
  'ticket-writer': 'void-ticket',
  'verification-before-completion': 'void-verify',
  'void-backlog-loop': 'void-autopilot',
  'void-feedback': 'void-learn',
  'writing-plans': 'void-plan',

  // Every skill this harness ships gained the `void-` prefix. A project installed
  // before that carries journals full of the bare names, and someone who learnt
  // `/tdd` will type it again: both must land on an answer rather than on silence.
  accessibility: 'void-accessibility',
  'accessibility-check': 'void-accessibility-check',
  'api-and-interface-design': 'void-api-and-interface-design',
  'async-safety': 'void-async-safety',
  autopilot: 'void-autopilot',
  'background-job-pattern': 'void-background-job-pattern',
  brainstorm: 'void-brainstorm',
  'cache-component-pattern': 'void-cache-component-pattern',
  checkpoint: 'void-checkpoint',
  'claude-md': 'void-claude-md',
  'client-vs-server-component': 'void-client-vs-server-component',
  'code-review': 'void-code-review',
  'commit-discipline': 'void-commit-discipline',
  context: 'void-context',
  debug: 'void-debug',
  decide: 'void-decide',
  'dependency-direction': 'void-dependency-direction',
  'devex-audit': 'void-devex-audit',
  'domain-driven-design': 'void-domain-driven-design',
  'drizzle-migration-safe': 'void-drizzle-migration-safe',
  'eas-build-profile': 'void-eas-build-profile',
  'env-validation': 'void-env-validation',
  'expo-config-plugins': 'void-expo-config-plugins',
  'expo-router-pattern': 'void-expo-router-pattern',
  'form-pattern': 'void-form-pattern',
  'frontend-design': 'void-frontend-design',
  functional: 'void-functional',
  'hexagonal-architecture': 'void-hexagonal-architecture',
  implement: 'void-implement',
  'install-prompt-ux': 'void-install-prompt-ux',
  'instrumentation-setup': 'void-instrumentation-setup',
  learn: 'void-learn',
  'llm-cost-discipline': 'void-llm-cost-discipline',
  'loading-error-boundaries': 'void-loading-error-boundaries',
  'make-pdf': 'void-make-pdf',
  'manifest-checklist': 'void-manifest-checklist',
  merge: 'void-merge',
  migrations: 'void-migrations',
  observability: 'void-observability',
  'offline-first-mutation': 'void-offline-first-mutation',
  'ota-update-strategy': 'void-ota-update-strategy',
  'package-extraction': 'void-package-extraction',
  'parallel-routes-slots': 'void-parallel-routes-slots',
  plan: 'void-plan',
  'plan-review': 'void-plan-review',
  qa: 'void-qa',
  'rate-limit-strategy': 'void-rate-limit-strategy',
  refactor: 'void-refactor',
  retrospective: 'void-retrospective',
  'route-group-decision': 'void-route-group-decision',
  'security-audit': 'void-security-audit',
  'security-guidance': 'void-security-guidance',
  'server-action': 'void-server-action',
  'service-package': 'void-service-package',
  'service-worker-strategy': 'void-service-worker-strategy',
  'source-driven-development': 'void-source-driven-development',
  'state-architecture': 'void-state-architecture',
  tdd: 'void-tdd',
  testing: 'void-testing',
  'testing-server-modules': 'void-testing-server-modules',
  ticket: 'void-ticket',
  'turbo-pipeline-tuning': 'void-turbo-pipeline-tuning',
  'typescript-strict': 'void-typescript-strict',
  'ui-review': 'void-ui-review',
  verify: 'void-verify',
  'webhook-handler-pattern': 'void-webhook-handler-pattern',
};

/**
 * Whether this name was ever a skill of ours.
 *
 * `Object.hasOwn` rather than a truthiness check: an entry whose replacement is
 * `undefined` still says the name was ours, and losing that would put a skill we
 * retired without successor back among the names we refuse to judge.
 */
export function wasEverOurs(name: string): boolean {
  return Object.hasOwn(RETIRED_SKILLS, name);
}
