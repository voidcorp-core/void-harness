---
title: Autopilot - boucle continue native GitHub, curateur dédié, merge automatique sur develop
date: 2026-09-22
status: in-design
author: Folpe + Claude
ticket:
supersedes:
  - docs/specs/2026-07-25-autopilot.md
related:
  - docs/specs/2026-09-07-mesurer-valeur-implement-autopilot.md
  - https://typesafe.ai/blog/introducing-system-one-models-and-jev
---

# Autopilot : boucle continue native GitHub

## Résumé

Folpe veut revenir devant un `develop` qui a avancé : un pool de tickets pris, implémentés,
relus, conflits résolus et mergés, sans son feu vert à chaque merge. Le moteur actuel (une PR
d'intégration par cluster, réconciliation maison, environ 10 000 lignes de code et 9 000 de
tests dans `packages/cli/src/lib/autopilot/`, 1 547 lignes dans `commands/autopilot.ts`) coûte
25 à 114 minutes par ticket alors que le mode direct en a livré 16 en deux heures. Cette spec le
remplace par une boucle continue qui confie le merge aux primitives natives de GitHub et ne garde
en code que ce qu'un modèle ne doit jamais décider.

## Le curseur entre code et modèle

Principe repris de TypeSafe (System One, Jev) : **le modèle rend des jugements étroits et
typés, la politique reste dans le code.**

- Les agents gardent toute leur liberté sur le travail lui-même : choisir et classer les
  tickets, implémenter, résoudre un conflit, relire.
- À chaque point de décision, leur réponse est fermée et validée par un schéma Zod avant
  d'agir. Une réponse invalide est un refus, jamais une interprétation.
- Le code applique la politique : places, collisions, bornes de relecture, arrêts, reprise,
  merge. Aucun modèle ne peut sauter une étape ni merger lui-même.

| Point de décision | Jugement typé rendu par le modèle | Politique appliquée par le code |
| --- | --- | --- |
| Préparation d'un ticket | `ready` / `needs-enrichment` / `ambiguous` | seul `ready` obtient une place |
| Classement | file ordonnée, justification par ticket | la tête de file prend la place libre, sous réserve des collisions |
| Conflit après éjection | `mechanical` / `semantic` | `semantic` : attente humaine |
| Relecture | liste de `blocking { scénario }` et d'`advisory` | un `blocking` sans scénario est invalide ; au plus deux tours |

## Rôles, un sujet chacun

1. **Curateur** (agent dédié). Il lit l'état réel du projet : programme, specs et plans en
   cours, code, PR ouvertes, merges récents, tickets en attente humaine. Il parcourt Linear
   dans l'ordre Todo, Backlog, puis Triage, et classe selon l'intérêt du projet (ce qui
   débloque, ce qui prolonge le chantier en cours, ce qui réduit un risque réel), pas selon
   l'étiquette de priorité. Il réaligne Linear sur cet ordre (priorité, statut) et laisse sur
   chaque ticket déplacé une justification de une à deux phrases. Il enrichit un ticket flou
   avec `void-ticket` avant de le déclarer `ready`, et écarte ce qui reste ambigu. Il ne ferme,
   n'annule ni ne supprime jamais un ticket. Il tient une file classée et la réévalue après
   chaque merge, parce qu'un merge change ce qui est pertinent ensuite.
2. **Orchestrateur**. Il fait tourner la boucle, n'évalue aucun ticket et n'édite aucun code.
3. **Workers**, un par place. Chacun exécute `void-implement` en entier dans son propre
   worktree : panel de spécialistes, TDD, preuves, passe de relecture. La boucle ne réduit
   rien de ce cycle, elle le lance et en consomme le résultat.
4. **Relecteur**. C'est la passe indépendante de `void-implement`, en contexte neuf, sur le
   SHA exact. Il n'y a pas de seconde relecture de merge : ce même verdict est publié comme
   check GitHub.

## La boucle

- **Quatre places au plus** (`autopilot.clusterSize`, soit le nombre d'agents lançables en
  même temps). Dès qu'un ticket est mergé ou passe en attente humaine, sa place se libère et
  l'orchestrateur la donne à la tête de file du curateur.
- **Collisions.** Deux tickets dont les empreintes se recouvrent ne tiennent jamais deux
  places en même temps. Les chemins déclarés `sequential` dans le programme (lockfile,
  migrations, artefacts générés) n'admettent qu'une place à la fois. Un ticket sans empreinte
  déclarée n'est pas admis.
- **Une PR par ticket vers `develop`, avec l'auto-merge.** Checks requis : ceux du dépôt, plus
  `independent-review`, publié par le relecteur sur le SHA relu.
- **File de merge GitHub.** Elle rejoue les checks sur le résultat combiné avec `develop`
  avant chaque merge. Deux tickets verts séparément mais incompatibles ensemble ne peuvent
  donc pas casser `develop`. Contrainte à respecter : dans la file, un check requis doit
  répondre sur l'événement `merge_group`. `independent-review` est donc un job de CI qui, sur
  `pull_request` comme sur `merge_group`, vérifie qu'un verdict favorable existe pour le SHA de
  tête de chaque PR concernée ; le relecteur ne pose que ce verdict. Toute nouvelle poussée
  change le SHA et exige un nouveau verdict.
- **Éjection.** Une PR retirée de la file (conflit, ou rouge sur le résultat combiné) revient
  au worker de son ticket. Il met sa branche à jour sur `develop`, classe le conflit, le
  résout s'il est `mechanical`, rejoue les preuves, puis la PR repart dans la file. Après une
  mise à jour, une relecture de vérification porte uniquement sur le nouveau diff.
