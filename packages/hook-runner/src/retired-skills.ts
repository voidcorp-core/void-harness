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
  'accessibility-first': 'accessibility',
  'adr-workflow': 'decide',
  'autonomous-backlog-loop': 'autopilot',
  'backlog-autopilot': 'autopilot',
  'backlog-batch': 'autopilot',
  brainstorming: 'brainstorm',
  'capture-rule': 'learn',
  'claude-md-authoring': 'claude-md',
  compounding: 'learn',
  'context-management': 'context',
  'harness-evolution': 'learn',
  'learning-capture': 'learn',
  'migrations-safety': 'migrations',
  refactoring: 'refactor',
  'session-handoff': 'checkpoint',
  'systematic-debugging': 'debug',
  'ticket-runner': 'implement',
  'ticket-writer': 'ticket',
  'verification-before-completion': 'verify',
  'void-backlog-loop': 'autopilot',
  'void-feedback': 'learn',
  'writing-plans': 'plan',
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
