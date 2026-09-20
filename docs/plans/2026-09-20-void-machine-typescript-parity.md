# TypeScript port: A0 parity register

Status: A1 implemented and verified; systematic A2-A5 suspended by revised user mandate.
Standalone local unit A0-A5. Writer WORK-1; panel provider ORCH.
Source HEAD: `cc2cb14a74f70acba18dd5fde2c1c9ce4a092c7f` (approved plan on
`85f177b1dc4638be75ccc9e265352698cc072969`). No source changes since `1efeedf1`
in native/void-machine, launcher, native doctor contract test, durable-run,
legacy oracle, CLI manifest or CI workflow (git diff inspected).

## Behavior, owner, destination and acceptance evidence

Destinations below are relative to packages/void-machine. They are not claims
that implementation exists. Each proof remains pending until linked to RUN output.

| Existing behavior/source | Owner and destination | Positive / refusal evidence required |
| --- | --- | --- |
| host/lib.rs repository discovery; core DoctorReport | Git adapter `src/adapters/git/repository.ts`, development doctor policy, application composition | Ordinary and linked worktree paths; outside Git blocked; absent Git; no writes; config/cache paths explicitly supplied |
| adapters/lib.rs machine config/lock validation | Format adapters and development doctor | Valid config/lock; malformed, unsupported version, unreadable file; degraded vs blocked dominance; closed v1 JSON report |
| cli/main.rs doctor | application CLI | Healthy exit 0, degraded/blocked 1, usage 2; parseable JSON only on stdout; human diagnostics on text path |
| adapters/lib.rs check_skill | File/format adapters, `src/verticals/development/skill-package.ts` | Exact two-file package; missing/unknown entry, directory-as-file, root/nested symlink, unreadable file, invalid UTF-8, duplicate/unknown manifest field, forbidden capability/permission |
| Skill manifest and package hashes | Skill package identity, Node crypto adapter | Fixed byte digest, LF versus CRLF and multibyte bytes, no normalization; sorted files; unchanged schema fields |
| core/lib.rs GitEffectRequest, effect_id | Development Git effect identity and validation | UTF-8 length prefixes, Rust lexical byte order, file duplicates retained in canonical input, revision u64 and ordinal u32 bounds |
| core/lib.rs claim/apply/ambiguous | Minimal generic effect state only if needed, Git validation in development | Positive fence, same-fence replay returns original proof; zero/stale fence, pending application, ambiguous repetition and applied-to-ambiguous refused |
| core/lib.rs validate_observation | Development Git proof policy | Full SHA, nonempty exact chain base to head, exact sorted footprint; merge, duplicate, invalid SHA, broken chain, shared mutation refused |
| host/git_effect.rs snapshots and commit observation | Git adapter + application composition | Real disposable Git repo, linked worktree, Unicode/space/newline paths, command failure; snapshots composed before proof; no writes by observer |
| core/cluster.rs reconcile_cluster | `src/verticals/development/cluster.ts` | Complete partial-success cluster; missing/extra/duplicate worker, no files/review, empty integration, collision refused; sequential overlap permitted, unowned widening allowed |
| core/cluster.rs ReconciliationLedger | Development in-memory acceptance | First accept then duplicate refusal; no claim of restart durability |
| core/merge.rs decide_merge and MergeLedger | Development merge policy; command construction in adapter | Protected nondeploy target, exact reviewed/check SHA and PR; production aliases, human gate, missing PR, invalid head, force, unknown protection, stale/failed checks, unavailable/stale review, sensitive paths, repeated merge refused |
| merge grant argv | `src/adapters/git/merge-command.ts` | Exact gh pr merge argv including --match-head-commit, no shell and no remote execution in tests |
| npm launcher | Existing packages/cli/bin/void-machine.mjs importing bundled candidate in A5 | Works without Cargo/native executable; exit/report contracts; explicit VOID_MACHINE_BIN migration refusal |
| Three schemas + read-only fixture | Package schema/ and fixtures/ in A5 | Preserve public $id and fields; update the two direct test consumers; no legacy journal rewrite |
| durable-run.ts, existing SQLite state | Legacy CLI autopilot remains authoritative | Existing v1 read/transition/recovery proofs retained; authoritativeEffects stays 0; no import into new core |

