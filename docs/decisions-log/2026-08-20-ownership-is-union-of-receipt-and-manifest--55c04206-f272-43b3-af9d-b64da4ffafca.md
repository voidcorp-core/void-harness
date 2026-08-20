---
schemaVersion: 1
id: "adr:55c04206-f272-43b3-af9d-b64da4ffafca"
createdAt: "2026-08-20T11:16:03.569Z"
title: "L'appartenance d'un asset est l'union du receipt et du manifeste"
status: accepted
deciders: []
supersedes: []
---

# L'appartenance d'un asset est l'union du receipt et du manifeste

## Context

Le harnais porte deux preuves de ce qu'il possède dans un projet, de classes opposées.
Le receipt (`.void/machine/receipts/install-v1.json`) est machine-local et gitignoré : il
enregistre ce que **cette machine** a écrit, avec les empreintes. Le manifeste
(`.void/install-manifest.json`) est committé : il nomme les chemins que **cette version**
possède, et voyage avec le dépôt.

Le code traitait ces deux preuves comme des alternatives — receipt s'il existe, sinon
manifeste. Un troisième état, non prévu, est celui qu'un consommateur réel atteint : un
receipt **présent mais partiel**. Observé le 2026-08-20 sur un projet installé en 3.0.0,
dont le receipt ne couvrait plus que 17 des 97 chemins du manifeste, dont aucun agent.

Deux mécanismes l'y avaient conduit. La migration de layout a garé le receipt précédent
sous `*.legacy`, et l'install qui a suivi n'a revendiqué que les fichiers qu'il avait
effectivement écrits : tout fichier déjà identique à ce qu'il compilait ne figurait ni dans
les mutations ni dans le receipt, et sortait donc de la propriété sans un mot. La montée
suivante, qui modifiait enfin un de ces fichiers, l'a vu comme un asset étranger et a
refusé de continuer. L'unique issue proposée était `--force`, qui écrase sans distinguer.

## Decision

L'appartenance est l'**union** des deux preuves, jamais un choix entre elles : le receipt
est complété par tout chemin que le manifeste committé nomme et qu'il ne couvre pas, et le
receipt reste autoritaire sur les chemins que les deux nomment. Un asset géré dont les
octets et le mode sont déjà identiques à ce que l'install vient de compiler est revendiqué,
et non désavoué.

## Consequences

Positive:

- Un projet dont le receipt a été amputé se répare tout seul au prochain `update`, sans
  commande supplémentaire et sans `--force`.
- La fuite de propriété est fermée à la source : plus aucun fichier ne quitte le receipt
  du seul fait que l'install n'avait rien à y écrire.
- Le cas « receipt absent » (tout clone frais) devient le cas dégénéré du même mécanisme,
  au lieu d'un chemin de code parallèle.

Negative:

- Le harnais revendique davantage, donc pourra supprimer davantage lors d'un retrait
  d'asset. La revendication reste bornée aux chemins **gérés** que l'install compile : un
  fichier partagé, co-détenu avec le projet, n'est jamais revendiqué par ressemblance, et
  une skill maison n'entre jamais dans le stage.
- Le manifeste devient une entrée de décision à chaque `update` local, non plus seulement
  au premier. Son parseur rejette déjà tout chemin non relatif ou remontant, et le refus
  porte sur le manifeste entier.

## Alternatives considered

- **Garder le modèle binaire et exiger `hydrate` puis `update --force`.** C'est l'état
  antérieur. Il demande deux commandes dont la plus effrayante de la CLI, pour un dégât que
  le harnais s'est infligé lui-même, et `--force` écrase sans distinguer un fichier édité à
  la main d'un fichier intact. Rejeté : faire payer à l'utilisateur un état qu'il n'a pas
  créé.
- **Reconstruire la propriété depuis un listage de répertoire.** Tout ce qui se trouve sous
  un préfixe géré serait déclaré nôtre. Rejeté : c'est exactement la supposition que ce
  mécanisme existe pour éviter, et elle avalerait les skills écrites à la main que le
  projet range au même endroit.
- **Comparer le disque aux empreintes du manifeste pour décider de l'adoption.** Rejeté, et
  déjà rejeté une fois : ces empreintes décrivent la version qui les a écrites, donc la
  comparaison échouerait sur chaque fichier que la nouvelle version modifie — précisément
  les fichiers pour lesquels la question se pose. Le manifeste prouve l'appartenance d'un
  **chemin**, jamais la fraîcheur d'un contenu.

## Reversal cost

Low. Le changement tient dans deux fonctions pures (`completeOwnership`,
`prepareInstallCommit`) et ne modifie aucun format persisté : un receipt écrit sous cette
règle reste lisible par la règle précédente, qui le verrait simplement plus complet.
