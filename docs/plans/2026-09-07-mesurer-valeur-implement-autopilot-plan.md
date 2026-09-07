---
title: Mesurer la valeur de Implement et Autopilot
date: 2026-09-07
status: in-progress
spec: docs/specs/2026-09-07-mesurer-valeur-implement-autopilot.md
ticket: DEV-833
author: Folpe + Codex
high_risk: true
---

# Plan - mesurer la valeur de Implement et Autopilot

## Goal

Construire puis exécuter une comparaison contrôlée de l'agent seul, de
`Implement` et d'`Autopilot` sur les trois parcours réels de DEV-832. La qualité
du code et de l'application est la mesure primaire, avec tolérance zéro pour un
bug critique ou une fausse réussite. Le protocole pilote d'abord la variance,
fige ensuite la campagne principale et laisse la décision de conserver,
simplifier ou retirer chaque mécanisme à Folpe sur `develop`.

## Steps

### Step 1 - Geler le contrat de campagne et les fixtures

- **Goal**: transformer la spec approuvée en un manifeste versionné, explicite
  et rejouable pour les neuf cellules de comparaison.
- **Depends on**: none
- **TDD mode**: strict
- **Scope**:
  - étendre les contrats de `apps/eval-harness/src/types.ts` sans mélanger les
    rapports de skills existants avec ceux de cette campagne ;
  - ajouter `apps/eval-harness/src/cases/autonomous-value.ts` et son test ;
  - ajouter les fixtures minimales sous
    `apps/eval-harness/fixtures/autonomous-value/` pour les parcours implement,
    autopilot et brainstorm ;
  - créer `benchmarks/engineering/README.md` et
    `benchmarks/engineering/cohort.json` comme protocole lisible et manifeste de
    comparabilité, en réutilisant DEV-451 sans créer un second claim de
    certification.
- **Verification gate**:
  - le manifeste contient exactement trois parcours et trois conditions par
    parcours ;
  - chaque cellule possède un commit de départ, un objectif, un oracle de
    défaut et un identifiant stable ;
  - les fixtures sont bornées, sans secret, clé, lockfile ou donnée privée ;
  - `pnpm --filter @voidcorp/eval-harness test` et
    `pnpm --filter @voidcorp/eval-harness typecheck` passent.
- **Expected commits**:
  - `test(eval): reject an incomplete autonomous value manifest`
  - `docs(eval): freeze the autonomous value campaign contract`
- **Notes**: ne pas lancer de runtime payant à cette étape. Le manifeste doit
  rester indépendant du mode utilisé pour produire le résultat.

### Step 2 - Exécuter une cellule isolée avec des preuves d'autorité

- **Goal**: faire fonctionner une cellule complète sans aide humaine et
  produire une preuve écrite par l'exécuteur.
- **Depends on**: Step 1
- **TDD mode**: souple pour les adaptateurs, strict pour les décisions pures
- **Scope**:
  - ajouter `apps/eval-harness/src/autonomous-value/runner.ts` et son test ;
  - ajouter `apps/eval-harness/src/autonomous-value/evidence.ts` et son test ;
  - réutiliser `apps/eval-harness/src/sandbox.ts`, les adaptateurs runtime
    existants et `packages/cli/scripts/conformance-process.mjs` ;
  - garantir l'identité du commit de départ, l'isolement, l'argv, le modèle,
    la version, l'effort, les événements, le diff, la sortie et le nettoyage ;
  - refuser les claims du worker comme source de preuve.
- **Verification gate**:
  - deux cellules identiques partent du même état et ne partagent aucun fichier
    de travail ;
  - une preuve absente, périmée, contradictoire ou non produite est refusée ;
  - les secrets et variables sensibles ne figurent jamais dans les rapports ;
  - interruption et nettoyage incomplet donnent un état explicite ;
  - la suite ciblée de l'eval harness et son typecheck passent.
- **Expected commits**:
  - `test(eval): refuse worker claims without executor evidence`
  - `feat(eval): run an isolated autonomous value cell with sealed evidence`
- **Notes**: l'absence de capacité est `unknown` ou `blocked`, jamais un vert.
  Aucun retry ne peut transformer un échec en succès.

### Step 3 - Ajouter les gates qualité, la correction bornée et le rapport aveugle

- **Goal**: appliquer la politique qualité commune et rendre les neuf cellules
  comparables dans un rapport sans révéler leur mode à la revue.