## Actual consumers and dependencies

- `packages/cli/package.json` owns the npm bin. Its published files are bin/dist,
  core-assets and docs, not the Rust source. `tsup.config.ts` currently builds
  only src/main.ts; A5 must include Machine and bundle runtime dependencies.
- `packages/cli/src/lib/native-doctor-contract.test.ts` consumes doctor-v1 schema
  and asserts native.binary.absent. Replace that obsolete fallback assertion at
  A5 with direct packed execution. No production TS consumer of the Rust library
  functions was found; their public Rust exports are characterized by tests.
- `packages/cli/src/lib/autopilot/durable-run.test.ts` consumes durable-run-v1 by
  file path. `commands/autopilot.ts` imports durable-run.ts; its state is not a
  general mission model. Keep ownership and reader, change schema location only.
- `.github/workflows/ci.yml` native-doctor job runs fmt, workspace tests, clippy
  and skill check on Linux/macOS/Windows. Replace this coverage, not its platform
  breadth. A0 runs the Rust corpus once; A5 exercises packed TS on those platforms.
- `conformance/machine/legacy-v3/{schema,manifest}.json` and CLI legacy-oracle
  reader describe 24 legacy harness scenarios (install/update/collision/receipt,
  runtime, skill, autopilot). They are not a Rust CLI test suite and are retained,
  not imported into the new Machine core.
- `packages/cli/README.md` documents VOID_MACHINE_BIN; update at cutover.
  `scripts/build-skill-references.mjs` names the product; refresh its description
  when native wording is retired, without changing historical ADRs.
- Node minimum remains the published `>=22.12`, not the older tsup node20 target.
  pnpm is pinned 10.34.5. Lockfile resolves CLI TypeScript 5.9.3, Vitest 4.1.9,
  tsup 8.5.1, tsx 4.22.4, YAML 2.9.0 and Zod 4.4.3. No TOML parser is currently
  locked. Select/read official versioned docs before A1 dependency/config edits.
- At initial inventory the worktree had no node_modules and no installed
  PHILOSOPHY copy. RUN has since installed dependencies without scripts. Active doctrine
  read from the main checkout; neither active installation nor shared Git config
  is changed. No lifecycle script was executed.
- DEV-807 foundation document absence is recorded in the supervised-design spec.
  No additional document was found by the scoped reference search; it does not
  block the explicit A0-A5 mandate or justify reconstructing that programme.

## Canonical contracts and deliberate corrections

Effect canonical text joins runId byte-length prefix, unitId byte-length prefix,
unsigned decimal revision, unsigned decimal ordinal, payload byte-length prefix,
and sorted length-prefixed declared files with newline separators. Hash prefix:
`effect-v1:sha256:`. Rust strings sort by UTF-8 bytes; JS localeCompare is unsuitable.
Use bigint for u64 (0..18446744073709551615); ordinal remains bounded u32. Any new
JSON boundary uses decimal strings for u64 rather than rounding past 2^53.

Skill identity concatenates `SKILL.md\n<byte-count>\n<raw-bytes>` and then
`harness.yaml\n<byte-count>\n<raw-bytes>`, with no extra separator. Current fixture
hashes calculated independently with Python hashlib and confirmed by Rust RUN:
manifest `7b4a1bae0563803313f4ce8e46e99faf6838a825279e099318d32d4695966322`;
package `0aee030b8ddb7b32ca4157a55dbee718755bafa9e92d2bd7455ca6e0869f8b27`.

Corrections to test rather than preserve:

1. Rust lock parsing accepts a substring instead of JSON (including schemaVersion
   10); use JSON parsing plus version/type validation. TOML parser must parse TOML,
   not split lines on equals; retain known-field/type checks.
2. YAML scanner does not validate schemaVersion/kind/value types and rejects legal
   block lists. Use maintained parsing plus a closed, read-only manifest schema;
   valid syntax never expands permissions. Duplicate keys remain forbidden.
3. Rust directory iteration flattens read failures, Git diff splits filenames on
   lines, and observe_commit_range supplies empty shared mutations. Preserve
   failures and use NUL-delimited paths plus actual composed before/after snapshots.
4. Repair strings mention machine config/lock commands absent from the CLI. Replace
   them with actionable manual repair text; machine-readable finding codes remain.
