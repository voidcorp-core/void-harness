---
title: Remplacer le canary runtime par un preflight déterministe
date: 2026-09-10
status: executing
spec: docs/specs/2026-09-10-replace-runtime-canary.md
ticket: DEV-838
author: Folpe + Codex
high_risk: false
---

# Plan

## Goal

Remplacer le canary qui lance un modèle réel par un preflight déterministe,
gratuit et fail-fast, puis laisser le pilote réel mesurer les parcours avec ses
gates d'arrêt existants.

## Steps

### Step 1 — Établir le contrat fail-fast du preflight

- **Goal**: Définir les résultats stables et les contrôles d'ordre du preflight.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: tests rouges ciblés démontrant l'arrêt avant installation, l'arrêt sur diff vide et le nettoyage après échec.
- **Expected commits**:
  - `test(eval): define deterministic preflight failure gates`
- **Notes**: Aucun runtime réel, aucun budget et aucun lockfile ; les tests utilisent uniquement des ports contrôlés.

### Step 2 — Implémenter le preflight isolé

- **Goal**: Vérifier tarball, commit, fixtures, écriture, diff et nettoyage dans un consommateur temporaire.
- **Depends on**: step-1
- **TDD mode**: strict
- **Verification gate**: suite du preflight verte, typecheck eval-harness vert et preuve d'un fail fast observable pour chaque étape coûteuse.
- **Expected commits**:
  - `feat(eval): add deterministic consumer preflight`
- **Notes**: Le preflight réutilise les primitives d'isolation existantes et expose uniquement des résumés bornés.

### Step 3 — Remplacer le lanceur canary

- **Goal**: Retirer l'appel runtime du canary et brancher le pilote réel après le preflight réussi.
- **Depends on**: step-2
- **TDD mode**: souple
- **Verification gate**: aucun chemin canary ne construit une invocation Codex ou Claude ; le pilote conserve `stopOnUnknown` et l'arrêt sur résultat non admissible.
- **Expected commits**:
  - `refactor(eval): route campaign through preflight`
- **Notes**: La taille du pilote, son budget, son admission et ses critères de qualité restent inchangés.

### Step 4 — Vérifier et préparer la reprise du pilote

- **Goal**: Sceller la correction, vérifier le dépôt et mettre à jour la preuve DEV-838.
- **Depends on**: step-3
- **TDD mode**: souple
- **Verification gate**: typecheck, tests complets, doctor, diff check et état Git propre ; nouvelle admission humaine requise avant une campagne 3.7.1.
- **Expected commits**:
  - `docs(eval): record preflight replacement evidence`
- **Notes**: Cette étape ne lance pas le pilote payant. La campagne ne reprend qu'après l'admission alignée sur l'artefact 3.7.1.

## Review checkpoints

### Checkpoint A — after Step 2

Vérifier le contrat et la preuve du preflight avant de retirer définitivement le
chemin canary runtime.

## Execution handoff

| Order | Unit | Depends on | Human gate |
|---|---|---|---|
| 1 | deterministic preflight contract | none | no |
| 2 | isolated deterministic preflight | 1 | no |
| 3 | campaign launcher replacement | 2 | no |
| 4 | verification and pilot handoff | 3 | yes, before 3.7.1 campaign |

## Resume point

**Next step**: Step 4 (Vérifier et préparer la reprise du pilote)

**Completed**:

- Spec approuvée et commitée dans `cac53c2f`.
- Steps 1 à 3 implémentés dans `23a27580` et vérifiés par le preflight réel.
- Preflight 3.7.1 observé : diff contrôlé de 287 octets, nettoyage complet,
  aucune invocation runtime.

**Pending**:

- Step 4 : vérification finale et handoff humain du pilote 3.7.1.
