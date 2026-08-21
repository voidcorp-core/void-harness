---
schemaVersion: 1
id: "adr:2b843198-8f27-4d25-a7e9-cc1a12646bc6"
createdAt: "2026-08-20T18:32:57.275Z"
title: "Toute skill livrée porte le préfixe void-"
status: accepted
deciders: []
supersedes: []
---

# Toute skill livrée porte le préfixe void-

## Context

Le harnais installe ses skills au niveau **projet**, dans `.claude/skills/<nom>/`, sous des noms
nus : `tdd`, `plan`, `debug`, `frontend-design`. Ce nommage a été choisi quand le harnais était
le seul fournisseur de skills d'un dépôt, et treize skills ont été renommées en ce sens.

Le monde a changé. Un runtime résout aujourd'hui des skills venues de plusieurs sources, et la
documentation officielle de Claude Code (lue le 2026-08-20) en donne les règles :

> « Across levels, enterprise overrides personal, and **personal overrides project**. »
> « A skill at any of these levels also **overrides a bundled skill** with the same name. »
> « **Plugin skills use a `plugin-name:skill-name` namespace, so they can't conflict**. »

Trois conséquences, toutes mesurées sur des projets réels :

1. **L'installation échoue.** Un projet portant déjà `frontend-design` — nom que distribue aussi
   Anthropic — ne pouvait pas installer le harnais du tout. Le premier contact avec le produit
   se soldait par un rollback.
2. **Le harnais perd toujours.** `project` est le niveau de plus basse priorité. Quelqu'un
   possédant `~/.claude/skills/tdd/` n'obtient jamais la nôtre, **en silence** : rien ne le
   signale, et `doctor` est vert.
3. **Le harnais écrase Claude Code.** Nos `code-review`, `debug`, `run`, `init`,
   `security-review` masquent les skills livrées par le runtime. Cela n'avait jamais été décidé.

## Decision

Toute skill que ce harnais livre porte le préfixe `void-` : `void-tdd`, `void-plan`,
`void-frontend-design`. La grammaire de la règle 8 s'applique inchangée à la partie qui suit le
préfixe — `kind: action` prend le verbe nu, `kind: standard` le sujet qu'elle gouverne.

Le préfixe s'applique aux skills du cœur **et** des packs. Deux règles seraient pires qu'une : un
utilisateur n'a pas à se demander lesquelles sont préfixées.

## Consequences

Positive:

- Une skill apportée par le projet ou par un tiers **coexiste** avec la nôtre. Plus de collision
  à l'installation, plus de fichier à supprimer pour faire de la place.
- Le harnais cesse d'être masqué en silence, et cesse de masquer le runtime.
- **Taper `/void` énumère tout ce que le harnais apporte.** Bénéfice de découvrabilité que le
  nom nu ne pouvait pas offrir, et argument décisif du mainteneur.
- Le registre des noms retirés absorbe la transition : les 66 anciens noms nus y pointent vers
  leur successeur préfixé, donc `/tdd` répond `tdd -> void-tdd` plutôt que le silence.

Negative:

- Deux caractères de plus à taper, et 66 renommages avec leurs références croisées.
- La règle 8 est amendée, un an après avoir été posée dans l'autre sens.
- Le renommage a produit des faux positifs révélateurs : `merge` (le verbe git), `plan.concurrency`
  (un champ de configuration), `ticket DEV-123` (une expression régulière), le bloc `autopilot` de
  `active.md`. **Nos noms de skills étaient des mots communs** — ce qui est précisément pourquoi
  ils entraient en collision chez les autres.

## Alternatives considered

- **Ne rien changer et gérer la collision à l'installation.** Livré d'abord, puis rejeté par
  l'usage : le message proposait « supprime la tienne », action impossible quand la skill
  homonyme ne vous appartient pas non plus. Et cela ne réglait ni le masquage silencieux ni
  l'écrasement des skills du runtime.
- **Passer par le canal plugin**, qui offre nativement le namespace `plugin:skill`. Rejeté par le
  mainteneur : un plugin par runtime, et une dépendance de distribution contraire à la promesse
  `npx` libre et sans compte.
- **Préfixer uniquement les noms génériques.** Rejeté : la frontière serait arbitraire, et un
  utilisateur devrait retenir lesquelles sont préfixées.
- **Un séparateur namespacé maison (`void:tdd`).** Rejeté : le deux-points est réservé au
  namespace de plugin par le runtime, et l'imiter au niveau projet inviterait la confusion.

## Reversal cost

Medium. Le renommage inverse est mécanique et le registre des noms retirés le rendrait indolore
dans les deux sens ; mais chaque consommateur installé aurait à absorber un second changement de
noms, et la crédibilité d'une convention qui change deux fois ne se reconstruit pas.
