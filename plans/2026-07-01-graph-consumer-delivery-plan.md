---
title: graph consumer delivery (sub-project B)
date: 2026-07-01
status: done
spec: docs/specs/2026-07-01-graph-consumer-delivery.md
author: Folpe + Claude
high_risk: false
---

# Plan — graph consumer delivery (sub-project B)

## Goal

Rendre le graph tooling exécutable chez un consommateur du harness (pas seulement dans le
monorepo), livré par les assets de la marketplace, zéro npm. Le conso obtient d'un coup le
rapport d'audit terminal **et** le studio visuel live, 100% local, via une skill à modes
`harness:void-graph`. Le model est baked au release et filtré au runtime par les packs
activés. L'artefact est un seul `void-graph.mjs` self-contained (studio inliné) commité dans
`packages/core/graph/`.

## Slices

Quatre tranches verticales, chacune démontrable seule :
1. Chemin d'audit portable (steps 1-3) — l'analyse tourne sur un model embarqué + télémétrie conso.
2. Bundle CLI standalone (step 4) — un `.mjs` autonome qui produit l'audit.
3. Studio servi localement (steps 5-6) — serveur sert le studio + studio fetch la data en local.
4. Artefact complet + livraison (steps 7-9) — studio inliné, skill, pipeline release.

---

## Steps

### Step 1 — `filterByEnabledPacks` (kernel pur)

- **Goal**: fonction pure qui, donné un `GraphModel` + la liste des packs activés, retourne le
  model restreint à core + packs actifs.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: `pnpm -F @voidcorp/harness-graph test` vert (nouveaux cas) + `typecheck`.
- **Expected commits**:
  - `test(harness-graph): filterByEnabledPacks cases`
  - `feat(harness-graph): filterByEnabledPacks pure model filter`
- **Notes**: nouveau `packages/harness-graph/src/model/filter.ts`, exporté depuis `index.ts`.
  Cas table : core seul, core+1 pack, pack inconnu (ignoré), liste vide → core seul, `undefined`
  → model complet (fallback). Nœuds sans pack (core) toujours conservés. Filtre les edges dont
  une extrémité disparaît.

### Step 2 — `readEnabledPacks` (adapter CLI)

- **Goal**: lire `.claude/settings.json` en `cwd` et extraire les packs activés depuis
  `enabledPlugins`, tolérant à l'absence/format.
- **Depends on**: none
- **TDD mode**: souple
- **Verification gate**: `pnpm -F @voidcorp/harness test` vert (nouveau lib) + `typecheck`.
- **Expected commits**:
  - `test(cli): readEnabledPacks tolerant reader`
  - `feat(cli): readEnabledPacks from .claude/settings.json`
- **Notes**: `packages/cli/src/lib/enabled-packs.ts`. Mappe les entrées `enabledPlugins`
  (`voidcorp/harness-<pack>` ou équivalent) → noms de packs du model. Absent → `undefined`
  (déclenche le fallback model complet du step 1). Confirmer le format exact de `enabledPlugins`
  contre un settings.json réel (source-driven, pas de mémoire).

### Step 3 — Mode bundled dans `graph.ts`

- **Goal**: brancher le dispatch `graph` sur deux modes — monorepo (scan actuel) vs bundled
  (model embarqué fourni → skip scan, applique `filterByEnabledPacks(readEnabledPacks())`).
- **Depends on**: [step-1, step-2]
- **TDD mode**: souple
- **Verification gate**: test d'intégration — dans un tmpdir conso (model embarqué injecté +
  `.void/activations.jsonl` seedé), `audit`/`cost`/`behavior` produisent un rapport ; aucun accès
  `PKGS_ROOT`. `pnpm -F @voidcorp/harness test` vert.
- **Expected commits**:
  - `test(cli): bundled-mode graph dispatch against a scratch consumer dir`
  - `refactor(cli): split graph dispatch into monorepo vs bundled model source`
- **Notes**: le model embarqué est injecté via un point d'entrée paramétrable (constante au build,
  param en test). Le chemin monorepo reste inchangé (non-régression : `graph build`/`check` OK).

### Checkpoint A — après Step 3

Le chemin d'audit portable tourne end-to-end sur un model embarqué + télémétrie conso, sans
monorepo. Stop. `harness:verification-before-completion`. Attendre le signal utilisateur.

