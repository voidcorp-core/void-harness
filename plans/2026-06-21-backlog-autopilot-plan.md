---
title: backlog-autopilot — plan d'implémentation phasé
date: 2026-06-21
status: executing
spec: docs/specs/2026-06-21-backlog-autopilot.md
author: Florent Pellegrin + Claude
high_risk: true  # auto-merge sur branches protégées + automatisation git/PR/merge
autoplan: APPROVED 2026-06-21 (CEO+Eng+DX dual-voice; M1-M8 appliquées; UC1/UC2/T2 retenues, T1 conservé)
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
  - `refactor(cli): remove claude -p orchestrator and worker-prompt modules`
  - `chore(skills): delete autonomous-backlog-loop skill and /void-backlog-loop command`
- **Notes**: supprime `packages/cli/src/lib/backlog/{orchestrator,prompt}.ts` + leurs `.test.ts` ; supprime `packages/core/skills/autonomous-backlog-loop/` ; adapte `billing.ts` (l'env-strip claude -p devient inutile, on hérite de l'auth session → garder seulement `assertSubscription`). Retirer les références loop dans `CLAUDE.md` + `AGENTS.md` (même commit, hook `sync-agent-docs`). **T1** : suppression franche, **pas de stub** (choix opérateur assumé, outil interne).
  - **M6 — NE PAS supprimer sèchement `stream.ts`** : il porte un protocole d'événements **machine-readable** (`VOID_EVENT: PHASE/DECISION/BRANCH`) qui alimente le flux live. **Porter** ce protocole dans le nouveau système (sortie worker structurée) avant de retirer le code claude -p. C'est aussi le **contrat machine-readable** consommé par l'orchestrateur (cf. Step 14).
  - **UC1 — backend headless différé** : la suppression vise le vieux `claude -p` hors-session. Inscrire dans le spec un **mode headless futur** de `backlog-autopilot` (même skill, même contrat worker) pour ne pas jeter la capacité walk-away/cron — différé, non implémenté ici.

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
- **Verification gate**: `vitest run` sur `cluster-detect.test.ts` ; mutation score ≥ 90 % ; cas couverts : graphe vide → batch-de-4, composante connexe → cluster, **edge de graphe SANS overlap de footprint → reste un batch (pas fusionné)**, **cluster > cap → split**, signaux contradictoires → priorité graphe > parenté > label > sémantique.
- **Expected commits**:
  - `test(cli): cluster-detect grouping gated by file-footprint overlap`
  - `feat(cli): cluster-detect with footprint corroboration, size cap and confidence`
- **Notes (M4)**: `packages/cli/src/lib/backlog/cluster-detect.ts`, helper pur. **Un lien de graphe ne suffit pas à fusionner** : exiger un **overlap de footprint fichiers** corroborant (réutilise le signal de `batch-partition.ts`) — un epic Linear peut relier du travail non couplé. Ajouter : **cap de taille de cluster**, **score de confiance**, **règle de split** post-estimation. La proximité sémantique n'est qu'un appoint, jamais seule.

### Step 5 — Ordonnancement topologique + partition worktree-conditionnelle

- **Goal**: dans un cluster, trier topologiquement et choisir l'isolation : **un worktree de cluster en séquentiel**, **un worktree par ticket en parallèle** ; lockfile/migrations toujours séquentiels.
- **Depends on**: [Step 4, Step 11]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur `cluster-order.test.ts` ; cas : chaîne de dépendances → séquentiel **dans un worktree de cluster**, feuilles disjointes → parallèle **un worktree par ticket**, cycle détecté → erreur explicite.
- **Expected commits**:
  - `test(cli): topological order and worktree isolation policy`
  - `feat(cli): cluster-order with cluster-worktree (seq) / per-ticket-worktree (parallel)`
- **Notes (T2)**: étend/compose `batch-partition.ts`. **Correction post-autoplan** : « pas de worktree si séquentiel » régressait la sûreté (crash/dirty-state). Politique retenue : **toujours un worktree** — un seul pour tout le cluster séquentiel, un par ticket en parallèle. Le contrat d'isolation est gelé **avec** la base/branche du Step 11 (dépendance ajoutée pour éviter le mismatch de contrat P2/P4 signalé en revue).

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

- **Goal**: contrat de commande **concret** + auto-détection : `plan` renvoie clusters OU batch-de-4 ; le launcher montre un **preview** (clusters, forme du stack, base, tickets, comportement de merge) et confirme avant d'invoquer le Workflow ; `--dry-run` par **défaut** au premier contact.
- **Depends on**: [Step 6]
- **TDD mode**: souple
- **Verification gate**: `vitest run` sur la commande `backlog-autopilot plan` + tests de **précédence/validation des flags** + tests des sous-commandes opérateur ; snapshot du contrat d'`args` passé au Workflow.
- **Expected commits**:
  - `test(cli): autopilot command contract, flag precedence, operator subcommands`
  - `feat(cli): autopilot launcher with concrete CLI contract and dry-run preview`
