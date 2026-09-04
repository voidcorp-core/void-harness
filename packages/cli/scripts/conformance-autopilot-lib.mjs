const MONOREPO_LINK = /\]\((?:\.\.\/|\.\/)*packages\/(?:core|cli)(?:\/[^)\s]*)?\)/i;
const MONOREPO_COMMAND = /\b(?:bash|node|npm|npx|pnpm|sh|tsx)\b[^\n`]*\bpackages\/(?:core|cli)(?:\/[^\s`]*)?/i;

export function assertPortableConsumerSkill(source) {
  const text = String(source);
  const dependency = MONOREPO_LINK.exec(text) ?? MONOREPO_COMMAND.exec(text);
  if (dependency !== null) {
    throw new Error(
      `installed skill depends on a harness monorepo path: ${dependency[0]}`,
    );
  }
}