---

### Step 4 — `build-void-graph` (bundle CLI-only)

- **Goal**: script de build produisant `void-graph.mjs` self-contained (kernel + logique CLI +
  model.json complet embarqué), **sans studio pour l'instant**, via esbuild.
- **Depends on**: [step-3]
- **TDD mode**: souple
- **Verification gate**: intégration — build dans un tmpdir, `node void-graph.mjs audit` tourne
  standalone dans un dossier conso scratch ; re-build **byte-identique** (déterminisme). Le mjs
  n'a aucune dép workspace/npm au runtime.
- **Expected commits**:
  - `test(cli): void-graph bundle runs standalone + is deterministic`
  - `feat(cli): build-void-graph esbuild bundle (CLI-only, embedded model)`
- **Notes**: `packages/cli/scripts/build-void-graph.ts` (ou `packages/harness-graph`). Model
  embarqué = `graph build` puis inline en constante. Fixer les options esbuild pour un output
  déterministe (pas de timestamp/hash volatil).

### Step 5 — Serveur live sert le studio (`GET /`)

- **Goal**: étendre `graph-live-server.ts` pour servir un HTML (placeholder injectable) sur
  `GET /`, en gardant `/model.json`, `/history`, `/events`.
- **Depends on**: none
- **TDD mode**: souple
- **Verification gate**: test — `GET /` renvoie le HTML injecté (content-type OK), `/model.json`
  renvoie la data, headers CORS préservés. `pnpm -F @voidcorp/harness test` vert.
- **Expected commits**:
  - `test(cli): live server serves injected studio html on GET /`
  - `feat(cli): live server static-serves the studio bundle`
- **Notes**: le HTML servi est un paramètre (au step 7 ce sera le studio inliné ; en test un stub).
  Parallélisable avec steps 1-4.

### Step 6 — Studio en mode server-fed

- **Goal**: le studio fetch model + history depuis le serveur same-origin (`/model.json`,
  `/history`) au lieu des `src/generated/*.json` figés.
- **Depends on**: [step-5]
- **TDD mode**: souple + vérif exploratoire
- **Verification gate**: `apps/graph-studio` build OK ; servi via le serveur local, le studio
  charge le graphe depuis le serveur (vérif visuelle sur `localhost`). Le mode monorepo (generated
  JSON) reste dispo en dev.
- **Expected commits**:
  - `refactor(graph-studio): server-fed data source (fetch model/history same-origin)`
  - `test(graph-studio): load.ts selects server-fed vs generated source`
- **Notes**: `apps/graph-studio/src/data/load.ts`. Détection : si servi depuis un serveur live
  (origin non-file, `/model.json` dispo) → fetch ; sinon → generated (dev). Compose avec la couche
  live existante (`startLive`).

### Checkpoint B — après Step 6

Le studio se sert et se charge en local depuis le serveur, sur n'importe quel cwd. Stop.
`harness:verification-before-completion`. Attendre le signal utilisateur.

---

### Step 7 — Studio inliné dans l'artefact complet

- **Goal**: builder le studio en single-file (`vite-plugin-singlefile`), l'inliner dans
  `void-graph.mjs`, et faire que `void-graph.mjs live` serve ce studio + la data sur un port local.
- **Depends on**: [step-4, step-5, step-6]
- **TDD mode**: souple + intégration
- **Verification gate**: intégration — `node void-graph.mjs live` démarre le serveur, `GET /`
  renvoie le studio inliné, `/model.json` la data filtrée ; port occupé → incrément ; artefact
  toujours déterministe. Vérif visuelle : ouverture `localhost` affiche le graphe.
- **Expected commits**:
  - `test(cli): void-graph live serves inlined studio + filtered model`
  - `feat(cli): inline single-file studio into the void-graph bundle`
