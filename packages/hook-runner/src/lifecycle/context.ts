export interface SessionStartOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: 'SessionStart';
    readonly additionalContext: string;
  };
}

export function sessionStartOutput(version: string): SessionStartOutput {
  const installed = version.trim() === '' ? 'unknown' : version.trim();
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `void-harness ${installed} is active. Non-negotiable floor: never edit secrets, keys or lockfiles; ` +
        'never run destructive shell commands; tests and fresh evidence gate "done". ' +
        'Capture durable project rules explicitly. Run `void-harness doctor` if runtime health is uncertain.',
    },
  };
}
