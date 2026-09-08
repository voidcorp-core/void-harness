---
title: Admission budgetaire durable des evaluations
date: 2026-09-08
status: in-progress
spec: docs/specs/2026-09-07-eval-durable-budget-admission.md
ticket:
author: Folpe + Codex
high_risk: true
---

# Plan - admission budgetaire durable

## Goal

Implementer la reservation conservative approuvee, sans appel payant. Reutiliser
le journal existant pour lier une approbation a une seule archive d'autorite et
conserver les reservations apres interruption. Un runtime sans plafond impose
verifie reste bloque. Ce plan ne livre ni canary, ni evaluateur qualite, ni
nouveau transport. Decision : `adr:f91fa744-be1d-485a-bbe1-935f410de8c4`.

## Steps

### Step 1 - Reserver une execution avant son effet

- **Goal**: tranche minimale de bout en bout : valider un budget, synchroniser
  une reservation dans le journal reel, puis seulement invoquer le callback local.
- **Depends on**: none
- **TDD mode**: strict
- **Scope**:
  - `apps/eval-harness/src/autonomous-value/budget.ts` et `budget.test.ts` :
    conversion monetaire et decisions pures, sans I/O ni dependance nouvelle ;
  - `durable.ts` et `durable.test.ts` dans le meme repertoire : etendre le record
    d'admission et son identite, pas creer un journal financier parallele ;
  - reemployer `parsePilotApproval` de `approval.ts`, sans assouplir ses 27 essais.
- **Contract**:
  - budget en microdollars entiers surs, arrondi vers le bas; bornes de reservation
    arrondies vers le haut; conversion decimale exacte avant arrondi, sans epsilon
    pouvant augmenter le budget ou reduire une reservation ;
  - maximum 1 000 000 USD comme le parseur actuel, valeurs negatives/non finies,
    reservation nulle et depassement numerique refuses ;
  - plan de reservations gele avec exactement les 27 identites du schedule,
    sans doublon ni identite inventee; chaque admission verifie le credit restant ;
  - borne indisponible : refus avant reservation et avant processus ;
  - le record conserve reservation et resultat apres observation; aucun effacement
    de reservation lors du passage de `admitted` a `observed`.
- **Verification gate**:
  - tests RED puis GREEN sur limite exacte, depassement d'un microdollar,
    arrondis, valeurs invalides, capacite absente et reservation avant callback ;
  - `pnpm --filter @voidcorp/eval-harness exec vitest run src/autonomous-value`
    et `pnpm --filter @voidcorp/eval-harness typecheck` passent sans skip.
- **Expected commits**:
  - `test(eval): specify durable budget admission limits`
  - `feat(eval): reserve evaluation budget before effects`
- **Notes**: la capacite positive des tests est controlee et non payante. Elle
  ne devient jamais la valeur par defaut d'un adaptateur de production.

### Step 2 - Fermer les recharges de budget et les reprises concurrentes

- **Goal**: une approbation ne peut pas financer deux archives ni rejouer une
  reservation incertaine, meme apres fermeture et reouverture du lanceur.
- **Depends on**: Step 1
- **TDD mode**: strict
- **Scope**: `budget.ts`, `durable.ts` et leurs tests; reutiliser les lectures
  bornees et les ecritures synchronisees existantes, ainsi que `launch.claim`.
- **Contract**:
  - sous la racine de confiance commune aux lanceurs, l'archive d'autorite est
    derivee du digest canonique de l'approbation validee seule. Ne pas inclure
    un repertoire de resultats, la configuration modifiable ou la politique
    dans ce chemin : les changer doit produire un conflit, pas une nouvelle caisse ;
  - manifeste complet, source, artefact, configuration, politique et reservations
    sont lies a l'identite stockee dans cette archive. Un export de rapport n'est
    jamais une source d'autorite ni un moyen de choisir une autre caisse ;
  - un seul proprietaire actif; aucune reclamation automatique d'une claim ;
  - relecture integrale bornee des reservations au demarrage, validation de leur
    somme et conservation du montant apres succes, echec ou resultat inconnu ;
  - reservation sans observation : aucun callback; observation complete : reuse
    sans nouvelle reservation; ancien format financier absent : refus du chemin
    budgete, sans reinterpretation ni migration destructive.
- **Verification gate**:
  - etendre les tests existants de concurrence, interruption, identite et erreurs
    de persistance avec les montants, au lieu de dupliquer ces scenarios ;
  - couvrir deux lanceurs, changement de repertoire d'export, plafond modifie,
    cout inferieur/inconnu, archive corrompue et echec avant/apres synchronisation ;
  - zero effet nouveau lors d'un refus; suites ciblees et typecheck verts.
