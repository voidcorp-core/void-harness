---
title: void-harness v3 - top-tier autonomous engineering team
date: 2026-07-24
status: executing
spec: docs/specs/2026-07-24-void-harness-v3-top-tier-engineering-team.md
author: Folpe + Codex
high_risk: true
---

# void-harness v3 - execution plan

## Goal

Faire évoluer void-harness 2.0.2 vers un harness v3 local-first qui orchestre réellement une équipe
de spécialistes sur Claude Code et Codex, prouve chaque pass applicable, maîtrise les tokens,
dispose d'un graphe projet natif et rend ses missions observables en live. Le chemin de base reste
account-free après téléchargement npm, sans `gh`, marketplace, `jq`, Python, Bun, Graphify ou
service obligatoire.

La cible n'est pas un refactor monolithique. Chaque étape ci-dessous est une tranche autonome,
testable et mergeable. Les sorties non prouvées restent `unknown`, `degraded` ou `blocked`.

## Scope

### Inclus

- ADR sans conflit pour plusieurs workers ;
- événements, preuves, findings, receipts et invalidation ;
- init transactionnel et enforcement Node portable ;
- Mission Engine déterministe et trois modes ;
- spécialistes natifs Claude/Codex, directement invocables ;
- TDD frontend et backend, UX/UI double-pass ;
- sécurité baseline, fortress et pentest local sûr ;
- profils stack versionnés et extensibles ;
- CatalogGraph, ProjectGraph, MissionGraph, EvidenceGraph ;
- Context Compiler et attribution de coût honnête ;
- Graphify optionnel et benchmarké ;
- Certification Lab, self-host et fixtures consommateurs ;
- data plane fiable de Mission Control ;
- seam local d'extensions.

### Exclus

- refonte visuelle x10 de Mission Control avant sa spec UI dédiée ;
- marketplace publique d'extensions ;
- proxy LLM ;
- support de runtime supplémentaire avant conformance Claude/Codex ;
- pentest offensif d'une cible externe ;
- migration massive des 96 décisions historiques ;
- changement manuel de version ou de changelog.

## Ce qui existe déjà

- `packages/harness-graph/` fournit le CatalogGraph v1, analyses, coût, outcomes et ProjectState.
- `packages/cli/src/lib/graph-live-server.ts` fournit loopback, CORS, SSE et historique.
- `apps/graph-studio/` fournit Three.js, live/replay, coût et reduced-motion.
- `packages/cli/src/lib/runtime-adapters.ts` porte la seam Claude/Codex.
- `packages/core/skills/ticket-runner/SKILL.md` décrit onze passes, sans exécution prouvée.
- `packages/core/hooks/activation-meter.sh` et `outcome-meter.sh` écrivent deux JSONL legacy.
- `packages/harness-graph/certification.json` existe, avec des preuves structurelles.
- `apps/eval-harness/` fournit le premier runner d'évaluations comportementales.
- les assets publiés sont copiés de `packages/core/` vers `packages/cli/core-assets/`.

## Architecture d'exécution

### Dépendances de packages cibles

```text
@voidcorp/mission-engine        pure, sans I/O ni runtime agent
        ^             ^
        |             |
@voidcorp/harness-graph   @voidcorp/hook-runner
        ^             ^             |
        +-------------+-------------+
                      |
                  voidharness CLI
                      |
       Claude adapter | Codex adapter
```

- `packages/mission-engine/` devient le coeur fonctionnel des contrats, missions et verdicts.
- `packages/harness-graph/` reste le coeur des graphes et dépend des contrats de mission, jamais du
  CLI.
- `packages/hook-runner/` compile un runner Node autonome vers l'asset publié.
- `packages/cli/` reste la coquille impérative et compose les trois.
- `apps/graph-studio/` consomme des snapshots/projections, jamais les fichiers internes des runs.

Le nom exact des packages est verrouillé ici pour éviter une décision pendant l'implémentation :

- `@voidcorp/mission-engine`
- `@voidcorp/hook-runner`
- `@voidcorp/harness-graph`
- `voidharness`

### Lanes

Les Steps 1 à 3 établissent le spine de vérité et sont séquentiels. Après Step 3 :

```text
Lane P - Portability       Steps 4 -> 8
Lane T - Team              Steps 9 -> 15
Lane G - Graph/efficiency  Steps 16 -> 20
                               \      /
                       Steps 21 -> 24
```

Le démarrage exact est :

- après Step 3, Lane P démarre Step 4 et Lane G démarre Step 16 ;
- Lane T peut préparer Step 9 après Step 3, mais Step 10 attend l'init local de Step 5 ;
- Step 18 attend Step 14 et Step 17, c'est le premier join Team/Graph ;
- Step 21 attend les trois lanes complètes.

Les lanes P, T et G peuvent donc avancer en worktrees séparés avec ces joins explicites.
Contraintes de réconciliation :

- un seul intégrateur modifie `pnpm-lock.yaml` ;
- un seul intégrateur régénère `packages/cli/core-assets/`, `model.json` et
  `certification.json` ;
- les workers ajoutent chacun leur fichier ADR, jamais un index partagé ;
- `docs/ARCHITECTURE.md`, `README.md`, `AGENTS.md` et `CLAUDE.md` sont intégrés une fois par lot ;
- migrations et manifests de release restent séquentiels.

### Contrat DX transversal

Chaque nouvelle commande CLI :

- possède `--help`, `--json` si elle produit des données et un mode non interactif ;
- utilise des exit codes documentés ;
- rend une erreur avec `code`, problème, cause et correction ;
- désactive couleur et animation hors TTY ;
- ne demande jamais une confirmation dans un flux `--no-interactive` ;
- ajoute un exemple copiable et un test des trois erreurs les plus probables ;
- conserve les anciennes commandes ou fournit un message de migration.

### MVP cut

Le premier alpha utile est atteint après Step 11 :

> Un ticket réel peut être planifié en mode `team`, exécuter architecture + sécurité + QA comme
> subagents natifs Claude ou Codex, produire des findings et preuves reliés au diff, puis refuser
> un faux vert.

Tout ce qui n'est pas requis pour cette preuve reste hors du premier alpha.

## Steps

### Step 1 - Rendre les ADR conflict-free de bout en bout

- **Goal**: permettre à N workers d'ajouter chacun un ADR sans compteur, fichier ou index partagé.
- **Depends on**: none
- **TDD mode**: strict
- **Files**:
  - `packages/cli/src/lib/decisions/types.ts`
  - `packages/cli/src/lib/decisions/parse.ts`
  - `packages/cli/src/lib/decisions/create.ts`
  - `packages/cli/src/lib/decisions/validate.ts`
  - `packages/cli/src/lib/decisions/render.ts`
  - `packages/cli/src/lib/decisions/*.test.ts`
  - `packages/cli/src/commands/decisions.ts`
  - `packages/cli/src/commands/decisions.test.ts`
  - `packages/cli/src/main.ts`
  - `packages/cli/src/commands/help.ts`
  - `packages/core/skills/adr-workflow/SKILL.md`
  - `packages/core/PROJECT-DOCTRINE.template.md`
  - `scripts/build-decisions-index.mjs`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `docs/DECISIONS.md`
  - `docs/CONTRIBUTING.md`
  - `docs/ARCHITECTURE.md`
  - `AGENTS.md` et `CLAUDE.md`
- **Behavior**:
  - `void-harness decisions new --title <title> --slug <slug>` crée avec `open(..., "wx")` un
    fichier `<date>-<slug>--<id>.md` dans le chemin détecté ;
  - l'ID est généré par `crypto.randomUUID()` et la création exclusive retry en cas de collision ;
  - `void-harness decisions check` valide formats legacy et v3, IDs, statuts, supersessions et
    cycles ;
  - `void-harness decisions render --format markdown|json` calcule une vue sans modifier le dépôt ;
  - `docs/DECISIONS.md` devient une landing page stable qui conserve le snapshot des 96 décisions
    legacy pour ne casser aucune référence historique ;
  - le script legacy cesse d'écrire l'index et délègue au check pendant la transition ;
  - les nouveaux projets utilisent `docs/decisions/`, void-harness conserve
    `docs/decisions-log/`.
- **Verification gate**:
  - 32 créations concurrentes dans le même fixture produisent 32 fichiers uniques et ne modifient
    aucun autre fichier ;
  - duplicate ID, supersession manquante et cycle font échouer `decisions check` ;
  - les 96 fichiers legacy passent ;
  - aucune commande `decisions new/check/render` ne modifie `docs/DECISIONS.md` ;
  - `pnpm decisions:check && pnpm --filter voidharness test && pnpm sync:docs` passent.
- **Expected commits**:
  - `test(decisions): cover concurrent ADR creation because parallel workers must never share a counter`
  - `feat(decisions): add one-file ADR lifecycle because isolated workers need conflict-free writes`
  - `docs(decisions): make the landing page immutable because generated indexes create merge conflicts`
