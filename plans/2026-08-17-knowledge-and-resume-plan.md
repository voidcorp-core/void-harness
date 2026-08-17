---
title: Connaissance et reprise - plan d'exécution
date: 2026-08-17
status: in-progress
spec: docs/specs/2026-08-17-project-knowledge-system.md
author: Folpe + Claude
high_risk: false
---

# Connaissance et reprise

## Goal

Qu'ouvrir un projet laissé de côté ne coûte plus vingt minutes de reconstruction mentale.

Le harness sait déjà lire la topologie d'un projet. Il ne sait rien de l'intention, et rien de
ce qui se passait juste avant l'arrêt. Ce programme écrit ces deux choses, les rend
interrogeables, et s'arrête là où la valeur cesse d'être prouvée.

## Pourquoi ce programme remplace le pointeur v3

Le programme v3 reste un backlog valide, mais il n'est plus le programme **exécutant**, pour
trois raisons factuelles au 2026-08-17.

**Aucun de ses tickets n'était entamé.** Le seul ticket en cours du dépôt était DEV-619, livré.
Il n'y avait donc rien à finir : le choix n'était pas entre finir et commencer, mais entre deux
backlogs non entamés.

**Son reliquat est du travail de fin de cycle.** Certification (DEV-449, 450, 453), dogfood et
certification consommateurs (DEV-454, 455, 456), Mission Control (DEV-458, 459, 460). Ces
familles présupposent un harnais stabilisé et un consommateur à certifier ; elles se placent
après une ligne de valeur, pas avant.

**Deux de ses tickets sont contredits par une direction plus récente.** DEV-459 (data plane
Mission Control authentifié) et DEV-460 (spec Mission Control x10 : identité holographique 3D,
six vues, budget 10 000 événements) répondent au même besoin que
`docs/specs/2026-08-17-void-command-center.md`, qui tranche dans l'autre sens : local, sans
backend, sans graphe décoratif, sans score. Les laisser dans un programme exécutant, c'est
garder deux réponses à une même question. Leur sort est un arbitrage humain, pas un effet de
bord de ce plan.

DEV-443 (context packs bornés) vient de v3 et **entre** dans ce programme : c'est la primitive
de contexte dont `resume` a besoin.

## Séquence

Trois tranches. Chacune est utile seule, et chacune se juge sur l'usage réel avant d'ouvrir la
suivante.

### Tranche 1 - le filet, avant toute autonomie

| Ticket | Taille | Objet |
|---|---|---|
| DEV-614 | XS | refuser un caractère de contrôle à l'écriture, avec un message utilisable |
| DEV-616 | XS | chercher un ticket existant avant d'en créer un |
| DEV-620 | S | le harnais publié écrit ses journaux dans un chemin qu'il n'ignore pas |
| DEV-615 | S | exiger un dogfood réel de la surface livrée |

DEV-619 a livré le préalable : les règles s'exécutent enfin dans ce dépôt. Ces quatre tickets
n'auraient eu aucun effet ici avant lui.

### Tranche 2 - la connaissance et la reprise

| Ticket | Taille | Objet |
|---|---|---|
| DEV-609 | M | matérialiser le graphe en artefact généré sous `.void/` |
| DEV-611 | S | régénérer au commit, brancher `session-handoff` sur `.void/session` |
| DEV-610 | L | décisions et invariants dans le graphe, livrer `why` |
| DEV-443 | L | context packs bornés par rôle |
| DEV-621 | M | `void-harness resume`, la reprise en terminal, sans interface |

**Le chemin court vers la valeur est DEV-609, DEV-611, DEV-621.** Huit points, et au bout on
sait si reprendre un projet coûte encore vingt minutes. DEV-610 et DEV-443 enrichissent ce que
`resume` a le droit de montrer ; ils ne conditionnent pas la preuve.

### Tranche 3 - le multi-projets, seulement si la tranche 2 a tenu sa promesse

| Ticket | Taille | Objet |
|---|---|---|
| DEV-622 | S | découverte par marqueur, primitives multi-projets |
| DEV-623 | L | `void-harness ui`, vue Projects et cockpit |

Condition d'ouverture écrite dans la spec : si `resume` en terminal ne fait pas gagner de
temps, aucune interface ne le fera. Cette tranche ne s'ouvre pas par défaut.

## Gates humains

- **DEV-620** touche ce que reçoivent tous les consommateurs et implique une publication.
- **DEV-623** ne s'ouvre qu'après un arbitrage explicite sur la valeur observée de `resume`.

## Ce que ce plan ne fait pas

Il ne ferme pas le programme v3, ne supprime aucun de ses tickets et ne préjuge pas du sort de
DEV-459 et DEV-460. Il déplace le pointeur d'exécution, ce qui est une décision réversible en
une ligne de frontmatter.

## Resume point

Au 2026-08-17 : DEV-613 et DEV-619 livrés et mergés, `develop` opérationnelle et protégée, le
harnais installé dans ce dépôt et ses règles actives. Les deux specs sont committées. Aucun
ticket de ce programme n'est entamé ; le premier à prendre est DEV-614.
