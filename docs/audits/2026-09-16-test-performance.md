# Audit du coût des tests du harnais

Mesure locale du 16 septembre 2026, macOS arm64, Node 24.15.0, Vitest 4.1.9.
Branche `fix/typescript-native-syntax`, base de session `3db74755`, corrections
non commitées pendant la mesure. Ce relevé décrit une campagne de diagnostic,
pas une certification d'un commit immuable.

## Résultat principal

Périmètre temporel : sept cas de régression CLI ont été ajoutés après cette
campagne pour le transport des artefacts en CI. Ils passent dans la vérification
ciblée de 115 tests ; leurs coûts ne sont pas attribués rétroactivement au relevé.

La campagne prend **299,4 secondes**, soit environ **5 minutes**. La tranche
des sous-processus représente **66,5 %** du temps. Le pic échantillonné de RSS
cumulée de l'arbre de tests atteint **889 Mio**, avec jusqu'à **19 processus**.
Ces mesures ne démontrent pas à elles seules une saturation globale du Mac.

Les **485 fichiers du catalogue sont tous représentés**, soit **5 342 tests**.
Un test de régression de sécurité ajouté pendant le travail a échoué avant sa
correction : la santé d'un worker incompatible n'empêchait pas `wired=true`.
Sa correction a ensuite passé les 24 tests ciblés de santé et de distribution.
Le résultat rouge initial reste dans les données ; il n'est pas réécrit en vert.

La vérification finale `pnpm test` passe ensuite **5 344 tests dans 485 fichiers**
en **220 secondes**, après correction et ajout de deux cas JavaScript/JSX. Elle
n'utilise pas le profileur et la charge ambiante diffère : l'écart avec 299,4 s
n'est pas une preuve de gain apporté par le correctif. Une tentative précédente
a été interrompue avec disparition du terminal RUN, sans résultat final ni
processus Vitest restant ; son journal est conservé séparément.

| Tranche | Fichiers | Tests | Temps mural | Pic RSS cumulé | Processus max. |
|---|---:|---:|---:|---:|---:|
| Calcul | 250 | 2 414 | 38,0 s | 829 Mio | 8 |
| Fichiers | 147 | 1 786 | 53,0 s | 839 Mio | 8 |
| Sous-processus | 86 | 1 112 | 199,2 s | 889 Mio | 19 |
| Réseau local | 2 | 30 | 9,2 s | 486 Mio | 6 |

Le relevé du pic de processus contient notamment 14 processus Node et 2
`semgrep-core`. Un plafond de workers Vitest ne borne donc pas tous les processus
descendants. Le catalogue permet aussi deux workers au projet contract/subprocess.

## Les suites les plus longues

Les durées ci-dessous couvrent les scénarios du fichier, d'après le rapport
Vitest. Elles ne constituent pas des mesures CPU exclusives par fichier.

| Fichier | Durée | Lecture du coût |
|---|---:|---|
| `packages/core/enforce/ci-enforce.test.ts` | 31,22 s | Dépôts Git et vrais lancements du driver CI |
| `apps/eval-harness/src/autonomous-value/runtime-pilot.test.ts` | 24,04 s | Matrice de 27 espaces Git et reprises |
| `test/workflows/promotion-integration.test.ts` | 17,35 s | Historiques Git reconstruits pour les variantes |
| `packages/cli/src/lib/security/owasp-fixture.test.ts` | 15,51 s | Deux scans Semgrep sur la même fixture |
| `packages/hook-runner/src/cli.test.ts` | 12,10 s | Nombreux démarrages réels de Node |
| `test/cli/ignore-block-follows-the-transaction.test.ts` | 8,73 s | Transactions réelles d'installation |
| `test/cli/force-preserves-co-owned.test.ts` | 7,41 s | Installation et smoke hooks indirects |

Le [classement complet des 485 fichiers](2026-09-16-test-costs.csv) contient leur
classe de ressource, niveau de preuve, durée, nombre de tests et échecs observés.
Les mesures détaillées et le CSV des cas individuels sont conservés localement
dans `.void/machine/test-audit-2026-09-16/`. Les 30 cas réseau disposent du journal
Vitest ; cette tranche utilise son lanceur existant et n'émet pas de JSON par cas.

## Optimisations à traiter dans cet ordre