5. Explicit VOID_MACHINE_BIN is refused with migration guidance at A5. No recursive
   lookup of the launcher's own name, runtime download, or alternate engine choice.
6. Runtime paths are injected. CLI may resolve explicit environment defaults at its
   outer edge; absence of HOME/terminal/macOS must not prevent operation.

## Evidence observed on 2026-09-20

ORCH executed the six requested commands sequentially in cockpit RUN, in this
exclusive worktree. WORK-1 read the result manifest and stdout/stderr logs. The
request and raw logs live in `.void/machine/typescript-port/`; they are local
execution evidence, never build inputs. Commands are retained in
`a0-run-results.json` and `verify-request.md`.

| Operation | Exit / observed outcome | Wall seconds | Maximum RSS bytes |
| --- | --- | ---: | ---: |
| Harness doctor --no-remote | 0; shadow, self-host not-installed, receipt missing/invalid | 0.147 | 84,213,760 |
| pnpm install --frozen-lockfile --ignore-scripts | 0; dependencies prepared, no pnpm lock change | 1.564 | 341,491,712 |
| Rust workspace corpus, jobs=1 / test-threads=1 | 0; 28 tests passed, none failed/ignored | 6.522 | 173,211,648 |
| Rust skill check, retained fixture | 0; valid, exact package/manifest hashes above, no findings | 0.429 | 1,818,624 |
| Rust doctor --json | 0; healthy, linked worktree root and common Git directory correct, no findings | 0.194 | 4,390,912 |
| Public CLI contracts, maxWorkers=1 | 1; exactly three expected behavioral failures | 2.207 | 194,854,912 |

Walls come from the RUN result manifest; memory is macOS `time -l` maximum RSS.
This is not aggregate process-tree memory, a count of launched processes, a
portable performance comparison or evidence of TypeScript speed. Process count
was not measured. Rust corpus duration includes compilation. Harness doctor exit
0 does not establish full install health; no install repair was attempted.

Public RED is behavioral: doctor returned native.binary.absent instead of
 git.missing; skill exited 1 instead of 0; unknown command exited 1 instead of 2.
All three tests were discovered and executed; no missing import or fixture caused
failure. These contracts intentionally stay RED until the A5 public switch.
Focused candidate A1 tests must independently be observed RED before A1 code.
The launcher and Rust sources remain unchanged, so no baseline rerun is needed.

Baseline command:

```sh
env CARGO_BUILD_JOBS=1 cargo test --manifest-path native/void-machine/Cargo.toml --workspace -- --test-threads=1
```

Cargo generated an untracked `native/void-machine/Cargo.lock`; it is preserved as
baseline residue, not hand-edited or included in this documentation/test change.

### Local evidence digests

These SHA-256 values bind the exact logs read, without committing machine paths.

- `a0-run-results.json`: `69183471cfdc6459ec6f112dee5be87905cbbeeb140d2ce2d64356875f6cdeb8`.
- `rust-baseline.log`: `a9b7381d436f16ef2afe80b29815c4507ed2543a3ff5791990f4bd09e9386a86`.
- `rust-skill.json`: `f1ea680b45fd42edad3cab9147a4283f0876a4ebff95d5fcfabbc38d25c6af09`.
- `rust-doctor.json`: `2ab0fd61609f9136d07dbb88dcc25a248ee31918123e8ba9e96ec3ba00ebc158`.
- `public-contract-red.log`: `4a1c0d65800fa09f4ffaab6604b716ce7086c71605a74a8512d30a369185091f`.
- `public-contract-red.log.stderr`: `79597f9b8a89b850dd0507a3e8a32978cf76e41f47c17ceb3a962b597fdd71c0`.

## Historical A0 handoff (superseded by the disposition below)

ORCH relayed architecture review with no BLOCKER. WORK-1 owns the package ADR,
focused doctor contracts and implementation. No structural or
production code has been written. Lint/typecheck and full TS suite are not claimed;
this handoff records inventory and expected RED, not a green implementation.
No UI or production observability change exists in A0.

No Rust source is removed until completed parity evidence and independent review
allow A5. Rollback is an explicit prior package pin, with existing state and
journals preserved; active installation is outside this mandate.

## Architecture disposition (ORCH relay, 2026-09-20)