- **Expected commits**:
  - `test(eval): prevent budget refill across archive recovery`
  - `feat(eval): bind reservations to one approval authority`
- **Notes**: la racine appartient a l'operateur de confiance. Deplacer ou falsifier
  ses archives comme proprietaire malveillant est hors garantie, comme aujourd'hui.

### Step 3 - Raccorder la politique et prouver le refus du runtime reel

- **Goal**: le chemin runtime utilise le journal budgetaire; aucun callback
  permissif ou flag CLI ne se substitue a une capacite financiere verifiee.
- **Depends on**: Step 2
- **TDD mode**: strict
- **Scope**: `runtime-pilot.ts`, `runtime-pilot.test.ts`, `approval.test.ts` et
  `docs/EVAL-RUNBOOK.md`.
- **Contract**:
  - remplacer l'admission monetaire deleguee par le raccord au journal budgete.
    Ne pas conserver une alternative `admit` permissive pour ce meme chemin ;
  - la provenance humaine de l'approbation et la preuve de plafonnement restent
    des entrees de confiance explicites, pas des affirmations de l'agent evalue ;
  - la capacite porte l'identite runtime/modele/version et la couverture appels
    simultanes, appels en vol et sous-agents. Une valeur declaree sans preuve
    documentee et enforcement correspondant est indisponible ;
  - aucun fournisseur n'est active par cette livraison : le registre de capacites
    de production refuse Codex et Claude tant que leur borne n'est pas etablie ;
  - conserver le vrai workspace, executor et seal dans les tests d'integration,
    substituer uniquement le transport/capacite non payants controles ;
  - aucun dossier historique ni approbation de 27 essais ne permet un canary.
- **Verification gate**:
  - 27 effets locaux au plus, reprise sans effet ni recharge, aucun remboursement ;
  - refus de capacite/approbation/provenance absente ou incompatible avant tout
    processus, test distinct pour chacun des runtimes de production ;
  - suites ciblees, typecheck, lint cible et revue independante du diff ;
  - `pnpm verify` sur le candidat integre exact, sans retry ni skip. Le loopback
    utilise l'environnement autorise existant; ne pas changer les assertions.
- **Expected commits**:
  - `test(eval): refuse unverified runtime spending capability`
  - `feat(eval): enforce budget authority at runtime admission`
  - `docs(eval): record budget verification and remaining runtime gates`
- **Notes**: aucun changement de modele, aucune lecture de credentials, aucun
  appel payant, aucune modification de secrets, lockfiles, doctrine ou runtime.

## Review checkpoints

- Avant execution : validation de ce plan. Vu le risque, revue `void-plan-review`
  recommandee sur toutes les dimensions, avec attention a l'autorite et au rejeu.
- Avant livraison : revue independante des erreurs de stockage et du raccord,
  preuve integree source-identifiee, et limites inscrites au runbook.
- Toute activation d'un runtime payant ou canary est un gate separe, non autorise
  par l'approbation de ce plan. Promotion et merge restent humains.

## Execution handoff

Une seule unite locale : admission budgetaire durable, composee des trois
tranches sequentielles ci-dessus. Pas de nouveaux tickets ni de selection
autonome de programme; aucune modification de l'etat Linear dans ce plan.

## Resume point

Les trois tranches de code sont implementees sur `d6aeef47` et leurs gates
locaux passent : 132 tests cibles, typecheck, lint, sept avis finaux pass et
verification integree de 23 gates, 4867 tests sans skip. Le runbook porte les
commits RED/GREEN, les preuves exactes et le diagnostic du premier run contamine
par le NODE_PATH du lanceur global. Aucun appel payant ni merge.

La certification globale reste partielle : le controleur ferme la mission
`mis_8356c419-7b79-416a-bda1-f422d8bcb711` en degraded pour des limites
d'attestation runtime (sandbox/process allowlist et probes PDF/browser).
La couverture instrumentee stricte reste non mesuree, fournisseur indisponible;
aucun score ni derogation n'est suppose. Ne pas recreer une mission pour
contourner ces limites. Le prochain travail necessite de disposer ces limites
de preuve; le plafonnement fournisseur et un canary restent des gates separes.

## Plan self-review

Chaque tranche nomme fichiers, contrat, mode TDD, tests observables et dependencies.
La premiere traverse conversion, decision, persistance et effet local. Le journal
possede seul les reservations; l'export et la mesure de cout ne peuvent le recharger.
Le parcours positif reste un test local : la disponibilite d'un plafond fournisseur,
la campagne payante, l'evaluateur reel et le canary ne sont pas promis par ce plan.
