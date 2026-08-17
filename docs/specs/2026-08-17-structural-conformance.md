---
title: Conformité structurelle - doctor vérifie et répare les conventions que le harnais déclare
date: 2026-08-17
status: in-design
author: Folpe + Claude
related:
  - docs/specs/2026-08-17-project-knowledge-system.md
  - docs/specs/2026-08-17-void-command-center.md
  - docs/ARCHITECTURE.md
---

# Conformité structurelle

## Résumé

Le harnais déclare des conventions de structure. Rien ne vérifie qu'un projet consommateur les
respecte, et rien ne le remet en conformité. `doctor` devient ce moteur : chaque règle sait
détecter sa dérive et, quand la réparation est mécanique, l'appliquer.

Ce n'est pas une commande nouvelle. `doctor` porte déjà la forme exacte : chaque vérification
retourne `{ ok, message, fix }`. Le champ `fix` existe, mais comme texte à lire, jamais appliqué.

## Problème

### Trois symptômes, une cause, tous constatés le 2026-08-17

| Constat | Nature |
|---|---|
| 294 décisions dans trois projets sont dans le format monolithique que le harnais a lui-même abandonné | convention non propagée |
| Le harnais publié écrit ses journaux dans `.void/runs/`, chemin que le bloc d'ignore qu'il installe ne couvre pas (DEV-620) | convention non tenue par le produit |
| Le gate de parité des docs sœurs refusait une installation correcte | convention jugeant du généré comme de l'écrit |

Aucun de ces trois défauts n'était visible avant que le harnais soit installé dans son propre
dépôt. Aucun n'aurait été trouvé par une lecture de code. Chacun tient à ce que **le harnais
déclare une convention et que personne ne vérifie qu'un projet la respecte.**

### Le cas des décisions, mesuré

| projet | décisions | format |
|---|---|---|
| sesame | 134 | monolithe `docs/DECISIONS.md`, 1824 lignes |
| void-harness | 132 | un fichier par ADR, `docs/decisions-log/` |
| DECLIK | 80 | monolithe, 1144 lignes |
| void-music | 80 | monolithe, 2122 lignes |
| forge | 8 | monolithe, format distinct |

La connaissance existe : 426 décisions écrites. Deux conséquences.

**L'extracteur de décisions du Project Knowledge System ne trouverait rien** dans sesame, DECLIK
ni void-music : il lit `docs/decisions-log/*.md`. La couche qui devait répondre à « quelles
décisions ai-je prises » serait vide là où il y a le plus de matière.

**Et un monolithe de 1824 lignes portant 134 décisions est de la mémoire en écriture seule.** Ce
n'est pas un détail de rangement : c'est le problème lui-même. On n'y retrouve pas une décision,
on ne sait pas ce qu'elle remplace, et rien n'empêche de la réécrire après coup. Le harnais a
migré vers un fichier par décision, avec index généré et gate d'immuabilité, pour ces raisons
exactement. Il ne l'a pas prêté à ses consommateurs.

## Le modèle : détecter et réparer

Une règle de conformité déclare deux choses : comment observer la dérive, et comment la réparer.

```
règle = { détecter(projet) -> conforme | dérive(preuve),
          réparer?(projet)  -> mutations }
```

`réparer` est optionnel. Son absence classe la règle comme consultative.

### La frontière d'admission

**Le test :** deux personnes compétentes seraient-elles d'accord sur la réparation exacte, sans
en discuter ? Si oui, la règle entre avec sa réparation. Sinon, elle reste un avis.

**Entre** — mécanique, vérifiable, réparable sans arbitrage : emplacement et format des ADR,
layout `.void/`, blocs d'ignore gérés, câblage des runtimes, parité des docs sœurs, nommage des
fichiers, fraîcheur des artefacts générés.

**N'entre jamais** — une frontière hexagonale violée, un test faible, une abstraction de trop,
un nom mal choisi. Ces jugements restent à `doctrine-critic`, qui propose et ne corrige pas.

Cette frontière est ce qui empêche la commande de devenir infinie, et ce qui empêche `--fix`
d'abîmer un projet. **Un `--fix` qui arbitre est un `--fix` qui corrompt.**

## `--fix`

Jamais actif par défaut. `doctor` continue de rapporter et de nommer les réparations
disponibles ; `--fix` les applique.

Quatre garde-fous, parce que la commande écrit dans un projet qui n'est pas le sien :

