---
title: Autopilot - plan d'implémentation sur une base saine
date: 2026-07-25
status: in-progress
spec: docs/specs/2026-07-25-autopilot.md
author: Folpe + Codex
high_risk: true
---

# Autopilot - plan d'implémentation

## Goal

Remplacer le mélange actuel de batch attended, ancien loop et auto-merge par un
bounded context `autopilot` unique. Une activation durable dans
`plans/ACTIVE.md` permet aux sessions suivantes de reprendre le programme sans
nouvelle consigne. Autopilot sélectionne au plus quatre tickets Linear prêts et
indépendants, exécute le vrai `ticket-runner` dans un worktree par ticket,
conserve une plage de commits par ticket, réconcilie localement, publie une seule
PR après la suite complète et s'arrête à la fusion humaine.

Le premier cut utile est `autopilot plan` : nouveau nom, ancien nom en erreur de
migration, un seul modèle de configuration et aucune mutation. Les tranches
suivantes ajoutent réservation, workers, réconciliation, publication puis
reprise sans réintroduire un second moteur.

## Architecture cible

### Une seule frontière

Le code actif vit sous :

```text
packages/cli/src/lib/autopilot/     domaine déterministe + état versionné
packages/cli/src/commands/autopilot.ts
packages/core/skills/autopilot/
packages/core/commands/autopilot.md
```

`packages/cli/src/lib/backlog/` n'est pas conservé comme couche legacy. Les
algorithmes purs utiles sont déplacés, renommés et retestés dans le nouveau
bounded context. Les chemins auto-merge, headless, stream et configuration
autonome qui ne servent plus sont supprimés. Le stub
`backlog-autopilot` ne contient aucune logique métier : il retourne seulement le
code d'erreur et la commande de migration.

### Functional core, imperative shells

- Le CLI calcule, valide et persiste un état local. Il ne contacte ni Linear ni
  GitHub et ne lance aucun agent.
- Le skill L0 lit les connectors, fournit au CLI des observations bornées,
  applique les actions calculées, puis réobserve le résultat.
- Le Workflow orchestre les worktrees et retourne des résultats
  machine-readable. Il ne décide ni de la sélection, ni de la fusion.
- `ticket-runner` reste l'unique cycle mono-ticket.
- Le reconciler est l'unique propriétaire de la branche d'intégration, des
  conflits, des artefacts partagés, du push et de la PR.

Les frontières externes utilisent des objets observation/action validés. Il n'y
a ni conteneur de dependency injection, ni faux client Linear dans le domaine.

### Contrat CLI machine-readable

Toutes les entrées/sorties JSON portent `schemaVersion: 1`. Les commandes sont :

```text
autopilot plan   [--active plans/ACTIVE.md] < CandidateObservation
autopilot start  [--active plans/ACTIVE.md] < ReservationReceipt
autopilot status --run <runId>
autopilot resume --run <runId> < RemoteObservation
autopilot abort  --run <runId> < RemoteObservation
```

- `CandidateObservation` contient les tickets Linear hydratés, relations,
  états, commentaires et footprints.
- `ReservationReceipt` contient le plan choisi et la réobservation prouvant que
  chaque claim Linear a réussi avec le même `clusterId`.
- `RemoteObservation` contient les états Linear et GitHub explicitement lus par
  le skill L0. Le CLI ne les fabrique pas.
- chaque sortie mutante est un `ActionPlan` avec préconditions et clés
  d'idempotence ; le skill applique, réobserve, puis rappelle le CLI ;
- une erreur d'usage ou de schéma sort `2` avec problème/cause/correction ;
  un état métier bloqué reste un JSON valide typé, pas une exception.

`status` sans observation distante annonce honnêtement quand son résultat exige
un refresh. `resume` et `abort` n'agissent jamais à partir du seul curseur local.

### Un seul modèle d'état

`plans/ACTIVE.md` porte le consentement et le routage stables.
`.void/autopilot/<runId>/state.json` porte le curseur technique local. Linear,
GitHub et Git restent les sources de vérité distantes.

L'état local est versionné, validé à la lecture, écrit atomiquement et borné. Un
état legacy est préservé mais refusé avec une erreur actionnable ; il n'est pas
silencieusement converti par une heuristique.

Les noms Git sont fixes :

- worker local : `autopilot-worker/<clusterId>/<ticketId>` ;
- intégration distante : `autopilot/<clusterId>` ;
- worktrees :
  `.void/autopilot/<runId>/worktrees/<ticketId|reconcile>`.

Ils sont dérivés d'identifiants slug-validés, jamais d'un titre libre.

### Configuration exécutable sans shell implicite

Le bloc `autopilot` de `ACTIVE.md` utilise des commandes argv :

