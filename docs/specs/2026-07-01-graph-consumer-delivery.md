---
title: graph consumer delivery (sub-project B)
date: 2026-07-01
status: approved
author: Folpe + Claude
related:
  - docs/specs/2026-07-01-graph-cost-profiler.md
  - docs/specs/2026-06-29-graph-live-p2.md
  - docs/specs/2026-06-29-graph-behavior-m8.md
  - docs/specs/2026-06-26-harness-graph-viz.md
---

# graph consumer delivery (sub-project B)

## Contexte

Sous-projet B de l'initiative graph self-optimization. A (cost profiler) est mergé
(`main` 2a21536, PR #48). Le graph tooling (kernel `packages/harness-graph`, CLI `graph`,
studio `apps/graph-studio`) ne tourne **que dans le monorepo**. Un projet consommateur du
harness reçoit uniquement les assets `.claude/` via la marketplace (`voidcorp-core/void-plugins`),
donc aucune commande `graph`.

Objectif de B : rendre le graph tooling **exécutable chez un consommateur**, livré par les
assets du plugin, **zéro npm publish**. Le consommateur obtient d'un coup le rapport d'audit
(terminal) **et** le studio visuel live.

### But sous-jacent

Le model graphé décrit **le harness installé**, pas le projet du consommateur. Faire tourner
`graph cost`/`behavior` chez un consommateur corrèle **son usage réel** (télémétrie locale +
transcripts) contre **les composants du harness** — c'est la boucle de self-optimization
mesurée depuis le terrain : est-ce que chaque hook/skill/agent gagne sa place chez de vrais
utilisateurs.

## État de l'existant (vérifié)

- Le consommateur a **déjà** la télémétrie : `activation-meter.sh` (hook `PreToolUse *`, shippé
  via marketplace, déclaré dans `packages/core/.claude-plugin/plugin.json`) écrit
  `.void/activations.jsonl` + `.void/usage.log` en `cwd`. Les transcripts Claude Code vivent
  dans `~/.claude/projects/<cwd encodé>`.
- Gaps : la CLI `@voidcorp/harness` **n'est pas publiée** (release.yml, décision zéro-npm), le
  kernel `@voidcorp/harness-graph` est `workspace:*` non publié et **absent de `packages/core`**,
  il n'existe **aucun `model.json` côté conso**, le studio est `private` / `dist` gitignoré /
  jamais distribué, et le serveur live (`graph-live-server.ts`) est **data-only** — il ne sert
  pas le studio.
- Couplage monorepo dur : `graph.ts` ancre `model.json`/`relations`/`packs` sur `PKGS_ROOT` ;
  `scanSourceTree` calcule `repoRoot` en supposant la disposition `packages/`. Ces chemins
  n'existent pas chez un consommateur.

## Décisions verrouillées (brainstorm 2026-07-01)

1. **Périmètre** : B livre tout d'un coup — CLI audit (rapports terminal) + studio live visuel.
2. **Source du model** : baked complet au release, **filtré au runtime** par les `enabledPlugins`
   du `.claude/settings.json` du consommateur (core + packs actifs). Évite les faux « morts »
   des packs non activés. Filtre coarse (niveau plugin/pack), pas de scan du cache.
3. **Artefact** : **un seul `void-graph.mjs` self-contained** (kernel + logique CLI + model
   embarqué + studio inliné en single-file), commité dans `packages/core/graph/`, shippé par la
   marketplace. **100% local** : servi sur `http://localhost:<port>`, aucune URL externe, offline.
4. **Déclenchement** : **une skill à modes** `harness:void-graph`. Sans arg → `live` (studio) ;
   `audit`/`cost`/`behavior` → rapport terminal.

## Architecture

Deux runtimes disjoints :

- **Release-time (monorepo)** : le build produit l'artefact self-contained. **Seul endroit qui
  scanne les sources** du harness — tout le couplage monorepo (`PKGS_ROOT`, `repoRoot`) reste ici.
- **Consumer-time (machine conso)** : `void-graph.mjs` tourne en pur portable — charge le model
  **embarqué** (aucun scan de source), le filtre, lit la télémétrie locale, sort un rapport ou
  sert le studio.

En bakant le model, on supprime tout couplage monorepo du chemin consommateur.

## Composants

1. **`build-void-graph`** (nouveau, release-time). Bundle via esbuild/tsup : kernel
   `@voidcorp/harness-graph` + logique CLI `graph` + `model.json` complet embarqué + studio
   buildé single-file (`vite-plugin-singlefile`, inliné en string). Sortie :
   `packages/core/graph/void-graph.mjs`. **Gate anti-drift** (miroir de `graph check`) : l'artefact
   committé doit égaler le rebuild, sinon CI rouge.
2. **Studio « server-fed »**. Aujourd'hui le studio importe `src/generated/*.json` figés au build
   (`apps/graph-studio/src/data/load.ts`). Nouveau mode : au chargement il **fetch model + history
   depuis le serveur qui le sert** (same-origin `/model.json`, `/history`) au lieu du snapshot
   monorepo. Les `generated/*.json` ne servent plus qu'au dev monorepo.
