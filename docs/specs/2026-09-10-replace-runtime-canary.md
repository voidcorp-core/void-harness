---
title: Remplacer le canary runtime par un preflight déterministe
date: 2026-09-10
status: approved
author: Folpe + Codex
ticket: DEV-838
related:
  - docs/specs/2026-09-07-mesurer-valeur-implement-autopilot.md
  - docs/plans/2026-09-07-mesurer-valeur-implement-autopilot-plan.md
---

# Remplacer le canary runtime par un preflight déterministe

## Problème

Le canary actuel lance un runtime réel sur une cellule complexe avant le pilote.
Il peut consommer du budget, dépasser la limite de sortie ou produire un diff
vide sans distinguer un défaut d'infrastructure d'un résultat métier. Il bloque
donc plusieurs fois la mesure de valeur sans fournir un signal proportionné.

## Décision

Supprimer le lancement réel du modèle comme gate préalable au pilote. Le canary
devient un preflight déterministe, local et gratuit, qui vérifie uniquement la
chaîne technique nécessaire à une cellule : tarball exact, installation isolée,
fixtures complètes et bornées, écriture d'une cible de test, capture d'un diff
non vide, nettoyage et état sain du harness.

Le pilote réel reste le premier exercice du modèle. Il conserve l'arrêt immédiat
sur résultat `unknown` ou `blocked`, diff vide, timeout, processus vivant,
preuve invalide ou nettoyage incomplet. Aucune cellule partiellement exécutée
ne sera agrégée comme résultat de campagne.

## Flux

1. Vérifier le digest du tarball et le commit consommateur gelé.
2. Créer un consommateur temporaire isolé et installer le tarball exact.
3. Charger toutes les fixtures de la cellule de preflight.
4. Modifier une cible déterministe avec une opération contrôlée.
5. Vérifier le diff capturé, l'identité de base et le nettoyage.
6. Exécuter ensuite le pilote réel avec son admission et son budget propres.

Le preflight ne lance ni Codex ni Claude et ne produit aucune mesure de qualité
du modèle. Il valide la plomberie ; le pilote mesure les parcours.

Le flux applique le fail fast : les contrôles d'identité et de bornes sont
exécutés avant toute opération coûteuse ; un échec arrête immédiatement la
suite, retourne une cause stable et lance le nettoyage sans étape suivante.
Après le démarrage du pilote, le premier résultat `unknown`, `blocked` ou non
admissible arrête l'admission de nouvelles cellules.

## Critères d'acceptation

- Le preflight échoue explicitement si le tarball, le commit ou les fixtures ne
  correspondent pas aux identités gelées.
- Le preflight échoue si la cible contrôlée ne produit pas un diff observable.
- Le preflight échoue si le nettoyage ou l'état du harness est incomplet.
- Le preflight n'effectue aucune exécution runtime et n'utilise aucun budget.
- Les contrôles peu coûteux précèdent toute installation ou exécution, et tout
  échec arrête immédiatement le flux avec nettoyage borné.
- Le pilote réel reste borné et arrête la campagne au premier résultat inconnu,
  bloqué ou non admissible.
- Les preuves distinguent clairement preflight technique et résultat pilote.
- Les tests couvrent succès, digest divergent, diff vide, sortie bornée,
  nettoyage incomplet et processus vivant.

## Hors périmètre

Cette décision ne modifie ni la taille du pilote, ni les critères de qualité,
ni les règles de promotion vers `develop` ou `main`, ni la politique d'admission
humaine. Elle ne transforme pas un résultat technique de preflight en preuve de
valeur du modèle.