1. **Corriger les classes de ressources indirectes.**
   `force-preserves-co-owned.test.ts` appelle `init`, puis `adapter.inspect`, puis
   `hook-smoke.ts`, qui lance Node. Le classement filesystem ne voit que les
   imports directs du test. Marquer ces cas subprocess permet de maîtriser leur
   concurrence. Gain de durée non garanti ; baisse des pointes à mesurer.

2. **Fusionner les deux scans Semgrep identiques.**
   `owasp-fixture.test.ts:79` et `:94` exécutent les mêmes arguments. Un scénario
   peut capturer l'empreinte avant, lancer le vrai scan, vérifier les deux
   vulnérabilités puis l'empreinte après. Toutes les assertions restent présentes.
   Un lancement est supprimable ; le gain exact reste à mesurer après changement.

3. **Réutiliser une baseline Git immuable, copiée par scénario.**
   `promotion-integration.test.ts:12` reconstruit la topologie appelée à `:77`;
   `ci-enforce.test.ts:54` recrée aussi le dépôt avant chaque test. Préparer une
   baseline par topologie, puis une copie indépendante pour chaque scénario,
   conserverait les vrais commits, diffs et scripts. Ne partager aucun dépôt
   mutable, index, référence ou résultat d'audit entre tests.

4. **Réduire les lancements CLI qui dupliquent une preuve pure.**
   `cli.test.ts:45` lance Node à chaque `enforce`; son build est déjà unique dans
   `beforeAll`. Les variantes de décision/rendu peuvent être testées sur les
   fonctions réelles, en gardant les preuves de stdin, codes de sortie, stderr,
   JSON invalide, concurrence et continuité dans les tests de processus.

5. **Profiler les imports de la tranche calcul avant de toucher à l'isolation.**
   Vitest rapporte 7,44 s de tests, 33,90 s d'import et 14,45 s de transformation,
   pour 34,41 s murales internes. Ces temps cumulés se chevauchent : ils ne se
   soustraient pas du temps mural. Le coût hors assertions mérite un profil CPU
   ciblé. Cela ne justifie pas de désactiver globalement l'isolation des tests.

La matrice de 27 espaces Git du runtime pilot protège la reprise réelle. Sa
durée ne justifie pas de supprimer des cas. Les propositions ci-dessus doivent
chacune conserver leurs assertions et produire un avant/après mesuré.

## Coût de vérification hors tests

La boucle complète inclut aussi des builds : `derive:check` reconstruit graphe,
CLI, hooks et studio ; le hook de commit relance `derive` si le cœur change ;
`pnpm pack` relance `build:cli` via `prepack`. Ces étapes ne sont pas comprises
dans les cinq minutes ci-dessus. Le dernier `derive:check` isolé a pris 20 s.
L'orchestration doit éviter de demander inutilement les mêmes reconstructions,
tout en conservant les contrôles de fraîcheur et l'identité de l'artefact livré.
Ce relevé ne modifie ni ne désactive ces contrôles.

## Méthode et limites

- Les quatre commandes `pnpm test:cpu`, `test:filesystem`, `test:subprocess` et
  `test:network` ont tourné successivement dans RUN, avec leurs limites existantes.
- Les trois premières ajoutent les reporters officiel et JSON de Vitest. Un
  observateur échantillonne les PID descendants, leur RSS et leur CPU chaque seconde.
- Le RSS cumulé peut compter plusieurs fois des pages partagées et manquer des
  processus de moins d'une seconde. Il ne mesure pas la pression mémoire globale.
  Le CPU de `ps` est une estimation lissée, pas un profil exclusif par assertion.
- `/usr/bin/time -l` conserve aussi les coûts CPU et mémoire dans les journaux.
  Le coût du profilage n'a pas été soustrait. Une seule campagne ne permet pas de
  conclure à un p95 ni de prédire toutes les charges du Mac.
- La première collecte CPU a échoué sur une virgule décimale macOS. Ses 2 414
  tests ont passé, mais elle n'a pas de profil de ressources exploitable. Ce
  résultat est conservé séparément ; la collecte corrigée fournit cette page.
- La mesure porte sur les tests du harnais, pas sur toutes les applications du
  Mac, les campagnes LLM externes ou les tests du projet Cortex.

Sources : [reporters Vitest 4.1.9](https://github.com/vitest-dev/vitest/blob/v4.1.9/docs/guide/reporters.md)
et [profilage officiel](https://github.com/vitest-dev/vitest/blob/v4.1.9/docs/guide/profiling-test-performance.md).
