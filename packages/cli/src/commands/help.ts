// `void-harness help` / no-args — print the command reference.

export function printHelp(): void {
  const text = `
void-harness — wire your project to the VoidCorp Claude Code marketplace.

The harness is a multi-plugin marketplace hosted at
voidcorp-core/void-harness on GitHub. Skills are auto-loaded by Claude
Code as /void:<name> (core) and /void-<stack>:<name> (packs).

Usage:
  void-harness <command> [options]

Commands:
  init [--pack <name>] [--all-packs] [--no-interactive] [--force]
                           Wire the CURRENT project. Without flags, runs an
                           interactive prompt with auto-detection. With
                           --pack flags, activates exactly those packs
                           non-interactively.

  add <pack-name>          Activate a pack in the current project.
  remove <pack-name>       Deactivate a pack (core cannot be removed).
  list                     Show active and available packs.

  doctor                   Health-check the project setup.
  install --global         Escape hatch (rare); see install --help.

  help                     Print this message.

Pack names (current marketplace):
  void           core — universal craftsman skills (always active)
  void-monorepo  Turborepo + Bun conventions
  void-nextjs    Next.js 16 + PWA conventions

Examples:
  void-harness init                                  # interactive
  void-harness init --pack nextjs --pack monorepo    # script-friendly
  void-harness init --all-packs                      # activate everything
  void-harness add nextjs                            # add a pack later
  void-harness list                                  # see what's active

Marketplace: https://github.com/voidcorp-core/void-harness
`.trimStart();
  process.stdout.write(text);
}
