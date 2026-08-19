---
title: Surface d'invocation - plan d'exécution
date: 2026-08-19
status: in-progress
spec: docs/specs/2026-08-19-skill-invocation-surface.md
ticket:
author: Folpe + Claude
high_risk: false
---

# Surface d'invocation

## Goal

Qu'une skill qui en compose une autre l'atteigne réellement, dans les trois runtimes, et que ce
qui doit s'armer tout seul s'arme tout seul. Aujourd'hui la chaîne d'`implement` cite 29 noms qui
ne résolvent pas en installation locale, et le champ qui déclare le déclenchement n'est lu par
aucun runtime. Le harnais définit bien et atteint mal.

## Découpage

Sept unités séquentielles. Chacune se juge sur une preuve observée, pas sur un diff lu.

Le Step 1 est le MVP-cut : **une paire de skills qui se compose vraiment**, de bout en bout,
avant toute généralisation. Si cette paire ne résout pas, généraliser à 60 fichiers ne ferait
qu'étendre une erreur.

---

### Step 0 — Sceller la tranche 0

- **Goal** : committer le travail déjà fait, qui supprime la collision `checkpoint` et `autopilot`
  entre command et skill.
- **Depends on** : aucune
- **TDD mode** : souple (le test et le gate existent déjà, écrits rouges puis verts)
- **Verification gate** : `pnpm test && pnpm derive:check && bash scripts/anti-bloat-check.sh &&
  pnpm sync:docs`
- **Expected commits** :
  - `fix(skills): one slash command name, one owner, because two descriptions drift`
- **Notes** : l'arbre contient déjà les suppressions de `packages/core/commands/{checkpoint,autopilot}.md`
  et leur miroir `core-assets`, le contenu porté dans les deux skills, le gate dans
  `scripts/anti-bloat-check.sh`, `test/skills/slash-command-uniqueness.test.ts`, et la règle 8
  étendue dans les deux docs sœurs. Ne pas ajouter les fichiers d'installation non suivis
  (`.claude/skills/`, `.agents/skills/`) : ils appartiennent au bloc d'ignore périmé, traité
  ailleurs. Stager les chemins nommés, jamais `git add -A`.

---

### Step 1 — Prouver la résolution des noms sur une paire

- **Goal** : `implement` compose `tdd` et l'atteint réellement en installation project-local.
- **Depends on** : step-0
- **TDD mode** : strict
- **Verification gate** : le nouveau test échoue avant la correction et passe après ; il monte un
  projet temporaire, y installe le harnais local, et vérifie qu'un nom cité dans le corps d'une
  skill figure bien dans la liste des skills invocables de ce projet.
- **Expected commits** :
  - `test(skills): a composed skill name must resolve in a local install`
  - `fix(skills): name the neighbouring skill, not its plugin invocation syntax`
- **Notes** : nouveau fichier `test/skills/composition-resolves.test.ts`. Il lit les noms cités
  dans `packages/core/skills/implement/SKILL.md` et `packages/core/skills/tdd/SKILL.md`, et les
  compare aux répertoires de `packages/core/skills/`. Un nom cité qui ne correspond à aucun
  répertoire, ou qui porte un préfixe, est un échec. La correction se limite à ces deux fichiers :
  la généralisation est le step suivant.

---

### Step 2 — Écrire la règle de résolution là où elle a le droit d'exister

- **Goal** : le bloc géré de `CLAUDE.md` et `AGENTS.md` dit comment invoquer une skill nommée,
  selon le canal d'installation. C'est le seul endroit qui connaît un préfixe.
- **Depends on** : step-1
- **TDD mode** : strict
- **Verification gate** : `pnpm vitest run packages/cli/src/lib/claude-md.test.ts` plus un test
  qui vérifie que le bloc rendu pour une installation locale ne contient aucun `harness:`, et que
  le bloc rendu pour le canal marketplace le contient.
- **Expected commits** :
  - `test(cli): the managed block states how a named skill is invoked per channel`
  - `feat(cli): render the skill resolution rule from the install channel`
- **Notes** : `packages/cli/src/lib/claude-md.ts` porte déjà la distinction
  `isClaude ? '`harness:implement`' : '`implement`'` ligne 48. Cette ligne est le germe : elle
  distingue le runtime alors que la variable réelle est le **canal**. Corriger la variable, pas
  seulement ajouter la phrase.

---

### Step 3 — Généraliser aux 223 références, avec le gate qui l'empêche de revenir

- **Goal** : plus aucune référence préfixée dans le corps d'un asset livré, et un gate qui refuse
  la réintroduction.
- **Depends on** : step-2
- **TDD mode** : strict
- **Verification gate** : `pnpm skills:check-references` réécrit passe ; `bash scripts/anti-bloat-check.sh`
  refuse un `harness:` injecté dans un `SKILL.md` (prouvé par injection, comme le gate de la
  tranche 0) ; `pnpm test` complet vert.