All five observations accepted within A; none requires a new scope or publication:

1. A1/A2 render present nullable fields at one JSON boundary using a justified
   allow-null marker. Compare parsed report values against closed schemas, not
   stdout bytes; byte equivalence applies to identities only.
2. A2 sorts directory entries before finding production. Multi-finding cases
   check code membership as well as deterministic repeat output; OS iteration
   order is not a Rust compatibility obligation.
3. Distribution remains one private package bundled into the existing voidharness
   CLI. TOML parsing warrants a maintained parser even for three known keys:
   syntax/duplicate-key correctness cannot be replaced by another local scanner.
   Measure pnpm check:size before cutover against the existing 2,000,000-byte
   tarball ceiling; do not remove a parser or raise that ceiling without evidence
   and an explicit disposition. No separately published Machine package.
4. The retained fixture identities are now observed in RUN Rust output, above.
5. Cache selection preserves XDG_CACHE_HOME, then HOME/.cache, then repository
   .void/machine/cache. Environment is explicit input to the application; only
   the CLI edge reads process.env. Windows USERPROFILE is not substituted.

No coordinator port/type/field or core layer is introduced. Runtime agents and
models remain external to A. TOML/lock corrections require real repository cases
showing degraded exit 1 before the A5 switch; no silent health compatibility claim.

## A1 pre-implementation evidence

ORCH RUN executed the new doctor corpus once against the already-built Rust
command: 19 tests, 12 passed and 7 expected behavioral failures, exit 1. Five
malformed lock/TOML cases returned success; invalid UTF-8 was classified unreadable
rather than malformed; the 64 KiB limit was absent. Retained nullable output,
cache precedence, linked worktree paths, no-write checks and usage passed.
No baseline replay or import/discovery failure is counted as evidence.

- `doctor-contract-red.log` SHA-256: `1ee163f5fefb22653ab3b10ae81b729294343fb2245b7d915d5ff83cd1b616bf`.
- `doctor-contract-red.log.stderr` SHA-256: `017d9f80dc518d7e3d41eaa0b4b651f0acae3a6328b2fc6f2bc27db5d2ab2345`.


## A1 startup failure disposition

RUN build/typecheck succeeded after the discriminant correction. Candidate tests
then failed 19/19 before doctor behavior, and real-worktree dogfood exited 1 with
empty stdout. These are startup failures, not additional business RED evidence.
Root cause: Zod 4.4.3 `$ZodRecord` calls `isPlainObject` before validating values
(src/v4/core/schemas.ts, util.ts); Node process.env is a special object and fails
that check. The existing process-level healthy-repository test reproduces it.
The CLI now snapshots enumerable environment properties into a plain object and
applies the unchanged record schema there. No validation is relaxed and no
business adapter reads ambient process.env. GREEN remains pending.

Lint exited 0 with two informational useLiteralKeys diagnostics, not warnings.
Disposition: retain bracket access to environment keys because the strict baseline
sets noPropertyAccessFromIndexSignature. No rule is disabled and no unrelated
style change is introduced. Typecheck/test/dogfood evidence stays individually
classified; the RUN collection wrapper's exit is not a feature verdict.


## A1 candidate GREEN (ORCH RUN, 2026-09-20)

Build a1-build-3, typecheck a1-typecheck-2 and doctor-contract-green-2 all exited 0;
the doctor corpus passed 19/19. Real-worktree a1-dogfood-2 exited 0 and emitted
schemaVersion 1, health healthy, findings [], the exact linked-worktree repository
and shared Git directory. Stderr was empty for all four checks. WORK-1 read the
result manifest and report. This proves A1 doctor, not public A5 cutover or A2-A4.
The earlier startup/build failures remain in their original logs.

- `a1-green-results-3.json` SHA-256: `a542c714b13214095e4ada3ec3a0e1ee1094ff392c07949de2b1c42369cc6bc9`.
- `doctor-contract-green-2.log` SHA-256: `b13ba0e9e29cce0bd7ec359160d5b77063dcf83c8095eba703ec4682ade5d61f`.
- `a1-dogfood-2.json` SHA-256: `2ab0fd61609f9136d07dbb88dcc25a248ee31918123e8ba9e96ec3ba00ebc158`.


## Disposition du mandat feuille blanche

