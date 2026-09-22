---
title: Autopilot - boucle continue native GitHub
date: 2026-09-22
status: in-progress
spec: docs/specs/2026-09-22-autopilot-native-loop.md
ticket:
author: Folpe + Claude
high_risk: true
---

# Plan : boucle continue native GitHub

## Goal

Remplacer le moteur de clusters par une boucle continue de quatre places : un curateur classe
les tickets selon l'intérêt du projet, chaque worker exécute `void-implement` complet dans son
worktree, une PR par ticket part vers `develop` avec l'auto-merge et la file de merge GitHub,
une relecture bornée publie son verdict comme check requis, et un petit noyau déterministe
applique la politique (places, collisions, bornes, arrêts, reprise). `main` reste humain.
`high_risk: true` parce que le plan touche l'autorisation de merge.

## Décisions d'exécution fixées ici

- **Frontière d'observation.** Le noyau lit GitHub lui-même via `gh` (PR, SHA, checks, file de
  merge, statuts) : c'est l'autorité du merge, un modèle ne la rapporte pas. Il reçoit l'état
  Linear de l'orchestrateur sous forme de JSON validé par Zod, parce que Linear n'est joignable
  que par MCP depuis l'agent et que l'état du tracker ne décide jamais d'un merge.
- **Verdict de relecture.** Le relecteur pose un statut de commit `void/independent-review`
  (`success` ou `failure`, description courte) sur le SHA de tête relu. Le job CI
  `independent-review` le vérifie sur `pull_request` (SHA de tête de la PR) et sur
  `merge_group` (SHA de tête de chaque PR du groupe, retrouvées depuis `head_ref`
  `gh-readonly-queue/<base>/pr-<n>-<sha>` puis l'API).
- **Signal d'arrêt.** Fichier local `.void/machine/autopilot/stop` contenant `drain` ou `now`,
  écrit par la commande `void-harness autopilot stop --drain|--now` ; lisible depuis n'importe
  quel pane herdr. L'orchestrateur le lit avant chaque attribution de place.
- **Réutilisation.** `program.ts` (lecture du bloc `autopilot`), `footprint-area.ts` et
  l'ownership `sequential` sont gardés tels quels. Tout le reste de `lib/autopilot/` est
  supprimé à l'étape 7.

## Steps

### Step 1 — Rendre la file de merge possible sur `develop`, sans l'activer

- **Goal** : chaque check requis répond à `merge_group`, et `independent-review` existe.
- **Depends on** : none
- **TDD mode** : strict pour le script de vérification du verdict (`scripts/independent-review-check.mjs`
  et son test : PR simple, groupe de plusieurs PR, verdict absent, verdict `failure`, verdict
  sur un ancien SHA, `head_ref` mal formé) ; souple pour le YAML.
- **Travail** : ajouter `merge_group` aux déclencheurs de `ci.yml` et de `void-enforce.yml`
  (vérifier dans la doc GitHub quels champs de contexte changent, notamment la base du diff
  d'`enforce`) ; ajouter le job `independent-review` ; ADR via `void-harness decisions new`
  (file de merge et verdict comme check requis).
- **Verification gate** : `pnpm lint && pnpm test` ; une PR de test montre les 6 checks verts,
  dont `independent-review` après un verdict posé à la main sur son SHA, et rouge sans.
- **Expected commits** : `test(ci): specify the independent review verdict check`,
  `ci: answer merge groups and require an independent review verdict`,
  `docs(decisions): delegate develop merges to the GitHub merge queue`.
- **Notes** : l'activation de la file et l'ajout du check requis dans la protection de
  `develop` sont un réglage du dépôt : ORCH les fait après accord explicite de Folpe, jamais un
  worker.

### Step 2 — Schémas des jugements typés

- **Goal** : chaque réponse d'agent à un point de décision est validée avant d'agir.
- **Depends on** : none (parallélisable avec l'étape 1)
- **TDD mode** : strict
- **Travail** : `packages/cli/src/lib/autopilot/judgments.ts` : `TicketReadiness`
  (`ready` | `needs-enrichment` | `ambiguous`, avec raison), `CuratorQueue` (liste ordonnée,
  justification, empreinte déclarée), `ConflictClass` (`mechanical` | `semantic`),
  `ReviewVerdict` (`blocking[]` avec scénario obligatoire, `advisory[]`, tour 1 ou 2). Une
  réponse invalide rend un refus typé, jamais une valeur par défaut.
- **Verification gate** : tests du fichier, `pnpm typecheck`.
- **Expected commits** : `test(autopilot): specify typed agent judgments`,
  `feat(autopilot): validate every agent judgment before acting`.

### Step 3 — Noyau déterministe de la boucle

- **Goal** : décider, à partir d'observations, quoi faire de chaque place.
- **Depends on** : step-2
- **TDD mode** : strict
- **Travail** : `packages/cli/src/lib/autopilot/loop.ts` (pur) et `loop-observe.ts` (adaptateur
  `gh`). Entrées : bloc `autopilot` du programme, état Linear validé, observations GitHub,
  signal d'arrêt, quotas déclarés. Sortie : une liste d'actions typées (`assign`, `wait`,
  `hand-back-to-worker`, `mark-human-wait`, `enable-auto-merge`, `drain`, `freeze`, `recap`).
  Règles : quatre places au plus, collisions par empreinte et `sequential`, pas d'admission
  sans empreinte, deux tours de relecture au plus, arrêt automatique (file vide, quota, trois
  attentes humaines consécutives), état ambigu vers attente humaine. Repli série quand la file
  de merge est absente. Contrôle de l'état Git partagé (DEV-858) : empreinte avant l'unité,
  refus de publication si elle change.
- **Verification gate** : tests du noyau avec doubles conformes aux sorties réelles de
  `gh pr view --json` et `gh api` (fixtures capturées, pas inventées), dont une reprise après
  redémarrage à mi-parcours sans double attribution.
- **Expected commits** : `test(autopilot): specify slot decisions from observed state`,
  `feat(autopilot): decide the continuous loop from Linear and GitHub state`,
  `test(autopilot): refuse units that changed shared repository state`,
  `feat(autopilot): fingerprint shared repository state around each unit`.

### Step 4 — Commande CLI de la boucle

- **Goal** : exposer le noyau aux agents par une commande sans jugement.
- **Depends on** : step-3
- **TDD mode** : souple (commande testée en processus)
- **Travail** : `void-harness autopilot next` (lit programme, état Linear sur stdin, GitHub,
  signal ; rend les actions en JSON), `autopilot stop --drain|--now`, `autopilot fingerprint`.
  Les anciennes sous-commandes restent en place jusqu'à l'étape 7.
- **Verification gate** : tests CLI, `pnpm test`.
- **Expected commits** : `feat(cli): expose the continuous loop decisions`.

### Step 5 — Réécrire le skill `void-autopilot`

- **Goal** : décrire la boucle et les quatre rôles, en déléguant le travail à `void-implement`.
- **Depends on** : step-4
- **TDD mode** : souple (tests de skill existants et anti-bloat)
- **Travail** : `packages/core/skills/void-autopilot/SKILL.md` réécrit (moins de 400 lignes,
  description d'au plus 250 caractères visés) : curateur (lecture du projet, Todo puis Backlog
  puis Triage, réordonnancement Linear justifié, enrichissement par `void-ticket`, jamais de
  fermeture), orchestrateur (appelle `autopilot next`, spawn des workers dans le cockpit),
  workers (`void-implement` complet, panel compris), relecteur (une passe, statut
  `void/independent-review`, advisories dans une issue Triage), résolution des conflits,
  arrêts et récapitulatif. `.source` et note d'audit mis à jour. ADR du changement de doctrine
  sur la curation.
- **Verification gate** : `pnpm test`, `bash scripts/anti-bloat-check.sh`,
  `pnpm skills:check-references`, `pnpm derive:check`.
- **Expected commits** : `feat(autopilot): run a continuous loop with a dedicated curator`,
  `docs(decisions): let the curator reorder the backlog`.

### Checkpoint A — après l'étape 5

Folpe autorise l'activation de la file de merge et du check requis sur `develop` (réglage du
dépôt fait par ORCH), et la déclaration du merge automatique dans le programme.

### Step 6 — Lot réel de deux à trois tickets

- **Goal** : prouver la boucle de bout en bout sur de vrais tickets.
- **Depends on** : step-5, checkpoint A
- **TDD mode** : exploratory (exécution réelle, pas de code livré)
- **Travail** : lancer `/void-autopilot` sur le projet, laisser le curateur choisir. Provoquer
  un conflit réel entre deux tickets et un arrêt en pleine unité suivi d'une reprise.
- **Verification gate** : les tickets sont sur `develop` sans intervention ; au moins un
  conflit résolu ; reprise sans double travail ; récapitulatif produit ; issue Triage des
  advisories créée. Mesure du temps par ticket, comparée aux 25-114 minutes de l'ancien moteur.
- **Expected commits** : aucun hors tickets ; note de preuve dans ce plan.

### Checkpoint B — après l'étape 6

Folpe juge le lot réel. Sans son accord, l'ancien moteur n'est pas supprimé.

### Step 7 — Supprimer l'ancien moteur et aligner la doctrine

- **Goal** : une seule façon de livrer en autonomie.
- **Depends on** : checkpoint B
- **TDD mode** : souple (suppression couverte par les tests restants)
- **Travail** : supprimer les modules de `lib/autopilot/` non repris et les sous-commandes
  associées ; mettre à jour `CLAUDE.md` et `AGENTS.md` (section Autonomous mode, en miroir),
  `docs/ARCHITECTURE.md`, et superséder l'ADR Autopilot de 2026-07-25.
- **Verification gate** : `pnpm lint && pnpm typecheck && pnpm test`, `pnpm sync:docs`,
  `pnpm decisions:check`, `pnpm derive:check`, `pnpm check:size`.
- **Expected commits** : `refactor(autopilot)!: remove the cluster reconciliation engine`,
  `docs: describe the continuous delivery loop`.

## Review checkpoints

- **Checkpoint A** (après l'étape 5) : réglage du dépôt et consentement au merge automatique.
- **Checkpoint B** (après l'étape 6) : jugement du lot réel avant suppression de l'ancien moteur.

Chaque étape passe par une relecture indépendante bornée (une passe, bloquants avec scénario
seulement) avant sa PR.

## Resume point

**Next step** : Step 1 et Step 2 en parallèle.

**Completed** :
- Spec approuvée (`docs/specs/2026-09-22-autopilot-native-loop.md`).

**Pending** :
- Step 1 : file de merge possible et check `independent-review`
- Step 2 : schémas des jugements typés
- Step 3 : noyau déterministe
- Step 4 : commande CLI
- Step 5 : skill réécrit
- Checkpoint A
- Step 6 : lot réel
- Checkpoint B
- Step 7 : suppression de l'ancien moteur
