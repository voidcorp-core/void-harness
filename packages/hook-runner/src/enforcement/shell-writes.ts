// Files a shell command writes to, so the enforcement floor can see them.
//
// Write targets used to be read from `file_path` and `apply_patch` only. A shell
// redirection carries its target inside the command string, so `cat > .env`
// arrived at the rules with an empty edit list: the protected-file rule was not
// lenient there, it was never consulted. CI was the only thing standing between
// that command and a committed secret.
//
// This reads redirections and `tee`, which is what an agent actually reaches for
// when it writes through the shell. It does NOT model the shell: a path built
// from a variable, moved by `cp`/`mv`, or written by a program given an output
// flag stays invisible. The aim is to close the common hole honestly, not to
// claim a completeness a regular expression cannot have.
//
// Where it must choose, it over-reports: a redirection inside a quoted string
// still counts as a target. Blocking a command that was not writing is a visible
// annoyance with an obvious workaround; missing one that was is a silent breach,
// and safety outranks convenience.

/** A redirection: an optional descriptor, `>` or `>>`, then the target. */
const REDIRECTION = /(?:^|\s)(?:\d*|&)>{1,2}\s*("[^"]*"|'[^']*'|[^\s;|&<>]+)/g;

/** `tee`, with or without `-a`, writes its arguments. */
const TEE = /(?:^|[\s|])tee\s+(?:-a\s+)?("[^"]*"|'[^']*'|[^\s;|&<>-][^\s;|&<>]*)/g;

function unquote(target: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(target);
  return quoted?.[2] ?? target;
}

/** Every distinct path this command writes to, sorted for a stable report. */
export function shellWriteTargets(command: string): string[] {
  const targets = new Set<string>();
  for (const pattern of [REDIRECTION, TEE]) {
    for (const match of command.matchAll(pattern)) {
      const target = match[1];
      if (target === undefined) continue;
      const path = unquote(target);
      if (path !== '') targets.add(path);
    }
  }
  return [...targets].sort();
}
