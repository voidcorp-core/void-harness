# PROJECT-DOCTRINE.md

Ce fichier est chargé dans chaque session par `@.void/PROJECT-DOCTRINE.md`, aux
côtés de `.void/installed/PHILOSOPHY.md` (universel, géré par void-harness) et de
`CLAUDE.md` (qui gouverne le travail **sur** le harnais).

Il ne répète ni l'un ni l'autre. Il porte ce qu'aucun des deux ne dit et qu'on a
dû rétablir plus d'une fois : le vocabulaire du dépôt, les arbitrages qu'on
rouvre par réflexe, et ce qui est en cours de décision.

**Ce fichier ne porte pas de règle forte.** Mesuré le 2026-08-20 : la doctrine est
chargée une seule fois, en tête de contexte, et ne survit pas à une compaction —
seuls les 38 mots du hook `SessionStart` reviennent, là où les douze règles
`enforce` sont réévaluées à chaque `Edit`. Une règle qui doit tenir va donc dans
un hook, ou dans une passe du cycle `implement`. Voir la décision
`a-rule-holds-where-it-is-re-evaluated`. Ce qui vit ici est du **contexte** : ce
qui aide à calibrer un jugement, pas ce qui doit l'imposer.

---

## Vocabulaire du dépôt

Trois mots portent la moitié des malentendus. Les employer exactement.

| Terme | Ce qu'il désigne précisément |
|---|---|
| **receipt** | `.void/machine/receipts/install-v1.json`. Ce que **cette machine** a écrit, avec les empreintes. Machine-local, gitignoré, **absent de tout clone**. |
| **manifeste** | `.void/install-manifest.json`. Les chemins que **cette version** possède, plus leurs empreintes. Committé, voyage avec le dépôt. Prouve l'appartenance d'un **chemin**, jamais la fraîcheur d'un contenu. |
| **observé / dérivé / déclaré** | Les trois classes de `.void/`, nommées par ce que leur suppression coûte. Observé = jetable (`machine/`). Dérivé = restauré à l'identique par l'install (`installed/`). Déclaré = écrit par le projet, jamais écrasé (racine de `.void/`). |
| **plancher** | Les règles `enforce` exécutées à chaque `Edit` par `.void/hooks/`. C'est le **harnais publié** qui tourne ici, pas l'arbre de travail — la distinction est ce qui permet de développer une règle sans se verrouiller le dépôt. |
| **passe** | Une étape du cycle `implement`, gardée par un prédicat observable. Une passe dont le prédicat est faux ne tourne pas ; une passe qui tourne toujours devient une case à cocher. |
| **source / installé** | `packages/core/skills/` est la source. `packages/cli/core-assets/` est la copie de build, `.claude/skills/` l'installé. **On édite la source**, jamais une copie ; `pnpm derive` régénère le reste. |

---

## Arbitrages tranchés — ne pas rouvrir

Les 145 décisions vivent dans `docs/decisions-log/`. Celles-ci reviennent le plus
souvent dans les conversations, alors autant les nommer ici.

- **Le harnais possède ses skills, le projet garde les siennes.** Une skill qu'il ne livre pas n'est jamais ignorée ni touchée ; une skill livrée modifiée sur place est restaurée. C'est le **manifeste** qui répond, jamais le chemin. → `harness-owns-its-skills-project-keeps-its-own`
- **Une skill livrée qui ne suffit pas ne se corrige pas ici.** On ouvre une issue sur `voidcorp-core/void-harness` via `learn` (branche B), et le correctif redescend par une version.
- **Le contenu dérivé n'est pas committé**, sauf ce dont l'absence est une *erreur* et non une dégradation : `.void/hooks/` et `.codex/hooks.json`. → `derived-content-is-not-committed`
- **Les tirets cadratins et emojis restent hors CI.** Règle de goût portée par `commit-discipline`, délibérément sans gate. Décidé le 2026-06-01, ne pas re-proposer de linter.
- **Aucune distinction méta / consommateur dans les mécanismes.** Ce qui diffère est la taille de la part du projet, pas la règle. Une règle juste n'a pas besoin de savoir où elle tourne. Seule exception nommée : `preserveDoctrine`, parce que `PHILOSOPHY.md` est canonique ici et installé ailleurs.
- **Pas d'`--auto-merge`, sur aucun chemin.** Merger est le moment où un humain lit le diff entier.
- **La règle « un build ne lit que des fichiers versionnés » reste locale à ce dépôt.** Elle ne monte pas dans `PHILOSOPHY.md` : son mécanisme (`test/builders/`) ne part chez aucun consommateur, et `PHILOSOPHY.md` refuse toute règle sans mécanisme.

---

## Ce qui est en cours de décision

À tenir à jour, et à vider quand c'est tranché.

- **DEV-645** — le manifeste enregistre l'empreinte entière de cinq fichiers co-détenus (`.gitignore`, `CLAUDE.md`, `PROJECT-DOCTRINE.md`, `.claude/settings.json`, `.void/config.json`). Un consommateur qui les personnalise a `void manifest` rouge à vie. Correction décidée, non implémentée : présence attendue, contenu non gouverné.
- **DEV-646** — le bloc `.gitignore` livré capture les skills que le projet a apportées.
- **DEV-647** — restaurer et rapporter, au lieu de bloquer sur un asset divergent. Décide au passage ce qui reste de `--force`.
- **DEV-648** — rien ne fait respecter « seul le harnais modifie ses skills ». Une règle `enforce` manque, et c'est elle qui doit router vers `learn`.
- **Chantier 2 de doctrine** — auditer chaque règle de `PHILOSOPHY.md` en trois colonnes (mécanisme déclaré / mécanisme réel / mécanisable), en tenant qu'une **skill n'applique rien** : c'est du texte qui doit être invoqué pour exister. Audit à poser avant tout code.
