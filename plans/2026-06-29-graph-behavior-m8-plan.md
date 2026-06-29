---
title: graph behavior (M8) — should-have-fired + dead-node
date: 2026-06-29
status: in-progress
spec: docs/specs/2026-06-29-graph-behavior-m8.md
author: Florent + Claude
high_risk: false
---

> **Exécution :** suivre le cycle `harness:ticket-runner` (depuis la source du repo —
> il n'est pas installé dans cette session) : ingest, TDD, review, verification, ship.
> Chaque étape déclare son mode TDD et son gate.

## Goal

Fermer la boucle télémétrie de la spec mère §8 : à partir de `.void/activations.jsonl`
(produit par M6), calculer `dead-node` (composants jamais déclenchés) et
`should-have-fired` (skill dont un trigger déclaré matchait une situation mais qui n'a
pas tiré dans la session). Surface : module pur kernel `behavior/` + sous-commande
`void-harness graph behavior`. Advisory/HITL, jamais bloquant. Matching par triggers
structurés déclarés en frontmatter (mécanique, déterministe). Hors v1 : dead-hook,
sémantique LLM, calque studio, gate CI.

## Découpage en tranches verticales

- **A (schéma)** : le frontmatter `triggers` se dérive dans le modèle — testable seul.
- **B (coeur pur)** : `analyzeBehavior` calcule les findings depuis (model, events) —
  le joyau testable, sans I/O.
- **C (CLI)** : `graph behavior` lit le log et rend le rapport — bout-en-bout.
- **D (seed + docs)** : ~6 skills déclarent leurs triggers, le tout documenté.

---

### Step 1 — Frontmatter `triggers` : schéma + dérivation

- **Goal** : un skill peut déclarer `triggers` en frontmatter ; le deriver le porte dans
  `GraphNode.triggers`.
- **Depends on** : none
- **TDD mode** : strict
- **Fichiers** :
  - Modifier : `packages/harness-graph/src/model/types.ts` (ajouter `NodeTriggers` +
    `GraphNode.triggers?`)
  - Modifier : `packages/harness-graph/src/derive/read-frontmatter.ts` (+ test) — renvoyer
    `{ description, triggers? }`, parser le bloc `triggers:` (sous-lignes indentées
    `globs:` / `extensions:` / `tools:`, chacune une **inline JSON array**, tolérant).
  - Modifier : `packages/harness-graph/src/derive/nodes.ts` (+ test) — passer `triggers`
    au nœud.
- **Interface** : `NodeTriggers = { globs?: readonly string[]; extensions?: readonly string[]; tools?: readonly string[] }` ; rétrocompatible (absent par défaut).
- **Verification gate** : `pnpm vitest run packages/harness-graph/src/derive` vert ;
  `pnpm --filter @voidcorp/harness-graph build` ; `tsc --noEmit` propre.
- **Expected commits** :
  - `test(graph-behavior): read-frontmatter + node deriver carry triggers`
  - `feat(graph-behavior): declarable triggers in skill frontmatter -> GraphNode`
- **Notes** : pas de dep YAML (le parser frontmatter est line-based) — parser
  `key: [..]` où la valeur est un JSON array, tolérant (clé absente → dimension omise ;
  JSON invalide → dimension omise, jamais de crash). Aucun `model.json` ne change ici
  (aucun skill ne déclare encore de trigger) ; le seed est en Step 5.

### Step 2 — Coeur pur : parse activations + triggerMatches (+ glob minimal)

- **Goal** : helpers purs déterministes consommés par `analyzeBehavior`.
- **Depends on** : none
- **TDD mode** : strict
- **Fichiers** :
  - Créer : `packages/harness-graph/src/behavior/types.ts` (`ActivationEvent`, `BehaviorFinding`)
  - Créer : `packages/harness-graph/src/behavior/parse.ts` (+ test) — `parseActivations(text): ActivationEvent[]` tolérant (ligne par ligne, malformé ignoré).
  - Créer : `packages/harness-graph/src/behavior/match.ts` (+ test) — `triggerMatches(triggers, situation): boolean` + un glob minimal pur (`*`, `**`, suffixe ; zéro dep).
- **Interfaces** : voir spec §5. `triggerMatches` OR sur les dimensions déclarées.
- **Verification gate** : `pnpm vitest run packages/harness-graph/src/behavior` vert ;
  `tsc --noEmit` propre.
- **Expected commits** :
  - `test(graph-behavior): parse activations + triggerMatches/glob`
  - `feat(graph-behavior): pure activation parse + trigger matching`
- **Notes** : `globMatches(pattern, path)` minimal — assez pour `**/*.test.ts`,
  `**/migrations/**`, `*.sql`. Documenter ses limites en commentaire. Parallèle à Step 1.

### Step 3 — Coeur pur : `analyzeBehavior` (dead-node + should-have-fired + garde de volume)

- **Goal** : la fonction d'analyse comportementale pure.
- **Depends on** : [step-1, step-2]
- **TDD mode** : strict
- **Fichiers** :
  - Créer : `packages/harness-graph/src/behavior/index.ts` (+ test) — `analyzeBehavior(model, events, opts?): { sufficient, stats, findings }`.
  - Modifier : `packages/harness-graph/src/index.ts` — exporter `analyzeBehavior` + types behavior.
- **Sémantique** (spec §6) :
  - opts : `{ sinceMs?: number }` (cutoff absolu ; le shell convertit `--since N` → `now - N*86400e3`, le coeur reste sans horloge).
  - garde de volume : `sessions < MIN_SESSIONS` (3) ou `events < MIN_EVENTS` (20) → `{ sufficient:false, findings:[] }`.
  - dead-node : nœuds kind ∈ {skill,agent,command,workflow-def} dont le bare name n'apparaît dans aucune activation (mapping kind→préfixe, `skill` couvre `command`).
  - should-have-fired : par `sessionId`, situation (`kind=tool`) matchant `node.triggers` + skill non-tiré dans la session → miss ; `count` = sessions distinctes ; finding si `count ≥ 1`.
  - findings triés (kind puis nodes.join) ; `severity:'info'` ; déterministe.
- **Verification gate** : `pnpm vitest run packages/harness-graph` vert ; build kernel ;
  `tsc --noEmit` propre.
- **Expected commits** :
  - `test(graph-behavior): analyzeBehavior dead-node + should-have-fired + volume guard`
  - `feat(graph-behavior): behavioral analysis core (advisory findings)`
- **Notes** : table-driven (fixtures events). Aucun I/O. `count` exposé pour le rendu CLI.

### Checkpoint A — après Step 3

L'algorithme comportemental est complet et testé sans WebGL/CLI. L'utilisateur revoit la
sémantique (defaults de garde, OR du matching, mapping command via skill) avant de câbler
la surface. Lancer `harness:verification-before-completion`. Attendre le signal.

### Step 4 — Shell CLI : `graph behavior`

- **Goal** : `void-harness graph behavior [--since N] [--log path]` rend le rapport.
- **Depends on** : [step-3]
- **TDD mode** : souple (shell ; smoke + run manuel)
- **Fichiers** :
  - Modifier : `packages/cli/src/commands/graph.ts` (branche `sub === 'behavior'`).
- **Comportement** : lit `--log` (def. `.void/activations.jsonl`) ; `parseActivations` ;
  `analyzeBehavior(model, events, { sinceMs })` avec `sinceMs` dérivé de `--since` (jours)
  via `Date.now()` ; si `!sufficient` → message « insufficient data (n events, m sessions ;
  need ≥X) » ; sinon liste dead-node + should-have-fired (avec `count`), cadrage advisory.
  **exit 0 toujours.**
- **Verification gate** : `pnpm --filter @voidcorp/harness build` ; smoke : sur un log de
  démo riche → findings ; sur log vide → message insuffisant ; exit 0 dans les deux cas.
  `pnpm lint` propre.
- **Expected commits** :
  - `feat(graph-behavior): graph behavior CLI report (advisory)`
- **Notes** : style cohérent avec `graph audit` (banner/footer, `allow-console` sur la
  branche erreur existante seulement). Aide CLI mise à jour en Step 6.

### Step 5 — Seed des triggers (~6 skills) + mirror + rebuild modèle

- **Goal** : prouver le bout-en-bout avec de vrais triggers déclarés.
- **Depends on** : [step-1]
- **TDD mode** : souple (frontmatter + assets)
- **Fichiers** :
  - Modifier le frontmatter de ~6 skills : `tdd`, `testing`, `typescript-strict`,
    `frontend-design`, `accessibility-first`, `migrations-safety`
    (`packages/core/skills/<name>/SKILL.md`).
  - Régénérer : `packages/cli/core-assets/**` via `pnpm --filter @voidcorp/harness build:assets`.
  - Régénérer : `packages/harness-graph/model.json` via `graph build`.
- **Triggers proposés** (révisables) : `testing` globs `["**/*.test.ts","**/*.spec.ts"]` ;
  `migrations-safety` globs `["**/migrations/**","**/*.sql"]` ; `typescript-strict` ext
  `["ts","tsx"]` ; `frontend-design`/`accessibility-first` ext `["tsx"]` ; `tdd` ext
  `["ts","tsx"]` tools `["Edit","Write"]`.
- **Verification gate** : `graph check` passe (modèle à jour) ; `graph behavior` sur un log
  de démo montre des findings should-have-fired plausibles ; `git status core-assets`
  montre les frontmatters mirrorés.
- **Expected commits** :
  - `feat(graph-behavior): seed declarative triggers on six path-driven skills`
- **Notes** : rebuild modèle obligatoire sinon `graph check` casse. Garder les triggers
  conservateurs (préférer globs précis pour limiter les faux positifs).

### Step 6 — Doc & clôture

- **Goal** : refléter la livraison ; journaliser la décision.
- **Depends on** : [step-4, step-5]
- **TDD mode** : souple (doc)
- **Fichiers** :
  - Modifier : `docs/specs/2026-06-26-harness-graph-viz.md` (cocher M8 livré).
  - Modifier : `docs/DECISIONS.md` (entrée : triggers déclarés vs lexical/LLM ; behavior
    séparé du analyze statique ; advisory only).
  - Modifier : `packages/cli/src/commands/help.ts` (sous-cmd `behavior`).
  - Modifier : `packages/harness-graph/README.md` (section Behavior).
  - Modifier : `docs/specs/2026-06-29-graph-behavior-m8.md` (status → livré).
- **Verification gate** : `pnpm test` global vert ; `graph check` passe ; `pnpm lint`
  propre ; `sync:docs` vert si CLAUDE/AGENTS touchés (ici non).
- **Expected commits** :
  - `docs(graph-behavior): log M8 decision + tick milestone + CLI/kernel docs`
- **Notes** : si une convention nouvelle apparaît, la refléter aussi dans la doc (meta-rule).

---

## Review checkpoints (récap)

- **Checkpoint A** — après Step 3 (algorithme comportemental complet, avant la surface).

## Critères de « Done »

- `pnpm test` + `graph check` + `pnpm lint` verts.
- `graph behavior` rend dead-node + should-have-fired (advisory, exit 0), garde de volume
  honnête sur log maigre.
- ~6 skills déclarent des triggers ; `model.json` les porte ; core-assets mirrorés.
- M8 coché dans la spec mère ; décision dans `DECISIONS.md`.

## Resume point

**Next step** : Step 1 (Frontmatter `triggers` : schéma + dérivation)

**Completed** : aucun.

**Pending** :
- ⏳ Step 1 — frontmatter triggers + dérivation
- ⏳ Step 2 — coeur pur parse + triggerMatches/glob
- ⏳ Step 3 — analyzeBehavior (dead-node + should-have-fired + garde volume)
- ⏳ Step 4 — CLI graph behavior
- ⏳ Step 5 — seed ~6 triggers + mirror + modèle
- ⏳ Step 6 — doc & clôture
