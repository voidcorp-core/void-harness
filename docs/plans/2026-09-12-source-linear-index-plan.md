---
title: Source Linear index
date: 2026-09-12
status: done
spec: docs/specs/2026-09-12-source-linear-index.md
author: Folpe + Codex
high_risk: false
---

# Plan

Livrer la projection de maintenance approuvée, sans aucune surface consommateur.
L'approbation explicite de la spec autorise cette unité autonome d'implémentation.

## Étapes

1. Import complet et rendu : `scripts/backlog-index.mjs`, modules sous
   `scripts/backlog-index/`, tests `test/backlog-index/`. TDD strict.
   Gate : mauvais projet, pagination incomplète, doublons, contenu hostile,
   déterminisme et parcours CLI testés avant usage réel.
2. Actualisation ciblée et publication atomique : mêmes surfaces, dépend de 1.
   TDD strict. Gate : ancien état conservé après erreur, concurrence refusée,
   fraîcheur globale inchangée et aucune suppression incrémentale.
3. Procédure connecteur source-only dans `docs/LINEAR-INDEX.md` et lien dans
   le README source. Dépend de 2. TDD souple pour câblage.
   Gate : exclusion des artefacts consommateurs, génération sur les 196 tickets,
   tests concernés, lint et vérification documentaire.

## Revue

Relire explicitement la frontière des permissions et des données importées.
Les écritures Linear appartiennent au connecteur ; le rendu ne peut jamais les rejouer.
Pas de modification de statut issue ou de protection GitHub dans cette unité.

## Reprise

Les trois étapes sont réalisées. Tests ciblés : 23 verts ; import réel :
196 tickets et 319 commentaires, suivi d'un rafraîchissement ciblé de DEV-452
qui conserve la date du relevé complet. Relecture indépendante : aucun blocage
restant après corrections. Typecheck, lint (avertissements existants), suites CPU,
fichiers, sous-processus et réseau vérifiées ; la suite réseau a nécessité l'accès
loopback hors sandbox. Tarball inspecté puis installé sur un consommateur jetable
avec les deux runtimes : aucun index, identifiant tracker ou instruction mainteneur.

Limites : la collecte reste conduite par le runtime connecté, sans daemon ni hook
global. Les pages sont attestées par la procédure et contrôlées à l'import, pas
par un client Linear embarqué. La revue thématique éditoriale reste datée et séparée.
La génération requiert les primitives POSIX de lecture sûre et fsync de répertoire ;
une plateforme qui ne les fournit pas est refusée, jamais annoncée compatible.

Prochaine action administrative : PR de la branche dédiée après commit.
Ne jamais committer les données Linear locales.

Correction de câblage après le premier passage CI : les trois fichiers installés
AGENTS.md, CLAUDE.md et .gitignore sont protégés intégralement par le floor.
Le lien mainteneur passe donc par README.md et les exclusions par `.void/.gitignore`,
deux fichiers appartenant au dépôt source. Aucun garde-fou n'est modifié.
