---
title: graph behavior (M8) — should-have-fired + dead-node analysis
date: 2026-06-29
status: delivered  # 2026-06-29
author: Florent + Claude
related:
  - docs/specs/2026-06-26-harness-graph-viz.md  # §8 telemetry, §12 M8
  - docs/specs/2026-06-29-graph-live-p2.md       # M6 activations.jsonl feed
---

## 1. Intention

Fermer la boucle de la spec mère §8 : à partir de la donnée d'activation accumulée
(`.void/activations.jsonl`, produite par M6), calculer **quels composants ne tirent
jamais** (`dead-node`) et **quels skills auraient dû tirer mais ne l'ont pas**
(`should-have-fired`). C'est l'analyse comportementale M8 (Phase 2). Advisory/HITL :
elle informe, ne bloque jamais.

C'est la réponse outillée à « lesquels de mes hooks/commandes/skills ne sont jamais
déclenchés » : M6 a amorcé la donnée, M8 la calcule.

## 2. Décisions verrouillées (brainstorm)

- **Surface** : nouvelle sous-commande `void-harness graph behavior` + module pur kernel
  `behavior/`. Séparé du `analyze` statique (la donnée est temporelle, par session).
- **Matching skills** : **triggers structurés déclarés** dans le frontmatter des skills
  (opt-in, machine-lisible). Mécanique, déterministe, CI-safe, incrémental, zéro faux
  positif. Rejeté : heuristique lexicale (bruit), LLM-judge (coût/non-déterminisme).
- **Livrable** : mécanisme + `dead-node` + `should-have-fired` + seed ~6 skills.
- **Robustesse** : garde de volume + fenêtre `--since` optionnelle + comptage
  d'occurrences ; tout en `severity: info`.
- **Hors v1** : `dead-hook` (matchers `plugin.json`), matching sémantique
  LLM/embeddings, calque studio visuel, gate CI bloquant.

## 3. Périmètre

**Inclus :** schéma frontmatter `triggers` ; dérivation kernel `GraphNode.triggers` ;
module pur `behavior/` (`dead-node`, `should-have-fired`, garde de volume, fenêtre) ;
parse pur des activations ; sous-commande CLI `graph behavior` ; seed des triggers de
~6 skills ; docs + jalon M8.

**Hors périmètre :** voir §2 (dead-hook, sémantique LLM, studio, CI bloquant, authoring
des triggers au-delà des ~6 seeds).

## 4. Architecture (4 tranches verticales)

```
A. Schéma + dérivation
   frontmatter skill -> triggers: { globs?, extensions?, tools? }  (tout optionnel)
   kernel deriver -> GraphNode.triggers? -> model.json

B. Coeur pur kernel : packages/harness-graph/src/behavior/
   parseActivations(text) -> ActivationEvent[]          (tolérant)
   triggerMatches(triggers, situation) -> boolean       (glob minimal *, **, suffixe)
   analyzeBehavior(model, events, { sinceDays? })
     -> { sufficient: boolean, stats, findings: BehaviorFinding[] }

C. Shell CLI : void-harness graph behavior [--since N] [--log path]
   lit activations.jsonl -> parseActivations -> analyzeBehavior -> render advisory (exit 0)

D. Seed ~6 skills (tdd, testing, typescript-strict, frontend-design,
   accessibility-first, migrations-safety) + mirror core-assets + model rebuild + docs
```

## 5. Contrat de données

`GraphNode` gagne un champ optionnel rétrocompatible :

```ts
interface NodeTriggers {
  readonly globs?: readonly string[];       // ex. ["**/*.test.ts"]
  readonly extensions?: readonly string[];  // ex. ["ts", "tsx"]
  readonly tools?: readonly string[];       // ex. ["Edit", "Write"]
}
// GraphNode.triggers?: NodeTriggers
```

`ActivationEvent` canonique (kernel `behavior/types.ts`) :

```ts
interface ActivationEvent {
  readonly ts: string;
  readonly kind: 'skill' | 'agent' | 'workflow' | 'tool';
  readonly name: string;
  readonly trigger: { readonly tool: string; readonly fileGlobs: readonly string[]; readonly ext: readonly string[] };
  readonly sessionId: string;
}
```

