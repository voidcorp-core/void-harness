// `void-harness help` / no-args — print the command reference.

export function printHelp(): void {
  const text = `
void-harness — wire your project to the VoidCorp Claude Code marketplace.

The harness plugins live in voidcorp-core/void-harness and are distributed
through the voidcorp marketplace (voidcorp-core/void-plugins). Skills are auto-loaded by Claude
Code as /harness:<name> (core) and /harness-<stack>:<name> (packs).

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

  doctor [--no-remote]     Health-check the project setup. Includes a remote
                           version check against the marketplace (--no-remote
                           to skip).
  check [--doctrine]       Compare local plugin versions against the remote
                           marketplace. With --doctrine, also diff PHILOSOPHY.md.
  update [--dry-run]       Refresh Claude Code's marketplace cache (git
         [--pins-only]     pull) AND bump .void/config.json pins to the
         [--cache-only]    new HEAD. One command replaces the
                           "/plugin marketplace update" + restart dance.
                           Restart Claude after to load the new plugin
                           version. --dry-run previews; --pins-only skips
                           the cache pull; --cache-only skips the pins.
  install --global         Escape hatch (rare); see install --help.

  backlog-autopilot plan       Deterministic planner for the attended parallel mode
                           (/harness:backlog-autopilot). Reads tickets+estimates
                           JSON on stdin, prints the parallel/sequential plan.
                           See backlog-autopilot --help.

  audit [--stale-days <n>] Outbound self-evolution audit: read .void/usage.log
                           and report harness skills that are active, stale, or
                           never fired (deprecation candidates). HITL, report-only.

  feedback push [--open]   Promote the inbound queue
                [file ...] (.void/harness-feedback/proposed/*.md) to GitHub issues
                           on the harness repo. Previews by default; --open files
                           them and moves each to pushed/. HITL.

  help                     Print this message.

Pack names (current marketplace):
  void           core — universal craftsman skills (always active)
  harness-monorepo  Turborepo + Bun conventions
  harness-nextjs    Next.js 16 + PWA conventions

Examples:
  void-harness init                                  # interactive
  void-harness init --pack nextjs --pack monorepo    # script-friendly
  void-harness init --all-packs                      # activate everything
  void-harness add nextjs                            # add a pack later
  void-harness list                                  # see what's active
  void-harness check                                 # remote version drift
  void-harness check --doctrine                      # + PHILOSOPHY.md drift
  void-harness update                                # sync pins to remote HEAD
  void-harness update --dry-run                      # preview the diff

Marketplace: https://github.com/voidcorp-core/void-plugins
`.trimStart();
  process.stdout.write(text);
}
