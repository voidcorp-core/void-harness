---
schemaVersion: 1
id: "adr:47d7b6de-c349-40ea-a38a-119570234355"
createdAt: "2026-08-20T12:30:54.601Z"
title: "Le harnais possède ses skills, le projet garde les siennes"
status: accepted
deciders: []
supersedes: []
---

# Le harnais possède ses skills, le projet garde les siennes

## Context

`.claude/skills/` est un répertoire partagé. Le harnais y matérialise ses skills,
et un projet consommateur peut y avoir des skills qui ne viennent pas de lui :
écrites sur place, importées d'ailleurs, propres à son métier. Rien dans le
chemin ne distingue les unes des autres, et deux mécanismes ont eu besoin de les
distinguer sans que la règle soit écrite.

**Le suivi par git.** La décision `derived-content-is-not-committed` (2026-08-04)
a classé les skills du harnais en contenu dérivé et les a ignorées : 1,2 Mo de
prose réécrite à chaque montée de version, présente dans tous les diffs produit.
Le commit qui l'applique protégeait la skill tierce par la forme du bloc, des
chemins énumérés depuis le manifeste, et l'a vérifié de bout en bout sur un clone
réel : « the consumer commits 9 files (settings, the hand-written skill, ...); a
clone carries only the hand-written skill ». La PR #250 (2026-08-19) a condensé
ces 148 lignes en `.claude/skills/*`, en nommant le risque déplacé et en le
confiant à un check de `doctor`. Une skill tierce est depuis ignorée par défaut,
et sa perte est la perte d'un travail, pas d'un fichier régénérable.

**La propriété au moment d'installer.** Une skill du harnais modifiée sur place
faisait échouer l'install : conflit d'asset non possédé, et `--force` pour seul
recours, celui-là même qui écrase sans distinguer. C'est ce refus qui a bloqué un
consommateur le 2026-08-20.

Les deux mécanismes butaient sur la même question sans réponse écrite : à qui
appartient un fichier sous `.claude/skills/` ?

## Decision

Le harnais possède exclusivement les skills qu'il livre, et lui seul les modifie.
Le projet possède toutes les autres, et le harnais ne les touche jamais.

Il en découle deux règles opérationnelles :

- **Une skill que le harnais ne livre pas n'est jamais ignorée.** Le bloc géré
  n'ignore que ce que le manifeste nomme ; ce qu'il ne nomme pas reste visible
  pour git sans que personne ait à écrire une ligne.
- **Une skill livrée qui a été modifiée sur place est restaurée, et la
  restauration est rapportée.** Ce n'est pas un travail à préserver, puisque la
  modifier ici n'est pas une opération permise : le changement se fait dans le
  dépôt du harnais et redescend par une version.

## Consequences

Positive:

- La question « ce fichier est-il à nous ? » a une réponse mécanique, le
  manifeste, au lieu d'une heuristique de chemin.
- Une skill tierce survit à un clone sans intervention et sans qu'on ait pensé à
  lancer `doctor`.
- Un consommateur cesse d'être bloqué par un asset que le harnais peut restaurer
  lui-même, ce qui retire au passage une raison d'atteindre `--force`.

Negative:

- La restauration écrase une modification locale. C'est le sens de la décision,
  et elle n'est acceptable que rapportée : une install qui restaure en silence
  redevient l'écrasement muet que ce dépôt refuse.
- Le bloc géré regagne des lignes que la PR #250 avait retirées. La forme retenue
  en limite le nombre en énumérant les skills tierces, qui se comptent sur une
  main, plutôt que celles du harnais, qui sont quarante et une.
- Une skill tierce portant le nom d'une skill livrée reste indistinguable et sera
  restaurée. C'est une collision de noms que la règle interdit déjà ; le harnais
  la signale plutôt que de la deviner.

## Alternatives considered

- **Garder le refus et `--force` comme unique issue** (l'état antérieur).
  Rejeté : il fait payer à l'utilisateur un état que le harnais sait réparer, et
  l'issue proposée écrase tout au lieu du seul fichier concerné. C'est
  exactement la panne du 2026-08-20.
- **Écraser sans le dire.** Rejeté : indistinguable d'une perte de données pour
  qui lit la sortie, et contraire au principe qu'une install rend compte de ce
  qu'elle a fait.
- **Laisser le bloc condensé et compter sur `doctor`.** Rejeté : c'est un
  rattrapage qui suppose qu'on lance `doctor` avant de perdre le travail, alors
  que la perte se produit au premier clone. Un filet n'est pas une garantie.
- **Confier la distinction à une convention de nom ou à un sous-répertoire
  réservé.** Rejeté : le manifeste répond déjà exactement à cette question, et
  une seconde source de vérité dériverait de la première.

## Reversal cost

Medium. Le bloc géré est régénéré à chaque install, donc revenir en arrière ne
demande qu'une version ; mais un consommateur ayant committé ses skills tierces
sous l'ancienne forme garderait un index à corriger à la main.
