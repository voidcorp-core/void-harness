---
title: backlog-batch attended parallel drain
date: 2026-06-18
status: done
spec: docs/specs/2026-06-18-backlog-batch-parallel.md
author: Florent Pellegrin + Claude
high_risk: false
---

## Goal

Construire `backlog-batch` : le mode **attended parallèle** complémentaire de
`autonomous-backlog-loop`. Un **launcher in-session** sélectionne des tickets Linear
éligibles indépendants, estime leur empreinte fichiers (passe LLM légère), partitionne en
**parallèle (faible risque) / séquentiel (chevauchement, lockfile, migrations)**, et — après
confirmation humaine — lance un **Workflow déterministe** qui exécute chaque ticket dans
son **worktree** via un subagent (cycle craftsman, green-or-blocked), puis **réconcilie**
les branches vertes en **une PR d'intégration** dont la **suite complète** est le juge.

Répartition de testabilité (load-bearing) :
- **CLI/TS (vitest, strict)** : sélection des indépendants + partition risque→∥/séquentiel,
  exposées par `void-harness backlog-batch plan` (entrée = données ticket + estimations en
  JSON, sortie = plan JSON). Le CLI n'a pas le MCP : il calcule, il ne récupère pas.
- **In-session (skill/agent)** : récupération Linear (MCP), estimateur (subagent),
  confirmation, invocation du Workflow.
- **Workflow (JS auto-contenu, pas d'import)** : exécute le plan reçu en `args` ; fan-out
  worktree + réconciliation. Validé par smoke runs, pas par vitest.

**Dépendance externe** : ce mode requiert l'outil **Workflow** (orchestration multi-agents
déterministe) disponible et opt-in dans la session Claude Code. Le launcher est le
déclencheur explicite.

Tranches verticales : on amène le **spine Workflow→worktree→PR** dès le Step 1 (le risque
d'intégration le plus élevé), puis on ajoute la planification déterministe, l'estimateur,
le launcher, et la réconciliation.

---

## Steps

### Step 1 — Workflow spine (thin e2e : fan-out → intégration → PR)

- **Goal**: un script Workflow qui prend un plan codé en dur (`parallel:[T1,T2]`), lance 2 subagents worktree triviaux, merge les branches sur `integration/<batch>`, ouvre 1 PR.
- **Depends on**: none
- **TDD mode**: souple (orchestration ; pas de surface vitest)
- **Verification gate**: syntaxe valide (`node --check`) + revue structurelle de l'orchestration. **Le smoke live multi-agents est différé** : `isolation:"worktree"` cible le repo courant, donc un vrai run ici polluerait void-harness (worktrees, branche d'intégration, PR). Le seam Workflow→worktree→PR sera exercé en **dogfood dans un projet consommateur** (décision 2026-06-18, option A).
- **Expected commits**:
  - `feat: backlog-batch workflow spine (parallel worktree fan-out to integration PR)`
- **Notes**: pure orchestration ; pas de logique testable ici. Réordonné : on construit d'abord les couches déterministes (Steps 2-4) qui portent la confiance bon marché.

### Checkpoint A — DIFFÉRÉ en dogfood

Le smoke live (2 subagents worktree → PR) se fait dans un vrai projet consommateur, pas sur void-harness. Reporté hors de la séquence d'implémentation locale.

### Step 2 — Partition (pure, CLI)

- **Goal**: `partition(estimates, opts)` → groupe ∥ (chevauchement faible) + queue séquentielle ; règles haut-risque (lockfile, migrations → séquentiel).
- **Depends on**: none (parallélisable avec Step 1)
- **TDD mode**: strict
- **Verification gate**: `pnpm test` vert, table-driven : disjoints → ∥ ; chevauchement → séquentiel ordonné ; lockfile/migration → séquentiel même si empreinte disjointe.
- **Expected commits**:
  - `test: backlog-batch overlap partition into parallel/sequential`
  - `feat: backlog-batch risk-aware partition`
- **Notes**: graphe de chevauchement = pure ; pas d'I/O.

### Step 3 — Sélection des indépendants (pure, CLI)

- **Goal**: `selectIndependent(tickets, k)` → top-K éligibles, non bloqués, sans lien de dépendance mutuel.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: `pnpm test` vert : exclut les bloqués/inter-dépendants, respecte priorité puis ordre de board, cap à k.
- **Expected commits**:
  - `test: backlog-batch independent-ticket selection`
  - `feat: backlog-batch eligible independent selection`
- **Notes**: entrée = données ticket déjà récupérées (le MCP est in-session, pas ici).

### Step 4 — Commande `void-harness backlog-batch plan`

- **Goal**: wirer sélection + partition : entrée JSON (tickets + estimations) → sortie plan JSON (groupes ∥ ordonnés + queue séquentielle) ; `--help`.
- **Depends on**: [step-2, step-3]
- **TDD mode**: strict (transform) / souple (glue CLI)
- **Verification gate**: `pnpm test` vert ; `void-harness backlog-batch plan` sur une fixture JSON → plan attendu.
- **Expected commits**:
  - `test: backlog-batch plan command transform`
  - `feat: backlog-batch plan subcommand`