`BehaviorFinding` :

```ts
interface BehaviorFinding {
  readonly kind: 'dead-node' | 'should-have-fired';
  readonly severity: 'info';
  readonly nodes: readonly string[];
  readonly evidence: string;     // ex. "never fired in 42 events / 7 sessions"
  readonly suggestion: string;
  readonly count?: number;       // sessions concernées (should-have-fired)
}
```

(Le `graph-live.ts` de P2 garde sa propre copie d'`ActivationEvent` ; déduplication
possible plus tard — hors scope.)

## 6. Le calcul (pur, déterministe)

- **Garde de volume** : `sessions distinctes < MIN_SESSIONS` (def. 3) ou
  `events < MIN_EVENTS` (def. 20) → `sufficient: false`, zéro finding.
- **`dead-node`** : pour chaque nœud de kind ∈ {skill, agent, command, workflow-def},
  son *bare name* (mapping kind→préfixe comme le studio, `skill` couvre `command`)
  n'apparaît dans aucune activation de la fenêtre → finding. pack/hook exclus (ne
  tirent pas comme activations nommées).
- **`should-have-fired`** : grouper les events par `sessionId`. Par session : ensemble
  des skills tirés + ensemble des **situations** (`kind=tool` avec `trigger`). Pour
  chaque skill déclarant `triggers` : si une situation de la session **matche** le
  trigger ET le skill n'a pas tiré dans cette session → un *miss* de session. `count` =
  sessions distinctes avec miss ; finding si `count ≥ 1`.
- **Fenêtre** : `--since N` filtre les events par `ts` (≥ now-N jours) ; défaut = tout
  l'historique. (now injecté par le shell ; le coeur pur reste sans horloge.)

`triggerMatches` : vrai si la situation satisfait **n'importe quelle** dimension
déclarée (`tool ∈ tools` OU `ext ∩ extensions ≠ ∅` OU un `fileGlob` matche un `globs`).
OR permissif (l'auteur choisit la dimension précise).

## 7. Flux de données

`activations.jsonl -> (CLI) parseActivations -> analyzeBehavior(model, events) ->
findings -> render`. Le `model` (avec `triggers`) vient de `loadModel` comme les autres
sous-commandes graph.

## 8. Erreurs & cas limites

- `activations.jsonl` absent/vide → `sufficient: false`, message « donnée insuffisante »,
  exit 0.
- Lignes JSONL malformées → ignorées (parse tolérant).
- `kind=tool` ne mappe aucun nœud (situation pure) — input du should-have-fired, jamais
  un dead-node.
- Skill sans `triggers` → exclu du should-have-fired (zéro faux positif), éligible au
  dead-node.
- `graph behavior` n'échoue jamais (advisory) : exit 0 toujours.
- Déterminisme : findings triés (kind puis nodes) ; aucun `Date.now`/`Math.random` dans
  le coeur pur.

## 9. Tests

- **Kernel (strict TDD)** : `triggerMatches` (tool/ext/glob + négatifs) ;
  `parseActivations` (tolérant) ; `analyzeBehavior` table-driven (dead-node ;
  should-have-fired = situation match + non-firing même session ; garde de volume ;
  fenêtre `--since` ; déterminisme/ordre) ; deriver capture `triggers`.
- **CLI (souple)** : `graph behavior` smoke (suffisant → findings ; insuffisant →
  message ; exit 0).

## 10. Modes TDD par tranche

A : **strict** (deriver pur + schéma). B : **strict** (le coeur). C : **souple** (shell
CLI). D : **souple** (seed frontmatter + docs).

## 11. Contraintes doctrine

- Coeur pur (kernel `behavior/`) sans I/O ; le shell CLI lit le fichier.
- `undefined` plutôt que `null` (harness:functional).
- Triggers seedés : frontmatter `packages/core/skills/*/SKILL.md`, mirror core-assets,
  `model.json` rebuild (sinon `graph check` casse sur dérive).
- Advisory only : ne rejoint pas `blockingFindings`/le gate CI.
- Jalon M8 coché dans la spec mère ; décision (triggers déclarés + behavior séparé)
  logguée dans `DECISIONS.md`.