- **Notes (M6 + M8)**:
  - **Contrat de commande explicite** : sources de pool (`--project`/`--milestone`/`--label`/`--cycle`/IDs manuels), `--auto-merge`, `--dry-run` (défaut). Exemples documentés, règles de précédence et de validation.
  - **Sous-commandes opérateur** : `status <runId>`, `resume <runId>`, `explain-blocked <runId>`, `abort <runId>`. Schéma de rapport « blocked » : ticket, cause, preuve, branches préservées, action humaine, commande de resume sûre.
  - **M8** : aligner le défaut batch à **4** (le code actuel `batch-plan.ts:8` est à `k=3`).
  - Réutilise `batch-plan.ts` + `cluster-detect.ts`.

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
- **Notes**: helpers purs ; l'exécution git reste dans l'adaptateur. **Sequencing (revue)** : le *contrat* base/branche-base (read-only : develop existe-t-il, quelle base, stack ou non) est **spiké tôt, en P2**, avant que Step 6 ne gèle les `args` du Workflow — son implémentation complète (avec stacking réel) reste ici en P4, mais le contrat ne doit pas être découvert après coup.

### Step 12 — Merge stacké séquentiel + auto-merge risk-gated (RISQUE #1, redessiné post-autoplan)

- **Goal**: poser les PR (stackées si besoin) et gérer le merge **sans jamais promettre « cascade déterministe sans conflit »** : tenter, **classifier** l'état, bloquer proprement.
- **Depends on**: [Step 11]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur la **machine d'états** (classifier conflit/stale/protection/CI/merge-queue) + tests d'intégration contre un **dépôt git éphémère** (bare remote local), PAS des snapshots d'args ; mutation ≥ 90 %.
- **Expected commits**:
  - `test(cli): stacked-merge state machine over an ephemeral git remote`
  - `feat(cli): sequential stacked merge with state classification and safe block`
- **Notes (M1 + M2 + UC2)**:
  - **Pas de cascade parallèle sur stacks squash-mergées.** `--squash` change le SHA du parent → rebase enfant en conflit ; GitHub ne re-targete pas sans suppression de branche. Donc : merge **strictement séquentiel** — attendre le parent **complètement mergé**, rebaser le **seul** enfant suivant, **gate humain sur conflit** (jamais de résolution LLM silencieuse).
  - **Auto-merge risk-gated (UC2)** : `--auto-merge` n'arme `gh pr merge --auto --squash` vers `develop`/`main` que pour un cluster **low-risk** (petit diff, hors UI/sécurité/migration, chemins possédés, pas une racine de stack). Cluster risqué ou racine de stack → **PR posée, merge humain**.
  - **M2** : sous `--auto-merge`, une protection de branche **inconnue** (403/offline/ambigu) est **FATALE**, pas un warning.
  - L'exécution `git`/`gh` reste wrappée derrière des helpers ; la machine d'états est la partie testée.

### Step 13 — État machine `.void/autopilot` + reprise crash

