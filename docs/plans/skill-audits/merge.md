# Skill audit — `merge`

**Date**: 2026-08-19
**Spec**: `docs/specs/2026-08-19-merge.md`

## Origine

Aucune source amont. La skill est écrite depuis un cas réel : sept PR mergées à la main dans ce
dépôt le 2026-08-19, dont quatre auraient été mal traitées par un « merger tout ce qui est vert ».

| Cas | Ce qu'un merge naïf aurait fait |
|---|---|
| Promotion `develop` -> `main`, verte en permanence | Déclencher une release non voulue |
| PR réparant le workflow dont l'absence la bloquait | La laisser bloquée, ou la forcer |
| Trois PR vertes mais `BEHIND` | Merger sur une base disparue |
| Conflits sur des artefacts générés | Choisir un côté, donc livrer un artefact faux |

## Adaptations

- **L'ordre vient du déblocage, pas de la date.** Découvert en butant dessus : la PR la plus
  ancienne était celle qui devait passer en dernier, et la débloquer demandait un geste qui
  n'était dans aucune PR.
- **`BEHIND` traité comme un refus**, pas comme un détail. C'est le piège le plus fréquent :
  la couleur est verte, la base n'existe plus.
- **Régénérer plutôt que choisir** sur un artefact généré. Un artefact choisi passe la CI et ne
  correspond plus à ses sources.
- **Le cas mixte est du contenu.** Une version dans un manifeste généré n'est pas une valeur à
  arbitrer : elle appartient à l'outil de release, et la question remonte à l'humain.

## Rejets

- **Un hook refusant `gh pr merge` sur CI rouge.** Il faudrait interroger GitHub, donc mettre du
  réseau dans le plancher d'enforcement, pour dupliquer ce que la protection de branche garantit
  déjà côté serveur. Écarté avant écriture.
- **Reprendre `/land-and-deploy` de gstack.** Il merge une PR nommée puis surveille un déploiement.
  Le problème traité ici est une file, et le déploiement n'en fait pas partie.
- **Faire relire le diff par la skill.** La revue est un geste humain déjà fait quand la PR est
  ouverte ; l'ajouter ici mélangerait deux responsabilités et rendrait la boucle non déterministe.