Consigne prioritaire transmise par ORCH le 20 septembre : le besoin utilisateur
prime sur la reproduction du Rust et sur l'ordre A complet avant socle de mission.
Cette table dispose de la matrice historique ; elle ne prétend pas supprimer les
sources ni annuler les preuves acquises. « Aucun consommateur » signifie aucun
appel de production trouvé dans le périmètre inspecté, pas une preuve d'absence
universelle d'utilisateurs externes. Une documentation de commande identifie une
surface à migrer ; elle ne démontre pas une fréquence d'usage ni une valeur métier.

| Capacité héritée | Besoin réel et consommateur identifié | Propriétaire | Disposition et raison |
| --- | --- | --- | --- |
| doctor, découverte Git/linked worktree | Diagnostiquer un projet de développement ; bin npm, README, schéma et tests consomment la surface, usage humain non mesuré | Adaptateur Git et diagnostic développement optionnel | **Conserver, corriger la portée** : A1 est utile comme diagnostic isolé, jamais préalable universel ou certification d'installation/livraison. Pas de Git obligatoire pour M1 |
| Rapports doctor/skill v1, exits et champs nullables | Interface CLI documentée et deux tests directs de schémas | Bord CLI/compatibilité | **Conserver pour les consommateurs existants** jusqu'à migration explicite ; nouveau parcours libre d'avoir son propre contrat. Pas d'égalité octet des rapports |
| machine.toml et machine.lock.json | Aucun producteur/lecteur métier trouvé hors doctor ; tests locaux uniquement | Ancien diagnostic, pas runtime neuf | **Différer leur admission au nouveau socle** ; ne pas fabriquer un format de stockage parce qu'il existe. Parsing sûr acquis A1 conservé tant que doctor lit ces fichiers |
| Champs config state_dir/cache_dir validés mais ignorés | Aucun effet utile démontré ; incohérence visible dans Rust et A1 | Diagnostic/application | **Corriger ou supprimer cette promesse** dans une évolution explicite de surface, jamais figer ce comportement dans le runtime. Aucun changement de code dans ce delta |
| Cache XDG/HOME/repo et chemins calculés | Sortie de doctor consommée comme diagnostic, pas stockage Machine utilisé | Adaptateur de chemins ; environnement injecté | **Conserver en compatibilité doctor**, **différer** comme politique globale. M1 reçoit ses chemins ; absence de HOME admissible |
| skill check, paquet exact SKILL.md/harness.yaml | CLI documenté, fixture/CI ; pas d'exécution ou d'admission de mission consommatrice trouvée | Éventuel outil développement, hors core | **Différer A2** : définir son service concret avant codage. Deux seuls fichiers et schéma de skills ne deviennent pas un format universel d'agent |
| Identité de paquet / manifestDigest | CLI expose les digests ; aucune référence persistée ou cache métier identifié | Bord de compatibilité de ce paquet | **Conserver si cette commande est maintenue**, sinon migrer explicitement ; ne pas imposer ce cadrage à toute unité ou agent |
| Canonical effect-v1, u64, état claimed/applied/ambiguous/fence | Exports Rust appelés par tests, aucun flux produit trouvé | Futur mécanisme d'effet, spécialisation Git à l'extérieur | **Différer A3** : reprendre le principe « ambigu ne se rejoue pas » lorsqu'un effet réel existe ; pas de machine d'états ni bigint obligatoires dans M1 pour satisfaire Rust |
| Observation commits/empreinte/mutations partagées | Besoin réel pour une livraison Git, absent de la première mission non-Git ; pas d'appel produit Rust trouvé | Adaptateur Git + verticale développement | **Différer** jusqu'à ce parcours ; lecture bornée et chemins NUL restent des apprentissages, pas du code à porter maintenant |
| Rapprochement cluster/ticket/rapport, lane/collision/provenance | Exports Rust testés, pas d'appel de production du nouveau produit | Verticale développement, runtime pour simple collecte | **Différer A4** ; M1 collecte deux résultats attendus sans héritage tickets/lanes/review |
| ReconciliationLedger et MergeLedger en mémoire | Unicité démontrée dans un processus seulement ; aucun besoin produit actuel identifié | Éventuel runtime/stockage lors d'effets réels | **Supprimer de la cible immédiate** ; conserver sources/preuves historiques. Ne jamais présenter ces sets comme reprise durable |
| Merge policy, SHA exact, protections, chemins sensibles, argv gh | Nécessaire à une éventuelle fusion autorisée, aucune fusion dans M1 ; exports Rust testés seulement | Développement pour politique, GitHub pour effet | **Différer** ; ne pas reconduire listes de refus, revue obligatoire et dépendance CI dans le socle non-Git |
| Durable-run TS / SQLite / schema v1 | Consommateur de production identifié : commands/autopilot.ts ; données legacy possibles | CLI autopilot existant | **Conserver chez son propriétaire** ; pas d'import automatique dans Machine, aucune réécriture de données. Réutilisation à décider sur besoin de reprise réel |
| Legacy oracle v3 | Lecteur et conformance du harnais existants | Conformance legacy | **Conserver** hors nouveau moteur ; ses 24 scénarios ne conditionnent pas une mission sans installation du harnais |
| Lanceur npm et VOID_MACHINE_BIN | Commande bin publiée et README ; surface réellement distribuée | Composition/packaging CLI | **Corriger au moment de la bascule**, pas avant M1 par principe ; traiter compatibilité explicite et éviter lookup récursif. Aucun second paquet publié |
| CI Rust, schemas et retrait des sources | Preuves du code livré, deux lecteurs de schémas directs | Distribution/compatibilité | **Différer A5 systématique** ; retirer seulement ce qui est remplacé ou explicitement abandonné, après disposition des consommateurs. Ne pas supprimer une preuve pour verdir |
| SHA/JSON/parser artisanal | Aucun intérêt à reproduire les erreurs ; primitives standard disponibles | Adaptateurs de formats/identité | **Supprimer de la nouvelle implémentation** ; code historique conservé. Un parseur maintenu n'est ajouté que si le format répond lui-même à un besoin |
| Contrôleur legacy, gates/review rounds/panels | Aucun besoin de les importer pour un relais simple | Hors du socle nouveau ; politiques spécifiques si demandées | **Supprimer de la cible**, sans toucher au harnais installé. Pas de coordinateur port/type/champ dans le core |

