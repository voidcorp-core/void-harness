---
schemaVersion: 1
id: "adr:d9e2fd0a-805b-4559-a5d2-bdc5c170b33d"
createdAt: "2026-08-20T12:47:06.385Z"
title: "Une règle tient si elle est réévaluée près de l'acte"
status: accepted
deciders: []
supersedes: []
---

# Une règle tient si elle est réévaluée près de l'acte

## Context

La doctrine du harnais est chargée une fois : `CLAUDE.md` importe
`PHILOSOPHY.md` et `PROJECT-DOCTRINE.md` par `@`, en tête de contexte, et rien ne
les représente ensuite. Sur une session longue, puis après une compaction, il ne
revient que le plancher de 38 mots que pose le hook `sessionstart-context.sh`.

Les douze règles `enforce` du plancher, elles, ne faiblissent jamais : elles sont
réévaluées à chaque `Edit`, indépendamment de ce que le contexte a gardé. Le
constat est mécanique, pas moral. Une règle ne tient pas parce qu'elle est bien
écrite ; elle tient parce que quelque chose la rejoue au moment d'agir.

Vérifié sur cette base : `source-driven-development` — la règle anti-rustine, que
le mainteneur tient pour la plus importante du dépôt — est citée dans le
CHANGELOG, le CHEATSHEET, plusieurs plans, une note d'audit, et par les skills
`decide` et `claude-md`. Elle n'apparaissait **dans aucune passe** du cycle
`implement`, c'est-à-dire nulle part dans la seule skill qui écrit du code.

## Decision

Une règle forte n'existe qu'à l'endroit où elle est réévaluée. Trois emplacements
possibles, et le choix se fait par la nature de la règle, pas par son importance :

1. **Un hook `enforce`** quand la règle se décide depuis un chemin et un diff.
2. **Une passe du cycle `implement`** quand elle demande de l'intention, avec un
   prédicat observable qui décide si elle s'applique.
3. **Le texte de la doctrine seul** quand elle relève du goût, et alors elle est
   comptée pour ce qu'elle est : un rappel, pas une garantie.

L'anti-rustine se scinde selon cette grille. Sa moitié documentaire — lire la
documentation officielle de la version installée, citer la référence — devient la
passe **Source grounding**, conditionnée à l'écriture d'une configuration, d'un
schéma ou d'une signature d'appel d'une dépendance tierce, et placée **avant** la
première écriture. Sa moitié de jugement — la première implémentation qui vient à
l'esprit est souvent une rustine au mauvais niveau d'abstraction, un mock de V0
doit refléter la signature du vrai adaptateur — est nommée dans la passe
**Review**, qui est ALWAYS, et jugée sur le premier jet.

## Consequences

Positive:

- La règle survit à une compaction : elle est rejouée par le cycle, pas retenue
  par le contexte.
- Le prédicat rend la passe frugale. Un changement purement interne n'a aucune
  documentation officielle à lire, la passe ne se déclenche pas, et elle ne
  devient pas une case à cocher.
- La moitié de jugement est jugée au seul moment où elle est jugeable : sur du
  code écrit. Avant, il n'y a rien à juger.

Negative:

- Le cycle passe de onze à douze passes. C'est une passe de plus à faire tenir
  dans un budget déjà dense, justifiée seulement parce que la règle qu'elle porte
  ne tenait nulle part.
- Rien ne garantit mécaniquement que la documentation a été lue. La passe déplace
  la règle d'un texte que personne ne relit vers un cycle que chaque ticket
  parcourt ; elle ne la transforme pas en preuve.

## Alternatives considered

- **Un hook `PreToolUse` sur l'anti-rustine.** Rejeté, et c'est l'arbitrage
  central. Un hook connaît un chemin et un diff, jamais l'intention : il ne
  pourrait que crier « as-tu lu la documentation ? » à chaque écriture. Un hook
  qui crie à tort apprend à être contourné, et il emporte la crédibilité des
  douze autres avec lui.
- **Placer la moitié de jugement dans la passe Architecture.** Rejeté : cette
  passe est conditionnelle, et une rustine se glisse précisément dans les
  changements qui ne touchent aucune structure. La règle y aurait été absente
  exactement quand elle sert.
- **Rendre la passe documentaire inconditionnelle.** Rejeté au nom du principe de
  frugalité que le cycle pose déjà : « fast » signifie sauter les passes dont le
  prédicat est faux, et une passe qui se déclenche toujours cesse d'être lue.
- **Renforcer le rappel dans PHILOSOPHY.md.** Rejeté : c'est l'état antérieur, et
  il vient d'être mesuré. Le texte était présent, complet et bien écrit ; il
  n'était rejoué nulle part.

## Reversal cost

Low. La passe est une entrée du cycle et une arête déclarée dans le graphe ;
la retirer se fait en deux endroits, et la skill `source-driven-development`
existe indépendamment.
