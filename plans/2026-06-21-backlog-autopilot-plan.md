---
title: backlog-autopilot — plan d'implémentation phasé
date: 2026-06-21
status: in-progress
spec: docs/specs/2026-06-21-backlog-autopilot.md
author: Florent Pellegrin + Claude
high_risk: true  # auto-merge sur branches protégées + automatisation git/PR/merge
---

## Goal

Consolider `backlog-batch` et `autonomous-backlog-loop` en une skill unique
`backlog-autopilot`, lancée **en session** (MCP/abonnement vivants), qui draine un pool
Linear sur plusieurs heures : auto-détection cluster vs batch-de-4, pipeline qualité
adaptatif par ticket, réconciliation en **une PR propre par ensemble logique**, gates
deux niveaux bloquants, boucle multi-cluster avec base `develop`/`main`, auto-merge
cascade sans conflit, état `.void/autopilot` + reprise crash + context-save final.
`autonomous-backlog-loop` (claude -p hors session) est **supprimé**. Livré en 4 phases,
chacune mergeable seule.

---

## Steps

### Step 1 — Supprimer `autonomous-backlog-loop` (skill + commande + CLI claude -p)

- **Goal**: retirer le `claude -p` hors-session et tout son code, sans laisser de référence orpheline.
- **Depends on**: none
- **TDD mode**: souple
- **Verification gate**: `pnpm test` vert ; `grep -rn "backlog-loop\|void-backlog-loop\|claude -p\|stream-json" packages docs` ne renvoie que des mentions historiques voulues (specs datées) ; pas d'import cassé (`pnpm -w build`).
- **Expected commits**:
  - `refactor(cli): remove claude -p orchestrator, stream and worker-prompt modules`
  - `chore(skills): delete autonomous-backlog-loop skill and /void-backlog-loop command`
- **Notes**: supprime `packages/cli/src/lib/backlog/{orchestrator,stream,prompt}.ts` + leurs `.test.ts` + `fixtures/iteration.stream.jsonl` ; supprime `packages/core/skills/autonomous-backlog-loop/` ; adapte `billing.ts` (l'env-strip claude -p devient inutile, on hérite de l'auth session → garder seulement `assertSubscription`). Retirer les références loop dans `CLAUDE.md` + `AGENTS.md` (même commit, hook `sync-agent-docs`).

### Step 2 — Renommer `backlog-batch` → `backlog-autopilot`

- **Goal**: la skill consolidée existe sous le nouveau nom et fait, à ce stade, exactement le batch-de-4 actuel.
- **Depends on**: [Step 1]
- **TDD mode**: souple
- **Verification gate**: `pnpm test` vert ; test de conformité skill (≤ 400 lignes, `description` ≤ 200 chars, frontmatter valide) ; hook `sync-agent-docs` vert ; `grep -rn "backlog-batch" packages docs` ne renvoie que les specs datées historiques.
- **Expected commits**:
  - `refactor(cli): rename backlog-batch command and lib to backlog-autopilot`
  - `refactor(skills): rename backlog-batch skill to backlog-autopilot`
  - `docs: reflect backlog-autopilot consolidation across CLAUDE/AGENTS/ARCHITECTURE/README`
- **Notes**: renomme `packages/core/skills/backlog-batch/` → `backlog-autopilot/` (skill + `workflows/*.workflow.js`) ; commande `/harness:backlog-batch` → `/harness:backlog-autopilot` ; CLI `backlog-batch` → `backlog-autopilot` ; met à jour `plans/skill-audits/` et les `.test.ts` référençant l'ancien nom.

### Step 3 — Journaliser les décisions de consolidation

- **Goal**: tracer les choix non-évidents dans `docs/DECISIONS.md` (meta-règle).
- **Depends on**: [Step 2]
- **TDD mode**: souple
- **Verification gate**: relecture ; `docs/DECISIONS.md` contient les 4 entrées datées 2026-06-21 ; pas de concept supprimé encore référencé ailleurs.
- **Expected commits**:
  - `docs(decisions): record backlog-autopilot consolidation, auto-detect, cascade, Opus-everywhere`
- **Notes**: entrées — (1) consolidation + suppression claude -p hors-session ; (2) auto-détection cluster vs batch-de-4 ; (3) auto-merge cascade sur PR stackées ; (4) Opus partout (dérogation justifiée à `llm-cost-discipline`).

### Checkpoint A — après Step 3 (fin P1)

P1 livre un `backlog-autopilot` iso-fonctionnel au batch actuel, loop supprimé.
Stop. Lancer `harness:verification-before-completion`. Attendre le signal pour P2.

---

### Step 4 — Détection de cluster (logique pure)

- **Goal**: à partir des tickets + graphe Linear (dépendances/blocages/parenté/labels), produire les clusters logiques + le reliquat indépendant.
- **Depends on**: [Step 2]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur `cluster-detect.test.ts` ; mutation score ≥ 90 % sur le module ; cas couverts : graphe vide → batch-de-4, composante connexe → cluster, signaux contradictoires → priorité graphe > parenté > label > sémantique.
- **Expected commits**:
  - `test(cli): cluster-detect grouping by dependency graph`
  - `feat(cli): cluster-detect pure grouping of a Linear pool`