- **Relecture bornée.** Une passe complète, qui ne bloque que sur ce qui est faux ou
  dangereux avec un scénario concret : comportement incorrect, faille, preuve instable ou
  vide, consommateur cassé. Les advisories vont dans une seule issue Triage par ticket et ne
  reviennent jamais dans la boucle. Après correction, le relecteur vérifie seulement les
  points bloquants. Deux tours au plus ; au-delà, le ticket passe en attente humaine avec son
  constat.
- **Repli sans file de merge** (consommateur hors organisation GitHub). Les merges se font en
  série : mise à jour sur la base, checks, merge, puis PR suivante. La garantie est la même,
  le débit plus faible.

## État et reprise

- Aucun état indispensable ne vit dans la session. Qui porte quel ticket vient de Linear
  (statut, assignation, lien de PR) ; le reste vient de GitHub (PR, SHA, checks, file de
  merge, verdict `independent-review`).
- Après un redémarrage (mise à jour de l'OS, coupure, contexte saturé), le noyau déterministe
  reconstruit les places depuis ces deux sources, retrouve chaque worktree par son ticket et
  reprend sans rien refaire en double. Un ticket dont l'état est ambigu passe en attente
  humaine plutôt que d'être relancé.
- **Contrôle de l'état Git partagé** (DEV-858). Avant de lancer un worker, l'orchestrateur
  relève une empreinte (digests seuls) de la config locale, du stash, des tags, des notes et
  des remotes. Si elle a changé à la fin de l'unité, le code refuse de publier l'unité.

## Arrêts

- **Arrêt propre**, déclenché par Folpe (« on va bientôt s'arrêter ») ou automatiquement
  (plus de ticket prêt ou préparable, quota bas, trois tickets consécutifs en attente
  humaine). La boucle ne prend plus de ticket, mène ceux en cours jusqu'au merge ou à
  l'attente humaine, ferme ses agents, nettoie les worktrees mergés, puis écrit un récapitulatif :
  ce qui a été mergé, ce qui attend et pourquoi, les advisories créées.
- **Arrêt immédiat**, déclenché par Folpe. Tout se fige. Rien n'est perdu, puisque l'état est
  dans Linear et GitHub ; une reprise ultérieure repart de là.
- **Quota.** Un agent qui approche de sa limite ne reçoit pas de nouveau ticket. S'il est au
  milieu d'une unité, la limite déclenche l'arrêt propre de cette place.

## Sécurité et autorisations

- Le merge automatique ne cible que `develop`. Il est autorisé par la déclaration durable du
  programme (`autopilot.mergeGate`, `deployBranch: main`), jamais par une option de lancement.
  La promotion de `develop` vers `main` reste humaine.
- Droits minimaux pour une machine allumée en permanence : pousser des branches, ouvrir des PR,
  merger vers `develop` via la file de merge, écrire dans Linear. Aucun droit sur `main`, sur
  les secrets ni sur les réglages du dépôt. La protection de branche côté serveur reste le
  dernier rempart.
- **Changement de doctrine à acter par ADR.** La curation du backlog n'est plus exclusivement
  humaine : Folpe la confie au curateur, dans les limites ci-dessus (ne jamais fermer ni
  supprimer, justifier chaque déplacement).

## Cible d'exécution

La boucle tourne dans une session du cockpit, visible dans ses panes. La cible est un Mac mini
allumé en permanence, avec un serveur herdr auquel Folpe se connecte depuis n'importe où. La
première version est prouvée sur le poste actuel ; elle passe telle quelle sur le Mac mini.
Aucun mode cloud n'est construit.

## Ce que devient l'existant

- `void-autopilot` reste le seul skill de la boucle, réécrit en version légère.
- Le noyau déterministe garde : reconstruction de l'état, gestion des places, règles de
  collision, contrôle de l'état Git partagé, bornes de relecture, conditions d'arrêt, repli
  série. Le reste du moteur (PR d'intégration, réconciliation, scellement, publication,
  ledgers) est supprimé une fois la nouvelle boucle prouvée.
- L'évolution naturelle : la boucle comme mission durable du noyau Void Machine, quand il
  saura gérer plusieurs étapes en parallèle. Hors périmètre ici.

## Tests et preuves

- **TDD strict** sur le noyau déterministe : reconstruction depuis des états Linear et GitHub
  simulés par des doubles conformes aux API réelles, collisions, bornes de relecture,
  conditions d'arrêt, contrôle de l'état partagé.
- **TDD strict** sur les schémas des jugements typés : chaque réponse invalide est refusée.
- **Souple** sur le skill et la composition des agents.
- **Preuve de sortie** : un lot réel de deux à trois tickets passe de Linear à `develop` sans
  intervention, dont au moins un conflit résolu et une reprise après arrêt simulé. Un
  récapitulatif final est produit. Ensuite seulement, l'ancien moteur est supprimé.

## Déploiement par étapes

1. Activer la file de merge sur `develop` et ajouter le check requis `independent-review`.
2. Écrire le noyau déterministe et les schémas des jugements.
3. Réécrire le skill (curateur, orchestrateur, workers, relecteur).
4. Faire passer un lot réel de deux à trois tickets.
5. Supprimer l'ancien moteur et mettre à jour la doctrine (CLAUDE.md, AGENTS.md, ADR).