```yaml
autopilot:
  enabled: true
  clusterSize: 4
  base: auto
  mergeGate: human
  verifyCommands:
    - [pnpm, build]
    - [pnpm, test]
  ownership:
    sequential:
      - pnpm-lock.yaml
      - "**/migrations/**"
    reconcileOnly: []
```

`clusterSize` est borné à `1..4` dans le premier incrément.
`mergeGate: human` est la seule valeur acceptée. Une commande est exécutée avec
`shell:false`. Les projets peuvent déclarer des artefacts `reconcileOnly` et
leur commande de rebuild sans encoder les chemins de void-harness dans le core.

### Compatibilité avec le programme v3

Les Steps 1 à 4 peuvent avancer indépendamment du nouveau moteur team. Le
premier worker Autopilot (Step 5) attend que le `ticket-runner` canonique du
programme v3, références L11/L12, soit fusionné ou expose son contrat final.
Autopilot consomme ce contrat ; il ne le copie pas.

Un `plans/ACTIVE.md` déjà `executing` n'est jamais remplacé. Lors du ticketing,
les unités de ce plan sont soit ajoutées explicitement au programme v3 par le
mainteneur, soit gardées en attente jusqu'à sa clôture. `ticket-writer` doit
échouer sur une collision, pas repointer le fichier.

`session-close`, déjà suivi dans DEV-442, reste un consommateur futur de l'état
et du commentaire de reprise. Il n'est pas fusionné dans Autopilot.

### Feature sœur : cheat sheet du harness

Une cheat sheet exhaustive est conservée comme feature sœur, hors du bounded
context Autopilot. Elle passe par son propre brainstorming/spec avant ticketing.
La direction recommandée est :

- `void-harness cheatsheet --format html|markdown|json`, HTML par défaut ;
- artefact statique, autonome, offline, ouvrable sans serveur ;
- recherche instantanée, filtres runtime/pack/type et commandes copiables ;
- vues « tout le catalogue », « installé/actif ici » et « je veux faire X » ;
- données dérivées de `model.json`, `certification.json`, des frontmatters et
  métadonnées CLI, jamais une deuxième liste maintenue à la main ;
- HTML accessible, imprimable et utilisable au clavier ; Markdown/JSON servent
  le terminal, les agents et les tests de parité.

Cette feature ne modifie ni l'état Autopilot ni son ordre de livraison. Son
critère architectural principal sera : aucune entrée de catalogue ne peut
diverger entre le CLI, le graph et la cheat sheet.

## Steps

### Step 1 - Livrer le cut plan-only sous le nom canonique

- **Goal**: rendre `void-harness autopilot plan` et
  `/harness:autopilot` utilisables sur une frontière propre, avec l'ancien nom
  limité à une erreur de migration.
- **Depends on**: none
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/commands/autopilot.ts`
  - créer `packages/cli/src/commands/autopilot.test.ts`
  - réduire `packages/cli/src/commands/backlog-autopilot.ts` au stub de migration
  - mettre à jour `packages/cli/src/main.ts`
  - mettre à jour `packages/cli/src/commands/help.ts`
  - mettre à jour `packages/cli/src/commands/help.test.ts`
  - créer `packages/cli/src/lib/autopilot/cluster-plan.ts`
  - créer `packages/cli/src/lib/autopilot/cluster-plan.test.ts`
  - déplacer et renommer dans `packages/cli/src/lib/autopilot/` les seules
    fonctions utiles de `batch-select.ts` et `batch-partition.ts`
  - créer `packages/cli/src/lib/autopilot/legacy-boundary.test.ts`
  - supprimer ensuite tout `packages/cli/src/lib/backlog/`, tests compris ;
    aucun module dormant n'est conservé pour une phase future
  - créer `packages/core/skills/autopilot/SKILL.md`
  - créer `packages/core/skills/autopilot/.source`
  - créer `packages/core/commands/autopilot.md`
  - réduire les anciennes surfaces skill/command à un message de migration
  - déplacer le workflow vers
    `packages/core/skills/autopilot/workflows/autopilot.workflow.js`
  - renommer `plans/skill-audits/backlog-autopilot.md` en
    `plans/skill-audits/autopilot.md` et documenter la nouvelle adaptation
  - mettre à jour les références vivantes dans `README.md`,
    `docs/ARCHITECTURE.md`, `docs/CODEX.md`, `AGENTS.md` et `CLAUDE.md`
- **Behavior**:
  - `plan` accepte uniquement des tickets hydratés et des footprints validés ;
  - le résultat contient au plus un cluster de quatre tickets indépendants,
    partitionné `parallel`/`sequential`, avec raisons et exclusions ;
  - une dépendance ouverte, un état non prêt ou une entrée mal formée est
    exclue avec une cause typée ;
  - `void-harness backlog-autopilot ...` sort avec code `2` et affiche
    `void-harness autopilot ...` ;
  - aucun flag `--auto-merge` n'apparaît sur la nouvelle surface.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/commands/autopilot.test.ts packages/cli/src/lib/autopilot/cluster-plan.test.ts packages/cli/src/commands/help.test.ts`
  - `pnpm --filter voidharness typecheck`
  - `pnpm anti-bloat:check`
  - tests couvrant vide, 1 ticket, 4 tickets, 5e exclu, bloqueur ouvert,
    overlap, faible confiance, migration et ancien nom
  - `legacy-boundary.test.ts` prouve que `lib/backlog/` n'existe plus et que les
    seuls `backlog-autopilot` actifs sont les stubs de migration
