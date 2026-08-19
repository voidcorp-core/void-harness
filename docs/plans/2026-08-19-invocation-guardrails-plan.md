---
title: Garde-fous d'invocation
date: 2026-08-19
status: in-progress
spec: docs/specs/2026-08-19-invocation-guardrails.md
ticket:
author: Folpe + Claude
high_risk: false
---

# Plan - garde-fous d'invocation

## Goal

Livrer deux verdicts sur le journal de mission déjà écrit, de sorte qu'une surface d'invocation
morte se signale d'elle-même à la session suivante. Le premier est déterministe (un nom absent du
catalogue), le second est un silence anormal (trois missions actives sans une seule activation).
Tous deux sont livrés au démarrage de session, en silence complet tant que tout va bien.

## Où vit le calcul, et pourquoi ce n'est pas là où la spec le disait

La spec suppose que le verdict lit `analyzeBehavior` dans `harness-graph`. Vérifié pendant le
découpage : impossible pour le bandeau. Le démarrage de session est produit par
`packages/hook-runner`, dont la seule dépendance est `mission-engine`, et qui est livré en bundle
esbuild dans chaque projet. Lui faire porter `harness-graph` et le catalogue compilé pour afficher
une ligne est hors de proportion.

Le calcul vit donc dans **`hook-runner`**, en fonctions pures, et `doctor` l'importe : le CLI
dépend déjà de `@voidcorp/hook-runner` (`packages/cli/package.json:62`). Une seule définition, et
le bandeau reste autonome.

Conséquence heureuse sur le verdict de résolution : le référentiel n'est pas le catalogue du
graphe mais **les skills réellement installées sur disque** (`.claude/skills/*/SKILL.md` et
`.agents/skills/*/SKILL.md`). C'est exactement la question posée - ce nom résout-il ici et
maintenant - plutôt que sa version modélisée.

## Steps

### Step 1 - Ramener les journaux à un seul emplacement

- **Goal**: `machine/runs` est le seul emplacement lu et écrit ; des journaux à l'ancien endroit
  deviennent un défaut signalé, pas un cas absorbé.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: `pnpm test --filter @voidcorp/cli --filter @voidcorp/hook-runner` vert,
  et sur ce dépôt `.void/runs` vide après migration, ses 3 missions présentes sous
  `.void/machine/runs`.
- **Expected commits**:
  - `test(cli): un journal resté à l'ancien emplacement est un défaut, pas un silence`
  - `fix(cli): lire les journaux à un seul endroit, et nommer la migration qui manque`
- **Notes**: `packages/cli/src/lib/graph-io.ts:36` fusionne `voidMachinePath` et `legacyVoidPath`
  à la main, là où les sept autres accès passent par `voidReadPath` ; l'aligner. Prérequis dur des
  steps 2 et 3 : tant que les journaux sont partagés entre deux endroits, tout verdict lit une
  moitié d'histoire et crie à tort. Défaut déjà tracé DEV-620.

### Step 2 - Verdict de résolution, du journal jusqu'au bandeau

- **Goal**: la première tranche verticale complète - lire les activations, comparer aux skills
  installées, afficher une ligne au démarrage si un nom ne résout pas.
- **Depends on**: step-1
- **TDD mode**: strict
- **Verification gate**: le corpus d'avant réparation (`skill:ticket-writer`,
  `skill:brainstorming`) rend le verdict rouge ; celui d'après (`brainstorm`, `plan`,
  `checkpoint`) le rend vert. Bandeau mesuré sous 50 ms sur le journal réel de ce dépôt.
- **Expected commits**:
  - `test(hooks): un nom d'activation absent des skills installées est un défaut`
  - `feat(hooks): dire au démarrage qu'un composant nommé n'existe plus`
- **Notes**: fonctions pures dans `hook-runner`, sans I/O au-delà de la lecture du journal et de
  l'énumération des dossiers de skills. Ne lire que les missions nécessaires, jamais les 27 918
  lignes du journal complet. Silence total quand tout va bien : `sessionStartOutput` n'ajoute rien.

### Step 3 - Verdict de vie

- **Goal**: trois missions actives d'affilée sans une seule activation de skill produisent la
  seconde ligne du bandeau.
- **Depends on**: step-2
- **TDD mode**: strict
- **Verification gate**: sur le corpus mesuré, la mission à 266 appels et 0 skill compte comme
  active et muette ; les 146 missions à événement unique sont ignorées ; le corpus d'après
  réparation reste vert.
- **Expected commits**:
  - `test(hooks): une mission active sans activation compte, une mission vide non`
  - `feat(hooks): signaler trois missions actives d'affilée sans skill`
- **Notes**: active = plus de vingt appels d'outils, seuil déjà retenu par l'analyse
  comportementale. L'activité se compte en `runtime.tool.started`, jamais en `hook.completed`.

### Step 4 - Rapport détaillé dans `doctor`

- **Goal**: `doctor` affiche ce que le bandeau ne peut pas tenir en une ligne - noms non résolus,
  missions considérées, appels comptés, ratio affiché sans rien décider.
- **Depends on**: step-3
- **TDD mode**: souple
- **Verification gate**: `void-harness doctor` sur ce dépôt affiche le verdict et reste vert ;
  `pnpm test --filter @voidcorp/cli` vert.
- **Expected commits**:
  - `feat(doctor): rendre le détail des deux verdicts d'invocation`
- **Notes**: `doctor` importe les fonctions du step 2 et 3, il ne recalcule rien. Le rendu suit la
  forme existante `{ name, ok, message, fix }`.

### Step 5 - Cache du verdict, seulement si le budget est dépassé

- **Goal**: garder le démarrage instantané si la lecture directe coûte trop cher.
- **Depends on**: step-2
- **TDD mode**: strict
- **Verification gate**: step exécuté uniquement si la mesure du step 2 dépasse 50 ms. Sinon, il
  est fermé sans code, avec la mesure inscrite dans le plan.
- **Expected commits**:
  - `test(hooks): un verdict en cache expire et se recalcule`
  - `feat(hooks): lire le verdict depuis un cache au démarrage`
- **Notes**: modèle déjà en place pour la fraîcheur de version - lecture du cache avant stdout,
  rafraîchissement après. Ne pas le câbler d'office : un cache posé sans mesure est une pièce
  mobile de plus pour un problème qui n'existe peut-être pas.

## Review checkpoints

### Checkpoint A - après Step 2

Le bandeau est visible pour de vrai : Folpe ouvre une session et lit ce que le garde-fou dit,
sur son propre dépôt. C'est le seul moment où le ton du message et son absence en régime normal
peuvent être jugés. Lancer `verify`, attendre son signal avant le Step 3.

## Resume point

Plan autonome et séquentiel : aucun ticket tracker pour l'instant, ce pointeur fait foi.

**Next step**: Step 1

**Pending**:
- Step 1 - un seul emplacement de journaux
- Step 2 - verdict de résolution jusqu'au bandeau
- Step 3 - verdict de vie
- Step 4 - rapport `doctor`
- Step 5 - cache conditionnel