- **Notes**:
  - ne pas renommer l'historique ;
  - mettre à jour le mirror `core-assets` uniquement à l'intégration ;
  - créer le decision log v3 « one file per ADR, no shared index » avec l'ancien format une dernière
    fois si Step 1 n'est pas encore disponible.

### Step 2 - Faire traverser un événement canonique du hook au replay

- **Goal**: remplacer les deux journaux opaques par un flux versionné, ordonné et reconnectable.
- **Depends on**: Step 1
- **TDD mode**: strict
- **Files**:
  - `packages/mission-engine/package.json`
  - `packages/mission-engine/tsconfig.json`
  - `packages/mission-engine/tsup.config.ts`
  - `packages/mission-engine/src/events/types.ts`
  - `packages/mission-engine/src/events/schema.ts`
  - `packages/mission-engine/src/events/reducer.ts`
  - `packages/mission-engine/src/events/*.test.ts`
  - `packages/mission-engine/src/index.ts`
  - `packages/hook-runner/package.json`
  - `packages/hook-runner/src/runtime-input.ts`
  - `packages/hook-runner/src/sequenced-writer.ts`
  - `packages/hook-runner/src/record.ts`
  - `packages/hook-runner/src/*.test.ts`
  - `packages/core/hooks/_void-hook.mjs` généré
  - `packages/core/hooks/activation-meter.sh`
  - `packages/core/hooks/outcome-meter.sh`
  - `packages/cli/src/lib/graph-live.ts`
  - `packages/cli/src/lib/graph-live-server.ts`
  - `packages/cli/src/lib/graph-live-auth.ts`
  - `packages/cli/src/lib/graph-live-server.test.ts`
  - `apps/graph-studio/src/data/load.ts`
  - `apps/graph-studio/src/render/live.ts`
  - `apps/graph-studio/src/render/live.test.ts`
  - `pnpm-workspace.yaml`
- **Behavior**:
  - le hook runner adapte les payloads Claude/Codex sans exposer leur forme au coeur ;
  - `VOID_MISSION_ID` sélectionne le run, sinon un ID déterministe dérivé de la session runtime ;
  - un lock Node cross-platform assigne une séquence continue, détecte un lock stale et borne le
    retry ;
  - les IDs runtime sont hashés avant de devenir un nom de dossier ;
  - lock, state et journal sont créés sans suivre de symlink hors du root et avec permissions
    utilisateur seulement lorsque l'OS les supporte ;
  - les événements vont dans `.void/runs/<mission-id>/events.jsonl` ;
  - les anciens `activations.jsonl` et `outcomes.jsonl` restent lisibles, mais ne sont plus écrits
    après migration ;
  - le serveur SSE émet `id`, supporte `Last-Event-ID`, backfill puis snapshot ;
  - le serveur échange un token de lancement one-shot contre un cookie local `HttpOnly`,
    `SameSite=Strict`, puis retire le token de l'URL ; SSE et historique refusent une session
    absente ;
  - le Studio affiche `LIVE`, `RECONNECTING`, `STALE`, `PARTIAL`, `REPLAY` ou `OFFLINE`.
- **Verification gate**:
  - 100 writers concurrents produisent des `seq` 1..100 sans perte ni doublon ;
  - kill pendant append ne produit pas de ligne partielle acceptée ;
  - reconnexion depuis l'event 50 reçoit exactement 51..100 ;
  - un gap non récupérable donne `PARTIAL`, jamais `LIVE` ;
  - requêtes sans session, token rejoué et Origin non autorisée sont refusés ;
  - import d'un fixture legacy conserve ses activations ;
  - `pnpm --filter @voidcorp/mission-engine test`,
    `pnpm --filter @voidcorp/hook-runner test`,
    `pnpm --filter voidharness test` et
    `pnpm --filter @voidcorp/graph-studio test` passent.
- **Expected commits**:
  - `test(events): specify ordering and replay because live truth cannot tolerate silent gaps`
  - `feat(events): add canonical sequenced run stream because every runtime needs one observable contract`
  - `feat(studio): expose connection truth because a stale dashboard must never look live`
- **Notes**:
  - aucun prompt, contenu de fichier ou output complet dans l'événement ;
  - taille maximale du payload et du fichier testée ;
  - le runner généré est un artefact contrôlé par un drift check.

### Step 3 - Relier preuves, findings, invalidation et verdict

- **Goal**: obtenir un verdict de mission impossible à verdir avec une preuve stale ou absente.
- **Depends on**: Step 2
- **TDD mode**: strict
- **Files**:
  - `packages/mission-engine/src/evidence/types.ts`
  - `packages/mission-engine/src/evidence/schema.ts`
  - `packages/mission-engine/src/evidence/canonical-json.ts`
  - `packages/mission-engine/src/evidence/invalidation.ts`
  - `packages/mission-engine/src/evidence/verdict.ts`
  - `packages/mission-engine/src/evidence/*.test.ts`
  - `packages/mission-engine/src/findings/types.ts`
  - `packages/mission-engine/src/findings/reducer.ts`
  - `packages/mission-engine/src/findings/*.test.ts`
  - `packages/cli/src/lib/runs/store.ts`
  - `packages/cli/src/lib/runs/redact.ts`
  - `packages/cli/src/lib/runs/archive.ts`
  - `packages/cli/src/lib/runs/*.test.ts`
  - `packages/cli/src/commands/mission.ts`
  - `packages/cli/src/commands/mission.test.ts`
  - `packages/cli/src/main.ts`
  - `packages/cli/src/commands/help.ts`
- **Behavior**:
  - `void-harness mission start --title <title> [--mode fast|team|fortress]` crée le run ;
  - `void-harness mission verify --id <id> -- <command...>` capture commande, code, durée, hash du
    diff, nœuds et sortie redacted ;
  - `void-harness mission inspect --id <id> [--json]` réduit les événements et rend le verdict ;
  - `mission archive --id` produit un `.jsonl.gz` après completion ;
  - `mission prune --older-than <days>` est explicite et dry-run par défaut, aucune suppression
    automatique ;
  - `mission verify` exécute un argv avec `shell:false`, un mode shell exige `--shell` explicite ;
  - une preuve porte `inputHash`, `diffHash`, `producer`, `source` et `confidence` ;
  - un changement invalide seulement les preuves dépendantes ;
  - les blockers non dérogeables de la spec restent rouges ;
  - JSONL invalide est mis en quarantaine et rend le run `degraded`.
- **Verification gate**:
  - une commande verte sur diff A devient stale sur diff B ;
  - une preuve falsifiée ou un event duplicate ne peut pas promouvoir le verdict ;
  - une exception donne `shipped-with-exception`, jamais `verified` ;
  - secrets connus dans commande/output sont redacted dans tous les fichiers ;
  - replay du même run produit le même état byte-for-byte hors timestamps de projection ;
  - tests mission-engine et CLI passent, puis `pnpm test`.
- **Expected commits**:
  - `test(evidence): cover stale and tampered proofs because verdicts must follow the current diff`
  - `feat(evidence): add findings and verdict ledger because quality needs auditable proof`
  - `feat(cli): expose mission start verify inspect because operators need a deterministic shell`
- **Notes**:
  - les commandes contenant un secret en argument sont hashées/redacted avant persistance ;
  - les artefacts complets ont une politique de rétention et ne sont pas commités.

### Step 4 - Rendre doctor et status strictement honnêtes

- **Goal**: supprimer les faux verts et distinguer installé, wired, fired, observed et certified.
- **Depends on**: Step 3
- **TDD mode**: strict
- **Files**:
  - `packages/cli/src/commands/doctor.ts`
  - `packages/cli/src/commands/doctor.test.ts`
  - `packages/cli/src/commands/status.ts`
  - `packages/cli/src/commands/status.test.ts`
  - `packages/cli/src/lib/runtime-adapters.ts`
  - `packages/cli/src/lib/runtime-adapters.test.ts`
  - `packages/cli/src/lib/self-repo.ts`
  - `packages/cli/src/lib/self-repo.test.ts`
  - `packages/harness-graph/src/state/*`
  - `packages/harness-graph/src/state/*.test.ts`
- **Behavior**:
  - le dépôt source ne saute plus doctor : il route vers le doctor self-host ou annonce
    précisément `not-installed` ;
  - chaque adapter fournit des postconditions exécutables, pas des empreintes de fichiers ;
  - un smoke envoie un payload fixture à un hook réellement installé et vérifie l'événement ;
  - `status` ne déduit pas `verified` de la seule présence d'un fichier ;
  - données insuffisantes, coûts absents et runtime non testé restent `unknown`.
- **Verification gate**:
  - supprimer/rendre non exécutable un hook installé fait échouer doctor ;
  - simuler un manifest présent mais hook non déclenché reste rouge ;
  - un projet Codex-only ne demande ni Claude ni marketplace ;
  - un projet non-git passe les checks applicables sans faux vert ;
  - tests ciblés, `pnpm graph:check`, `pnpm certification:check` et `pnpm test` passent.