### A1 et tests : limites explicites

A1 a été réalisé conformément au plan antérieur, mais sa priorité était héritée,
pas justifiée par un parcours métier observé. Le report healthy prouve uniquement
l'inspection demandée ; il ne certifie pas Machine, ses agents ou sa livraison.
Les tests de chemins nullable/XDG et report v1 sont des protections de surface,
pas des invariants universels. L'égalité aux textes/ordre OS et les approximations
Rust sont écartées. Le seuil 64 KiB, la profondeur TOML 16 et le refus d'encodage
sont des limites locales documentées, pas de nouveaux gates de mission.

Les brouillons A2 non exécutés anticipaient des choix sans consommateur établi :
exactement deux fichiers, kind action/standard, capabilities read, permissions none,
version de manifeste et codes détaillés. Leur présence dans un test n'approuve pas
ces choix. Ils restent non committés comme brouillons ; aucune demande RUN A2 n'est
active. Les vecteurs multioctets/CRLF sont calculés, seule la fixture originale a
été observée en Rust. Les trois tests publics A0 ne constituent plus à eux seuls
un critère universel de fin ; leur disposition suivra la migration de la surface.

### Prochaine décision bornée

Proposer M1 : une mission locale sans Git, extraction puis synthèse de deux
sources fournies, deux configurations d'agent à la composition et un livrable
structuré validé. Le relais distribue/collecte ; il n'accorde aucune autorité.
Deux configurations de modèles distinctes peuvent être représentées aux adaptateurs
et testées avec des agents simulés. Cela ne démontre pas l'exécution réelle de deux
modèles. Protéger résultat manquant/invalide et exit 0 trompeur, avec entrées/chemins
explicites. Pas de plateforme générale, de paiements, Docker ou publication.

ORCH dispose de la séquence révisée et organise seulement la lecture ciblée utile.
WORK-1 reste l'auteur des futurs contrats et du code après ce relais. Aucun choix
de stockage ou API générale n'est décidé ici. Si une décision acceptée doit être
changée, créer une nouvelle ADR ; aucune ADR acceptée n'est éditée par ce delta.
