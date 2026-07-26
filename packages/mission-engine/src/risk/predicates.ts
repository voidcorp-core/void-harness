export interface MissionSignalsInput {
  readonly ticket: string;
  readonly files: readonly string[];
  readonly stack: readonly string[];
  readonly complete?: boolean;
}

export interface RiskPredicate {
  readonly id: string;
  readonly textPatterns: readonly RegExp[];
  readonly pathPatterns: readonly RegExp[];
}

export interface PredicateMatch {
  readonly predicateId: string;
  readonly matchedInputs: readonly string[];
}

export const HIGH_RISK_PREDICATES: readonly RiskPredicate[] = Object.freeze([
  {
    id: 'auth',
    textPatterns: [
      /\bauth(?:entication|orization)?\b/i,
      /\bpermission\b/i,
      /\bauthentification\b/i,
      /\bautorisations?\b/i,
    ],
    pathPatterns: [/(?:^|\/)(?:auth|permissions?)(?:\/|\.|$)/i],
  },
  {
    id: 'pii',
    textPatterns: [
      /\bpii\b/i,
      /\bpersonal data\b/i,
      /\bcustomer data\b/i,
      /donn[ée]es? personnelles?/i,
    ],
    pathPatterns: [/(?:^|\/)(?:pii|personal-data)(?:\/|\.|$)/i],
  },
  {
    id: 'tenancy',
    textPatterns: [
      /\bmulti[- ]?tenan(?:t|cy)\b/i,
      /\btenant isolation\b/i,
    ],
    pathPatterns: [/(?:^|\/)(?:tenant|tenancy)(?:\/|\.|$)/i],
  },
  {
    id: 'destructive-migration',
    textPatterns: [
      /\bdestructive migration\b/i,
      /\bmigration destructive\b/i,
      /\bdrop (?:a )?(?:column|table|index)\b/i,
      /\btruncate\b/i,
    ],
    pathPatterns: [/(?:^|\/)migrations?\/.*(?:drop|destructive)/i],
  },
  {
    id: 'upload',
    textPatterns: [
      /\bfile upload\b/i,
      /\bupload\b/i,
      /\buntrusted (?:file|document|content)\b/i,
      /\b(?:document|contenu) non fiable\b/i,
    ],
    pathPatterns: [/(?:^|\/)(?:upload|parser)(?:s)?(?:\/|\.|$)/i],
  },
  {
    id: 'code-execution',
    textPatterns: [
      /\bexecute (?:user[- ]provided )?(?:code|shell)\b/i,
      /\bcode execution\b/i,
      /\beval\s*\(/i,
      /ex[ée]cution de code/i,
    ],
    pathPatterns: [/(?:^|\/)(?:sandbox|executor|shell)(?:\/|\.|$)/i],
  },
  {
    id: 'llm-tools',
    textPatterns: [
      /\bllm tool/i,
      /\bagent permission/i,
      /\btool calling\b/i,
      /outils? llm/i,
      /permissions? (?:aux|d['’])agents?/i,
    ],
    pathPatterns: [/(?:^|\/)(?:tools|agents?)\.(?:json|ya?ml|toml)$/i],
  },
  {
    id: 'supply-chain',
    textPatterns: [
      /\bsupply[- ]chain\b/i,
      /\brelease provenance\b/i,
      /\bdependency (?:change|update|upgrade)\b/i,
    ],
    pathPatterns: [
      /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i,
      /(?:^|\/)package\.json$/i,
      /(?:^|\/)\.github\/workflows\//i,
    ],
  },
]);

const SIGNAL_PATTERNS: ReadonlyArray<
  readonly [string, readonly RegExp[]]
> = [
  ['product', [
    /\b(?:feature|user flow|journey|product|add|create)\b/i,
    /fonctionnalit[ée]|parcours|ajouter|cr[ée]er/i,
  ]],
  ['architecture', [
    /\b(?:api|module|boundary|domain|schema|architecture)\b/i,
    /fronti[èe]re|domaine|sch[ée]ma/i,
  ]],
  ['tdd', [
    /\b(?:behavior|test|implement|fix|change|add|create)\b/i,
    /comportement|impl[ée]menter|corriger|modifier|ajouter|cr[ée]er/i,
  ]],
  ['qa', [
    /\b(?:test|qa|verify|acceptance|regression)\b/i,
    /v[ée]rifier/i,
  ]],
  ['security', [
    /\b(?:security|trust|auth|secret|permission|untrusted)\b/i,
    /s[ée]curit[ée]|non fiable/i,
  ]],
  ['observability', [
    /\b(?:observability|logging|metric|trace|runtime)\b/i,
    /observabilit[ée]|m[ée]trique|ex[ée]cution/i,
  ]],
  ['migration', [
    /\b(?:migration|persistent|database|schema|backfill)\b/i,
    /persistant|base de donn[ée]es|sch[ée]ma/i,
  ]],
  ['ux-ui', [
    /\b(?:ui|ux|visual|screen|component|interaction)\b/i,
    /interface|[ée]cran|composant/i,
  ]],
  ['accessibility', [
    /\b(?:accessibility|a11y|screen reader|keyboard)\b/i,
    /accessibilit[ée]|clavier/i,
  ]],
  ['performance', [
    /\b(?:performance|latency|volume|bundle|hot path|cost)\b/i,
    /latence|chemin critique|co[ûu]t/i,
  ]],
  ['pdf', [/\bpdf\b/i]],
  ['retrospective', [
    /\b(?:retrospective|incident|postmortem|release)\b/i,
    /r[ée]trospective/i,
  ]],
];

function matchesFor(
  predicate: RiskPredicate,
  input: MissionSignalsInput,
): readonly string[] {
  const matches: string[] = [];
  if (predicate.textPatterns.some((pattern) => pattern.test(input.ticket))) {
    matches.push('ticket');
  }
  for (const file of input.files) {
    if (predicate.pathPatterns.some((pattern) => pattern.test(file))) {
      matches.push(`file:${file}`);
    }
  }
  return Object.freeze(matches.sort());
}

export function evaluateHighRiskPredicates(
  input: MissionSignalsInput,
): readonly PredicateMatch[] {
  const matches: PredicateMatch[] = [];
  for (const predicate of HIGH_RISK_PREDICATES) {
    const matchedInputs = matchesFor(predicate, input);
    if (matchedInputs.length > 0) {
      matches.push(Object.freeze({ predicateId: predicate.id, matchedInputs }));
    }
  }
  return Object.freeze(matches);
}

export function deriveMissionSignals(
  input: MissionSignalsInput,
): ReadonlySet<string> {
  const signals = new Set<string>();
  for (const [signal, patterns] of SIGNAL_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(input.ticket))) signals.add(signal);
  }
  if (input.files.some((file) => /\.(?:ts|tsx|js|jsx|py|rs|go)$/.test(file))) {
    signals.add('tdd');
    signals.add('qa');
  }
  if (input.files.some((file) => /\.(?:tsx|jsx|css|html)$/.test(file))) {
    signals.add('ux-ui');
    signals.add('accessibility');
  }
  if (input.stack.length > 0) signals.add('stack-patterns');
  for (const match of evaluateHighRiskPredicates(input)) {
    signals.add(match.predicateId);
    signals.add('security');
  }
  return signals;
}
