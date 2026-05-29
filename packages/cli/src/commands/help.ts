// `voidcorp-harness help` / no-args — print the command reference.

export function printHelp(): void {
  const text = `
voidcorp-harness — opinionated Claude Code + Codex harness for VoidCorp projects.

Usage:
  npx @voidcorp/harness <command> [args]

Commands:
  install                  Install core skills/agents/hooks into ~/.claude/voidcorp/.
                           Idempotent. Detects an existing install and updates.
  init [--pack <name>]     Initialize the current project: create .voidcorp/config.json,
                           install CLAUDE.md + AGENTS.md (sister docs), wire pre-commit
                           hooks. Optional --pack to activate a stack pack.
  doctor                   Health-check: verify harness install integrity, config
                           validity, sister-doc parity, hook executability.
  help                     Print this message.

Examples:
  npx @voidcorp/harness install
  npx @voidcorp/harness init --pack pack-nextjs-pwa
  npx @voidcorp/harness doctor

Docs: https://github.com/voidcorp-core/void-harness
`.trimStart();
  process.stdout.write(text);
}