- **Expected commits**:
  - `test(autopilot): define the canonical plan-only surface because migration must fail explicitly`
  - `refactor(autopilot): establish one planning boundary because the new name must not wrap legacy engines`
- **Notes**: le planner ne conserve pas de code dormant pour les clusters
  dépendants ou le multi-cluster. Ses types gardent des identifiants et raisons
  extensibles, mais le comportement livré correspond au cut approuvé.

### Step 2 - Installer la configuration durable du programme actif

- **Goal**: valider un seul modèle de configuration Autopilot, partagé par le
  CLI et le bootstrap des runtimes.
- **Depends on**: Step 1
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/active-program.ts`
  - créer `packages/cli/src/lib/autopilot/active-program.test.ts`
  - créer `packages/cli/src/lib/autopilot/errors.ts`
  - supprimer `.void/autonomous.json` du contrat et toute référence vivante
  - mettre à jour `packages/cli/src/lib/claude-md.ts` et son test de bootstrap
  - mettre à jour `packages/core/skills/ticket-writer/SKILL.md`
  - mettre à jour `packages/core/skills/writing-plans/SKILL.md`
  - mettre à jour `docs/ARCHITECTURE.md` et `docs/CONTRIBUTING.md`
- **Behavior**:
  - `active-program.ts` lit un frontmatter YAML borné et root-confined ;
  - le schéma exige `status`, programme, plan, spec, tracker et bloc
    `autopilot` ;
  - `enabled:false` est valide et interdit toute nouvelle sélection ;
  - `mergeGate` autre que `human`, `clusterSize > 4`, commande vide, chemin
    absolu ou chemin sortant du repo échoue avec problème, cause et correction ;
  - provider `linear` est supporté au premier incrément ; un autre provider est
    déclaré non supporté sans prétendre à une continuité automatique.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/active-program.test.ts`
  - fixtures : fichier absent, désactivé, Linear valide, YAML invalide, path
    escape, tableau argv invalide, cluster 0/5, merge gate non humain
  - `pnpm decisions:check`
  - `pnpm vitest run packages/cli/src/lib/claude-md.test.ts`
- **Expected commits**:
  - `test(autopilot): reject ambiguous activation because durable consent must be explicit`
  - `feat(autopilot): load the active program contract because sessions need durable authority`
- **Notes**: si le bootstrap active-program d'un autre ticket a déjà atterri,
  l'adapter à ce schéma sous tests. Ne jamais conserver deux formes de
  `ACTIVE.md` ou deux règles de sélection.

### Step 3 - Réserver atomiquement un cluster Linear

- **Goal**: calculer une reprise ou une réservation de cluster sans double claim
  et sans stocker un faux état Linear local.
- **Depends on**: Step 2
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/tracker-observation.ts`
  - créer `packages/cli/src/lib/autopilot/cluster-reservation.ts`
  - créer `packages/cli/src/lib/autopilot/cluster-reservation.test.ts`
  - créer `packages/cli/src/lib/autopilot/linear-marker.ts`
  - créer `packages/cli/src/lib/autopilot/linear-marker.test.ts`
  - créer `packages/cli/src/lib/autopilot/base-selection.ts`
  - créer `packages/cli/src/lib/autopilot/base-selection.test.ts`
  - créer `packages/cli/src/lib/autopilot/branch-protection.ts`
  - créer `packages/cli/src/lib/autopilot/branch-protection.test.ts`
- **Behavior**:
  - l'entrée est une observation complète des issues, états, assignees,
    relations et commentaires machine-readable ;
  - exactement un cluster en cours retourne `resume` ;
  - plusieurs tickets en cours sont valides seulement avec le même
    `clusterId` et le même programme ;
  - des claims concurrents incompatibles retournent `competing-claims` sans
    action ;
  - sinon le planner retourne une liste ordonnée d'actions Linear : re-fetch,
    transition, assignation, commentaire de réservation ;
  - chaque action porte une précondition sur l'état observé ;
  - une application partielle produit des compensations explicites, jamais une
    supposition d'atomicité du connector ;
  - le marqueur commentaire est borné, versionné et ne contient aucun secret.
  - `base:auto` choisit `develop` s'il existe, sinon `main` ; une base explicite
    doit exister ;
  - le base SHA est résolu avant claim et une protection absente ou inconnue
    bloque le démarrage avant tout worker.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/cluster-reservation.test.ts packages/cli/src/lib/autopilot/linear-marker.test.ts packages/cli/src/lib/autopilot/base-selection.test.ts packages/cli/src/lib/autopilot/branch-protection.test.ts`
  - mutation score manuel ou Stryker >= 90 % sur les branches de réservation
  - cas : aucune issue, reprise, claim frais, claim concurrent, write partiel,
    retry idempotent, commentaire malformé, ticket sorti du scope,
    develop/default/explicite et protection unknown/unprotected/protected