3. **Serveur live étendu** (`packages/cli/src/lib/graph-live-server.ts`). Garde `/model.json`,
   `/history`, `/events` (SSE). **Ajoute `GET /` → sert le studio inliné.** Un port, un process,
   zéro dép (`node:http`).
4. **CLI portable** (`packages/cli/src/commands/graph.ts` + lib). `graph.ts` est refactoré pour
   **brancher sur deux modes** : monorepo (comportement actuel, `loadModel`/`scanSourceTree`) vs
   bundled (model embarqué présent → **skip total du scan**, aucun accès `PKGS_ROOT`). Le chemin
   conso charge le model embarqué, le **filtre par `enabledPlugins`** de `.claude/settings.json`,
   puis lit `.void/activations.jsonl` + `~/.claude/projects` en `cwd`. Modes `audit`/`cost`/
   `behavior` → terminal ; `live` → serveur+studio.
5. **Skill `harness:void-graph`** (`packages/core/skills/`). Modes : sans arg → `live` (lance
   `void-graph.mjs live` en background depuis le répertoire d'install du plugin, ouvre `localhost`) ;
   `audit`/`cost`/`behavior` → rapport terminal. `description` ≤ 200 chars, autodiscovery précise.
   Le mécanisme exact de résolution du chemin d'install (`${CLAUDE_PLUGIN_ROOT}` ou équivalent) est
   confirmé au plan contre la doc Claude Code plugins (source-driven-development), pas de mémoire.

## Flux de données

```
model.json embarqué
  → filtre packs actifs (enabledPlugins de .claude/settings.json)
  → merge avec .void/activations.jsonl (behavior / dead-node)
          + ~/.claude/projects/<cwd>/*.jsonl (cost réel, cache-aware)
  → analyzeBehavior / analyzeCost (kernel pur, INCHANGÉ)
  → rendu terminal  OU  servi en SSE + static au studio local
```

## Gestion d'erreurs

- Pas de `.void/activations.jsonl` → pas d'erreur, behavior/dead-node « aucune activation encore »,
  audit statique (staticTokens + structure) reste utile.
- Pas de transcripts → `cost` bascule static-only, warning explicite, pas de crash.
- `.claude/settings.json` absent / sans `enabledPlugins` → fallback model complet + note « filtre
  packs inactif ».
- Port occupé (live) → incrémente jusqu'à libre, imprime le port réel.
- Volume guard (3 sessions / 20 events) hérité de A : advisory, overridable via flags existants.
- Model embarqué / kernel divergents → `KERNEL_VERSION` vérifié au chargement, message clair.

## Approche de test

| Cible | Mode | Notes |
|---|---|---|
| Kernel behavior/cost | (couvert par A) | inchangé |
| Filtre packs | **strict** | table : core seul, core+1 pack, pack inconnu, settings absent |
| Chargement model embarqué | souple | decode + version-check |
| Route static-serve (`GET /`, `/model.json`) | souple | HTML studio, data, headers |
| `build-void-graph` + drift gate | intégration | build tmpdir, artefact déterministe, re-run identique |
| Studio server-fed | exploratoire/manuel | vérif visuelle chargement depuis serveur local |

## Phases (ordonnées, valeur incrémentale)

- **B-1 — chemin CLI portable** : model embarqué + filtre packs + `audit`/`cost`/`behavior`
  terminal + skill mode audit. Testable dans un dossier conso scratch. *TDD strict (filtre) +
  souple (adapters).*
- **B-2 — studio livrable** : build single-file + serveur static-serve + studio server-fed +
  skill mode live. *Souple (serveur) + exploratoire (studio).*
- **B-3 — pipeline release** : `build-void-graph`, drift gate, dépôt dans `packages/core/graph/`,
  entrée `DECISIONS.md` (artefact buildé committé en git = entorse assumée, justifiée par
  zéro-npm + marketplace-ships-repo). *Souple + intégration.*

## Hors périmètre

- **C (viz coût studio)** : taille/couleur des nœuds par coût, panneau coût, ticking live du coût.
  Roule sur le studio livrable de B ; spec séparé.
- Publication npm : reste explicitement désactivée.
- Filtre skill-par-skill (granulaire) : le filtre B est coarse (niveau pack). YAGNI tant que les
  skills ne sont pas toggle-ables individuellement côté Claude Code.

## Critères de succès

1. Dans un projet consommateur (harness installé via marketplace, aucun accès au monorepo),
   `harness:void-graph audit` sort un rapport cost/behavior/dead-node sur les composants du
   harness réellement installés, corrélé à la télémétrie locale.
2. `harness:void-graph` (sans arg) lance un serveur local et ouvre le studio sur `localhost`, qui
   affiche le graphe du harness installé, offline, sans URL externe.
3. `void-graph.mjs` est un artefact unique, self-contained, déterministe (drift gate vert), shippé
   via la marketplace, sans dépendance workspace ni npm au runtime conso.
4. Le model conso ne contient que core + packs activés par ce consommateur.