1. **Montrer avant d'écrire.** `--fix --dry-run` énumère les mutations exactes.
2. **Refuser sur un arbre sale.** La réparation doit toujours être relisible en diff et
   annulable par un `git checkout`. Sur un arbre déjà modifié, les deux se confondent.
3. **Atomique par règle.** Une réparation qui échoue à mi-chemin est annulée entière.
   `commitFileTransaction`, que `init` utilise déjà, porte cette propriété.
4. **Ne jamais réparer ce qui n'est pas déclaré.** Un fichier hors du périmètre d'une règle
   n'est pas touché, même s'il paraît fautif.

`--fix` ne committe pas. Il laisse les modifications dans l'arbre : l'humain lit et committe.

## Première règle : le format des décisions

**Détection.** Un `docs/DECISIONS.md` qui porte des entrées structurées **sans se déclarer
figé**. Le signal est le marqueur de gel, pas un décompte.

Ce choix est ce qui rend la détection fiable. Ce dépôt porte 96 entrées dans son monolithe et 132
fichiers dans `docs/decisions-log/` : compter ne dirait rien, alors que l'en-tête tranche sans
ambiguïté — « Frozen legacy snapshot », suivi du pointeur vers le dossier. Un monolithe gelé et
pointant vers les fichiers est **conforme**. Un monolithe vivant est une dérive.

Corollaire utile : la réparation se termine en écrivant ce marqueur, donc elle est idempotente et
se documente elle-même.

**Réparation.** Une section devient un fichier. L'identifiant vient du numéro d'origine, le
titre du titre. La date manque dans le monolithe et se récupère par `git blame` sur la section :
sans date, une décision ne se situe pas dans le temps, et l'index généré n'a pas d'ordre. Le
monolithe devient une page d'atterrissage figée qui pointe vers les fichiers, exactement le
statut que `docs/DECISIONS.md` a dans ce dépôt.

**Ce que la réparation n'invente pas.** Les relations de supersession ne sont pas déductibles
d'un monolithe non daté ; elles restent vides et se renseignent à la main. Une réparation qui
devinerait qu'une décision remplace une autre franchirait la frontière d'admission.

**Hors périmètre.** `.forge/decisions.jsonl` appartient au plugin forge par contrat d'artefact.
La conformité ne touche pas ce qu'un autre plugin possède.

## Où vit le moteur

Dans `doctor`, pas à côté. Une seconde commande de vérification signifierait deux réponses à
« mon projet est-il en règle », ce que ce dépôt a déjà refusé au cutover autopilot.

Nuance à traiter : dans le dépôt source, `doctor` délègue déjà au doctor self-host
(`selfRepoDoctorTarget`). Les règles de conformité doivent s'appliquer aux deux cibles, ou
déclarer explicitement lesquelles ne concernent qu'un consommateur.

## Ce que ça débloque

L'extracteur de décisions du PKS trouve 426 décisions au lieu de 132. La couche qui répond à
« quelles décisions ai-je prises » devient réelle dans les projets où le travail a lieu, et non
seulement dans le méta-dépôt.

DEV-620 devient une règle plutôt qu'un correctif ponctuel : un bloc d'ignore livré qui ne couvre
pas un chemin que le runtime écrit est une dérive détectable.

## Risques

**La commande devient infinie.** C'est le risque principal. Parade : la frontière d'admission,
appliquée à chaque règle proposée, sans exception de confort.

**`--fix` casse un projet consommateur.** Parade : les quatre garde-fous, et le refus sur arbre
sale qui garantit la réversibilité.

**Une réparation en masse produit un diff illisible.** Migrer 134 décisions crée 134 fichiers.
Parade : une règle à la fois, un projet à la fois, et le contenu est déplacé sans être réécrit,
donc vérifiable par comparaison.

**Le monolithe reste édité après migration.** Parade : le marqueur de gel est justement le signal
de détection, donc une entrée ajoutée dans un fichier gelé est une dérive que la règle voit au
passage suivant.

## Tests

- Une règle sans réparation est rapportée et jamais appliquée par `--fix`.
- `--fix` refuse sur un arbre sale, avec un message qui nomme la raison.
- Une réparation interrompue laisse l'arbre exactement dans son état initial.
- La migration des décisions préserve le contenu de chaque section, octet pour octet hors
  frontmatter ajouté.
- Une décision sans date récupérable est signalée plutôt que datée arbitrairement.
- `doctor` sans `--fix` a exactement le comportement d'aujourd'hui sur un projet conforme.
- Ce dépôt, dont le monolithe est gelé et le dossier peuplé, ne déclenche pas la règle des
  décisions. C'est le test de non-régression du signal de détection.