- **Expected commits**:
  - `test(autopilot): model cluster reservation races because Linear is the execution ledger`
  - `feat(autopilot): plan idempotent cluster claims because parallel tickets need one ownership lease`
- **Notes**: le CLI retourne des actions ; le skill Linear les applique puis
  réobserve toutes les issues avant de considérer la réservation acquise.

### Step 4 - Persister un état versionné et exposer les commandes opérateur

- **Goal**: rendre `start`, `status`, `resume` et `abort` déterministes,
  idempotents et honnêtes avant tout fan-out.
- **Depends on**: Step 3
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/run-state.ts`
  - créer `packages/cli/src/lib/autopilot/run-state.test.ts`
  - créer `packages/cli/src/lib/autopilot/state-store.ts`
  - créer `packages/cli/src/lib/autopilot/state-store.test.ts`
  - étendre `packages/cli/src/commands/autopilot.ts`
  - étendre `packages/cli/src/commands/autopilot.test.ts`
- **Behavior**:
  - l'état v1 contient `runId`, `clusterId`, programme, base + base SHA,
    tickets, worker commit ranges/proofs, intégration, PR et synchro tracker ;
  - chaque collection et chaîne est bornée par schéma ;
  - le store utilise temp + fsync + rename et permissions utilisateur ;
  - `start` écrit seulement après preuve de réservation réobservée ;
  - `status` est read-only et distingue local, remote-required, waiting-merge,
    blocked et complete ;
  - `resume` retourne la prochaine action sûre, sans l'exécuter deux fois ;
  - `abort` produit le plan de libération et préserve branches/commits ;
  - un état legacy, tronqué, symlinké ou hors root échoue fermé et reste intact.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/run-state.test.ts packages/cli/src/lib/autopilot/state-store.test.ts packages/cli/src/commands/autopilot.test.ts`
  - fault injection avant write, avant fsync et avant rename
  - `pnpm --filter voidharness typecheck`
  - smoke dans un dépôt temporaire avec chemin contenant des espaces
- **Expected commits**:
  - `test(autopilot): reproduce torn and stale run state because resume must fail closed`
  - `feat(autopilot): persist one versioned run state because sessions need idempotent recovery`
  - `feat(cli): expose autopilot operator commands because recovery must be observable`
- **Notes**: aucune absence de PR distante ne signifie « merged ». Cette
  transition attend l'observation explicite de Step 10.

### Checkpoint A - Foundation plan-only après Step 4

Le mainteneur vérifie le nouveau bounded context, la suppression des moteurs
supersédés, le schéma `ACTIVE.md`, la réservation et l'état avant d'autoriser le
fan-out. Lancer `harness:verification-before-completion`. Aucun worker, push ou
write Linear réel n'est dogfoodé avant ce checkpoint.

### Step 5 - Définir le worker comme exécution canonique de ticket-runner

- **Goal**: produire un résultat worker vérifiable sans dupliquer une seule
  passe de `ticket-runner`.
