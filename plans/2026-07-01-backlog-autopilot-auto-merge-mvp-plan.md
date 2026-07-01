---
title: backlog-autopilot auto-merge MVP (attended batch)
date: 2026-07-01
status: in-progress
spec: docs/specs/2026-07-01-backlog-autopilot-auto-merge-mvp.md
author: Folpe + Claude
high_risk: true
---

# Plan — backlog-autopilot auto-merge MVP (attended batch)

## Goal

Rendre `--auto-merge` réellement exécutable sur le lot attended : après une PR d'intégration
verte, une **surface de décision CLI déterministe** (`backlog-autopilot merge-decision`) compose
les gates purs existants (`autoMergeGate` + `protectionGate` + `classifyMergeState`) et le skill
Layer-1 agit — arme `gh pr merge` si low-risk + protégé, sinon laisse la PR à la main avec la
raison. Le seul calcul neuf est l'extraction des signaux de risque depuis les fichiers du diff.
Un seul cluster attended (`isStackRoot=false`) ; la boucle L0 multi-cluster reste un follow-up.

## Note high-risk

Le comportement (merge autonome vers branche protégée) est high-risk, mais le **code livré est une
décision dry-run** (aucun merge exécuté par le code ni les tests) ; l'action gh vit dans la prose
du skill. Le design amont est déjà autoplan-approuvé (plan 2026-06-21). `gstack:/autoplan`
disponible si tu veux une passe supplémentaire avant exécution ; sinon le cycle ticket-runner
(review + doctrine-critic + verification) couvre la revue.

## Steps

### Step 1 — `riskSignalsFromDiff` (pur)

- **Goal**: dériver `{ fileCount, touchesUi, touchesSecurity, touchesMigration }` depuis la liste
  des fichiers d'un diff, via des globs par défaut alignés sur les catégories tranchées.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: `pnpm -F @voidcorp/harness test` (nouveaux cas) + `typecheck` verts.
- **Expected commits**:
  - `test(cli): riskSignalsFromDiff category globs`
  - `feat(cli): riskSignalsFromDiff — diff risk signals for the auto-merge gate`