- **Notes**: `packages/cli/src/lib/backlog/cluster-detect.ts`, helper pur (pas d'I/O). La proximité sémantique des titres n'est qu'un signal d'appoint, jamais seule pour fusionner (risque faux ensembles).

### Step 5 — Ordonnancement topologique + partition worktree-conditionnelle

- **Goal**: dans un cluster, trier topologiquement et marquer parallèle (worktree) vs séquentiel (branche cluster, sans worktree) ; lockfile/migrations toujours séquentiels.
- **Depends on**: [Step 4]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur `cluster-order.test.ts` ; cas : chaîne de dépendances → tout séquentiel sans worktree, feuilles disjointes → parallèle avec worktree, cycle détecté → erreur explicite.
- **Expected commits**:
  - `test(cli): topological order and worktree-conditional partition`
  - `feat(cli): cluster-order with worktree-only-when-parallel partition`
- **Notes**: étend/compose `batch-partition.ts`. Le flag `needsWorktree` est calculé ici et consommé par le Workflow.

### Step 6 — Cluster engine dans le Workflow déterministe

- **Goal**: le Workflow accepte des clusters, exécute l'ordre topo (parallèle worktree / séquentiel branche), réconcilie, produit une PR par cluster.
- **Depends on**: [Step 5]
- **TDD mode**: souple
- **Verification gate**: tests d'intégration du Workflow sur fixtures (verts/rouges, parallèle/séquentiel) ; pas de run live sur void-harness (pollue les worktrees du harness — décision 2026-06-18 ; dogfood en projet consommateur).
- **Expected commits**:
  - `test(skills): cluster engine workflow over mixed fixtures`
  - `feat(skills): cluster engine — topo execution + reconcile + one PR per cluster`
- **Notes**: étend `workflows/backlog-autopilot.workflow.js`. `agent(..., {isolation:'worktree'})` seulement si `needsWorktree`.

### Step 7 — Launcher : auto-détection du mode + confirmation

- **Goal**: la commande CLI `plan` renvoie clusters OU batch-de-4 ; le launcher confirme (sauf `--auto-merge`) puis invoque le Workflow.
- **Depends on**: [Step 6]
- **TDD mode**: souple
- **Verification gate**: `vitest run` sur la commande `backlog-autopilot plan` (sortie JSON clusters+batch) ; snapshot du contrat d'`args` passé au Workflow.
- **Expected commits**:
  - `test(cli): autopilot plan emits clusters or batch-of-4`
  - `feat(cli): autopilot launcher wires auto-detect to the workflow`
- **Notes**: réutilise `batch-plan.ts` + `cluster-detect.ts`.

### Checkpoint B — après Step 7 (fin P2)

P2 livre le clustering + l'exécution séquentiel/mix avec worktree conditionnel.
Stop. `harness:verification-before-completion`. Attendre le signal pour P3.

---

### Step 8 — Triage adaptatif du ticket

- **Goal**: classer chaque ticket trivial / standard / ambigu-risqué d'après des signaux explicites.
- **Depends on**: [Step 6]
- **TDD mode**: souple
- **Verification gate**: revue du prompt worker ; cas documentés (rename → trivial, feature UI → standard, migration → risqué) ; skill ≤ 400 lignes.
- **Expected commits**:
  - `feat(skills): adaptive ticket triage in the worker pipeline`
- **Notes**: signaux — complétude description, critères d'acceptation, footprint fichiers, touche-UI, risque (migration/lockfile/sécurité/boundary).

### Step 9 — Pipeline qualité par ticket (brainstorm autonome → plan → TDD → UX → review niv.1)

- **Goal**: encoder le cycle adaptatif dans le worker, brainstorm autonome au bar top-5 % avec journal de décisions.
- **Depends on**: [Step 8]
- **TDD mode**: souple
- **Verification gate**: revue ; le worker écrit `decisions.md` (choix + alternatives rejetées) ; passe UX statique (`frontend-design` + `accessibility-first`) déclenchée seulement si touche-UI ; review niveau 1 présente ; worker reste commit-only.
- **Expected commits**:
  - `feat(skills): adaptive per-ticket quality cycle with autonomous top-5% brainstorm`
- **Notes**: TDD mode du worker auto par chemin (skill `tdd`). QA navigateur live = opt-in (drapeau), pas par défaut.

### Step 10 — Review deux niveaux bornée + red-handling adaptatif

- **Goal**: review cluster (niveau 2) `/harness:code-review` avec boucle review→fix bornée à K passes ; exclusion adaptative du ticket rouge.
- **Depends on**: [Step 9]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur `red-handling.test.ts` ; cas : rouge feuille → exclu seul, rouge avec descendance → exclu + descendance, rouge racine → cluster bloqué sans PR ; convergence review bornée testée sur fixture.
- **Expected commits**:
  - `test(cli): adaptive red-ticket exclusion by dependency descendance`
  - `feat(cli): red-handling exclusion + bounded two-level review loop`
- **Notes**: la logique d'exclusion (rouge + descendance, blocage si racine) est pure → `red-handling.ts`. La boucle K-passes est câblée dans le Workflow.

### Checkpoint C — après Step 10 (fin P3)

P3 livre le pipeline qualité adaptatif + gates deux niveaux + red-handling.
Stop. `harness:verification-before-completion`. Attendre le signal pour P4.

---

### Step 11 — Détection base + calcul de branche par cluster

- **Goal**: base = `develop` si présent sinon `main` ; chaque cluster branche depuis la base, ou depuis la branche d'une PR non mergée dont il dépend (stack).
- **Depends on**: [Step 7]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur `base-detect.test.ts` + `branch-base.test.ts` ; cas : develop existe → base develop, cluster indépendant → base, cluster dépendant d'une PR ouverte → branche stackée.
- **Expected commits**:
  - `test(cli): base detection and per-cluster branch base computation`
  - `feat(cli): develop/main base detection + stacked branch base`
- **Notes**: helpers purs ; l'exécution git reste dans l'adaptateur.

### Step 12 — PR stackées + auto-merge cascade (RISQUE #1)

- **Goal**: poser les PR (stackées si besoin), `gh pr merge --auto --squash`, et au merge d'une base : retarget + rebase déterministe des PR enfants, sans conflit.
- **Depends on**: [Step 11]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur l'arg-construction (`integrate.test.ts` étendu : pushArgs/prCreateArgs/mergeArgs/**retargetArgs**/**rebaseArgs**) ; mutation ≥ 90 % ; plan d'intégration documenté pour le test live en projet consommateur (jamais sur void-harness).
- **Expected commits**:
  - `test(cli): stacked PR retarget + cascade rebase arg construction`
  - `feat(cli): auto-merge cascade with deterministic retarget and rebase`
- **Notes**: c'est le point le plus délicat. Construction d'args pure et testable ; l'exécution `git`/`gh` est wrappée. Préflight : protection de branche serveur sur la base sinon refus.

### Step 13 — État machine `.void/autopilot` + reprise crash

- **Goal**: persister `state.json` / `decisions.md` / `pr/<cluster>.md` ; reprendre au curseur après crash.
- **Depends on**: [Step 11]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur la sérialisation (`run-state.test.ts`) + test de reprise (écrire l'état, simuler redémarrage, continuer au bon curseur).
- **Expected commits**:
  - `test(cli): autopilot run-state serialization and crash resume`
  - `feat(cli): durable .void/autopilot run state with resume cursor`
- **Notes**: sérialisation pure ; couche fs en adaptateur mince.

### Step 14 — Boucle launcher multi-cluster + récap + context-save final

- **Goal**: L0 boucle sur les clusters via l'état, émet le récap dense et invoque `/context-save` en fin de run.
- **Depends on**: [Step 12, Step 13, Step 10]
- **TDD mode**: souple
- **Verification gate**: `vitest run` sur `summary.test.ts` étendu (clusters faits / PR ouvertes-mergées / bloqués+raisons / journal décisions) ; revue du flux launcher.
- **Expected commits**:
  - `test(cli): multi-cluster run summary`
  - `feat(cli): autopilot multi-cluster loop + final context-save handoff`
- **Notes**: orchestrateur mince (jamais de lecture de fichiers d'impl) ; le récap pointe vers `decisions.md` pour le réajustement a posteriori.

### Checkpoint final — après Step 14 (fin P4)

Run complet `harness:verification-before-completion` (12 points). Dogfood live en projet
consommateur recommandé avant de considérer la skill « done ».

---

## Review checkpoints

- **Checkpoint A** — après Step 3 (fin P1, consolidation).
- **Checkpoint B** — après Step 7 (fin P2, clustering).
- **Checkpoint C** — après Step 10 (fin P3, pipeline qualité).
- **Checkpoint final** — après Step 14 (fin P4, autonomie longue).

## High-risk

`high_risk: true`. Recommandation : lancer `gstack:/autoplan` sur ce plan avant exécution
(auto-merge sur branches protégées + automatisation git/PR/merge = surface sensible).

## Resume point

**Next step**: Step 1 (Supprimer autonomous-backlog-loop)

**Completed**: —

**Pending**:
- ⏳ Step 1 — Supprimer autonomous-backlog-loop
- ⏳ Step 2 — Renommer backlog-batch → backlog-autopilot
- ⏳ Step 3 — Journaliser les décisions
- ⏳ Step 4 — Détection de cluster
- ⏳ Step 5 — Ordonnancement topologique + partition worktree
- ⏳ Step 6 — Cluster engine Workflow
- ⏳ Step 7 — Launcher auto-détection
- ⏳ Step 8 — Triage adaptatif
- ⏳ Step 9 — Pipeline qualité par ticket
- ⏳ Step 10 — Review deux niveaux + red-handling
- ⏳ Step 11 — Détection base + branche par cluster
- ⏳ Step 12 — PR stackées + auto-merge cascade (risque #1)
- ⏳ Step 13 — État machine + reprise crash
- ⏳ Step 14 — Boucle launcher + context-save final