- **Depends on**: Step 2
- **TDD mode**: strict
- **Scope**:
  - ajouter `apps/eval-harness/src/autonomous-value/scorer.ts` et son test ;
  - ajouter `apps/eval-harness/src/autonomous-value/reviewer.ts` et son test ;
  - ajouter `apps/eval-harness/src/autonomous-value/reporter.ts` et son test ;
  - intégrer le maximum de trois cycles de correction, l'arrêt immédiat d'un
    défaut critique ou de sécurité mal compris, et la séparation entre gates
    absolus et métriques secondaires ;
  - préserver le pattern de revue aveugle déjà présent dans
    `apps/eval-harness/src/runner.ts` et `apps/eval-harness/src/judge.ts` sans
    confier le verdict à un juge LLM seul.
- **Verification gate**:
  - un bug critique, une fausse réussite ou une preuve inventée disqualifie la
    cellule ;
  - une correction non résolue après trois cycles reste hors de `develop` ;
  - le rapport distingue défauts, corrections, interventions, durée,
    ressources, coût, reprise, nettoyage et `unknown` ;
  - l'ordre alterné est déterministe et rejouable ;
  - cas négatifs et positifs passent, puis `pnpm --filter @voidcorp/eval-harness test`
    et `pnpm --filter @voidcorp/eval-harness typecheck` passent.
- **Expected commits**:
  - `test(eval): disqualify critical defects and false greens`
  - `feat(eval): score autonomous value with bounded correction and blind review`
- **Notes**: aucune moyenne ne peut compenser un échec absolu. Le rapport doit
  rendre l'absence de preuve visible plutôt que la traiter comme une réussite.

### Step 4 - Réaliser le pilote et calculer la campagne principale

- **Goal**: mesurer la variance sur trois répétitions par cellule, puis figer le
  nombre d'exécutions et la cible de confiance avant la campagne principale.
- **Depends on**: Step 3
- **TDD mode**: exploratory pour la campagne, strict pour la validation du
  manifeste produit
- **Scope**:
  - lancer exactement 27 exécutions de pilote (9 cellules x 3) dans des
    environnements isolés ;
  - archiver les manifestes, sorties, preuves et ressources sous un répertoire
    borné de rapport de campagne ;
  - séparer les défauts de la condition, de l'outil, de l'environnement et du
    protocole ;
  - calculer puis faire approuver le nombre principal, l'effet minimal
    détectable et la cible de confiance ;
  - ne pas modifier les critères après lecture du pilote.
- **Verification gate**:
  - 27 résultats sont présents ou chaque absence est catégorisée comme
    `unknown`/`blocked` ;
  - aucun défaut critique n'est masqué par agrégation ;
  - l'identité source, le digest d'artefact, la cellule et la configuration sont
    présents pour chaque résultat ;
  - Folpe approuve explicitement le protocole principal et son budget avant la
    moindre exécution payante supplémentaire.
- **Expected commits**:
  - `test(eval): prove pilot reports preserve cell identity and unknowns`
  - `docs(eval): record pilot variance and freeze the main campaign`
- **Notes**: ce step est un gate humain de DEV-833. Un pilote insuffisant ne
  permet aucune conclusion forte et ne déclenche pas automatiquement la suite.

### Step 5 - Exécuter la campagne principale et vérifier les sorties

- **Goal**: obtenir le corpus comparatif gelé sans intervention humaine pendant
  les exécutions.
- **Depends on**: Step 4 and explicit protocol/budget approval
- **TDD mode**: souple pour le lancement, strict pour les postconditions
- **Scope**:
  - exécuter le nombre figé pour chacune des neuf cellules ;
  - alterner l'ordre selon le manifeste et conserver les environnements séparés ;
  - vérifier la reprise après interruption sur au moins une cellule de chaque
    parcours ;
  - vérifier le nettoyage après succès, échec et interruption ;
  - produire un rapport de campagne immuable lié au commit et aux artefacts.
- **Verification gate**:
  - toutes les cellules prévues ont un résultat ou une absence expliquée ;
  - aucune cellule avec bug critique, fausse réussite ou correction non résolue
    n'est présentée comme admissible ;
  - les reprises ne doublent aucun effet et aucun processus enfant ne survit ;
  - les checks ciblés, le typecheck et les tests de non-retry passent ;
  - aucune donnée sensible n'est archivée.
- **Expected commits**:
  - `test(eval): reject incomplete or contaminated campaign reports`
  - `docs(eval): archive the frozen autonomous value campaign`
