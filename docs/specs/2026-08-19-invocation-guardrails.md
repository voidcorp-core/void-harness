---
title: Garde-fous d'invocation - être prévenu quand la surface d'invocation redevient morte
date: 2026-08-19
status: in-design
author: Folpe + Claude
ticket:
related:
  - docs/specs/2026-08-17-structural-conformance.md
  - docs/plans/2026-08-19-skill-invocation-surface-plan.md
---

# Garde-fous d'invocation

## Résumé

Le chantier précédent a réparé la surface d'invocation : une skill qui en compose une autre
l'atteint désormais. Il n'a pas répondu à la question suivante, qui est celle qui a coûté les
semaines de panne : **serait-on prévenu si ça s'arrêtait de nouveau ?**

Deux verdicts, tous deux calculés sur le journal de mission déjà écrit, tous deux livrés au
démarrage de session parce que c'est le seul endroit que personne ne peut rater :

1. **Résolution.** Un composant nommé dans le journal et absent du catalogue.
2. **Vie.** Trois missions actives d'affilée sans une seule activation de skill.

## Problème

### Ce qui s'est passé

Les skills se citaient entre elles avec un préfixe qui ne résout pas en installation
project-local. Seize passes d'`implement` étaient seize appels en échec, rejoués de mémoire.
Rien n'a bronché pendant des semaines.

### Mesures du 2026-08-19

Sur les 152 missions enregistrées, six seulement portent des hooks ; les 146 autres tiennent en
un événement. Le corpus réel est de quatre missions :

| hooks | appels d'outils | activations de skill |
|---|---|---|
| 2 463 | 784 | 2 |
| 1 035 | 414 | 3 |
| 875 | 266 | **0** |
| 100 | 50 | 1 |

Les quatre activations historiques nomment `skill:ticket-writer` et `skill:brainstorming`, deux
noms retirés au renommage 3.0. **Cent pour cent du signal enregistré avant réparation nommait un
composant fantôme.** Depuis la réparation, trois missions récentes portent huit activations sous
`brainstorm`, `plan` et `checkpoint`, qui résolvent toutes.

### Pourquoi l'analyse existante n'a pas suffi

`packages/harness-graph/src/behavior/index.ts` calcule déjà `dead-node` et `telemetry-gap`. Le
calcul n'a pas manqué ; son lecteur a manqué. Deux défauts précis :

- `telemetry-gap` exige **zéro** activation. On en avait quatre. Le seuil binaire a été franchi
  par quatre événements dont aucun n'était valide.
- Les findings sortent en `severity: 'info'`, dans un rapport qui ne se lance qu'à la main.

Le garde-fou n'est donc pas un calcul de plus. C'est un destinataire, plus la réconciliation
inverse qui manque vraiment.

## Ce qui est structurellement impossible

Mesuré en direct le 2026-08-19 : une invocation de skill au nom inconnu est refusée par le
runtime **avant** le premier hook. Aucun événement n'est écrit, ni `started`, ni `completed`, ni
le `status: error` que `runtime-input.ts` sait pourtant produire. Le journal n'a pas bougé d'une
ligne.

Conséquence à assumer : **le harnais est aveugle à ses propres appels refusés.** On ne peut pas
observer la panne, seulement constater le silence qu'elle laisse. La seule façon d'observer
directement était de provoquer l'appel en CI, écarté le 2026-08-19 sur le coût récurrent.

## Le modèle

### Verdict 1 - résolution

Tout composant nommé dans un événement d'activation et absent du catalogue est signalé.
Déterministe : le nom existe ou il n'existe pas, aucun seuil, aucun faux positif possible. Sur
l'historique, ce test aurait crié sur la totalité du corpus, et il aurait attrapé
`skill:ticket-writer` le lendemain de son renommage.

### Verdict 2 - vie

Trois missions actives d'affilée sans une seule activation de skill. Une mission est active
au-delà de vingt appels d'outils, seuil déjà utilisé par l'analyse comportementale ; en dessous,
elle ne prouve rien et n'est pas comptée. Les 146 missions à événement unique disparaissent
d'elles-mêmes.