- **Depends on**: Step 1, programme v3 L11/L12 fusionné
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/worker-result.ts`
  - créer `packages/cli/src/lib/autopilot/worker-result.test.ts`
  - mettre à jour `packages/core/skills/ticket-runner/SKILL.md`
  - mettre à jour `packages/core/skills/autopilot/SKILL.md`
  - mettre à jour leurs `.source` et audits
  - créer `test/autopilot/autopilot-skill.test.ts`
- **Behavior**:
  - le worker re-fetch le ticket Linear complet au démarrage ;
  - il exécute le vrai `ticket-runner` avec le plan/spec global en contexte ;
  - il lance les gates ciblés du ticket, pas la suite complète du cluster ;
  - il peut appliquer une migration uniquement en dev/local et les tickets de
    migration sont routés séquentiellement ;
  - il crée une plage de 1..N commits avec `baseSha`, `headSha` et liste ordonnée
    des commits ;
  - il retourne fichiers, preuves hashées, décisions et statut
    `completed|blocked` ;
  - il ne push pas, n'ouvre pas de PR, ne merge pas et ne passe pas le ticket en
    review/done ;
  - les décisions suivent ticket, plan/spec, ADR/doctrine, conventions puis
    solution sûre/réversible/simple.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/worker-result.test.ts test/autopilot/autopilot-skill.test.ts`
  - le test skill prouve la délégation à `ticket-runner`, l'absence de cycle
    qualité copié et l'interdiction push/PR/merge
  - `pnpm anti-bloat:check`
  - `packages/core/skills/autopilot/SKILL.md <= 400` lignes et description
    `<= 200` caractères
- **Expected commits**:
  - `test(autopilot): define worker commit-range evidence because reconciliation needs exact provenance`
  - `feat(autopilot): delegate workers to ticket-runner because ticket quality must have one owner`
- **Notes**: les modifications déjà préparées sur le lifecycle tracker de
  `ticket-runner` sont reprises si elles sont encore pertinentes, puis
  consolidées dans un seul contrat final.

### Step 6 - Exécuter un cluster de quatre dans des worktrees

- **Goal**: fan-out parallèle ou séquentiel selon le plan, avec succès partiel et
  aucun effet distant des workers.
- **Depends on**: Step 4, Step 5
- **TDD mode**: souple
- **Files**:
  - implémenter
    `packages/core/skills/autopilot/workflows/autopilot.workflow.js`
  - créer `test/autopilot/autopilot-workflow.test.ts`
  - créer `packages/cli/src/lib/autopilot/worker-order.ts`
  - créer `packages/cli/src/lib/autopilot/worker-order.test.ts`
  - créer `packages/cli/src/lib/autopilot/worktree-lifecycle.ts`
  - créer `packages/cli/src/lib/autopilot/worktree-lifecycle.test.ts`
  - créer `packages/cli/src/lib/autopilot/partial-success.ts`
  - créer `packages/cli/src/lib/autopilot/partial-success.test.ts`
- **Behavior**:
  - un worktree et une branche par ticket, y compris en séquentiel ;
  - largeur parallèle bornée par `clusterSize` ;
  - overlap, faible confiance, lockfile, migration et ownership partagé passent
    en séquentiel ;
  - chaque sortie est validée avant d'entrer dans l'état ;
  - un worker rouge et ses dépendants sont exclus, branches préservées ;
  - les workers verts indépendants continuent ;
  - aucun worker n'obtient une commande de push, PR ou merge.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/worker-order.test.ts packages/cli/src/lib/autopilot/worktree-lifecycle.test.ts packages/cli/src/lib/autopilot/partial-success.test.ts test/autopilot/autopilot-workflow.test.ts`
  - le harness `node:vm` injecte de faux `agent`, `parallel`, `phase` et `log`
    dans le vrai workflow
  - fixtures : 4 parallèles, 2+2 séquentiels, migration, résultat invalide,
    worker rouge, aucun vert, ordre stable et concurrency cap
  - `node --check packages/core/skills/autopilot/workflows/autopilot.workflow.js`
- **Expected commits**:
  - `test(autopilot): simulate worktree fan-out because workflow behavior must be executable`
  - `feat(autopilot): run one bounded ticket cluster because parallelism must stay isolated`
- **Notes**: le Workflow retourne les résultats ; le skill L0 est le seul à
  persister le nouvel état et à commenter Linear.

### Step 7 - Réconcilier les plages de commits sur une branche propre

- **Goal**: intégrer exactement les commits verts, résoudre les conflits et
  reconstruire les artefacts partagés avant toute publication.
- **Depends on**: Step 6
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/reconcile-plan.ts`
  - créer `packages/cli/src/lib/autopilot/reconcile-plan.test.ts`
  - créer `packages/cli/src/lib/autopilot/git-observation.ts`
  - créer `packages/cli/src/lib/autopilot/git-observation.test.ts`
  - créer `packages/cli/src/lib/autopilot/git-run.ts`
  - étendre le prompt reconciler du vrai workflow
- **Behavior**:
  - vérifier que chaque `baseSha..headSha` est une plage linéaire, bornée et
    issue de la base déclarée ;
  - créer `autopilot/<clusterId>` depuis le base SHA prouvé ;
  - intégrer les plages en ordre déterministe sans absorber de commit étranger ;
  - résoudre un conflit selon le modèle d'autorité et journaliser le choix ;
  - rejouer toute preuve invalidée par les fichiers ou le SHA ;
  - retirer des workers les artefacts `reconcileOnly`, les reconstruire une
    seule fois et committer le résultat sur la branche d'intégration ;
  - un conflit non résoluble sans nouvelle autorité exclut le ticket concerné
    si le reste reste cohérent, sinon bloque la réconciliation.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/reconcile-plan.test.ts packages/cli/src/lib/autopilot/git-observation.test.ts`
  - tests d'intégration sur dépôt Git éphémère : deux plages disjointes, conflit
    résolu, commit étranger refusé, base avancée, artefact rebuild unique et
    succès partiel
  - aucun test ne dépend de snapshots d'argv comme unique preuve