- **Expected commits** :
  - `test(scripts): a reference gate must reject a name the runtime cannot resolve`
  - `refactor(skills): cite every neighbouring skill by its bare name`
  - `feat(scripts): refuse a plugin-prefixed reference in a shipped asset`
  - `docs(decisions): the bare name is the written form of a skill reference`
- **Notes** : l'enregistrement se crée avec `void-harness decisions new` : la forme des
  références a deux alternatives crédibles, la réécriture à l'installation et l'abandon du canal
  marketplace, toutes deux argumentées dans la spec. 223 occurrences, 60 fichiers, 29 noms distincts. La réécriture est mécanique mais
  elle traverse les 37 `SKILL.md`, les agents et les packs. `scripts/check-skill-references.mjs`
  change de contrat : il validait l'existence au catalogue, il doit valider l'invocabilité. Sa
  regex actuelle `(?<!void-)\bharness:([a-z0-9]+(?:-[a-z0-9]+)*)` devient le motif **interdit**,
  et le motif reconnu devient le nom nu entre accents graves. Attention aux faux positifs :
  `void-harness:` est déjà exclu, et les specs, plans et décisions restent hors périmètre parce
  qu'ils citent l'état d'alors.

---

### Checkpoint A — après le Step 3

Folpe lance une implémentation réelle et observe que la chaîne se déroule : les passes de
`implement` chargent les skills qu'elles nomment au lieu de les rejouer de mémoire.

Stop ici. Lancer `verify`. Attendre le signal avant le Step 4.

C'est le seul moment du plan où la valeur est vérifiable par l'usage plutôt que par un test.

---

### Step 4 — Supprimer `commands/`

- **Goal** : `void-doctor`, `void-audit` et `void-graph` deviennent des skills ; `void-feedback`
  est fondu dans `learn` ; `packages/core/commands/` disparaît.
- **Depends on** : step-3
- **TDD mode** : strict
- **Verification gate** : les quatre anciens noms sont couverts — trois invocables comme skills,
  le quatrième documenté comme fondu ; `${CLAUDE_PLUGIN_ROOT}` absent de tout asset installé ;
  `pnpm derive:check` et `pnpm test` verts.
- **Expected commits** :
  - `test(skills): the CLI-facing gestures resolve as skills on every runtime`
  - `feat(skills): turn the four commands into skills, so Codex and Kimi receive them`
  - `refactor(skills): fold void-feedback into learn, which already owns branch B`
  - `feat(cli): resolve the plugin root at install time`
  - `docs(decisions): commands are a legacy format, every gesture is a skill`
- **Notes** : l'enregistrement se crée avec `void-harness decisions new` et couvre les deux
  décisions de ce step, la disparition de `commands/` et la fusion de `void-feedback` dans
  `learn`, chacune avec l'alternative qu'elle écarte. Les trois conversions portent `disable-model-invocation: true` et gardent leur
  `allowed-tools`. Chaque nouvelle skill doit satisfaire les gates existants : `.source`
  co-localisé, note d'audit dans `docs/plans/skill-audits/<nom>.md`, `kind`, description sous
  200 caractères. Pour `learn`, ajouter les phrases déclencheuses de `void-feedback` dans
  `when_to_use` et vérifier que la branche B reste sous le plafond de 400 lignes. Le gate
  « un nom, un propriétaire » devient « aucun fichier sous `*/commands/` ». `${CLAUDE_PLUGIN_ROOT}`
  se traite dans `packages/cli/src/lib/runtime-assets.ts`, à côté de `rewriteHookCommand` qui
  fait déjà ce travail pour les hooks.

---

### Step 5 — Rendre le déclenchement réel

- **Goal** : les standards s'arment sur le fichier, et un refus de hook nomme la skill qui
  s'applique.
