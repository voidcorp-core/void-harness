---
title: Mesurer la valeur de Implement et Autopilot
date: 2026-09-07
status: in-design
author: Folpe + Codex
ticket: DEV-833
related:
  - docs/VOID-MACHINE-VISION.md
  - docs/specs/2026-08-31-autonomous-until-develop.md
  - DEV-832
  - DEV-451
---

# Mesurer la valeur de Implement et Autopilot

## Décision recherchée

Déterminer, avec des preuves observables, si `Implement` et `Autopilot` améliorent
réellement la qualité du code et de l'application par rapport à un agent utilisé
seul. Le résultat doit permettre de décider, pour chaque mécanisme, de le
conserver, de le simplifier ou de le retirer.

Le rapport de mesure est un livrable en soi. Il ne déclenche aucune modification
automatique du harness. Toute évolution ultérieure devient un ticket séparé et
requiert une approbation explicite.

## Priorités et frontière humaine

La priorité est la qualité réelle du code et de l'application : un résultat
rapide ou peu coûteux ne compense pas un bug. La réduction de l'intervention
humaine est le second objectif.

La machine peut diagnostiquer, corriger et revérifier seule. Elle dispose d'un
maximum de trois cycles de correction par défaut. Un défaut critique ou de
sécurité mal compris provoque un arrêt immédiat.

Un défaut non résolu reste hors de `develop` et produit un rapport d'arrêt. Seul
un résultat intégré, testé et relu peut atteindre `develop`. Folpe examine alors
le résultat sur `develop` avant toute promotion vers la production. Il n'y a pas
d'intervention humaine pendant les exécutions comparées.

## Parcours comparés

La campagne réutilise les trois parcours réels déjà cadrés par DEV-832 :

1. un ticket réellement exécuté avec `Implement` ;
2. un petit cluster réellement exécuté avec `Autopilot` ;
3. un brainstorm répété dix fois, dont une preuve manquante doit être détectée.

Chaque parcours est exécuté dans trois conditions :

1. agent seul ;
2. agent avec `Implement` ;
3. agent dans `Autopilot`.

Le même objectif, le même commit de départ, le même modèle, la même version, le
même niveau d'effort et des ressources comparables sont utilisés dans une
cellule. Chaque cellule possède un environnement isolé. L'ordre des essais est
alterné afin de limiter l'effet d'apprentissage.

Le benchmark ne revendique pas le label « top 5 % ». Si ce claim est envisagé
ultérieurement, les conditions de DEV-451 s'appliquent, notamment la cohorte
comparable suffisante et la revue humaine aveugle.

## Architecture

Le protocole d'évaluation reste séparé du code métier et réutilise les preuves de
DEV-832 ainsi que les règles de mesure de DEV-451. Il ne crée ni nouveau runtime,
ni seconde mémoire conversationnelle, ni second contrôleur de mission.

Les trois exécuteurs produisent des sorties et des preuves dans des espaces
séparés. Un évaluateur commun applique les mêmes règles aux trois conditions,
puis un rapporteur compare les résultats. Les candidates restent séparées
pendant l'évaluation afin qu'une condition ne puisse pas contaminer une autre.

## Composants

- **Registre des tâches** : parcours, commit de départ, critères attendus et
  oracles de défaut.
- **Cellules d'exécution** : agent seul, `Implement` et `Autopilot`, avec leurs
  configurations et environnements isolés.
- **Boucle de correction** : diagnostic, correction et revérification, bornés à
  trois cycles.
- **Collecteur de preuves** : événements et résultats produits par l'exécuteur,
  jamais une déclaration du worker.
- **Revue qualité aveugle** : analyse du code et du comportement sans révéler le
  mode utilisé.
- **Rapporteur** : séparation entre échecs absolus, métriques secondaires,
  valeurs inconnues et limites de comparabilité.

## Flux d'une cellule

1. Geler la tâche, le commit de départ et les critères de réussite.
2. Lancer la cellule dans un environnement isolé, selon l'ordre expérimental.
3. Laisser la condition coder, tester, corriger et revérifier sans aide humaine.
4. Sceller les preuves : diff, événements, tests, défauts, corrections, durée,
   ressources, reprise et nettoyage.
5. Appliquer les gates absolus et écarter toute sortie non admissible.
6. Soumettre les sorties admissibles à la revue qualité aveugle.
7. Produire le rapport comparatif et présenter le résultat intégré sur `develop`
   pour la décision humaine avant production.