- **Notes**: `vite-plugin-singlefile` sur `apps/graph-studio` → un HTML autonome, inliné en string
  dans le bundle esbuild. Ouverture navigateur best-effort (impression de l'URL en fallback).

### Step 8 — Skill `harness:void-graph`

- **Goal**: skill à modes dans `packages/core/skills/` — sans arg → `live` (lance le bundle en
  background, ouvre `localhost`) ; `audit`/`cost`/`behavior` → rapport terminal.
- **Depends on**: [step-7]
- **TDD mode**: souple
- **Verification gate**: la skill invoque le bundle installé et produit l'audit / lance le studio
  dans un projet scratch simulant l'install plugin. `description` ≤ 200 chars. Lint skill CI vert.
- **Expected commits**:
  - `feat(core): harness:void-graph modal skill (audit + live)`
- **Notes**: résoudre le chemin d'install du plugin (`${CLAUDE_PLUGIN_ROOT}` ou équivalent) —
  **confirmer contre la doc Claude Code plugins** (source-driven-development), pas de mémoire.
  Ajouter `.source` + note d'audit si dérivé d'une source.

### Step 9 — Pipeline release + livraison

- **Goal**: câbler `build-void-graph` au release, commiter l'artefact dans `packages/core/graph/`,
  ajouter un drift gate CI, documenter la décision.
- **Depends on**: [step-7, step-8]
- **TDD mode**: souple + intégration
- **Verification gate**: drift gate CI (artefact committé == rebuild) vert ; `void-harness doctor`
  OK ; l'artefact est bien inclus dans les assets shippés par la marketplace (vérif du set core).
- **Expected commits**:
  - `feat(core): ship void-graph.mjs artifact + CI drift gate`
  - `docs(decisions): log committed build artifact in packages/core (zero-npm delivery)`
  - `docs(architecture): consumer graph delivery via plugin assets`
- **Notes**: entrée `docs/DECISIONS.md` (artefact buildé committé = entorse assumée, justifiée par
  zéro-npm + marketplace-fetch-repo). Mettre à jour `docs/ARCHITECTURE.md` (nouveau chemin de
  livraison) + `CLAUDE.md`/`AGENTS.md` en lockstep si une convention est ajoutée. Ne pas éditer les
  versions à la main (release-please).

---

## Review checkpoints

- **Checkpoint A** — après Step 3 (audit portable end-to-end).
- **Checkpoint B** — après Step 6 (studio servi en local).

## Done criteria (feeds verification-before-completion)

1. `harness:void-graph audit` dans un projet conso sort un rapport cost/behavior/dead-node sur les
   composants installés, corrélé à la télémétrie locale.
2. `harness:void-graph` sans arg ouvre le studio sur `localhost`, offline, sans URL externe.
3. `void-graph.mjs` unique, self-contained, déterministe (drift gate vert), shippé via marketplace,
   zéro dép workspace/npm au runtime.
4. Le model conso ne contient que core + packs activés.
5. Non-régression : chemin monorepo (`graph build`/`check`/`live`) inchangé, suite complète verte.

## Resume point

**Next step**: DONE — all 9 steps shipped on `feat/graph-consumer-delivery` (not pushed). Optional: push + PR when the user decides, like sub-project A.

**Completed**:
- ✅ Step 1 — filterByEnabledPacks kernel pur (commit `fa554ad`, 7 tests)
- ✅ Step 2 — readEnabledPacks depuis .claude/settings{,.local}.json (commit `43e17fc`, 10 tests)
- ✅ Step 3 — mode bundled graph.ts (resolveModel, commit `e2dba27`, 3 tests) → **Checkpoint A atteint**
- ✅ revue slice 1 — test d'intégration dispatch + guard version (commit `6f24e27`)
- ✅ Step 4 — build-void-graph esbuild bundle CLI-only (commit `e2cdaf8`, 2 tests, déterministe + standalone)
- ✅ Step 5 — serveur sert le studio GET / + port réel (commit `369fd1c`, 3 tests)
- ✅ Step 6 — studio server-fed via /studio-data.json (commit `64cd4b2`, studio 59 + cli 269 tests) → **Checkpoint B atteint** (vérif visuelle end-to-end en attente du bundle Step 7)

- ✅ Step 7 — studio single-file inliné dans le bundle (commit `4ad91e2`, smoke réel : GET / sert le studio, model filtré 102→68) + port-increment + vrai port
- ✅ Step 8 — command /void-graph (commit `33c67b3`, ${CLAUDE_PLUGIN_ROOT} inline-substitué, aligné void-doctor)
- ✅ Step 9 — artefact commité + drift gate check-bundle + DECISIONS/ARCHITECTURE (commit `8a29f91`, tous gates CI verts en local)

**Pending**: none — B complete.