- **Notes**: un résultat `unknown` reste visible et réduit la portée de la
  conclusion. Il ne devient jamais zéro ou succès par défaut.

### Step 6 - Produire le rapport final et prendre la décision sur develop

- **Goal**: permettre une décision humaine traçable avant production, sans
  auto-validation du ticket.
- **Depends on**: Step 5
- **TDD mode**: souple pour la mise en forme, exploratory pour l'analyse humaine
- **Scope**:
  - soumettre les sorties admissibles à la revue humaine aveugle ;
  - produire un rapport final avec verdict primaire, métriques secondaires,
    limites, défauts et inconnues ;
  - révéler ensuite le mode des sorties et comparer agent seul, `Implement` et
    `Autopilot` ;
  - ouvrir les tickets séparés correspondant à conserver, simplifier ou retirer
    un mécanisme ;
  - conserver la décision de promotion de `develop` vers la production comme
    gate humain distinct.
- **Verification gate**:
  - le rapport répond à chaque critère de la spec, par parcours et par condition ;
  - la revue aveugle est conservée avec son contexte et sa méthode ;
  - toute conclusion forte est refusée si les données sont insuffisantes,
    contaminées ou non comparables ;
  - aucun claim « top 5 % » n'est émis sans satisfaire DEV-451 ;
  - Folpe approuve la synthèse et les tickets de suite avant de déclarer
    DEV-833 terminé.
- **Expected commits**:
  - `test(eval): report every unmet criterion as unverified`
  - `docs(eval): publish the autonomous value decision report`
- **Notes**: ce plan ne modifie pas le harness dans ce step. Toute modification
  issue du rapport suit son propre spec, plan et gate.

## Review checkpoints

### Checkpoint A - after Step 3

Folpe reviews the executable protocol, evidence contract, gates and blind-review
shape before any pilot. Stop here and run the targeted verification. No paid
execution proceeds without explicit protocol and budget approval.

### Checkpoint B - after Step 5

Folpe reviews the frozen campaign report, all critical-failure dispositions and
the cleanup/recovery evidence before the final comparison and follow-up tickets.

## Execution handoff

| Key | Tracker | Step | Depends on | Human gate | Output |
|---|---|---|---|---|---|
| AV-01 | DEV-835 | Contract and fixtures | none | no | versioned campaign manifest |
| AV-02 | DEV-836 | Isolated cell and evidence | AV-01 | no | authoritative cell proof |
| AV-03 | DEV-837 | Gates and blind report | AV-02 | no | executable scoring/reporting |
| AV-04 | DEV-838 | Pilot and sample calculation | AV-03 | yes | approved frozen protocol |
| AV-05 | DEV-839 | Main campaign | AV-04 | no | immutable campaign corpus |
| AV-06 | DEV-840 | Final report and decision | AV-05 | yes | approved decision and follow-up tickets |

This is the execution handoff for DEV-833. If implementation becomes several
provider-native tickets, `void-ticket` must create them from these keys and keep
the listed dependencies. The tracker remains the owner of mutable progress; this
plan does not add a current-step pointer.

## Resume point

Step 1 is complete in DEV-835. The observed evidence is the RED test commit
`f322b580`, followed by the contract and fixture commit `09fa1de4`, the pinned
runtime metadata commit `ed21ebd2`, and the comparable-cell hardening commit
`e8b7683b`.

Step 2 is complete in DEV-836. The RED tests are in `ed9f15f0`; the GREEN
implementation and strengthened tests are in `8db4df8f`. The cell runner now
binds source, workspace and fixture identity, captures tracked and untracked
changes, uses the shell-free conformance process with bounded output and a
disposable HOME, refuses live children and contradictory or worker-only proof,
and exposes replay digest verification. The eval-harness suite passed with 121
tests and the strict typecheck passed after the last code change. Repository
Biome lint remains unobservable because the local Biome binary is absent; no
lockfile was changed. Continuation remains governed by the tracker relations;
this note does not select or claim the next unit.

## Plan self-review

- No placeholders or unbounded language remain in the steps.
- Every step declares a dependency, TDD mode, verification gate and expected
  commits.
- The first executable vertical slice (Step 2) produces one isolated, evidenced
  cell rather than a horizontal runner without a proof.
- The plan names the existing eval and conformance surfaces it reuses and keeps
  the human gates explicit.
- The approved spec is linked in frontmatter.
- `high_risk: true` is intentional because the result may authorize removing or
  simplifying mechanisms that protect code quality; `void-plan-review all` is
  recommended before execution.