- **Expected commits**:
  - `test(autopilot): exercise commit-range reconciliation because clean merges can hide foreign history`
  - `feat(autopilot): reconcile exact ticket ranges because one PR must retain per-ticket provenance`
- **Notes**: la résolution ordinaire de conflit appartient à Autopilot. Elle ne
  devient un gate humain que si elle exige une expansion de scope, une baisse de
  sécurité ou une action de production irréversible.

### Step 8 - Prouver la suite locale et budgéter les triggers CI

- **Goal**: interdire le premier push tant que la suite miroir CI n'est pas verte
  et expliquer si une seule exécution distante est réellement garantie.
- **Depends on**: Step 7
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/verification-plan.ts`
  - créer `packages/cli/src/lib/autopilot/verification-plan.test.ts`
  - créer `packages/cli/src/lib/autopilot/ci-trigger-plan.ts`
  - créer `packages/cli/src/lib/autopilot/ci-trigger-plan.test.ts`
  - créer `packages/cli/src/lib/autopilot/proof-invalidation.ts`
  - créer `packages/cli/src/lib/autopilot/proof-invalidation.test.ts`
- **Behavior**:
  - exécuter chaque argv avec `shell:false`, timeout et sortie bornés ;
  - lier chaque preuve à l'intégration SHA, au diff hash et aux commandes ;
  - invalider une preuve sur rebase ou modification d'une dépendance déclarée ;
  - parser les workflows GitHub bornés et classer `pull-request-only`,
    `push-only`, `redundant`, `manual` ou `unknown` ;
  - pour `redundant|unknown`, ne jamais désactiver un required check : signaler
    que la garantie d'un run n'est pas disponible ;
  - refuser toute publication si une commande locale est rouge ou stale.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/verification-plan.test.ts packages/cli/src/lib/autopilot/ci-trigger-plan.test.ts packages/cli/src/lib/autopilot/proof-invalidation.test.ts`
  - fixtures CI : `pull_request`, `push`, les deux, `workflow_call`, YAML invalide,
    ancre YAML et expression non interprétable
  - test process réel : argv avec espaces, timeout, sortie volumineuse et aucun
    shell expansion
- **Expected commits**:
  - `test(autopilot): model CI trigger budgets because one remote run cannot be assumed`
  - `feat(autopilot): seal local verification because publication must start from a green integration SHA`
- **Notes**: lire la documentation GitHub Actions officielle avant
  d'implémenter le parseur et consigner les syntaxes volontairement classées
  `unknown`.

### Step 9 - Publier une seule branche et conduire la PR jusqu'à ready

- **Goal**: pousser uniquement la branche d'intégration, créer une PR et corriger
  les checks sans armer de merge.
- **Depends on**: Step 8
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/publish-plan.ts`
  - créer `packages/cli/src/lib/autopilot/publish-plan.test.ts`
  - créer `packages/cli/src/lib/autopilot/pr-body.ts`
  - créer `packages/cli/src/lib/autopilot/pr-body.test.ts`
  - mettre à jour `packages/core/skills/autopilot/SKILL.md`
  - mettre à jour
    `packages/core/skills/autopilot/workflows/autopilot.workflow.js`
- **Behavior**:
  - un refspec explicite non-force publie uniquement
    `autopilot/<clusterId>` ;
  - aucune branche worker n'est poussée ;
  - une seule PR cible la base configurée ;
  - le corps liste tickets inclus/exclus, plages de commits, décisions,
    vérifications locales, budget CI et blockers ;
  - le skill observe les checks, diagnostique et corrige les échecs qui lui
    appartiennent, puis repousse la même branche ;
  - une correction distante peut déclencher un run supplémentaire, comptabilisé
    honnêtement ;
  - aucun chemin n'appelle `gh pr merge`, `--auto` ou une API de merge.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/publish-plan.test.ts packages/cli/src/lib/autopilot/pr-body.test.ts test/autopilot/autopilot-workflow.test.ts`
  - faux runner `git`/`gh` : push échoué donc pas de PR, PR déjà existante,
    retry idempotent, check pending, check rouge corrigé, check rouge externe
  - test de source interdisant `pr merge`, `--auto-merge` et push d'une branche
    worker dans le code actif
