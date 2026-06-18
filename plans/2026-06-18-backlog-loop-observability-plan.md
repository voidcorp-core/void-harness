---
title: backlog-loop observability refactor
date: 2026-06-18
status: in-progress
spec: docs/specs/2026-06-18-backlog-loop-observability.md
author: Florent Pellegrin + Claude
high_risk: false
---

## Goal

Refondre `autonomous-backlog-loop` : déplacer l'orchestrateur de bash vers TypeScript
dans `packages/cli`, l'exposer en `void-harness backlog-loop` (flags + wizard) et
`/void-backlog-loop`, streamer un flux live append-only (stream-json + événements
sémantiques émis par le worker), terminer sur un résumé final (tickets + décisions + PR
+ blocages), et **garantir la facturation sur l'abonnement** (strip `ANTHROPIC_API_KEY`
/ `ANTHROPIC_AUTH_TOKEN` de l'env worker). La doctrine de fond est préservée : process
frais par ticket, HITL aux frontières, floor sécurité, green-or-blocked.

Les tranches sont **verticales** : on amène un bout-en-bout démontrable le plus tôt
possible (Step 4 = spawn → stream → render → résultat d'un ticket via un faux `claude`),
puis on enrichit.

---

## Steps

### Step 1 — Command skeleton + config resolution + dry-run

- **Goal**: câbler la sous-commande `backlog-loop` et résoudre la config (`flags > env > .void/autonomous.json > defaults`), avec `--help` et `--dry-run` (affiche la config résolue, ne spawn rien).
- **Depends on**: none
- **TDD mode**: strict (merge `config.ts`) / souple (glue `backlog-loop.ts`, dispatch `main.ts`)
- **Verification gate**: `pnpm test` vert sur `config.test.ts` (table-driven précédence) ; `void-harness backlog-loop --help` et `--dry-run` produisent la config attendue sans spawn.
- **Expected commits**:
  - `test: config resolution precedence for backlog-loop`
  - `feat: backlog-loop command skeleton with config + dry-run`
- **Notes**: réutiliser `lib/render.ts` pour la sortie ; conserver les clés de config existantes (`linearScope`, `targetState`, `reviewState`, `branchPrefix`, `maxIterations`, `maxFailures`, `autoMerge`, `model`).

### Step 2 — Billing guard (subscription only)

- **Goal**: garantir l'abonnement via `billing.ts` (`subscriptionEnv` retire `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` ; `assertSubscription` die sur vars cloud `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY`), surfacé dans `--dry-run`.
- **Depends on**: [step-1]
- **TDD mode**: strict
- **Verification gate**: `pnpm test` vert sur `billing.test.ts` (strip des bonnes vars, die sur var cloud, `--allow-api` désactive le strip) ; `--dry-run` affiche `billing: abonnement` ou l'avertissement de strip.
- **Expected commits**:
  - `test: subscription billing guard env handling`
  - `feat: billing guard strips API creds from worker env`
- **Notes**: `--allow-api` est l'échappatoire opt-in (approuvée). Le pré-flight existant (arbre propre, refus `VOID_HARNESS_ALLOW_*`, sandbox-gate) reste inchangé.

### Step 3 — Stream-json parser → événements métier

- **Goal**: `stream.ts` pur transforme les lignes (stream-json + `VOID_EVENT:` + `VOID_AUTONOMOUS_RESULT:`) en événements discriminés ; lignes inconnues/malformées → `Unknown` ignoré, jamais de crash.
- **Depends on**: none (parallélisable avec step-1/2)
- **TDD mode**: strict
- **Verification gate**: `pnpm test` vert sur `stream.test.ts` avec une **fixture stream-json réelle** capturée une fois + cas `VOID_EVENT` + lignes malformées.
- **Expected commits**:
  - `test: stream-json + VOID_EVENT event mapping`
  - `feat: backlog-loop stream parser to domain events`
- **Notes**: couplage assumé au schéma JSON de Claude Code (approuvé) ; dégradation propre plutôt qu'épinglage de version. Capturer la fixture via un vrai `claude -p --output-format stream-json` court, anonymisée.

### Step 4 — Orchestrateur 1-itération + render live (premier bout-en-bout)

- **Goal**: `orchestrator.ts` spawn UNE itération `claude -p --output-format stream-json` (env = `subscriptionEnv`), pipe stdout → `stream.ts` → `render.ts` (arbre append-only) et classifie le résultat. Première tranche verticale complète.
- **Depends on**: [step-1, step-2, step-3]
- **TDD mode**: souple
- **Verification gate**: test d'intégration avec un **faux `claude`** (stub sur PATH crachant du stream-json canné) : l'arbre live contient les lignes-clés, le résultat est classifié, l'env enfant ne contient pas `ANTHROPIC_API_KEY`. Smoke manuel optionnel contre le vrai `claude`.
- **Expected commits**:
  - `test: single-iteration orchestrator against fake claude`
  - `feat: backlog-loop orchestrator single iteration + live render`
- **Notes**: rendu append-only strict (pas de redraw). Le log brut de run reste tee'd pour post-mortem.

### Checkpoint A — après Step 4

L'utilisateur voit le premier bout-en-bout : un ticket exécuté avec flux live + facturation abonnement. Stop ici, lancer `harness:verification-before-completion`, attendre le signal avant la boucle complète.

### Step 5 — Boucle complète + circuit-break + résumé final

- **Goal**: étendre l'orchestrateur en boucle (`maxIterations`, `maxFailures`, break `NO_TICKETS`) ; `summary.ts` accumule les événements → résumé final (tickets, PR, blocages) ; exit code = nb de blocages.
- **Depends on**: [step-4]
- **TDD mode**: strict (`summary.ts`) / souple (boucle)
- **Verification gate**: `pnpm test` vert : faux `claude` jouant une séquence (`COMPLETED`, `BLOCKED`, `NO_TICKETS`) → résumé correct, cap d'itérations respecté, circuit-break à `maxFailures`, exit code attendu.
- **Expected commits**:
  - `test: run summary accumulation + loop circuit-break`
  - `feat: backlog-loop full loop with final summary`
- **Notes**: « run continu + résumé final » (HITL unique au merge).

### Step 6 — Wizard premier run

- **Goal**: si `.void/autonomous.json` absent, wizard interactif (scope, target, max, auto-merge) qui écrit le fichier ; config existante → wizard sauté.
- **Depends on**: [step-1]
- **TDD mode**: souple
- **Verification gate**: `pnpm test` vert : wizard écrit une config valide ; chemin config-présente le saute. Non-TTY (CI) → pas de blocage interactif (skip + message).
- **Expected commits**:
  - `test: first-run wizard writes valid config`
  - `feat: backlog-loop first-run config wizard`
- **Notes**: garder le wizard minimal ; ne pas dupliquer la validation de `config.ts`.

### Step 7 — Worker : événements sémantiques + décisions dans le résumé

- **Goal**: étendre `iteration-prompt.md` pour émettre `VOID_EVENT: PHASE <…>` et `VOID_EVENT: DECISION <…>` ; `summary.ts` surface les décisions/ADR dans le résumé final.
- **Depends on**: [step-3, step-5]
- **TDD mode**: souple
- **Verification gate**: faux `claude` émettant des `VOID_EVENT: DECISION` → décisions présentes dans le résumé final (test) ; la ligne `VOID_AUTONOMOUS_RESULT:` finale reste classifiée.
- **Expected commits**:
  - `test: decisions surfaced in final summary`
  - `feat: worker emits semantic phase/decision events`
- **Notes**: ne pas casser le protocole de résultat existant ; les `VOID_EVENT` sont additifs.

### Step 8 — Slash-command, suppression du bash, docs & sync

- **Goal**: créer `packages/core/commands/void-backlog-loop.md` (+ miroir `packages/cli/core-assets/commands/`) wrappant `void-harness backlog-loop` ; **supprimer** `autonomous-backlog.sh` ; MAJ `SKILL.md`, `.source`, `plans/skill-audits/autonomous-backlog-loop.md`, entrée `DECISIONS.md` (bash→TS, suppression du shim, garantie abonnement) ; sync `CLAUDE.md` + `AGENTS.md` pour le nouveau point d'entrée.
- **Depends on**: [step-5, step-6, step-7]
- **TDD mode**: souple
- **Verification gate**: `pnpm test` vert ; `pnpm version:check` OK ; hook `sync-agent-docs.sh` passe (CLAUDE.md ↔ AGENTS.md) ; `void-harness doctor` OK ; plus aucune référence à `autonomous-backlog.sh`.
- **Expected commits**:
  - `feat: /void-backlog-loop slash-command wrapping the CLI`
  - `refactor!: remove bash autonomous-backlog.sh in favor of CLI orchestrator`
  - `docs: DECISIONS + skill audit + CLAUDE/AGENTS sync for backlog-loop`
- **Notes**: commit breaking (`!`) pour la suppression du `.sh` + le changement de point d'entrée. Vérifier que la SKILL.md reste ≤ 400 lignes (anti-bloat).

---

## Review checkpoints

- **Checkpoint A — après Step 4** (déclaré ci-dessus) : premier bout-en-bout visible.
- **Checkpoint B — après Step 5** : la boucle complète + résumé final, avant les couches confort (wizard, événements sémantiques, intégration).

---

## Resume point

**Next step**: Step 6 (Wizard premier run) — pending Checkpoint B sign-off

**Completed**:
- ✅ Step 1: Command skeleton + config + dry-run (`feat(cli): backlog-loop config resolution`, `feat(cli): backlog-loop command skeleton with --help and --dry-run`)
- ✅ Step 2: Billing guard (`feat(cli): subscription billing guard for backlog-loop`)
- ✅ Step 3: Stream parser (`feat(cli): backlog-loop stream-json parser to domain events`)
- ✅ Step 4: Orchestrateur 1-itération + render (`feat(cli): single-iteration orchestrator + live append-only renderer`) — **Checkpoint A**
- ✅ Step 5: Boucle + circuit-break + résumé + câblage commande (`feat(cli): backlog-loop run loop, circuit-break, and dense summary`, `feat(cli): wire backlog-loop command to the live loop`) — **Checkpoint B**. Note: prompt + settings embarqués dans le CLI (Step 7 partiellement absorbé : le worker émet déjà PHASE/DECISION/PR).

**Pending**:
- ⏳ Step 6: Wizard premier run
- ⏳ Step 7: Worker événements sémantiques + décisions (reste : réconcilier/supprimer l'ancien iteration-prompt.md au Step 8)
- ⏳ Step 8: Slash-command + suppression bash + docs/sync