- **Expected commits**:
  - `test(doctor): reproduce false-green installs because file presence is not runtime proof`
  - `fix(doctor): verify executable postconditions because installed must not mean working`
  - `fix(status): preserve unknown states because missing evidence is not success`

### Step 5 - Installer Claude et Codex localement, sans compte, avec rollback

- **Goal**: rendre le tarball npm autonome et transactionnel pour les deux runtimes.
- **Depends on**: Step 4
- **TDD mode**: strict
- **Files**:
  - `packages/cli/src/commands/init.ts`
  - `packages/cli/src/commands/init.test.ts`
  - `packages/cli/src/commands/runtime.ts`
  - `packages/cli/src/commands/runtime.test.ts`
  - `packages/cli/src/lib/runtime-adapters.ts`
  - `packages/cli/src/lib/transaction.ts`
  - `packages/cli/src/lib/transaction.test.ts`
  - `packages/cli/src/lib/receipts.ts`
  - `packages/cli/src/lib/receipts.test.ts`
  - `packages/cli/src/lib/prerequisites.ts`
  - `packages/cli/src/lib/prerequisites.test.ts`
  - `packages/cli/src/lib/paths.ts`
  - `packages/cli/scripts/copy-core-assets.mjs`
  - `packages/cli/package.json`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/CODEX.md`
- **Behavior**:
  - le package local est la source par défaut des assets Claude et Codex ;
  - la marketplace devient un adapter opt-in, jamais un prérequis ;
  - `init` fait stage, compile, smoke, doctor, atomic swap, receipt ;
  - un échec restaure byte-for-byte l'état précédent ;
  - `remove` ne touche qu'aux fichiers possédés par le receipt ;
  - `gh`, auth GitHub et `jq` disparaissent des postconditions de base ;
  - le runtime choisi reste obligatoire, aucun compte void-harness n'existe.
- **Verification gate**:
  - pack tarball puis init offline dans fixtures Claude-only, Codex-only et both ;
  - mêmes tests sous Linux, macOS et Windows Node ;
  - fault injection à chaque étape prouve le rollback ;
  - un fichier utilisateur adjacent survit à update/remove ;
  - TTHW local tarball p50 inférieur à 60 secondes ;
  - `pnpm conformance:install` couvre la matrice OS/runtime et est créé dans cette Step ;
  - `pnpm check:publish`, test tarball et full CI passent.
- **Expected commits**:
  - `test(init): cover transactional failure points because partial installs corrupt agent policy`
  - `feat(init): materialize local runtime assets because account-free install is the primary path`
  - `feat(init): add ownership receipts because updates and removal must be reversible`
- **Notes**:
  - lire les docs officielles Claude/Codex sur les assets natifs avant leur config ;
  - aucune version n'est éditée manuellement.

### Step 6 - Porter le safety floor vers le runner Node

- **Goal**: partager exactement les mêmes règles critiques entre hooks inline et CI.
- **Depends on**: Step 5
- **TDD mode**: strict
- **Files**:
  - `packages/hook-runner/src/rules/dangerous-command.ts`
  - `packages/hook-runner/src/rules/protected-file.ts`
  - `packages/hook-runner/src/rules/secret-content.ts`
  - `packages/hook-runner/src/rules/tdd-order.ts`
  - `packages/hook-runner/src/rules/*.test.ts`
  - `packages/hook-runner/src/cli.ts`
  - `packages/core/hooks/block-dangerous-bash.sh`
  - `packages/core/hooks/protect-sensitive-files.sh`
  - `packages/core/hooks/secret-in-content.sh`
  - `packages/core/hooks/tdd-guard.sh`
  - `packages/core/enforce/ci-enforce.sh`
  - `packages/core/enforce/ci-enforce.test.ts`
  - `.github/actions/void-enforce/action.yml`
- **Behavior**:
  - les wrappers shell ne font que localiser Node et transmettre stdin/exit ;
  - les quatre règles pures renvoient verdict, code, message et preuve ;
  - le floor CI appelle le même bundle ;
  - les formes Claude Edit/Write, Codex apply_patch et shell sont normalisées ;
  - inputs énormes, invalides ou binaires sont bornés et fail-safe.
- **Verification gate**:
  - corpus commun inline/CI donne les mêmes verdicts ;
  - tests adversariaux : encodage, espaces, chemins relatifs, symlinks, commandes imbriquées,
    multi-file patch ;
  - Windows et POSIX passent ;
  - secret fixture runtime généré n'est jamais commité ;
  - `pnpm --filter @voidcorp/hook-runner test`, `pnpm anti-bloat:check` et `pnpm test` passent.
- **Expected commits**:
  - `test(enforce): share adversarial fixtures because inline and CI must agree`
  - `feat(enforce): port critical guards to Node because the safety floor must be cross-platform`
  - `refactor(hooks): reduce shell to adapters because policy belongs in one pure core`

### Step 7 - Porter les règles qualité et lifecycle restantes

- **Goal**: supprimer `jq` et le shell non portable du chemin de base sans globaliser les règles TS.
- **Depends on**: Step 6
- **TDD mode**: strict
- **Files**:
  - `packages/hook-runner/src/rules/` pour no-any, no-as, console, null, skip, boundaries,
    test-name, design-slop et taille ;
  - `packages/hook-runner/src/lifecycle/` pour format, context, typecheck et output trimming ;
  - `packages/cli/src/lib/config-schema.ts` et sa migration vers des commandes argv ;
  - wrappers correspondants sous `packages/core/hooks/` ;
  - `packages/core/codex/hooks.json` ;
  - `packages/core/.claude-plugin/plugin.json` ;
  - tests de parité et de floor sous `packages/core/hooks/`.
- **Behavior**:
  - une règle de langage ne s'active que si le profil et le fichier la rendent applicable ;
  - auto-format ne modifie que les fichiers explicitement touchés ;
  - les commandes projet v3 sont des tableaux argv ; les chaînes legacy restent lues avec un
    warning et aucun nouveau config n'en écrit ;
  - typecheck et output trimming exposent timeout et état degraded ;
  - tous les hooks émettent des événements canoniques ;
  - les wrappers restent sous 100 lignes.
- **Verification gate**:
  - matrice hook x runtime x OS verte ;
  - projet Python minimal n'est pas bloqué par une règle TypeScript ;
  - projet non-git et chemins avec espaces passent ;
  - manifests Claude/Codex ont une parité expliquée ;
  - `pnpm anti-bloat:check`, tests hook, `pnpm sync:docs` et full suite passent.
- **Expected commits**:
  - `test(hooks): cover profile-scoped rules because agnostic must not mean TypeScript everywhere`
  - `feat(hooks): finish the Node lifecycle because base enforcement must not depend on jq`
  - `docs(hooks): declare runtime parity because unsupported depth must stay visible`

### Step 8 - Faire de void-harness son premier consommateur

- **Goal**: compiler et exécuter les sources courantes dans le dépôt sans les confondre avec les
  assets publiés.
- **Depends on**: Steps 5, 7
- **TDD mode**: strict
- **Files**:
  - `packages/cli/src/commands/self-host.ts`
  - `packages/cli/src/commands/self-host.test.ts`
  - `packages/cli/src/lib/self-host/compile.ts`
  - `packages/cli/src/lib/self-host/doctor.ts`
  - `packages/cli/src/lib/self-host/receipt.ts`
  - `packages/cli/src/lib/self-host/*.test.ts`
  - `packages/cli/src/main.ts`
  - `packages/cli/src/commands/help.ts`
  - `.gitignore`
  - `.github/workflows/ci.yml`
  - `docs/CONTRIBUTING.md`
  - `docs/RELEASING.md`
- **Behavior**:
  - `void-harness self-host sync` compile dans `.void/generated/.staging-*` puis swap ;
  - le receipt contient source hash et fichiers possédés ;
  - `self-host doctor` exerce discovery, hooks, événements et Mission Control ;
  - modes `shadow`, `warn`, `enforce`, `release-gate` ;
  - les artefacts générés sont gitignored et n'écrasent jamais `packages/core/`.
- **Verification gate**:
  - deux sync identiques sont idempotents ;
  - un changement source rend doctor stale avant resync ;
  - fault injection conserve le dernier self-host vert ;
  - un smoke réel Claude/Codex est enregistré lorsqu'un runtime est disponible ; sinon doctor
    affiche `degraded` et la conformance réelle reste un gate Step 10/21, jamais un faux vert ;
  - CI release-gate refuse un artefact source hash divergent ;
  - full suite verte.
- **Expected commits**:
  - `test(self-host): cover source drift and rollback because dogfood must test the artifact we ship`
  - `feat(self-host): compile local runtime assets because the harness must consume itself`
  - `ci(self-host): gate releases on dogfood because packaged and source behavior must agree`
- **Notes**:
  - commencer en `shadow` ;
  - aucun fichier natif utilisateur existant n'est pris en ownership.

### Checkpoint A - Foundation alpha après Step 8

Folpe vérifie :

- init account-free dans un fixture ;
- doctor volontairement cassé puis rouge ;
- mission event en live/replay ;
- ADR concurrent ;
- self-host shadow.

Arrêt obligatoire. Exécuter la full suite, l'audit sécurité des nouvelles surfaces et
`verification-before-completion`. Ne pas ouvrir la lane Team en enforcement avant validation.

### Step 9 - Compiler une mission déterministe de risque et d'applicabilité

- **Goal**: transformer ticket, diff, stack et politiques en un DAG complet avant tout subagent.
- **Depends on**: Steps 3, 4
- **TDD mode**: strict
- **Files**:
  - `packages/mission-engine/src/policy/schema.ts`
  - `packages/mission-engine/src/policy/merge.ts`
  - `packages/mission-engine/src/policy/*.test.ts`
  - `packages/mission-engine/src/risk/classify.ts`
  - `packages/mission-engine/src/risk/predicates.ts`
  - `packages/mission-engine/src/risk/*.test.ts`
  - `packages/mission-engine/src/mission/plan.ts`
  - `packages/mission-engine/src/mission/dag.ts`
  - `packages/mission-engine/src/mission/*.test.ts`
  - `packages/cli/src/lib/policy-loader.ts`
  - `packages/cli/src/lib/policy-loader.test.ts`
  - `packages/cli/src/commands/mission.ts`
  - `packages/core/policies/core.yaml`
- **Behavior**:
  - fusion `core < profile < organization < project` avec conflits visibles ;
  - classification low/medium/high avec raisons et version ;
  - chaque pass minimal reçoit état initial et preuve d'applicabilité ;
  - auth, PII, tenancy, migration destructive, upload, code execution, LLM tools et supply-chain
    imposent fortress ;
  - `mission plan --ticket <file> --json` est déterministe hors `generatedAt`.
- **Verification gate**:
  - table de décision exhaustive sur happy/nil/empty/huge/duplicated/wrong-role/called-twice ;
  - une policy projet peut renforcer mais pas affaiblir le core sans waiver ;
  - toute classe high-risk déclenche fortress ;
  - snapshot DAG stable sur fixtures Declik/Sesame/Solaar/void-harness ;
  - mission-engine et CLI tests passent.
- **Expected commits**:
  - `test(mission): specify risk and applicability because every specialist must be evaluated`
  - `feat(mission): compile the canonical DAG because prose composition cannot prove execution`
  - `feat(policy): merge layered rules because projects need extension without silent weakening`

### Step 10 - Compiler les premiers spécialistes natifs Claude et Codex

- **Goal**: rendre architecture, sécurité et QA directement invocables et orchestrables.
- **Depends on**: Steps 5, 9
- **TDD mode**: strict pour le compiler, souple + behavioral eval pour les contrats experts
- **Files**:
  - `packages/core/specialists/solution-architect.yaml`
  - `packages/core/specialists/security-engineer.yaml`
  - `packages/core/specialists/test-qa-engineer.yaml`
  - `.source` adjacent pour chaque spécialiste ;
  - `plans/skill-audits/` notes correspondantes ;
  - `packages/cli/src/lib/specialists/schema.ts`
  - `packages/cli/src/lib/specialists/load.ts`
  - `packages/cli/src/lib/specialists/compile-claude.ts`
  - `packages/cli/src/lib/specialists/compile-codex.ts`
  - `packages/cli/src/lib/specialists/*.test.ts`
  - `packages/cli/src/lib/codex-agents.ts`
  - `packages/cli/src/lib/runtime-adapters.ts`
  - fixtures `.claude/agents/*.md` et `.codex/agents/*.toml` dans les tests.
- **Behavior**:
  - un seul YAML canonique compile vers les formats natifs ;
  - le fallback actuel qui compile les agents Codex en skills est supprimé après conformance des
    agents TOML natifs ;
  - Claude et Codex découvrent les trois subagents ;
  - chaque rôle est read-only, scoped, budgété et à sortie structurée ;
  - invocation manuelle et orchestrée ont le même contrat ;
  - une absence de primitive subagent rend `team` indisponible, jamais simulé.
- **Verification gate**:
  - golden files des deux runtimes ;
  - aucun texte doctrinal ne diverge entre outputs ;
  - tests de permissions refusent l'écriture ;
  - si un runtime ne sait pas imposer read-only, le spécialiste déclare cette limite et le mode
    `team` reste `degraded` jusqu'à une isolation équivalente ;
  - smoke runtime réel lance chaque agent et parse sa sortie ;
  - anti-bloat, sourcing audit et runtime adapter tests passent.
- **Expected commits**:
  - `test(specialists): specify native runtime output because adapters must not fork doctrine`
  - `feat(specialists): add architecture security and QA agents because team mode needs real independent roles`
  - `docs(specialists): record sources and rejected overlap because expert scopes must remain bounded`
- **Notes**:
  - lire la documentation officielle actuelle des agents Claude/Codex avant les golden files ;
  - ne pas transformer tous les skills en agents.

### Step 11 - Exécuter le MVP team dans ticket-runner

- **Goal**: faire passer un ticket réel par plan, lead writer, trois reviews, correction et verdict.
- **Depends on**: Steps 3, 9, 10
- **TDD mode**: strict sur le cycle et les preuves, behavioral eval sur le conductor
- **Files**:
  - `packages/mission-engine/src/orchestration/controller.ts`
  - `packages/mission-engine/src/orchestration/review-loop.ts`
  - `packages/mission-engine/src/orchestration/*.test.ts`
  - `packages/core/skills/ticket-runner/SKILL.md`
  - `packages/core/skills/ticket-runner/.source`
  - `plans/skill-audits/ticket-runner.md`
  - `packages/core/workflows/ticket-runner.workflow.yaml`
  - `apps/eval-harness/src/cases/mission-team.ts`
  - `apps/eval-harness/src/runtime/claude.ts`
  - `apps/eval-harness/src/runtime/codex.ts`
  - `apps/eval-harness/src/runtime/*.test.ts`
- **Behavior**:
  - ticket-runner demande/charge le plan canonique ;
  - un lead writer unique possède la tranche ;
  - architecte, sécurité et QA reçoivent des contextes frais ;
  - outputs deviennent findings, pas prose libre ;
  - le writer corrige, seules les preuves affectées sont relancées ;
  - absence d'un événement `specialist.completed` requis bloque le verdict ;
  - boucle bornée, aucun vert par timeout.
- **Verification gate**:
  - fixture avec faille auth : sécurité la trouve et le run reste rouge avant correction ;
  - fixture avec frontière incorrecte : architecte la trouve ;
  - fixture avec branche non testée : QA la trouve ;
  - with/without montre zéro faux vert sur ces trois blockers ;
  - Claude et Codex produisent un run replayable au même schéma ;
  - full suite et eval MVP passent.
- **Expected commits**:
  - `test(ticket-runner): encode missing-specialist blockers because prose composition is not execution`
  - `feat(ticket-runner): orchestrate the first native team because tickets need independent expert proof`
  - `eval(ticket-runner): certify the MVP blockers because team quality must be measured`

### Step 12 - Ajouter fast, fortress, budgets et recovery

- **Goal**: obtenir trois modes honnêtes, une reprise idempotente et un budget qui ne dégrade pas le
  floor.
- **Depends on**: Step 11
- **TDD mode**: strict
- **Files**:
  - `packages/mission-engine/src/modes/fast.ts`
  - `packages/mission-engine/src/modes/team.ts`
  - `packages/mission-engine/src/modes/fortress.ts`
  - `packages/mission-engine/src/modes/*.test.ts`
  - `packages/mission-engine/src/budget/reducer.ts`
  - `packages/mission-engine/src/budget/*.test.ts`
  - `packages/mission-engine/src/orchestration/recovery.ts`
  - `packages/mission-engine/src/orchestration/recovery.test.ts`
  - `packages/cli/src/commands/mission.ts`
  - `packages/core/policies/core.yaml`
- **Behavior**:
  - fast refuse ou se promeut si risque high ;
  - team exige les spécialistes applicables ;
  - fortress ajoute threat model, adversarial review, rollback et seconde preuve critique ;
  - seuils 70/90/100 % émettent les transitions de la spec ;
  - retry unique avec contexte réduit, remplacement même tier, sinon block ;
  - `mission resume --id` ne répète aucun side effect déjà prouvé.
- **Verification gate**:
  - fast et team ont le même résultat qualité sur corpus low-risk ;
  - fast est rejeté sur chaque prédicat fortress ;
  - crash/restart à chaque transition reprend au bon nœud ;
  - side effect fixture appelé exactement une fois ;
  - budget à 100 % pause, il ne waive aucun pass ;
  - tests mission, CLI et eval passent.
- **Expected commits**:
  - `test(modes): prove automatic promotion because fast must not bypass risk`
  - `feat(modes): add fast team fortress because speed and assurance need explicit contracts`
  - `feat(recovery): resume idempotently because interrupted agents must not repeat side effects`

### Step 13 - Ajouter le double-pass UX/UI et le TDD frontend

- **Goal**: faire intervenir Experience Designer avant le code et Visual Craft Director après des
  screenshots réels.
- **Depends on**: Steps 10, 12
- **TDD mode**: strict pour le comportement UI, souple + screenshots + behavioral eval pour le craft
- **Files**:
  - `packages/core/specialists/experience-designer.yaml`
  - `packages/core/specialists/visual-craft-director.yaml`
  - sources et audits adjacents ;
  - `packages/core/skills/tdd/SKILL.md`
  - `packages/core/skills/testing/SKILL.md`
  - `packages/core/skills/frontend-design/SKILL.md`
  - `packages/core/skills/ui-review/SKILL.md`
  - `packages/core/skills/qa/SKILL.md`
  - `packages/core/policies/ui.yaml`
  - `apps/eval-harness/src/cases/frontend-tdd.ts`
  - `apps/eval-harness/src/cases/ui-craft.ts`
  - fixtures web mobile/desktop/états sous `apps/eval-harness/fixtures/ui/`.
- **Behavior**:
  - plan UI obligatoire avant implémentation ;
  - TDD couvre composants, hooks, stores, a11y et états ;
  - QA capture mobile, desktop, loading, empty, error, success et permission applicables ;
  - Visual Craft Director travaille en contexte frais ;
  - browser absent quand requis donne `blocked` ;
  - aucun judge LLM seul ne certifie le visuel.
- **Verification gate**:
  - fixture slop volontairement générique est rejetée ;
  - fixture composant avec bug clavier est attrapée par test avant E2E ;
  - snapshots mobile/desktop sont rattachés au diff ;
  - toutes les dimensions design atteignent au moins 8/10 sur le corpus accepté ;
  - anti-bloat, skill tests, a11y et evals passent.
- **Expected commits**:
  - `test(frontend): enforce behavior-first UI because TDD applies beyond the backend`
  - `feat(ux): add prebuild experience review because good interfaces start before pixels`
  - `feat(ui-review): add fresh-context craft proof because screenshots must expose AI slop`

### Step 14 - Compléter l'équipe et les profils évolutifs

- **Goal**: router DDD, hexagonal, data/migration, API, observabilité, performance, accessibilité,
  DevEx, rétrospective et PDF au bon moment.
- **Depends on**: Steps 9, 10
- **TDD mode**: strict pour schémas/routing, souple + behavioral eval pour expertise
- **Files**:
  - nouveaux contrats sous `packages/core/specialists/` ;
  - `packages/core/profiles/base.yaml`
  - `packages/core/profiles/typescript.yaml`
  - `packages/core/profiles/react.yaml`
  - `packages/core/profiles/nextjs.yaml`
  - `packages/core/profiles/node-server.yaml`
  - `packages/core/profiles/monorepo.yaml`
  - `packages/core/profiles/pwa.yaml`
  - `packages/core/profiles/expo.yaml`
  - `packages/core/profiles/sql.yaml`
  - `packages/mission-engine/src/profile/schema.ts`
  - `packages/mission-engine/src/profile/freshness.ts`
  - `packages/mission-engine/src/profile/*.test.ts`
  - `packages/cli/src/lib/stack.ts`
  - skills existants et audits concernés.
- **Behavior**:
  - chaque rôle est toujours évalué ;
  - `not-applicable` contient prédicat, inputs et hash ;
  - profil déclare versions, sources officielles, `reviewedAt` et expiration ;
  - version inconnue/stale donne `degraded` et source-driven review ;
  - patterns de pack ne chargent que sur stack et fichiers concernés ;
  - PDF requiert un moteur seulement si entrée ou livrable PDF.
- **Verification gate**:
  - matrice Declik/Sesame/Solaar charge seulement les profils détectés ;
  - changement schema déclenche migration, observabilité et QA adaptés ;
  - changement CSS n'invoque pas migration ;
  - profil expiré ne se présente pas comme état de l'art ;
  - overlap spécialistes inférieur ou égal à 30 % selon audit ;
  - skill tests, routing snapshots et behavioral evals passent.
- **Expected commits**:
  - `test(profiles): cover applicability and freshness because state-of-the-art guidance expires`
  - `feat(profiles): route stack expertise because agnostic core still needs precise local patterns`
  - `feat(specialists): complete the virtual team because every engineering discipline needs an accountable scope`

### Step 15 - Ajouter sécurité périodique, pentest sûr et rétrospective

- **Goal**: vérifier régulièrement l'absence de compromission et transformer les signaux en
  propositions HITL.
- **Depends on**: Steps 12, 14
- **TDD mode**: strict pour scope/policy, souple pour adapters scanner
- **Files**:
  - `packages/core/workflows/security-baseline.workflow.yaml`
  - `packages/core/workflows/retrospective.workflow.yaml`
  - `packages/core/adapters/security/manifest.yaml`
  - `packages/mission-engine/src/security/scope.ts`
  - `packages/mission-engine/src/security/severity.ts`
  - `packages/mission-engine/src/security/*.test.ts`
  - `packages/cli/src/commands/security.ts`
  - `packages/cli/src/commands/security.test.ts`
  - `packages/core/templates/github/void-security.yml` ;
  - `packages/core/skills/security-audit/SKILL.md`
  - `packages/core/skills/retrospective/SKILL.md`.
- **Behavior**:
  - baseline local sans vendeur sur chaque ticket ;
  - scans de dépendances et DAST via adapters déclarés ;
  - cible externe exige scope + autorisation explicite ;
  - mode non destructif par défaut ;
  - findings ont reproduction, sévérité, preuve et correction ;
  - périodicité configurable en CI ;
  - rétro propose des changements, n'écrit jamais la doctrine.
- **Verification gate**:
  - URL externe sans autorisation est refusée ;
  - fixture OWASP locale détecte les vulnérabilités attendues sans données détruites ;
  - scanner absent en fortress/prelaunch bloque la preuve requise ;
  - secret, tenant isolation et destructive migration ne sont pas waiveables ;
  - sécurité, CI template et retrospective evals passent.
- **Expected commits**:
  - `test(security): enforce pentest scope because autonomous scanning must stay authorized`
  - `feat(security): add periodic baseline and adapters because compromise detection cannot be one-off`
  - `feat(retrospective): propose evidence-backed improvements because self-evolution must remain HITL`

### Step 16 - Introduire l'enveloppe Graph v3 sans casser le catalogue

- **Goal**: servir quatre graphes versionnés derrière un modèle node-link commun.
- **Depends on**: Steps 2, 3
- **TDD mode**: strict
- **Files**:
  - `packages/harness-graph/src/model/v3/types.ts`
  - `packages/harness-graph/src/model/v3/schema.ts`
  - `packages/harness-graph/src/model/v3/ids.ts`
  - `packages/harness-graph/src/model/v3/provenance.ts`
  - `packages/harness-graph/src/model/v3/*.test.ts`
  - `packages/harness-graph/src/catalog/build.ts`
  - `packages/harness-graph/src/catalog/build.test.ts`
  - `packages/harness-graph/src/mission/build.ts`
  - `packages/harness-graph/src/evidence/build.ts`
  - `packages/harness-graph/src/index.ts`
  - `packages/cli/src/commands/graph.ts`
  - adapters v1 sous `packages/harness-graph/src/compat/`.
- **Behavior**:
  - `CatalogGraph`, `MissionGraph` et `EvidenceGraph` émettent schemaVersion 3 ;
  - IDs namespacés et stables ;
  - origine, confiance, provenance et rootHash obligatoires ;
  - loader v1 adapte sans mutation ;
  - snapshot et delta sont validés avant projection.
- **Verification gate**:
  - modèle v1 courant donne un CatalogGraph v3 sans perte de relation ;
  - invalid provenance, duplicate ID, dangling edge et path escape sont rejetés ;
  - golden graph déterministe ;
  - Studio courant fonctionne via compat adapter ;
  - graph tests, graph check et bundle check passent.
- **Expected commits**:
  - `test(graph): specify v3 provenance because inferred and observed edges need different trust`
  - `feat(graph): add four-layer envelope because catalog project mission and evidence answer different questions`
  - `feat(graph): adapt v1 catalog because migration must preserve current consumers`

### Step 17 - Construire le ProjectGraph natif et ses requêtes

- **Goal**: fournir impact, paths, tests, owners et sous-graphe sans service externe.
- **Depends on**: Step 16
- **TDD mode**: strict + benchmark
- **Files**:
  - `packages/harness-graph/src/project/extractors/types.ts`
  - `packages/harness-graph/src/project/extractors/filesystem.ts`
  - `packages/harness-graph/src/project/extractors/workspace.ts`
  - `packages/harness-graph/src/project/extractors/git.ts`
  - `packages/harness-graph/src/project/extractors/typescript.ts`
  - `packages/harness-graph/src/project/cache.ts`
  - `packages/harness-graph/src/project/build.ts`
  - `packages/harness-graph/src/project/query.ts`
  - tests et fixtures adjacents ;
  - `packages/cli/src/commands/graph.ts`
  - `packages/cli/src/lib/project-graph-store.ts`
  - `packages/harness-graph/package.json`.
- **Behavior**:
  - extracteur générique fichiers/workspaces/tests/docs/git ;
  - extracteur TS/JS AST pour imports, exports, symboles et tests ;
  - l'extracteur v1 utilise l'API Compiler officielle de `typescript`, derrière le port
    d'extracteur ; cette dépendance JS déjà présente dans le workspace évite un binaire natif et
    reste remplaçable ;
  - cache SHA-256 incrémental, atomic swap et rootHash ;
  - requêtes `explain`, `path`, `impact`, `subgraph`, `owners`, `testsFor`, `staleness` ;
  - graphe stale/partiel déclenche fallback source.
- **Verification gate**:
  - fixtures cycles, path aliases, dynamic import, monorepo, deleted/renamed files ;
  - build répété sans changement ne reparcourt pas les fichiers ;
  - un rename détecté par Git crée `previous-id` vers le nouvel ID ; sans preuve de rename, le
    graphe crée un nouveau nœud au lieu d'inventer une continuité ;
  - aucune dépendance critique omise sur corpus de référence ;
  - cold et incremental benchmarks enregistrés ;
  - graph tests, typecheck et memory ceiling passent.
- **Expected commits**:
  - `test(project-graph): encode dependency edge cases because context pruning must not omit critical code`
  - `feat(project-graph): add native incremental extraction because the base harness must stay self-sufficient`
  - `feat(project-graph): expose impact queries because agents need focused context instead of full repositories`
- **Notes**:
  - aucun regex-only symbol parser ;
  - refuser une dépendance native qui casse le tarball cross-platform.

### Step 18 - Compiler un context pack borné par rôle

- **Goal**: réduire le contexte sans perte critique et sans injecter le graphe entier.
- **Depends on**: Steps 9, 14, 17
- **TDD mode**: strict + benchmark
- **Files**:
  - `packages/mission-engine/src/context/port.ts`
  - `packages/mission-engine/src/context/select.ts`
  - `packages/mission-engine/src/context/budget.ts`
  - `packages/mission-engine/src/context/render.ts`
  - `packages/mission-engine/src/context/*.test.ts`
  - `packages/cli/src/lib/context/project-graph-adapter.ts`
  - `packages/cli/src/lib/context/source-fallback.ts`
  - `packages/cli/src/lib/context/*.test.ts`
  - `packages/cli/src/commands/mission.ts`
  - `benchmarks/context/`.
- **Behavior**:
  - seeds depuis ticket, diff, policies, findings et spécialiste ;
  - progressive disclosure L0..L4 ;
  - déduplication des décisions/policies ;
  - budget par rôle et provenance de chaque fragment ;
  - source fallback obligatoire si confiance/staleness insuffisante ;
  - context pack Markdown compact + manifest JSON hashable.
- **Verification gate**:
  - zéro omission critique sur les missions benchmark ;
  - au moins 30 % de tokens source en moins sur tâches complexes éligibles ;
  - régression précision inférieure à 5 % hors critique ;
  - context hash stable ;
  - specialist reçoit seulement les chemins autorisés ;
  - benchmark et tests passent.
- **Expected commits**:
  - `test(context): define omission corpus because token savings cannot trade away correctness`
  - `feat(context): compile role-specific subgraphs because specialists need less but better context`
  - `bench(context): record source fallback comparison because graph value must be measured`

### Step 19 - Importer Graphify et décider par benchmark

- **Goal**: accepter le JSON Graphify comme source optionnelle sans le rendre autoritaire.
- **Depends on**: Steps 17, 18
- **TDD mode**: strict pour importer, exploratory puis benchmark pour l'adapter
- **Files**:
  - `packages/harness-graph/src/import/graphify/schema.ts`
  - `packages/harness-graph/src/import/graphify/normalize.ts`
  - `packages/harness-graph/src/import/graphify/*.test.ts`
  - `packages/cli/src/commands/graph.ts`
  - `packages/cli/src/lib/graphify-adapter.ts`
  - `packages/cli/src/lib/graphify-adapter.test.ts`
  - `benchmarks/graphify/`
  - `docs/GRAPHIFY.md`
  - décision datée de rétention ou rejet par classe de tâche.
- **Behavior**:
  - `graph import graphify <file>` est local, read-only et borné ;
  - paths relatifs, namespace `graphify:*`, provenance conservée ;
  - input invalide ou énorme mis en quarantaine ;
  - aucune inférence Graphify ne remplace une relation extraite avec plus de confiance ;
  - adapter code-only détecté, jamais installé automatiquement.
- **Verification gate**:
  - corpus malveillant : path traversal, duplicate IDs, cycles énormes, payload bomb ;
  - benchmark recherche classique vs natif vs Graphify sur quatre repos ;
  - gain/omission/précision/incremental documentés ;
  - Graphify n'est retenu comme préférence que si les seuils de spec passent ;
  - sans Graphify, full suite et toutes missions restent fonctionnelles.
- **Expected commits**:
  - `test(graphify): reject hostile graph inputs because optional modules cross a trust boundary`
  - `feat(graphify): add provenance-preserving import because external graphs may enrich but never own truth`
  - `bench(graphify): decide adoption by measured context gain because optional complexity needs proof`

### Step 20 - Attribuer tokens, temps et coût sans double comptage

- **Goal**: relier chaque consommation à une mission/spécialiste avec source et confiance.
- **Depends on**: Steps 2, 3, 18
- **TDD mode**: strict
- **Files**:
  - `packages/mission-engine/src/cost/types.ts`
  - `packages/mission-engine/src/cost/attribute.ts`
  - `packages/mission-engine/src/cost/*.test.ts`
  - `packages/cli/src/lib/transcript-cost.ts`
  - `packages/cli/src/lib/transcript-cost.test.ts`
  - `packages/cli/src/lib/cost/codex.ts`
  - `packages/cli/src/lib/cost/claude.ts`
  - `packages/cli/src/lib/cost/*.test.ts`
  - `packages/harness-graph/src/cost/*`
  - fixtures redacted de transcripts.
- **Behavior**:
  - sources `runtime-reported`, `transcript-derived`, `estimated`, `unknown` ;
  - corrélation par IDs/intervalle, jamais coût session complet par skill ;
  - cache read/write distinct ;
  - prix versionnés séparément des tokens ;
  - aucun contenu prompt/réponse lu ou persisté ;
  - format drift augmente skipped/degraded, jamais zéro.
- **Verification gate**:
  - somme des attributions ne dépasse pas total runtime ;
  - intervalles chevauchés restent explicitement partagés ou unknown ;
  - format transcript inconnu ne crash pas ;
  - tests confidentialité vérifient qu'aucun contenu fixture ne sort ;
  - comparaison manuelle de trois runs réels ;
  - cost, graph et CLI tests passent.
- **Expected commits**:
  - `test(cost): prevent session double counting because specialist economics need honest attribution`
  - `feat(cost): add confidence-tagged attribution because unknown usage must stay visible`
  - `docs(cost): document privacy and drift because transcript adapters handle sensitive formats`

### Step 21 - Certifier runtimes et spécialistes

- **Goal**: passer de structurellement présent à réellement effective par cellule.
- **Depends on**: Steps 8, 11, 12, 14, 15, 18, 20
- **TDD mode**: strict pour runner/scorers, behavioral + adversarial pour spécialistes
- **Files**:
  - `apps/eval-harness/src/runtime/` ;
  - `apps/eval-harness/src/suites/conformance.ts`
  - `apps/eval-harness/src/suites/specialists.ts`
  - `apps/eval-harness/src/suites/adversarial.ts`
  - `apps/eval-harness/src/suites/*.test.ts`
  - `apps/eval-harness/src/scorers.ts`
  - `apps/eval-harness/src/reporter.ts`
  - `packages/harness-graph/src/certification/*`
  - `packages/harness-graph/certification.json`
  - `benchmarks/engineering/README.md`
  - `benchmarks/engineering/cohort.json`
  - `.github/workflows/ci.yml`
  - `.github/workflows/runtime-conformance.yml`
- **Behavior**:
  - suite déterministe sur chaque PR ;
  - suite runtime réelle Claude/Codex sur environnement autorisé ;
  - with/without, sensitivity et adversarial par spécialiste ;
  - cellules par runtime, version de contrat et classe de tâche ;
  - gates false green, hook absent, graph stale, artifact mismatch et coût ;
  - le benchmark compare a minima runtime nu, harness v2 et v3 sur les mêmes modèles/versions ;
  - le label top 5 % exige un benchmark public gelé et au moins 20 configurations comparables,
    avec revue aveugle humaine pour les dimensions subjectives ; avant cela, le produit affiche
    seulement `certified against <suite>`.
- **Verification gate**:
  - chaque capacité modifiée sans eval fait échouer certification ;
  - un prompt spécialiste neutralisé fait chuter le sensitivity test ;
  - blockers critiques donnent zéro faux vert ;
  - mêmes fixtures et schémas sur Claude/Codex ;
  - manifest gelé correspond exactement au commit et au tarball ;
  - cohorte insuffisante rend le label top 5 % indisponible sans bloquer la certification honnête ;
  - suites déterministe, conformance et behavioral passent.
- **Expected commits**:
  - `test(certification): gate false greens because top-tier claims require adversarial evidence`
  - `feat(certification): add runtime conformance because static assets do not prove native execution`
  - `feat(certification): score specialist deltas because effectiveness must be measured per cell`

### Step 22 - Dogfooder sur void-harness, Declik, Sesame et Solaar

- **Goal**: prouver la v3 sur quatre projets réels avant stable.
- **Depends on**: Steps 8, 15, 21
- **TDD mode**: strict pour fixtures/gates, souple pour migration de config
- **Files**:
  - `fixtures/consumers/void-harness.json`
  - `fixtures/consumers/declik.json`
  - `fixtures/consumers/sesame.json`
  - `fixtures/consumers/solaar.json`
  - `packages/cli/src/lib/conformance/consumer.ts`
  - `packages/cli/src/lib/conformance/consumer.test.ts`
  - `packages/cli/src/commands/self-host.ts`
  - `package.json`
  - `.github/workflows/consumer-conformance.yml`
  - guides de migration sous `docs/migrations/`.
- **Behavior**:
  - les fixtures contiennent métadonnées/hash, pas le code privé ;
  - tests réels s'exécutent localement dans chaque checkout disponible ;
  - progression shadow -> warn -> enforce -> release-gate ;
  - différences projet restent dans profils/policies projet ;
  - aucune remontée automatique de doctrine ;
  - release-please pilote version/changelog/prerelease selon sa documentation officielle.
- **Verification gate**:
  - mission backend, frontend, migration, sécurité et low-risk fast sur le corpus ;
  - aucune régression des commandes projet ;
  - comparaison qualité/coût v2 vs v3 ;
  - self-host et tarball ont le même source hash ;
  - aucun manifest versionné à la main ;
  - release candidate bloquée tant qu'un fixture critique est rouge.
- **Expected commits**:
  - `test(consumers): encode four real project shapes because agnostic claims need heterogeneous proof`
  - `feat(conformance): run consumer missions because self-dogfood alone misses stack boundaries`
  - `docs(migration): define v2 to v3 adoption because quality upgrades need a reversible path`

### Checkpoint B - Release candidate après Step 22

Folpe vérifie :

- une mission `fast`, `team` et `fortress` réelle ;
- deux runs comparables Claude/Codex ;
- UX/UI avec screenshots ;
- pentest local et remediation ;
- économies tokens du Context Compiler ;
- retour arrière vers v2 ;
- score de certification et limites affichées.

Arrêt obligatoire avant Mission Control UI ou extension publique. Un `NOT CLEARED` du Certification
Lab bloque la release candidate.

### Step 23 - Brancher le data plane Mission Control et ouvrir sa spec x10

- **Goal**: alimenter toutes les vues prévues avec un backend fiable, sans décider le design final.
- **Depends on**: Steps 2, 3, 16, 20, 22
- **TDD mode**: strict pour data/live, souple pour la projection minimale existante
- **Files**:
  - `packages/cli/src/lib/mission-control/server.ts`
  - `packages/cli/src/lib/mission-control/routes.ts`
  - `packages/cli/src/lib/mission-control/auth.ts`
  - `packages/cli/src/lib/mission-control/*.test.ts`
  - `packages/cli/src/commands/graph.ts`
  - `apps/graph-studio/src/data/mission.ts`
  - `apps/graph-studio/src/data/team.ts`
  - `apps/graph-studio/src/data/quality.ts`
  - `apps/graph-studio/src/data/consumption.ts`
  - tests de reducers seulement ;
  - nouvelle spec UI `docs/specs/<date>-mission-control-x10.md` après brainstorming.
- **Behavior**:
  - endpoints read-only pour Live Mission, Team, Consumption, Quality, History, Catalog ;
  - loopback, session token, CORS strict, limites de taille ;
  - snapshot/delta, Last-Event-ID et états de connexion ;
  - progressive graph L0..L4 ;
  - l'UI actuelle ne simule aucune animation sans événement ;
  - aucune refonte visuelle avant approbation de la spec dédiée.
- **Verification gate**:
  - tests reconnect/gap/backfill sur chaque route ;
  - accès sans session locale refusé sur toutes les routes live et historiques ;
  - historique rejoué donne le même état ;
  - 10k événements ne bloquent pas le reducer ou la page au-delà du budget fixé dans la spec UI ;
  - vue 2D/reduced-motion conserve l'information minimale ;
  - plan UI séparé approuvé avant toute Step visuelle ultérieure.
- **Expected commits**:
  - `test(mission-control): cover reconnect and authorization because local dashboards still expose sensitive state`
  - `feat(mission-control): expose truthful read models because visual quality needs a reliable data plane`
  - `docs(spec): design Mission Control x10 because the visual layer needs its own approved contract`
- **Notes**:
  - cette Step s'arrête au data plane et aux projections minimales ;
  - le brainstorming UI devra utiliser `frontend-design` puis `ui-review`.

### Step 24 - Livrer le seam local d'extensions

- **Goal**: permettre d'ajouter un spécialiste, profil ou adapter sans marketplace et sans
  permissions implicites.
- **Depends on**: Steps 9, 10, 16, 21
- **TDD mode**: strict + adversarial
- **Files**:
  - `packages/mission-engine/src/extensions/manifest.ts`
  - `packages/mission-engine/src/extensions/permissions.ts`
  - `packages/mission-engine/src/extensions/merge.ts`
  - `packages/mission-engine/src/extensions/*.test.ts`
  - `packages/cli/src/commands/extensions.ts`
  - `packages/cli/src/commands/extensions.test.ts`
  - `packages/cli/src/lib/extensions/install.ts`
  - `packages/cli/src/lib/extensions/remove.ts`
  - `packages/cli/src/lib/extensions/*.test.ts`
  - `fixtures/extensions/`
  - `docs/EXTENSIONS.md`.
- **Behavior**:
  - install depuis chemin local explicite uniquement ;
  - namespace, licence, provenance, versions et permissions obligatoires ;
  - aucune exécution ni hook implicite à l'installation ;
  - collision et affaiblissement core bloqués ;
  - receipt et suppression complète ;
  - extension non certifiée affichée comme telle ;
  - registre public hors scope.
- **Verification gate**:
  - fixtures path traversal, symlink escape, collision, permission escalation, hook implicite ;
  - install/remove idempotents et rollback fault-injected ;
  - extension Graphify adapter fonctionne sans modifier le core ;
  - extension spécialiste compile vers Claude/Codex ;
  - full security suite, certification et tarball smoke passent.
- **Expected commits**:
  - `test(extensions): reject privilege escalation because third-party modules cross the strongest trust boundary`
  - `feat(extensions): add local manifests and receipts because extensibility must remain inspectable`
  - `docs(extensions): document the pre-marketplace contract because ecosystem growth needs stable boundaries`
- **Notes**:
  - post-stable et non bloquant pour la v3 initiale ;
  - ne démarre qu'après stabilisation des contrats sur les quatre projets ;
  - aucun registre ou install réseau dans cette Step.

## Verification globale

Chaque Step exécute son gate ciblé. À chaque checkpoint et avant chaque prerelease :

```bash
pnpm install --frozen-lockfile
pnpm sync:docs
pnpm version:check
pnpm anti-bloat:check
pnpm decisions:check
pnpm lint
pnpm build
pnpm typecheck
pnpm graph:check
pnpm certification:check
pnpm graph:check-bundle
pnpm test
pnpm check:publish
```

À partir de Step 5, ajouter :

```bash
pnpm conformance:install
pnpm conformance:hooks
```

À partir de Step 11 :

```bash
pnpm eval -- --suite mission-team --runtime claude,codex
```

À partir de Step 21 :

```bash
pnpm eval -- --suite all --runtime claude,codex
pnpm conformance:consumers
```

Les scripts sont créés dans la Step qui les introduit. Aucun gate ne référence une commande
inexistante à son propre point d'exécution.

## Security gates

- chaque nouvelle lecture de fichier normalise puis vérifie qu'elle reste sous le root autorisé ;
- JSON/YAML/JSONL ont limites de taille, profondeur et nombre d'objets ;
- événements et preuves sont redacted avant disque ;
- le serveur Mission Control reste loopback et read-only ;
- extension, Graphify et scanner sont des entrées non fiables ;
- aucune cible externe n'est testée sans autorisation explicite ;
- aucune dépendance n'est ajoutée avant lecture de sa documentation officielle, audit de licence,
  maintenance, supply-chain et compatibilité cross-platform ;
- les actions GitHub tierces restent pinées selon la politique de supply-chain décidée.

## Performance budgets

- hook runner p95 inférieur à 75 ms à chaud et 150 ms à froid sur machine de référence, avec
  overhead pur inférieur à 25 ms au-dessus du démarrage Node mesuré ;
- réduction/replay de 10 000 événements p95 inférieur à 100 ms sur machine de référence ;
- build ProjectGraph incrémental p95 inférieur à 500 ms pour moins de 10 fichiers modifiés ;
- Mission Control reçoit un snapshot initial utilisable en moins de 1 seconde sur le corpus ;
- Context Compiler réduit d'au moins 30 % les tokens source sur tâches complexes éligibles ;
- fast conserve le floor et vise un overhead p50 inférieur à 30 % face au flux direct low-risk ;
- toute mesure précise machine, version, corpus et source.

Ces budgets sont des gates de benchmark, pas des garanties marketing cross-machine.

## Rollback

- chaque nouvelle structure de fichier a un `schemaVersion` et un loader précédent ;
- init/update/self-host/extensions utilisent staging + atomic swap + receipt ;
- les logs append-only ne sont jamais réécrits en place ;
- les événements legacy restent importables pendant toute la v3 ;
- v2 reste installable jusqu'à la stable v3 et le guide documente le retour ;
- release-please possède les versions, la publication utilise un dist-tag prerelease jusqu'au gate
  stable.

## Plan-review implementation tasks

Pass `all`, ordre CEO -> Design -> Eng -> DevEx.

### Verdict

`CLEARED` pour planification, sous réserve des deux checkpoints humains déjà inscrits. Aucun P1 ne
reste ouvert.

### Findings disposés

| Priorité | Lens | Finding | Disposition |
|---|---|---|---|
| P1 | CEO/Eng | programme trop gros pour une branche et DAG de lanes imprécis | replié dans Architecture d'exécution, joins et ownership intégrateur |
| P1 | Eng | supprimer l'index ADR casserait ses références historiques | replié Step 1, snapshot legacy figé + projection courante à la demande |
| P1 | Eng/Security | le premier serveur live exposait les événements avant l'auth Mission Control | replié Step 2, token one-shot, cookie local et routes protégées |
| P1 | Eng | `top 5 %` restait invérifiable sans cohorte | replié Step 21, benchmark public gelé, cohorte >=20, sinon label absent |
| P2 | Eng | `read-only` peut être déclaratif selon le runtime | replié Step 10, état degraded sans isolation prouvée |
| P2 | Eng | choix du parseur ProjectGraph laissé à l'implémentation | replié Step 17, TypeScript Compiler API derrière un port |
| P2 | Eng | commandes projet en chaînes prolongeraient l'injection shell | replié Steps 3/7, argv par défaut et shell explicite |
| P2 | DevEx | nouvelles commandes sans contrat d'erreur commun | replié dans le contrat DX transversal |
| P2 | Performance | budget hook 25 ms incluant cold start irréaliste | replié dans Performance budgets avec warm/cold et overhead pur |
| P3 | CEO | extensions non prioritaires pouvaient retarder la stable | Step 24 marquée post-stable et non bloquante |

### Coverage review

- **Architecture**: package direction explicite, trois joins, single-writer et artefacts partagés
  sérialisés.
- **Failure modes**: nil/empty/huge/duplicate/wrong-role/retry, crash/reprise, stale/tamper,
  runtime/tool absent, graph partial, SSE gap, rollback et path escape ont un gate.
- **Tests**: chaque Step déclare TDD, gate observable, commits attendus et corpus.
- **Design**: UI produit traité Step 13 ; Mission Control visuel correctement bloqué derrière une
  nouvelle spec.
- **DevEx**: TTHW, offline tarball, aide, JSON, non-interactif, erreurs et migration v2 couverts.

### Scope mode

`REDUCTION` au niveau de chaque PR, `SELECTIVE` au niveau du programme. Le MVP s'arrête à Step 11 ;
Mission Control visuel et écosystème ne peuvent pas grossir ce cut.

## Resume point

**Next step**: Checkpoint A - validation humaine du socle alpha

**Completed**:

- spec v3 approuvée et commitée (`df216e7`) ;
- audit stack/usage/graph terminé ;
- architecture, modes, équipe, graphes, failure policy, certification et rollout validés.
- Step 1 : ADR UUID exclusifs, schémas legacy/v3, supersession, immutabilité git,
  projections read-only, doctrine/CI/assets/graphes alignés (`a39d8ad`) ;
- gate Step 1 : 1 173 tests passés, 1 skip attendu ; typecheck, lint, build,
  anti-bloat, décisions avec base git, graphes, bundle et publish-safety verts ;
- Step 2 : journal canonique append-only partagé Claude/Codex, validation bornée,
  séquençage concurrent, replay O(n), compatibilité legacy, registre multi-projet,
  SSE authentifié et reprenable, états Mission Control explicites (`74b2e6c`) ;
- gate Step 2 : 1 211 tests passés, 1 skip attendu ; typecheck, bundle embarqué,
  core-assets et diff verts ; replay 10k événements p95 59,26 ms, hook cold p95
  92,66 ms, écriture hot p95 1,6 ms.
- Step 3 : preuves canoniques auto-hashées et bornées, invalidation ciblée par dépendance,
  findings append-only, verdict déterministe, journal redacted, CLI mission shell-safe,
  inspection stable, archivage atomique et prune explicite (`f079a6e`) ;
- gate Step 3 : 1 251 tests passés, 1 skip attendu ; build, typecheck, anti-bloat,
  publish-safety, décisions, graphes, bundle, core-assets, parité docs, versions et diff verts ;
  smoke réel start/verify/inspect/archive vert, fuite de secret absente et preuve stale refusée.
- Step 4 : faux verts capturés en TDD (`6fa49d8`), postconditions exécutables par adapter,
  smoke du hook réellement installé en fixture isolée sans secrets ambiants, états tri-state
  `installed/wired/fired/observed/certified`, ProjectState localement vérifié et self-host
  explicitement `not-installed` (`3852ae0`) ;
- gate Step 4 : 1 260 tests passés, 1 skip attendu ; 558 tests CLI passent hors sandbox loopback ;
  build, typecheck, lint, anti-bloat, publication, décisions, graphes, certification, core-assets,
  parité docs, versions et diff verts ; manifest seul et hook non exécutable restent rouges.
- Step 5 : assets Claude/Codex locaux par défaut, tarball offline autosuffisant, staging isolé,
  transaction byte-for-byte, receipt hashé, ownership conservateur et lifecycle
  add/remove/update local sans marketplace (`650f983`, `079420e`) ;
- gate Step 5 : matrice conformance Claude/Codex/both verte sur tarball offline, p50 1,07 s ;
  rollback fault-injected, runtime add et fichiers adjacents prouvés ; 1 283 tests passés,
  1 skip attendu ; typecheck, anti-bloat, publication, décisions, parité docs et versions verts.
- Step 6 : quatre règles critiques pures dans le runner Node, normalisation Claude/Codex/CI
  bornée, wrappers shell réduits à dix lignes, TDD backend/frontend partagé, manifests natifs,
  chemins Codex absolus quotés cross-platform et diff CI sur le même bundle (`7cc4071`,
  `499ac31`, `234af19`) ;
- gate Step 6 : 1 339 tests passés, 1 skip attendu ; 57 tests runner, 119 tests floor ciblés,
  smoke Codex depuis un sous-répertoire avec espaces, chemins symlinkés bornés, conformance
  offline p50 1,07 s, typecheck, lint, anti-bloat, publication, décisions, parité docs et
  versions verts.
- Step 7 : règles qualité restantes profilées par langage, commandes lifecycle en argv,
  formatage borné aux fichiers touchés, trim/typecheck/context portables, un seul asset Node
  installé, résultats de hooks canoniques et contrôle de taille Git-only réellement advisory
  (`fc4f819`, `4579b6e`, `e7f610a`, `fc6f018`, `6909c40`) ;
- gate Step 7 : 1 367 tests passés, 1 skip attendu ; fixtures Python, dépôt sans commit,
  chemin avec espaces et base Git explicite couverts ; conformance offline Claude/Codex/both
  p50 621 ms ; build, typecheck, lint, anti-bloat, publication, décisions immuables depuis
  `fc6f018`, graphes, bundle, certification, parité docs, versions et diff verts.
- Step 8 : self-host isolé en staging puis swap atomique, receipt byte-hashé, worker
  Claude/Codex compilé depuis les sources courantes, modes de rollout, rollback et doctor
  exécutable avec replay canonique (`f281525`, `db95ec5`, `bce4130`) ;
- audit sécurité Step 8 : environnement enfant réduit, revalidation du hash avant publication,
  PostCSS corrigé et `pnpm audit` sans vulnérabilité connue ;
- gate Step 8 : 1 382 tests passés, 1 skip attendu ; Claude et Codex réellement disponibles,
  hooks fired, événements rejoués, self-host `release-gate` puis `shadow` verts ; build,
  typecheck, lint, anti-bloat, publication, décisions immuables depuis `b80ce14`, graphes,
  bundle, certification, conformance offline p50 734 ms, parité docs et versions verts.

**Pending**:

- validation humaine Checkpoint A ;
- Steps 9 à 24 ;
- Checkpoint B après Step 22 ;
- brainstorming/spec dédiée Mission Control x10 pendant Step 23.