- **Goal**: persister `state.json` / `decisions.md` / `pr/<cluster>.md` ; reprendre au curseur après crash.
- **Depends on**: [Step 11]
- **TDD mode**: strict
- **Verification gate**: `vitest run` sur la sérialisation + **test de torn-write** (état écrit après push, avant ouverture PR ; après PR, avant arming merge) + test de **réconciliation distante** (l'état diverge de la réalité → on requête `gh pr list`/SHA et on corrige, sans double-push ni double-PR).
- **Expected commits**:
  - `test(cli): autopilot run-state atomic write and remote reconciliation on resume`
  - `feat(cli): durable run state with atomic writes and reality reconciliation`
- **Notes (M3)**: **écritures atomiques** (temp + rename). L'état persiste/réconcilie l'**état distant** (branch SHA, PR number, base, auto-merge armé, checks, tentatives de rebase, état de conflit), pas juste le curseur local. À la reprise on **réconcilie contre la réalité** (`gh pr list`), on ne **rejoue pas** le curseur — chaque action externe est idempotente.

### Step 14 — Boucle launcher multi-cluster + récap + context-save final

- **Goal**: L0 boucle sur les clusters via l'état, **reste réellement mince** (compaction explicite entre clusters), applique le **circuit breaker** de budget, émet le récap et invoque `/context-save` en fin de run.
- **Depends on**: [Step 12, Step 13, Step 10]
- **TDD mode**: souple
- **Verification gate**: `vitest run` sur `summary.test.ts` étendu + test du **circuit breaker** (cap tokens/rate-limit/temps atteint → arrêt propre, état préservé, récap partiel) + test du **contrat worker** (sortie non conforme au schéma → rejet, pas d'accrétion de contexte).
- **Expected commits**:
  - `test(cli): worker-output contract, budget circuit breaker, run summary`
  - `feat(cli): autopilot thin loop with compaction, budget breaker and context-save`
- **Notes (M5 + M7)**:
  - **M5 — orchestrateur réellement mince** : entre deux clusters, **re-lire `state.json` et repartir en jetant les tours précédents** (compaction explicite, pas seulement « ne pas lire les fichiers d'impl »). Les sorties worker suivent un **schéma machine-readable** (le protocole `VOID_EVENT` porté du Step 1) ; tout ce qui n'y est pas conforme est rejeté.
  - **M7 — circuit breaker** : cap configurable tokens / rate-limit / temps de run ; à l'atteinte, arrêt propre + état préservé + récap partiel (évite de verrouiller la session humaine à mi-journée).
  - Le récap pointe vers `decisions.md` pour le réajustement a posteriori.

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

**Next step**: Checkpoint A (revue utilisateur de P1) → puis Step 4 (Détection de cluster)

**Completed (P1 — consolidation)**:
- ✅ Step 1 — Supprimer autonomous-backlog-loop (commit `1901539`) ; protocole `VOID_EVENT` extrait dans `events.ts` ; suite 290 verte. Déviation : `summary.ts`/`wizard.ts` supprimés (loop-shaped), reconstruits en P2/P4.
- ✅ Step 2 — Rename backlog-batch → backlog-autopilot (commit `7c5365d` ; skill + commande + CLI + workflow + core-assets régénéré + docs CLAUDE/AGENTS unifiés + skill-audit + decision-matrix). Suite 290 verte, anti-bloat + parité OK.
- ✅ Step 3 — DECISIONS.md : 2 entrées 2026-06-21 (consolidation + orchestrateur hybride + auto-détection + Opus ; auto-merge risk-gated séquentiel post-autoplan).

**P1 livré (Checkpoint A franchi, revue OK — "on continue").**

**En cours (P2 — clustering)**:
- ✅ Step 4 — `cluster-detect.ts` : détection de clusters gatée par overlap de footprint (M4), cap + split par retrait de tier faible, flag `oversized`. 13 tests, suite 302 verte, tsc clean. (Mutation : Stryker non installé dans le repo → passe mutation manuelle.)

**Pending**:
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

---

## GSTACK REVIEW REPORT

Pipeline `/autoplan` : CEO → Eng → DX (Design skippé, pas d'UI propre). Doubles voix
Claude (sous-agent indépendant) + Codex à chaque phase. Base GitHub `main`, mode solo.

### Consensus CEO (strategy)

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Prémisses valides ? | NON (throughput n'est pas le goulot ; « claude -p sans MCP » non prouvé) | NON (suppression headless prématurée) | **DISAGREE → user challenge** |
| Bon problème ? | Reframe : la bande passante de revue est le vrai goulot | Partiel | CONFIRMED (reframe) |
| Scope calibré ? | Sur-dimensionné (14 steps) | Sur-dimensionné (cascade avant la demande) | **CONFIRMED** |
| Alternatives explorées ? | NON (option 3 auto-justifiée ; « réparer le loop » non chiffré) | NON | **CONFIRMED** |
| Risque 6 mois ? | Suppression headless + auto-merge large + pas de circuit breaker | Idem + mega-skill | **CONFIRMED** |

### Consensus Eng (architecture)

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Architecture saine ? | Orchestrateur « mince » non capé (context rot quand même) | Aspiration, pas archi : besoin d'un contrat machine-readable | **CONFIRMED** |
| Tests suffisants ? | NON (arg snapshots ≠ convergence cascade) | NON (simulateur/repo éphémère requis) | **CONFIRMED** |
| Sécurité ? | — | Protection inconnue doit être FATALE sous `--auto-merge` | **CONFIRMED** |
| Chemins d'erreur ? | Crash-resume ne réconcilie pas l'état distant | Idem (SHA/PR/base/checks) | **CONFIRMED** |
| Risque de déploiement ? | **Step 12 cascade = falsehood porteur, descope** | **Step 12 non déterministe, classifier+bloquer** | **CONFIRMED — CRITIQUE** |
| Détection cluster ? | Sur-groupe ; exiger overlap de footprint | Sur-groupe ; cap taille + confidence + split | **CONFIRMED** |

### Consensus DX (operator)

| Dimension | Claude | Codex | Consensus |
|---|---|---|---|
| Démarrage < 5 min ? | Pas de contrat de commande concret | Idem ; quickstart + `--dry-run` défaut | **CONFIRMED** |
| Flags devinables ? | Précédence/validation absentes | Idem | **CONFIRMED** |
| Erreurs actionnables ? | Rapport « blocked » sans schéma | Schéma : ticket/cause/preuve/branches/action/resume | **CONFIRMED** |
| Observabilité ? | **Step 1 supprime le protocole `VOID_EVENT` (stream.ts) sans remplacement** | Sous-commandes status/resume/explain-blocked/abort manquantes | **CONFIRMED** |
| Upgrade sûr ? | Migration : pas d'alias = users échoués | Stub 1-2 releases pointant la commande de remplacement | **CONFIRMED → taste** |

### Thème cross-phase (signal haute confiance)

1. **Step 12 auto-merge cascade** — flaggé en Eng (critique), CEO (risque stratégique), DX
   (flag dangereux sans preview). Le `reconcile` actuel est un **subagent LLM**, donc la
   promesse « déterministe sans conflit » sur des stacks **squash-mergées** est fausse.
2. **Contrat opérateur / observabilité** — Eng (contrat worker machine-readable), DX
   (sous-commandes + schéma blocked), + suppression du protocole `VOID_EVENT` existant.
3. **Suppression du headless `claude -p`** — CEO ×2 (capacité réelle, pas qu'une impl).

### Décisions auto-décidées (mécaniques / correctness — à appliquer en révision)

| # | Décision | Principe | Rejeté |
|---|---|---|---|
| M1 | **Step 12 redesign** : remplacer « cascade déterministe sans conflit » par « tenter la cascade, classifier (conflit/stale/protection/CI), bloquer proprement avec rapport actionnable » ; merge stacké **strictement séquentiel** (attendre le parent mergé, rebaser le seul enfant suivant, gate humain sur conflit) ; test d'intégration sur **repo git éphémère**, pas des snapshots d'args. | P1, P5 | Promesse « garantie sans conflit » |
| M2 | **Protection inconnue = FATALE** sous `--auto-merge` (aujourd'hui warn). | sécurité | warn-and-continue |
| M3 | **Crash-resume** : écritures atomiques (temp+rename) + **réconciliation de l'état distant** (`gh pr list`) au lieu de rejouer le curseur ; actions externes idempotentes. | P1 | happy-path resume |
| M4 | **Cluster** : exiger un **overlap de footprint fichiers** corroborant avant de fusionner sur le graphe seul + cap de taille + score de confiance + règle de split. | P1 | « graphe gagne » |
| M5 | **Orchestrateur mince** : contrat **machine-readable** des sorties worker + mécanisme explicite de compaction/`clear` entre clusters (sinon le L0 LLM accrète). | P5 | « mince » non spécifié |
| M6 | **Observabilité** : préserver/porter le protocole `VOID_EVENT` ; ajouter sous-commandes `status/resume/explain-blocked/abort`, schéma de rapport « blocked », contrat de commande avec exemples, `--dry-run` par défaut + quickstart. | P1 | suppression sèche de stream.ts |
| M7 | **Circuit breaker** budget tokens/rate-limit/temps (évite de verrouiller la session humaine à mi-journée). | P1 | aucun cap |
| M8 | **Batch défaut = 4** (aligne la doc et le code, défaut actuel `k=3` dans `batch-plan.ts:8`). | cohérence | drift 3 vs 4 |

### Décisions de goût / user challenges (NON auto-décidées — gate)

- **UC1** — Suppression *maintenant* du headless `claude -p` (Step 1, irréversible) vs le garder derrière un flag / différer + benchmark sur 3 tickets. Les deux voix CEO : capacité walk-away/cron/CI réellement différente.
- **UC2** — Auto-merge directement sur `develop`/`main` vs restreindre (branche d'intégration par défaut, « promote » humain explicite vers develop/main, cap par run, gate humain pour les racines de stack).
- **T1** — Aucun alias déprécié vs **stub 1 release** qui sort la commande de remplacement.
- **T2** — Worktree seulement si parallèle vs **worktree de cluster même en séquentiel** (sûreté crash/dirty-state ; per-ticket en parallèle).
- **Premisse** — Le vrai goulot est-il le débit de PR ou la bande passante de revue ? (kill-criterion suggéré : si le temps de revue par PR ne baisse pas, la feature est net-négative.)
- **Note** — « Opus partout » : déjà décidé explicitement par toi (dérogation loggée) ; les modèles préfèrent un choix par risque. Défaut conservé sauf avis contraire.
