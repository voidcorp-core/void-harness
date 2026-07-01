---
title: backlog-autopilot auto-merge MVP (attended batch)
date: 2026-07-01
status: approved
author: Folpe + Claude
related:
  - docs/specs/2026-06-21-backlog-autopilot.md
  - plans/2026-06-21-backlog-autopilot-plan.md
  - docs/DECISIONS.md  # 2026-06-21 (auto-merge risk-gated) + 2026-06-26 (merge method)
---

# backlog-autopilot auto-merge MVP (attended batch)

## Contexte

Le design de l'auto-merge est **verrouillé** (spec `2026-06-21-backlog-autopilot.md`, plan
`2026-06-21-backlog-autopilot-plan.md`, décisions 2026-06-21 ×2 + 2026-06-26). La **logique de
décision est entièrement codée et testée** dans `packages/cli/src/lib/backlog/auto-merge.ts`
(22 tests) : `autoMergeGate` (risk-gating), `protectionGate` (protection inconnue fatale sous
auto-merge), `classifyMergeState` (machine d'états merge/rebase/wait/block), `rebaseOnto`
(abort-sur-conflit). Les briques adjacentes existent aussi (`integrate.ts`, `config.ts` parse déjà
`--auto-merge`/`--auto-merge-method`, `cluster-branch.ts`, `run-state.ts`, `billing.ts`,
`branch-protection.ts`).

**Le gap :** rien de tout ça n'est branché à un chemin d'exécution. La commande CLI
`backlog-autopilot` n'expose que `plan/status/resume/explain-blocked/abort` ; les helpers purs ne
sont importés que par leurs tests ; le workflow reçoit `autoMerge` mais l'ignore ; le launcher
« P4 » n'existe qu'en prose dans le SKILL.md.

**Contrainte d'architecture :** le CLI (process node) **ne peut pas appeler l'outil Workflow**
(capacité d'agent Claude). L'architecture existante split déjà : le **skill** (Layer 1, in-session)
orchestre (Workflow + gh), le **CLI** calcule le déterministe. La décision liante 2026-06-21 place
l'auto-merge côté launcher (skill), pas côté workflow.

## Périmètre (décidé)

**MVP = auto-merge du lot attended, un cluster à la fois.** Après que le workflow a réconcilié une
PR d'intégration verte, `--auto-merge` arme les gates existants et merge via gh, pour enchaîner sur
un autre lot. Câble les helpers testés sur le chemin attended.

**Hors périmètre (follow-up documenté) :** la boucle L0 multi-cluster, les PR stackées + merge
séquentiel avec retarget/rebase en cascade, le run-state/resume en cours de run, le headless
backend (déjà réservé/différé). `isStackRoot` est donc toujours `false` dans le MVP (un seul
cluster attended, pas de racine de stack).

## Architecture

**Skill-driven, surface de décision CLI déterministe.** Le skill (Layer 1) rassemble les
observations via gh, demande au CLI une décision de merge, et agit :

```
workflow -> PR d'intégration verte
  -> skill collecte obs (gh pr view/diff/checks + branch protection)
  -> CLI `backlog-autopilot merge-decision` (compose les gates purs)  [déterministe]
  -> arm (`gh pr merge --auto --<method>`)  |  block (laisse la PR, imprime la raison)
  -> enchaîne le lot suivant
```

Aucune logique de décision neuve : le CLI **compose** `autoMergeGate` + `protectionGate` +
`classifyMergeState`. Le seul calcul nouveau est l'**extraction des signaux de risque** depuis la
liste des fichiers du diff.

## Composants

1. **`riskSignalsFromDiff`** (pur, nouveau — `packages/cli/src/lib/backlog/merge-risk.ts`).
   `(files: readonly string[]) => { fileCount; touchesUi; touchesSecurity; touchesMigration }`.
   Classe chaque fichier via des globs par défaut alignés sur les catégories déjà tranchées
   (sécurité, migration, UI). `clusterId` et `isStackRoot` (=`false` en MVP) sont fournis par
   l'appelant pour former l'`AutoMergeRisk` que `autoMergeGate` consomme.

2. **Commande CLI `backlog-autopilot merge-decision`** (déterministe, JSON in → JSON out).
   Entrée (stdin JSON) : `{ autoMerge, method, clusterId, files, protection, observation }` où
   `protection` alimente `protectionGate` et `observation` (`MergeObservation`) alimente
   `classifyMergeState`. Sortie : `{ arm, action, method, reason }` en composant les trois gates
   purs (+ `riskSignalsFromDiff`). N'exécute AUCUN merge : décision seule (dry-run par nature).

3. **Câblage config + préflight.** La commande résout `--auto-merge` / `--auto-merge-method` via le
   `resolveConfig` existant de `config.ts` (précédence flags > env > file > defaults). Sous
   `--auto-merge`, `assertSubscription` (billing) est un préflight bloquant, cohérent avec la
   doctrine « autonomie = abonnement, pas de creds API ».

4. **Étape Layer-1 dans le SKILL** (`packages/core/skills/backlog-autopilot/SKILL.md`). Une étape
   exécutable (prose → steps) : après la PR verte, si `--auto-merge`, rassembler les obs gh, appeler
   `merge-decision`, puis agir — `arm` → `gh pr merge --auto --<method>` ; `action=block`/`wait`/
   `rebase` ou `arm=false` → **laisser la PR à la main** en imprimant la raison. **Jamais** de
   résolution de conflit silencieuse ; protection inconnue → abandon de l'auto-merge (humain).
   La command `backlog-autopilot.md` gagne `--auto-merge` dans son `argument-hint` + une ligne.

## Gestion d'erreurs

- **Protection inconnue/absente** → `protectionGate` renvoie `fatal` → auto-merge abandonné,
  PR laissée à la main (blast radius explicite).
- **Conflit / checks fail** → `classifyMergeState` → `block` → humain, jamais de résolution auto.
- **Checks pending** → `wait` (le skill peut re-observer ou laisser à la main selon attended).
- **Diff non low-risk** (UI/sécu/migration ou > maxFiles) → `arm=false`, PR laissée, raison.
- **Échec gh** (réseau, permission) → surfacé au skill, aucun state silencieux, on n'arme pas.

## Approche de test

| Cible | Mode | Notes |
|---|---|---|
| `riskSignalsFromDiff` | **strict** | table : fichier sécu/migration/UI/neutre, fileCount, casse limite des globs |
| gates purs (autoMergeGate/protectionGate/classifyMergeState) | (couverts) | inchangés, 22 tests existants |
| `merge-decision` (composition + I/O JSON) | souple | vrais gates, cas arm / block / fatal / not-low-risk |
| config/billing wiring dans la commande | souple | flags résolus, préflight abonnement sous --auto-merge |
| étape skill Layer-1 | prose / dogfood | vérif manuelle ; aucun auto-merge live en test |

**Aucun auto-merge réel n'est exécuté par les tests** — la décision est dry-run ; l'action gh vit
dans le skill (prose), dogfoodée séparément.

## Phases

- **Step 1** — `riskSignalsFromDiff` pur (strict).
- **Step 2** — `backlog-autopilot merge-decision` : compose les gates, JSON I/O (souple).
- **Step 3** — câblage config `--auto-merge`/`--auto-merge-method` + `assertSubscription` préflight
  dans la commande (souple).
- **Step 4** — étape Layer-1 dans le SKILL + `--auto-merge` dans la command `.md` (prose + docs).

## Critères de succès

1. `backlog-autopilot merge-decision` (déterministe) renvoie `arm:true` pour un lot low-risk +
   protégé + vert, et `arm:false` avec une raison précise sinon (sécu/migration/UI/gros diff/
   protection/conflit/checks).
2. Sous `--auto-merge`, une protection de base inconnue est **fatale** (jamais d'arme).
3. Le SKILL décrit une étape exécutable qui, après une PR verte, appelle la décision et **arme via
   gh** ou **laisse à la main avec la raison** — jamais de résolution de conflit silencieuse.
4. `--auto-merge` déclenche le préflight abonnement.
5. Non-régression : les 5 sous-commandes existantes + le batch attended sans `--auto-merge`
   inchangés ; les 22 tests auto-merge + le reste de la suite verts.