- **Notes**: `packages/cli/src/lib/backlog/merge-risk.ts`. Sortie compatible avec l'`AutoMergeRisk`
  de `auto-merge.ts` (l'appelant ajoute `clusterId` + `isStackRoot=false`). Table de cas : fichier
  sécurité (auth/secrets/RLS), migration (drizzle/*.sql/migrations), UI (.tsx/components/app),
  neutre, comptage, casse limite (chemin qui matche deux catégories → toutes vraies).

### Step 2 — `backlog-autopilot merge-decision` (surface CLI déterministe)

- **Goal**: sous-commande qui lit un JSON d'observations sur stdin et écrit la décision sur stdout,
  en composant `riskSignalsFromDiff` + `autoMergeGate` + `protectionGate` + `classifyMergeState`.
- **Depends on**: [step-1]
- **TDD mode**: souple
- **Verification gate**: test de la commande — cas `arm:true` (low-risk+protégé+clean),
  `arm:false` avec raison (UI/sécu/migration/gros diff), protection inconnue → fatal, conflit/checks
  → block. `pnpm -F @voidcorp/harness test` vert.
- **Expected commits**:
  - `test(cli): merge-decision composes the auto-merge gates`
  - `feat(cli): backlog-autopilot merge-decision (dry-run decision surface)`
- **Notes**: câblée dans `packages/cli/src/commands/backlog-autopilot.ts` (nouveau sous-cmd, à
  côté de plan/status/…). Entrée : `{ autoMerge, method, clusterId, files, protection, observation }`.
  Sortie : `{ arm, action, method, reason }`. **N'exécute aucun merge.** Réutilise le pattern
  stdin-JSON→stdout-JSON de `backlog-autopilot plan`. Aucune régression des 5 sous-cmds existantes.

### Step 3 — câblage config `--auto-merge` + préflight abonnement

- **Goal**: la commande résout `--auto-merge`/`--auto-merge-method` (via `resolveConfig` existant)
  et applique `assertSubscription` (billing) en préflight bloquant sous `--auto-merge`.
- **Depends on**: [step-2]
- **TDD mode**: souple
- **Verification gate**: test — flags résolus (précédence flags>env>file>defaults) ; sous
  `--auto-merge` sans abonnement valide → préflight bloque avec message clair. Suite verte.
- **Expected commits**:
  - `test(cli): merge-decision resolves --auto-merge flags + subscription preflight`
  - `feat(cli): wire --auto-merge/--auto-merge-method + billing preflight into the command`
- **Notes**: réutilise `config.ts` (`parseFlags`/`resolveConfig`, déjà testés) et `billing.ts`
  (`assertSubscription`). Le préflight ne s'applique que sous `--auto-merge` (le batch attended sans
  auto-merge est inchangé). `--auto-merge-method` défaut `merge` (décision 2026-06-26).

### Checkpoint A — après Step 3

La surface de décision déterministe est complète et testée end-to-end (risque → gates → décision →
flags → préflight). Stop. `harness:verification-before-completion`. Attendre le signal utilisateur
avant de câbler le skill (le seul endroit qui agit réellement).

### Step 4 — étape Layer-1 dans le SKILL + command `.md`

- **Goal**: décrire l'étape exécutable d'auto-merge dans le skill (après PR verte → obs gh →
  `merge-decision` → arm via gh | laisser + raison), et exposer `--auto-merge` dans la command.
- **Depends on**: [step-3]
- **TDD mode**: souple (prose skill + docs ; pas de code testable unitairement)
- **Verification gate**: `pnpm anti-bloat:check` (SKILL ≤400 lignes, description ≤200) + `sync:docs`
  verts ; relecture : l'étape n'exécute jamais de résolution de conflit, protection inconnue → humain,
  method par défaut merge. Model.json régénéré si le graphe change (skill/command non ajoutés, juste
  édités → probablement pas de nouveau nœud, mais lancer `graph build` pour confirmer).
- **Expected commits**:
  - `feat(core): backlog-autopilot Layer-1 auto-merge step + /backlog-autopilot --auto-merge`
- **Notes**: `packages/core/skills/backlog-autopilot/SKILL.md` (la section "Long-run autonomy" passe
  de prose descriptive à étape actionnable, en restant sous la cap 400) + `commands/backlog-autopilot.md`
  (`argument-hint` + 1 ligne). Régénérer core-assets (`build:assets`) en lockstep. Doctrine :
  HITL au conflit, protection-inconnue fatale, blast radius explicite. Dogfood live = hors plan
  (comme le reste de backlog-autopilot).

## Review checkpoints

- **Checkpoint A** — après Step 3 (surface de décision déterministe complète, avant le câblage skill).

## Done criteria (feeds verification-before-completion)

1. `backlog-autopilot merge-decision` renvoie `arm:true` pour low-risk+protégé+clean, `arm:false`
   avec raison précise sinon ; protection inconnue = fatal.
2. `--auto-merge` déclenche le préflight abonnement ; `--auto-merge-method` défaut merge.
3. Le SKILL décrit l'étape actionnable (arm via gh | laisser à la main + raison), jamais de conflit
   résolu silencieusement.
4. Non-régression : 5 sous-cmds + batch attended sans auto-merge inchangés ; 22 tests auto-merge +
   suite complète verts ; anti-bloat + sync:docs verts.

## Resume point

**Next step**: Step 1 (`riskSignalsFromDiff` pur)

**Completed**: none

**Pending**:
- ⏳ Step 1 — riskSignalsFromDiff (strict)
- ⏳ Step 2 — merge-decision CLI (souple)
- ⏳ Step 3 — config + billing préflight (souple) → Checkpoint A
- ⏳ Step 4 — étape skill Layer-1 + command (souple/prose)