- **Expected commits**:
  - `test(autopilot): constrain integration publication because worker branches must stay local`
  - `feat(autopilot): publish one reconciliation PR because CI cost belongs at the cluster boundary`
- **Notes**: la PR reste ouverte en `ready for merge`. La fusion est hors des
  actions autorisées, même si GitHub indique `MERGEABLE`.

### Step 10 - Réconcilier GitHub, Linear et la fusion humaine

- **Goal**: reprendre après crash ou nouvelle session, puis clôturer les tickets
  uniquement sur preuve de fusion.
- **Depends on**: Step 9
- **TDD mode**: strict
- **Files**:
  - créer `packages/cli/src/lib/autopilot/remote-recovery.ts`
  - créer `packages/cli/src/lib/autopilot/remote-recovery.test.ts`
  - créer `packages/cli/src/lib/autopilot/tracker-lifecycle.ts`
  - créer `packages/cli/src/lib/autopilot/tracker-lifecycle.test.ts`
  - étendre `packages/cli/src/commands/autopilot.ts`
  - étendre `packages/cli/src/commands/autopilot.test.ts`
  - finaliser les sections reprise/merge de
    `packages/core/skills/autopilot/SKILL.md`
- **Behavior**:
  - l'observation GitHub distingue explicitement OPEN, CLOSED et MERGED, avec
    head SHA, base, checks et merge SHA ;
  - une PR absente ou fermée non mergée ne devient jamais `merged` ;
  - base drift invalide les preuves et déclenche rebase, réconciliation et suite
    complète avant une nouvelle publication ;
  - après MERGED + checks requis verts, les tickets inclus passent Done avec le
    lien PR ; les exclus gardent leur statut et cause ;
  - pour un checkpoint, la fusion de la PR vaut approbation et aucune seconde
    gate Linear n'est créée ;
  - `abort` libère les claims Linear applicables, commente la reprise et préserve
    les branches ;
  - toutes les actions externes ont une clé d'idempotence dérivée du run et sont
    réobservées avant validation.
- **Verification gate**:
  - `pnpm vitest run packages/cli/src/lib/autopilot/remote-recovery.test.ts packages/cli/src/lib/autopilot/tracker-lifecycle.test.ts packages/cli/src/commands/autopilot.test.ts`
  - table exhaustive : PR open/pending/green/red, closed, merged, missing, head
    divergent, base avancée, Linear write partiel, retry et ticket exclu
  - `pnpm --filter voidharness typecheck`
- **Expected commits**:
  - `test(autopilot): reject inferred merges because remote absence is not completion proof`
  - `feat(autopilot): reconcile remote and tracker state because session resume must be idempotent`
- **Notes**: après clôture du cluster, le multi-cluster peut sélectionner le
  suivant dans une phase ultérieure. Le premier incrément s'arrête après un
  cluster fusionné.

### Checkpoint B - Cycle autonome complet après Step 10

Le mainteneur inspecte une exécution simulée complète : ACTIVE, réservation,
quatre workers, succès partiel, réconciliation, suite locale, une PR, checks,
fusion observée et Linear Done. Lancer
`harness:verification-before-completion`. Le seul geste humain dans le scénario
nominal est la fusion de la PR.

### Step 11 - Compiler les consommateurs et dogfooder sans faux vert

- **Goal**: livrer le même contrat à Claude et Codex, prouver l'installation
  consommateur et recueillir une preuve réelle avant de déclarer Autopilot done.
- **Depends on**: Step 4, Step 10, Checkpoint B
- **TDD mode**: souple
- **Files**:
  - créer `packages/cli/scripts/conformance-autopilot.mjs`
  - créer les fixtures sous
    `packages/cli/test-fixtures/autopilot-consumer/`
  - mettre à jour `package.json` avec `conformance:autopilot`
  - régénérer `packages/cli/core-assets/`, graph model, certification et bundle
    par leurs commandes canoniques
- **Behavior**:
  - le runtime généré lit `ACTIVE.md` et reprend automatiquement quand
    `autopilot.enabled:true` ;
  - aucune question de repointage ou confirmation par cluster n'est demandée ;
  - `ticket-writer` crée le pointeur seulement après plan/pool approuvés et
    refuse une collision ;
  - Claude et Codex nomment leur skill natif correctement ;
  - le tarball installé dans une fixture expose `autopilot`, le stub legacy et
    le bootstrap, sans source monorepo ;
  - la conformance utilise de faux ports Linear/GitHub et un bare remote Git
    local, puis un dogfood réel sur un projet consommateur valide les connectors
    et le coût CI ;
  - le dogfood réel s'arrête sur une PR non mergée pour le gate humain.