**L'activité se mesure en appels d'outils, jamais en hooks.** Une activation de skill *est* un
appel d'outil : on compare un sous-ensemble à son ensemble, dans le même registre. Compter les
hooks reviendrait à emprunter un signal d'enforcement pour parler d'invocation, et le jour où
trois hooks sont retirés du plancher, le garde-fou dériverait sans que personne fasse le lien.

Le ratio activations sur appels reste **affiché** comme contexte. Il ne décide de rien : quatre
valeurs observées (0 %, 0,25 %, 0,7 %, 2 %) ne définissent aucune normale.

### Livraison du verdict

| Surface | Contenu | Régime normal |
|---|---|---|
| Démarrage de session | une ligne, seulement si rouge | **silence total** |
| `void-harness doctor` | le rapport détaillé : noms non résolus, missions, appels | une ligne verte |

Le démarrage de session est le seul point de lecture garanti. `doctor` ne se lance qu'à la main,
et son propre bandeau dit de le lancer « si la santé du runtime est incertaine », c'est-à-dire
jamais tant que rien de visible ne casse. Livrer le garde-fou dans `doctor` seul reproduirait à
l'identique le défaut qu'il répare.

Contrainte de coût : le journal fait 27 918 lignes. Le démarrage doit rester instantané, donc le
verdict est lu depuis un cache, sur le modèle déjà en place pour la vérification de version, qui
lit le cache à l'ouverture et le rafraîchit après l'écriture de stdout.

## Un seul emplacement de journaux

Les journaux vivent aujourd'hui à deux endroits : `.void/machine/runs` (150 missions) et
`.void/runs` (3 missions, dont celles d'aujourd'hui). La cause n'est pas deux écrivains : le
harnais **installé** dans ce dépôt est antérieur à la migration, et son bundle ne contient pas
une seule occurrence de `machine`. Le défaut est déjà tracé (DEV-620, spec du 2026-08-17).

`machine/` est l'emplacement retenu : c'est le jetable, ce qui ne survit pas à la suppression du
harnais.

- Le garde-fou lit **un** emplacement. Pas de fusion permanente : elle masquerait à vie une
  migration jamais faite.
- Des journaux à l'ancien emplacement sont un **défaut signalé**, pas un cas absorbé en silence.
- `packages/cli/src/lib/graph-io.ts:36` fusionne les deux à la main, là où les sept autres points
  d'accès passent par `voidReadPath`. À aligner.

## Risques

| Risque | Parade |
|---|---|
| Le garde-fou crie sur un harnais sain | Verdict 1 déterministe ; verdict 2 exige trois missions actives |
| Le démarrage de session ralentit | Verdict lu depuis un cache, jamais recalculé à l'ouverture |
| Le bandeau devient du bruit ignoré | Silence total en régime normal, une ligne seulement si rouge |
| Un lecteur voit la moitié des journaux | Un seul emplacement, migration en attente signalée |
| Deux définitions de « skill morte » | Le verdict lit `analyzeBehavior`, il ne le réimplémente pas |

## Tests

TDD strict sur les deux verdicts et sur la lecture des journaux : ce sont des fonctions pures sur
un flux d'événements, le cas d'erreur est le seul qui compte, et le corpus réel fournit les
fixtures. Chaque verdict est prouvé sur les deux histoires mesurées : le corpus d'avant
réparation doit être rouge sur les deux verdicts, celui d'après doit être vert sur les deux.

Souple sur le rendu du bandeau et le format du rapport `doctor`.

## Écarté

- **Le smoke de comportement en CI.** Seule observation directe possible de l'échec, écartée le
  2026-08-19 : coût récurrent payé à chaque exécution pour une valeur ponctuelle.
- **Un seuil sur le ratio activations/appels.** Quatre valeurs observées, aucune normale connue.
  Un seuil inventé crie à tort puis se fait désarmer.
- **Les hooks comme preuve d'activité.** Signal d'enforcement emprunté pour parler d'invocation,
  couplage invisible entre deux responsabilités.
- **Un calcul propre au garde-fou.** Deuxième définition de la mort d'une skill, qui divergera de
  la première.
- **Une télémétrie propre au garde-fou.** Deuxième version de ce qui s'est passé dans une
  session. Le garde-fou possède son verdict, jamais sa source.
- **`doctor` seul.** Un signal correct que personne ne lance, soit exactement le défaut réparé.
