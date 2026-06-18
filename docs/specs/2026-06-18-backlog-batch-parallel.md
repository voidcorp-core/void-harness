---
title: backlog-batch — attended parallel ticket drain via worktree subagents
date: 2026-06-18
status: approved
author: Florent Pellegrin + Claude
related:
  - docs/specs/2026-06-18-backlog-loop-observability.md
  - packages/core/skills/autonomous-backlog-loop/
  - docs/DECISIONS.md
---

## Problème

`autonomous-backlog-loop` est le mode **autonome, séquentiel, walk-away** : un process
frais par ticket, déterministe, sans surveillance, fidèle aux principes Ralph. Il ne
couvre pas un autre besoin réel : « je suis là, draine **maintenant** quelques tickets
indépendants **en parallèle**, sans rien casser, et donne-moi une PR à reviewer ».

Faire ça naïvement (N agents qui éditent le même arbre de travail) casse tout. Le faire
bien suppose : isolation par worktree, un routage **conscient du risque** de
chevauchement, une réconciliation qui attrape les conflits (y compris sémantiques), et un
orchestrateur **déterministe** (pas une session LLM longue qui pourrit son contexte).

## Objectif

Un mode **complémentaire attended** : `backlog-batch`. Il sélectionne un lot de tickets
éligibles indépendants, **estime leur empreinte fichiers**, route en **parallèle ce qui
est à faible risque** et **en séquentiel ce qui se chevauche**, exécute chaque ticket
dans son **worktree** via un subagent (cycle craftsman complet, green-or-blocked), puis
**réconcilie** les branches vertes en **une PR d'intégration unique** dont la **suite
complète** est le juge. Ce n'est PAS un remplacement du mode séquentiel : c'est son
pendant pour le travail surveillé, court, parallélisable.

## Décisions cadrées (brainstorming)

- **Substrat** : l'outil **Workflow** (orchestration JS déterministe de subagents,
  `parallel()`, `isolation:"worktree"`). Récupère le déterminisme qu'une boucle Agent
  in-session perdrait ; pas de rot d'orchestrateur.
- **Deux couches** : un **launcher in-session interactif** (sélection + estimation +
  partition + gate de confirmation) qui lance ensuite le **Workflow** (fan-out →
  réconciliation → PR) avec le plan confirmé en `args`. Le Workflow ne prompte jamais.
- **Sélection** : l'orchestrateur **propose** le top-K éligible indépendant ; l'humain
  **confirme/édite** avant le fan-out (cohérent avec le mode attended).
- **Routage conscient du risque** : empreinte estimée par une **passe LLM légère** (un
  petit subagent par ticket prédit aires/fichiers + confiance) ; chevauchement élevé →
  **séquentiel** ; risque mesuré faible → **parallèle**. Lockfile / migrations → toujours
  séquentiel (collisions sémantiques garanties).
- **Réconciliation** : **une PR d'intégration unique** pour le batch. Tickets bloqués
  (verify rouge) **exclus** de la branche d'intégration. Conflits résolus par un
  **subagent de réconciliation**, **borné par la suite complète** (vert → PR ; rouge →
  batch bloqué + évidence).
- **Facturation** : subagents héritent de l'auth parente → **abonnement** (pas de strip).
- **Frontière** : **skill sœur** de `autonomous-backlog-loop` (substrat et modèle de
  risque distincts), pas un mode de la skill existante.

## Architecture

Deux couches, une frontière nette :

1. **Launcher in-session** — la skill `backlog-batch` (+ `/harness:backlog-batch`).
   Interactif : interroge Linear, estime, partitionne, montre le plan, prend la
   confirmation humaine. Produit un **plan** (groupe parallèle ordonné + queue
   séquentielle) qu'il passe au Workflow.
2. **Workflow déterministe** (asset JS) — reçoit le plan en `args`. `parallel()` sur le
   groupe ∥ (chaque agent `isolation:"worktree"`), puis exécute la queue séquentielle
   (worktree, enchaînée), puis la réconciliation. Sortie : la PR batch + un résumé.

Le launcher fait le « scout inline » (lecture Linear, estimation) ; le Workflow fait le
fan-out déterministe. La confirmation humaine est strictement entre les deux.

## Composants

| Composant | Rôle | Pureté |
|---|---|---|
| `packages/core/skills/backlog-batch/SKILL.md` | Doctrine du mode + invocation du launcher/Workflow | — |
| `packages/core/commands/backlog-batch.md` | `/harness:backlog-batch` → lance le launcher | — |
| Sélection éligibles (lib) | Linear → set indépendant (non bloqué, sans lien de dép. mutuel), top-K par priorité | **pur** (entrée = tickets) |
| Estimateur d'empreinte | Passe LLM légère : par ticket → aires/fichiers probables + confiance | shell (subagent) |
| Partition (lib) | Graphe de chevauchement → groupe ∥ + queue séquentielle ; lockfile/migrations forcés séquentiels | **pur** |
| Workflow `backlog-batch.workflow.js` (asset) | `parallel()` ∥ + queue séquentielle (worktree), puis réconciliation → PR | déterministe |
| Worker subagent (par ticket) | Cycle craftsman dans son worktree : pick→plan→tdd→verify→commit. Green-or-blocked | shell |
| Subagent de réconciliation | Merge branches vertes sur `integration/<batch>`, résout conflits, gate = suite complète | shell |