- **Notes**: surface déterministe que le launcher appellera avec les données qu'il a réunies.

### Step 5 — Estimateur d'empreinte (subagent)

- **Goal**: un agent estimateur : ticket → aires/fichiers probables + confiance (sortie structurée).
- **Depends on**: none
- **TDD mode**: souple
- **Verification gate**: sur 2 tickets d'exemple, retourne une empreinte structurée exploitable par `plan` ; confiance basse → routage prudent (séquentiel).
- **Expected commits**:
  - `feat: backlog-batch footprint estimator agent`
- **Notes**: passe LLM **légère** (modèle bon marché possible) ; alimente la partition.

### Step 6 — Launcher skill + commande + gate de confirmation

- **Goal**: `backlog-batch` skill + `/harness:backlog-batch` : Linear (MCP) → estimateur → `plan` → rendu du plan → **confirmation humaine** → invoque le Workflow avec le plan confirmé.
- **Depends on**: [step-1, step-4, step-5]
- **TDD mode**: souple
- **Verification gate**: depuis des données Linear d'exemple, affiche le plan ∥/séquentiel et s'arrête au gate de confirmation **sans** lancer le Workflow (équiv. dry-run) ; `--tickets` force une liste explicite.
- **Expected commits**:
  - `feat: backlog-batch launcher skill + command with confirmation gate`
- **Notes**: la confirmation est strictement entre scout (in-session) et Workflow (déterministe). Le worker s'appuie sur des **skills** (brainstorming/tdd), pas des sous-sous-agents (plafond d'imbrication).

### Checkpoint B — après Step 6

Flux attended complet visible (sélection → estimation → partition → confirmation → fan-out → PR), réconciliation encore basique. Stop et revue avant la couche conflits.

### Step 7 — Réconciliation : subagent conflits + gate suite + exclusion des bloqués

- **Goal**: dans le Workflow, merger les branches **vertes** sur l'intégration ; sur conflit, un **subagent de réconciliation** résout ; **suite complète** = juge (vert → PR ; rouge → batch bloqué + évidence). Tickets bloqués (verify rouge) exclus, rapportés à part.
- **Depends on**: [step-1, step-6]
- **TDD mode**: souple
- **Verification gate**: smoke run avec (a) un conflit injecté → réconcilié + suite verte → PR ; (b) un worker bloqué → exclu de l'intégration, présent dans le résumé ; (c) suite rouge après merge → batch BLOQUÉ, pas de PR.
- **Expected commits**:
  - `feat: backlog-batch reconciliation subagent + full-suite gate`
  - `feat: backlog-batch exclude blocked tickets from integration`
- **Notes**: la suite tourne sur la branche d'intégration (séquentielle → pas de collision ports/DB). Cap de concurrence par défaut 3.

### Step 8 — Skill, frontière, docs & sync

- **Goal**: SKILL.md `backlog-batch` (+ `.source`, audit), tableau de **frontière** vs `autonomous-backlog-loop` dans les deux SKILL.md, entrée `DECISIONS.md`, sync `CLAUDE.md`/`AGENTS.md`, MAJ help CLI.
- **Depends on**: [step-7]
- **TDD mode**: souple
- **Verification gate**: `pnpm test` vert ; `pnpm version:check` ; `sync:docs` (parité) ; `anti-bloat:check` (SKILL ≤ 400, pas d'overlap > 30 % — frontière nette) ; `void-harness doctor`.
- **Expected commits**:
  - `feat: /harness:backlog-batch command`
  - `docs: backlog-batch skill, sister-boundary, DECISIONS, CLAUDE/AGENTS sync`
- **Notes**: vérifier explicitement le recouvrement < 30 % avec `autonomous-backlog-loop` (libs de sélection/worker partagées, doctrine distincte).

---

## Review checkpoints

- **Checkpoint A — après Step 1** : le spine Workflow→worktree→PR fonctionne.
- **Checkpoint B — après Step 6** : flux attended complet (hors polish réconciliation).

---

## Resume point

**Next step**: — implémentation locale terminée. Reste : **dogfood live** dans un projet consommateur (Checkpoint A différé).

**Completed**:
- ✅ Step 1: Workflow spine authored — live smoke deferred (Checkpoint A)
- ✅ Step 2: Partition pure
- ✅ Step 3: Sélection indépendants pure
- ✅ Step 4: Commande `backlog-batch plan`
- ✅ Step 5: Estimateur d'empreinte (prompt dans la skill launcher)
- ✅ Step 6: Launcher skill + `/harness:backlog-batch` + gate confirmation
- ✅ Step 7: Réconciliation (couverte par le spine : conflits + gate suite + exclusion bloqués)
- ✅ Step 8: Skill frontière, .source, audit, matrice, DECISIONS, CLAUDE/AGENTS sync, help, core-assets

**Pending**: dogfood live multi-agents dans un vrai projet consommateur (worktrees + PR sur le repo cible, pas sur void-harness).