- **Verification gate**:
  - `pnpm conformance:install`
  - `pnpm conformance:autopilot`
  - `pnpm test`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm anti-bloat:check`
  - `pnpm sync:docs`
  - `pnpm decisions:check`
  - `pnpm graph:check`
  - `pnpm certification:check`
  - `pnpm graph:check-bundle`
  - `pnpm version:check`
  - `pnpm check:publish`
  - `pnpm --filter voidharness build:assets` puis worktree propre sur
    `packages/cli/core-assets`
- **Expected commits**:
  - `test(autopilot): add consumer conformance because source-only success would be a false green`
  - `docs(autopilot): align both runtimes because durable resume is a consumer contract`
  - `build(autopilot): regenerate shipped assets because npm must match the authored core`
- **Notes**: versions et changelog restent sous release-please. Ne jamais
  modifier un manifeste de version à la main. Le dogfood distant requiert une
  autorisation explicite du projet consommateur et ne contourne aucun required
  check.

## Review checkpoints

- **Checkpoint A après Step 4** : frontière saine, plan-only, activation,
  réservation et état versionné.
- **Checkpoint B après Step 10** : cycle complet jusqu'à la fusion humaine et la
  clôture Linear.

Les checkpoints concernent l'implémentation d'Autopilot. Dans un run Autopilot
consommateur, le contrat reste inchangé : la fusion de la PR est l'unique gate
humain nominal.

## Plan review

Ce plan est `high_risk: true` à cause des mutations autonomes Linear/GitHub, de
la gestion de worktrees et de la reprise cross-system. Après approbation écrite,
exécuter `harness:plan-review all` avant `ticket-writer`. Les findings
correctness sont repliés dans ce plan ; toute modification de la frontière
d'autorité exige un ADR qui supersède celui du 2026-07-25.

## Linear execution handoff

Le découpage cible onze tickets d'implémentation et deux gates. `ticket-writer`
doit rechercher les doublons, reprendre les conventions natives du projet et
créer les vraies relations `blockedBy`. Il ne crée ni ne remplace
`plans/ACTIVE.md` tant qu'un autre programme y est `executing`.

| Ref | Ticket impératif | Taille | Priorité | `blockedBy` | Gate |
|---|---|---:|---|---|---|
| AP01 | Livrer le cut Autopilot plan-only canonique | L | high | - | non |
| AP02 | Valider la configuration durable du programme actif | M | high | AP01 | non |
| AP03 | Réserver un cluster Linear idempotent | M | high | AP02 | non |
| AP04 | Persister l'état et exposer les commandes opérateur | L | high | AP03 | non |
| GPA | Valider la foundation Autopilot | XS | high | AP04 | oui |
| AP05 | Définir le worker ticket-runner canonique | M | high | AP01, v3 L11/L12 | non |
| AP06 | Exécuter un cluster borné dans des worktrees | L | high | GPA, AP05 | non |
| AP07 | Réconcilier les plages de commits | L | high | AP06 | non |
| AP08 | Sceller la suite locale et le budget CI | M | high | AP07 | non |
| AP09 | Publier une seule PR sans auto-merge | M | high | AP08 | non |
| AP10 | Réconcilier GitHub, Linear et la fusion humaine | L | high | AP09 | non |
| GPB | Valider le cycle Autopilot complet | XS | high | AP10 | oui |
| AP11 | Compiler les consommateurs et dogfooder | L | high | GPB | non |

Les unités sont volontairement dépendantes : forcer des lots parallèles ici
créerait précisément le Frankenstein que ce plan retire. Quand plusieurs tickets
futurs deviennent réellement disjoints, le planner pourra les grouper ; il ne
falsifie jamais l'indépendance pour atteindre quatre.

## Resume point

**Next step**: revue utilisateur du plan, puis `harness:plan-review all`.

**Completed**:

- spec approuvée : `docs/specs/2026-07-25-autopilot.md` ;
- ADR accepté : Autopilot autonome, fusion PR humaine ;
- plan écrit sur la base du code actuel et du programme v3.

**Pending**:

- approbation écrite du plan ;
- plan-review multi-lenses ;
- création des tickets AP01-AP11 et gates GPA/GPB avec `ticket-writer` ;
- exécution à partir d'AP01 sans remplacer le programme actif existant.
- brainstorming/spec séparée de `void-harness cheatsheet`, sans l'inclure dans
  AP01-AP11.

Après création des tickets, Linear devient la source de vérité mutable. Ce
resume point ne doit pas être utilisé comme un second pointeur de ticket.