Modules **purs** (TDD strict) : sélection des éligibles, partition risque→∥/séquentiel.
Tout le reste (estimateur, Workflow, workers, réconciliation, launcher) est shell, testé
en souple avec des subagents stub.

## Flux de données

```
/harness:backlog-batch [--max-parallel 3] [--tickets ...]
  LAUNCHER (in-session, interactif):
    Linear → éligibles indépendants (top-K, ou --tickets explicites)
    estimateur LLM léger → empreinte/ticket + confiance
    partition → ∥ {A,B}  +  séquentiel [C après A]   (C chevauche A ; lockfile/migration → séquentiel)
    AFFICHE le plan → CONFIRMATION humaine (retire/ajoute/bascule ∥↔séq)
  WORKFLOW(args = plan confirmé):
    parallel(A,B)  chacun isolation:worktree → cycle craftsman + verify (green-or-blocked)
    puis séquentiel: C (worktree, après A mergé)
    branches VERTES → integration/<batch>
       conflit git ? → subagent de réconciliation (garde les deux intentions)
       run SUITE COMPLÈTE (autorité, séquentielle → pas de collision)
         vert  → 1 PR batch (référence A,B,C + décisions/ADR)
         rouge → batch BLOQUÉ + évidence ; branches préservées
    tickets bloqués (verify rouge) → exclus de l'intégration, rapportés à part
  RÉSUMÉ: PR batch #N · inclus · exclus/bloqués · conflits résolus
```

## Gestion d'erreurs & garde-fous

- **Estimation faillible** : si un conflit surgit malgré le routage, le subagent de
  réconciliation est le filet et la **suite complète** est le juge final. Jamais de PR
  batch sur du rouge.
- **Ticket bloqué** : exclu de l'intégration, branche WIP préservée, rapporté. Ne pollue
  pas le lot.
- **Isolation tests entre worktrees** : cap de concurrence par défaut **3** ; l'autorité
  de vérif est la suite **sur la branche d'intégration** (séquentielle → pas de collision
  ports/DB). Le verify par-worktree est best-effort (early-block) ; les projets aux tests
  liés ressources peuvent abaisser `--max-parallel`.
- **Lockfile / migrations** : marqués haut-risque par l'estimateur → routés séquentiels.
- **Sécurité/abonnement** : subagents héritent de l'auth parente (abonnement) ; les hooks
  de sécurité restent actifs dans chaque worktree.
- **Worktrees** : auto-nettoyés (l'isolation Workflow supprime un worktree inchangé) ;
  branches des tickets verts préservées jusqu'au merge de la PR.

## Approche de test (modes TDD)

- Sélection éligibles (parse → set indépendant) → **strict**, mocks Linear.
- Partition (graphe chevauchement → ∥/séquentiel, règles lockfile/migration) → **strict**,
  table-driven.
- Workflow d'orchestration → **souple** : subagents **stub** (faux worker renvoyant
  green/blocked, faux conflit) → vérifie partition→fanout→reconcile→exit + exclusion des
  bloqués.
- Réconciliation (merge intégration + gate suite) → **souple**, dépôt git jouet.
- Launcher glue + rendu du plan → **souple**.

## Phases (→ plan)

1. Partition pure : graphe de chevauchement → ∥/séquentiel + règles haut-risque — strict.
2. Sélection Linear éligibles indépendants — strict (mocks).
3. Estimateur d'empreinte (passe LLM légère, subagent) + branchement sur la partition — souple.
4. Launcher in-session + gate de confirmation + rendu du plan — souple.
5. Workflow : `parallel()` ∥ + queue séquentielle (worktree), workers stub — souple.
6. Réconciliation : intégration + subagent conflits + gate suite complète + PR batch — souple.
7. Skill `backlog-batch` (SKILL.md, `.source`, audit) + `/harness:backlog-batch` +
   entrée DECISIONS.md + sync `CLAUDE.md`/`AGENTS.md` (nouveau mode) + frontière vs
   `autonomous-backlog-loop`.

## Frontière avec `autonomous-backlog-loop` (anti-bloat)

Skill **sœur**, pas un mode. Distinction explicite dans les deux SKILL.md :

| | `autonomous-backlog-loop` | `backlog-batch` |
|---|---|---|
| Modèle | séquentiel, walk-away, **process** frais | parallèle attended, **subagents** worktree |
| Orchestrateur | CLI déterministe (zéro LLM) | Workflow déterministe (subagents LLM) |
| Sortie | 1 PR / ticket | 1 PR d'intégration / batch |
| Reset | process OS | worktree + contexte subagent |
| Facturation | strip API → abonnement | héritée → abonnement |

Recouvrement borné (sélection Linear + cycle worker) ; les libs de sélection/worker-cycle
sont partagées, pas dupliquées.

## Hors scope (YAGNI)

- Pas de résolution de conflits *cross-PR* (une seule PR d'intégration).
- Pas de parallélisme imbriqué illimité (cap de concurrence ; queue séquentielle pour le
  haut-risque).
- Pas de stacked-PRs.
- Pas de mode non surveillé pour ce flux (c'est le rôle de `autonomous-backlog-loop`).
