---
name: merge
description: Vider la file des PR ouvertes sans casser le dépôt. Ordre par déblocage plutôt que par date, CI verte ET à jour, artefacts générés régénérés, conflits de contenu rendus à leur auteur. Use when merging pull requests.
---

# merge — voidcorp craftsman edition

`implement` s'arrête à la PR ouverte. `autopilot` produit une PR d'intégration. Personne ne dit
comment vider la file. Ce geste a l'air trivial jusqu'au moment où il ne l'est pas.

**Attribution**: see `.source`.

---

## Ce que ce n'est pas

Ce n'est pas une revue. Une PR entrant dans la file est supposée revue par un humain : cette skill
décide de **mécanique**, jamais de qualité. Elle ne lit pas le diff pour juger le code.

Elle ne force rien : pas de `--admin`, pas de force-push, pas de merge d'une PR rouge.

---

## Étape 1 — Lire la file, et savoir ce qui n'y entre pas

Lister toutes les PR ouvertes vers la base visée, avec pour chacune : état de mergeabilité,
conclusion de chaque check, base, brouillon ou non, auteur.

Sortent de la file, sans discussion :

- **La PR qui existe pour rester ouverte.** Une promotion permanente vers la branche de release
  est verte et mergeable en continu ; la merger est la décision de contenu du cycle, et elle
  appartient à un humain. La nommer dans le rapport, ne jamais la merger.
- **Les brouillons.**
- **Ce que l'utilisateur n'a pas visé** quand il a nommé un périmètre.

Une file vide est un résultat, pas un échec : le dire et s'arrêter.

## Étape 2 — Ordonner par déblocage, jamais par date

L'ordre correct n'a aucun rapport avec le numéro ni l'ancienneté.

1. **Une PR dont le contenu supprime la cause du conflit d'une autre passe avant elle.** Le cas
   qui a motivé cette skill : la PR réparant le workflow de back-merge était en conflit
   précisément parce que ce back-merge n'avait jamais tourné. Sans le back-merge d'abord, elle
   restait bloquée pour toujours.
2. À défaut de relation, **le moindre conflit d'abord** : ce qui se merge sans rien toucher, puis
   ce qui demande une régénération.

Chercher la relation explicitement : une PR en conflit avec la base, dont une autre PR ouverte (ou
un geste manquant) explique le conflit, attend cette autre.

## Étape 3 — Trois conditions pour merger, toutes nécessaires

| Condition | Ce qu'elle écarte |
|---|---|
| Tous les checks **verts** | Un merge qui casse la base |
| La branche **à jour** avec sa base | Des checks qui ont tourné sur une base disparue |
| Le merge **propre** | Une résolution faite dans le noir |

`BEHIND` n'est pas un feu vert. C'est le piège le plus courant : la CI est verte et la PR est
mergeable, mais les checks portent sur un état qui n'existe plus. Remettre la branche à jour,
**réattendre la CI**, puis merger.

Ne jamais contourner un refus de la protection de branche : c'est le garde-fou, au bon endroit,
et le seul qui connaisse l'état réel côté serveur.

## Étape 4 — Résoudre le mécanique, rendre le contenu

Deux natures de conflit, une seule automatisable.

**Mécanique — un artefact généré.** Bundles, catalogues, index dérivés. On **régénère depuis les
sources fusionnées**, jamais on ne choisit un côté. Un artefact choisi passe la CI et ment
ensuite : il ne correspond plus à ses sources.

**De contenu — deux intentions se croisent.** La boucle s'arrête sur cette PR et le dit. C'est un
travail d'auteur.

**Cas mixte** : un fichier généré qui porte aussi une décision, comme une version dans un
manifeste. C'est du **contenu**. Le sens de la valeur décide, pas l'emplacement du fichier. Une
version en particulier n'est jamais choisie à la main quand un outil de release la possède : la
question devient « quelle branche fait autorité sur cette valeur », et elle se pose à l'humain.

## Étape 5 — Boucler, puis rendre compte

Merger une PR rend les suivantes `BEHIND` : la file bouge à chaque tour. Reprendre à l'étape 1
tant qu'une PR **devient** mergeable.

S'arrêter quand plus rien ne progresse, et rendre alors, pour chaque PR restante, la raison exacte
du blocage — jamais « n'a pas pu être mergée ».

Après le dernier merge, vérifier que la base est saine : la suite, les gates du dépôt, et l'état
de la branche locale.

---

## Anti-rules

- MUST NOT merger une PR dont un check n'est pas vert.
- MUST NOT merger une PR `BEHIND` sans l'avoir remise à jour et avoir réattendu la CI.
- MUST NOT merger la promotion vers la branche de release.
- MUST NOT résoudre un conflit de contenu, ni choisir un côté d'un artefact généré.
- MUST NOT utiliser `--admin`, ni force-pusher une branche protégée.
- MUST NOT juger la qualité du code : la revue est un geste humain, déjà fait.

## Composition

- **Amont — `implement`** ouvre les PR que cette skill draine ; **`autopilot`** en produit une par
  cluster.
- **Avec `verify`** : après le dernier merge, la base se prouve, elle ne se suppose pas.
- **Avec `commit-discipline`** : un commit de merge dit pourquoi il a lieu, comme les autres.