## Règles de qualité et d'erreur

Un seul bug critique, une fausse réussite ou une preuve inventée disqualifie la
condition concernée, même si sa moyenne est bonne. Les défauts non critiques,
les corrections nécessaires, les interventions, la durée, les ressources et le
coût sont rapportés séparément.

Un échec de test est diagnostiqué selon sa cause. Aucun retry n'est utilisé pour
fabriquer une suite verte. Un runtime ou une ressource indisponible donne un
résultat `inconnu` ou `bloqué`, jamais un succès. Une correction non résolue au
bout de trois cycles reste hors de `develop`.

Une interruption reprend depuis le dernier état scellé, sans doubler les effets
ni recommencer une intégration. Un nettoyage incomplet est signalé avec ses
reliquats bornés. Une mesure de coût indisponible reste `unknown`, jamais zéro.

## Mesures

### Mesure primaire

- nombre de bugs critiques échappés ou de fausses réussites ; la tolérance est
  zéro ;
- qualité fonctionnelle et qualité du code évaluées par la revue aveugle et les
  preuves des tests, du typecheck et du parcours réel.

### Mesures secondaires

- défauts non critiques détectés et corrigés ;
- nombre de cycles de correction ;
- interventions humaines pendant l'exécution ;
- durée et consommation de ressources ;
- coût ou usage, avec `unknown` explicite si la donnée n'est pas accessible ;
- réussite de la reprise après interruption ;
- nettoyage après succès, échec et interruption ;
- limites et pertes de comparabilité.

## Validation du protocole

Le protocole est d'abord éprouvé par des cas positifs et négatifs : preuve
absente ou fausse, bug critique, interruption, reprise et nettoyage incomplet.
Les preuves réelles de DEV-832 sont rejouées pour vérifier que les trois
parcours sont reconnus correctement.

La campagne commence par trois répétitions par cellule afin d'estimer la
variance. Le nombre d'exécutions de la campagne principale, sa cible de
confiance et son effet minimal détectable sont ensuite calculés et figés avant
la campagne principale. Les critères ne peuvent pas être modifiés après
observation des résultats principaux.

Les résultats de qualité sont relus humainement en aveugle sur le mode utilisé.
Une conclusion forte est refusée si les données sont insuffisantes, contaminées
ou non comparables.

## Phases

1. **Protocole** : critères, tâches, cellules, preuves, budget et limites.
2. **Pilote** : trois répétitions par cellule.
3. **Gel** : calcul et approbation du protocole principal.
4. **Campagne principale** : exécution sans intervention humaine.
5. **Revue et rapport** : revue aveugle, analyse et limites.
6. **Décision** : conserver, simplifier ou retirer chaque mécanisme via des
   tickets séparés.

Aucun benchmark payant n'est lancé avant l'approbation explicite du protocole et
du budget. Cette spec n'autorise aucune implémentation ni aucun changement de
comportement du harness.

## Critères d'acceptation

- [ ] Les trois parcours DEV-832 sont exécutés dans les trois conditions prévues.
- [ ] Les tâches, commits, modèles, versions, efforts et environnements sont
      comparables et les cellules sont isolées.
- [ ] Aucune aide humaine n'intervient pendant une exécution.
- [ ] Les corrections sont bornées à trois cycles et les défauts non résolus
      restent hors de `develop`.
- [ ] Un bug critique ou une fausse réussite disqualifie la condition.
- [ ] Les preuves sont produites par l'exécuteur et conservées avec leur contexte.
- [ ] Le pilote précède le gel de la campagne principale.
- [ ] La revue qualité est aveugle et la décision humaine intervient sur
      `develop` avant la production.
- [ ] Le rapport distingue qualité, défauts, interventions, durée, ressources,
      coût, reprise, nettoyage et inconnues.
- [ ] Aucun claim « top 5 % » n'est produit sans satisfaire DEV-451.

## Hors périmètre

- implémenter ou modifier `Implement`, `Autopilot` ou le noyau ;
- créer un nouveau runtime, une nouvelle mémoire ou une nouvelle couche de
  contrôle ;
- publier un paquet npm ou promouvoir `main` ;
- lancer une campagne payante avant approbation du protocole et du budget ;
- transformer ce benchmark en claim marketing ou en auto-évaluation par un seul
  juge LLM.

## Statut

Cette spec est en conception. Elle doit passer la relecture interne, puis être
explicitement approuvée par Folpe avant toute transition vers un plan ou une
implémentation.
