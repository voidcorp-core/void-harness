---
title: Aligner les budgets de description des skills et agents
date: 2026-08-21
status: in-progress
spec: docs/specs/2026-08-21-discovery-description-budgets.md
ticket:
author: Folpe + Codex
high_risk: false
---

# Plan des budgets de description

## Goal

Faire converger la doctrine, le gate anti-bloat et les tests sur une cible
éditoriale de 250 caractères et un plafond bloquant de 500 pour les descriptions
de skills et d'agents. Les descriptions valides au-dessus de la cible sont
signalées sans échec. Les hooks conservent leur déclenchement événementiel et
leur plafond de 100 lignes.

## Steps

### Step 1 — Prouver les deux niveaux aux frontières

- **Goal**: ajouter un test comportemental qui exécute le vrai gate sur des
  fixtures de skills et d'agents à 250, 251, 500 et 501 caractères.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: le nouveau test échoue contre le gate à 512 parce que
  251 n'est pas rapporté et 501 n'est pas refusé ; les fixtures prouvent aussi
  qu'un agent est couvert, pas seulement une skill.
- **Expected commits**:
  - `test(skills): encode the two-level discovery description budget`
- **Notes**: créer
  `test/skills/discovery-description-budget.test.ts`. Le test lance
  `scripts/anti-bloat-check.sh` dans un répertoire temporaire minimal contenant
  les sidecars et notes d'audit exigés par les autres règles. Il observe le code
  de sortie et le texte produit, sans tester une copie réimplémentée de la
  logique.

### Step 2 — Appliquer la cible 250 et le plafond 500

- **Goal**: rendre le test vert en faisant du gate la source exécutable des deux
  seuils et en alignant les assertions courantes.
- **Depends on**: step-1
- **TDD mode**: strict
- **Verification gate**: le test de frontière passe ; 250 ne produit aucune
  note, 251 et 500 produisent une note avec code 0, 501 produit un échec avec
  code 1 ; les tests frontmatter ciblés passent.
- **Expected commits**:
  - `fix(skills): enforce the two-level discovery description budget`
- **Notes**: introduire dans `scripts/anti-bloat-check.sh` deux constantes
  lisibles (`DESCRIPTION_TARGET=250`, `DESCRIPTION_CAP=500`) et éviter les
  littéraux divergents dans les messages. Aligner
  `test/skills/frontmatter-is-agnostic.test.ts` sur le plafond 500. Les tests de
  `void-autopilot`, `void-checkpoint` et `doctrine-critic` qui présentent 200
  comme budget global passent à la cible 250 ; ils peuvent rester plus stricts
  que le plafond sans le renommer en cap.

### Step 3 — Faire converger la doctrine et les artefacts livrés

- **Goal**: publier une seule formulation de la règle et régénérer les miroirs
  affectés sans modifier les descriptions ni les hooks eux-mêmes.
- **Depends on**: step-2
- **TDD mode**: souple
- **Verification gate**: `pnpm sync:docs`, `pnpm anti-bloat:check`,
  `pnpm skills:check-references`, `pnpm decisions:check`, `pnpm derive:check` et
  `pnpm test` passent sur le SHA final ; `git diff --check` est vide.
- **Expected commits**:
  - `docs(doctrine): align discovery description budgets`
- **Notes**: mettre à jour ensemble `AGENTS.md` et `CLAUDE.md`, puis `README.md`,
  `docs/CONTRIBUTING.md`, `docs/plans/skill-audits/TEMPLATE.md`,
  `packages/core/agents/doctrine-critic.md` et sa note d'audit. Corriger au même
  endroit « seven rules » en « eight rules », puisque la liste courante en porte
  huit. Régénérer le miroir CLI et les projections par `pnpm verify --fix`, puis
  inspecter chaque artefact avant le gate final. Ne pas réécrire les plans,
  specs, relevés datés ou décisions historiques qui décrivent leur ancien état.

## Review checkpoints

Le plan comporte trois petites tranches séquentielles ; aucun checkpoint humain
intermédiaire n'est nécessaire. La revue porte sur le diff final avant livraison.

## Resume point

**Next step**: Step 1 (Prouver les deux niveaux aux frontières)

**Completed**:

- Spec approuvée : `docs/specs/2026-08-21-discovery-description-budgets.md`.
- ADR accepté : `adr:81cbd775-9ba2-4e94-a172-47968ff44180`.

**Pending**:

- Step 1 : test comportemental rouge aux quatre frontières.
- Step 2 : gate et assertions alignés.
- Step 3 : doctrine, miroirs et vérification finale.