- **Depends on** : step-4
- **TDD mode** : strict
- **Verification gate** : un test vérifie que chaque `paths` déclaré matche au moins un fichier
  réel du dépôt (un glob qui ne matche rien est un déclenchement mort, indétectable à l'usage) ;
  un test vérifie qu'un refus de hook nomme une skill qui existe au catalogue.
- **Expected commits** :
  - `test(skills): a declared path glob must match a real file`
  - `feat(skills): arm the file-scoped standards with paths`
  - `test(hooks): a refusal names the skill that governs the rule`
  - `feat(hooks): name the governing skill in the refusal message`
- **Notes** : `paths` ne concerne que les `kind: standard` dont le périmètre est réellement un
  chemin. Une action ne prend jamais `paths` : elle se déclenche sur une intention, pas sur un
  fichier. La liste exacte se décide à l'exécution et se prouve par le test de matching ; le
  risque nommé dans la spec est le bruit, donc en cas de doute une skill n'en prend pas.
  `paths` est un accélérateur Claude Code ; sur Codex et Kimi le niveau équivalent est le hook,
  déjà câblé des deux côtés par `_void-hook.mjs`. C'est aussi le step où
  `enforcement.inline` devient la source du câblage au lieu d'une déclaration lue par le seul
  graphe.

  **Le critère d'admission à `paths`, pour qu'il ne se décide pas au jugé.** Une skill en prend
  un si et seulement si les trois conditions tiennent : son `kind` est `standard` ; la règle
  qu'elle porte s'applique à **tout** fichier du glob, sans exception qu'il faudrait juger ; et
  elle est déjà tenue par un hook `PreToolUse` sur le même périmètre, ce qui prouve que le
  périmètre est mécaniquement décidable. Les treize hooks câblés donnent donc la liste de
  départ : `tdd` (`tdd-order`), `typescript-strict` (`no-any`, `no-as-cast`), `observability`
  (`no-console`), `functional` (`no-null`), `testing` (`no-focused-test`, `test-name`),
  `hexagonal-architecture` (`boundary-direction`), `frontend-design` (`design-slop`),
  `security-guidance` (`secret-content`). Une skill hors de cette liste n'en prend pas dans ce
  step.

---

### Step 6 — Passer aux conventions Agent Skills

- **Goal** : le frontmatter des 37 skills est conforme à la spécification, et la conformité est
  gardée en CI.
- **Depends on** : step-5
- **TDD mode** : strict
- **Verification gate** : la validation passe sur les 37 skills et est câblée dans
  `.github/workflows/ci.yml` ; `pnpm test`, `pnpm derive:check` et le graphe restent verts.
- **Expected commits** :
  - `test(skills): frontmatter carries only the fields the spec allows`
  - `refactor(skills): move the proprietary fields under metadata`
  - `feat(graph): read the harness fields from metadata`
- **Notes** : `kind`, `owner`, `runtimes`, `enforcement`, `eval_targets` passent sous `metadata`
  en clés plates préfixées `void_`, parce que la spec veut une map chaîne vers chaîne et que
  `enforcement` est aujourd'hui imbriqué. Consommateurs à migrer :
  `packages/harness-graph/src/derive/read-frontmatter.ts`, `state/score.ts`, `model/types.ts`, et
  la lecture de `kind:` dans `scripts/anti-bloat-check.sh`. Vérifier d'abord si `skills-ref
  validate` est installable proprement ; sinon écrire le validateur maison qui applique la liste
  blanche de la spec, ce qui est de toute façon plus sûr qu'une dépendance non vérifiée sur un
  chemin de CI.

---

## Ce que ce plan ne fait pas

- **Le bloc `.gitignore` géré et son check dans `doctor`.** Il appartient à
  `docs/specs/2026-08-17-structural-conformance.md`, qui nomme déjà « blocs d'ignore gérés » dans
  sa frontière d'admission. Le défaut est constaté et documenté ; sa réparation se planifie là-bas.
- **La revue du contenu des 37 skills, une par une.** Elle vient après le Step 6, et elle a besoin
  que les liens résolvent pour juger autre chose que la plomberie. C'est un programme séparé, à
  spécifier quand celui-ci est fini.
- **Les 21 agents.**

## Gates humains

- Checkpoint A après le Step 3, sur usage réel.
- Chaque étape produit une PR que Folpe relit et merge. Aucun merge automatique, sur aucun chemin.

## Execution handoff

| Ordre | Unité | Dépend de | Gate humain |
|---|---|---|---|
| 1 | Sceller la tranche 0 | - | non |
| 2 | Prouver la résolution sur une paire | 1 | non |
| 3 | Règle de résolution dans le bloc géré | 2 | non |
| 4 | Généraliser aux 223 références + gate | 3 | **oui, checkpoint A** |
| 5 | Supprimer `commands/`, fondre void-feedback | 4 | non |
| 6 | Déclenchement réel : paths + hooks nommants | 5 | non |
| 7 | Conventions Agent Skills + validation CI | 6 | non |

Les sept unités sont séquentielles : chacune modifie la surface que la suivante lit. Aucune ne se
parallélise, ce qui exclut `autopilot` pour ce programme.

## Resume point

Valable tant que ce programme est autonome. Dès que `ticket` aura créé les unités dans le
tracker, la table ci-dessus et l'état natif du tracker font autorité, et ce pointeur n'est plus
maintenu : deux pointeurs de progression donnent deux réponses à « où on en est ».

**Prochaine étape** : Step 0 (sceller la tranche 0).

**Fait** :
- Tranche 0 écrite, non committée : collision command/skill supprimée sur `checkpoint` et
  `autopilot`, gate et test associés, règle 8 étendue.
- Spec écrite et approuvée : `docs/specs/2026-08-19-skill-invocation-surface.md`.

**En attente** : Steps 0 à 6.
