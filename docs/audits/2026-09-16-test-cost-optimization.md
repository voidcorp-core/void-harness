# DEV-844 : optimisation du coût des tests, preuves en cours

État au 19 septembre 2026 : prêt pour revue post-implémentation. La campagne
ciblée A/B/B/A observe une baisse moyenne de CPU user + sys de 19,9 % sur les
cinq surfaces mesurées, sans accélération murale démontrée. Aucune extrapolation
à la suite complète. La campagne fonctionnelle initiale reste rouge (83 passes,
1 échec de fixture temporelle inchangée, correction différée par ORCH).
La disposition produit/QA globale et la décision finale de rétention restent ouvertes.

Références : [audit initial](2026-09-16-test-performance.md), spécification
`docs/specs/2026-09-16-test-cost-optimization.md` dans le checkout principal.
La spécification et le plan global ne sont pas encore versionnés dans cette
worktree. Le ticket de reprise et la clarification produit restent dans
`.void/machine/` ; ils ne sont pas des preuves de livraison.

## Modification et inventaire des preuves

| Invariant | Propriétaire survivant | Cas avant / après | Observation RUN |
| --- | --- | --- | --- |
| Détection SQL et shell par Semgrep réel, fixture inchangée | owasp-fixture.test.ts : scan fusionné et empreinte avant/après | 4 / 3 | 3 passes, aucun skip ; deux cas statiques et un scan réel |
| Driver CI : annotations, noms non ASCII, contenu protégé, autorisation et refus des bases invalides | ci-enforce.test.ts : mêmes scénarios et vrai driver, copie complète par scénario | 24 / 24 | 24 passes |
| Promotion : autorité imbriquée, commits directs, pagination, lots et erreurs API | promotion-integration.test.ts : mêmes assertions, deux topologies copiées indépendamment | 7 / 7 | 7 passes |
| Données co-possédées conservées malgré force | force-preserves-co-owned.test.ts : marqueur subprocess | 4 / 4 | 4 passes |
| Parité installation/add/remove | add-remove-parity.test.ts : marqueur subprocess | 5 / 5 | 5 passes |
| Classe subprocess, tier system, inclusion et budget d'un worker | test-catalog.test.ts : deux cas supplémentaires | 4 / 6 | RED 2 échecs attendus, puis GREEN 6 passes |
| stdin, exits, stderr, malformed input, concurrence, lifecycle et reprise | hook-runner/src/cli.test.ts inchangé | 35 / 35 | 34 passes, 1 échec de fixture datée |
| Matrice runtime-pilot de 27 dépôts Git | runtime-pilot.test.ts inchangé | inchangé | Pas rejouée dans cette campagne ciblée |

Le périmètre ciblé passe de 83 à 84 cas : un cas Semgrep fusionné et deux cas
catalogue ajoutés. La baisse d'un cas scanner est explicite ; ses assertions de
détection et de non-mutation restent ensemble. Les six fichiers modifiés passent
leurs 49 cas ; le septième fichier sélectionné, hook CLI inchangé, porte l'échec.

Réductions déterministes proposées : un appel scan Semgrep au lieu de deux ;
une construction du dépôt enforcement au lieu de 24 ; deux constructions de
l'historique promotion au lieu de sept. Chaque scénario garde une copie complète
indépendante, incluant .git, index, refs et objets. Les scénarios promotion
écrivent leurs fixtures GraphQL et compteurs seulement dans leur copie. Nettoyage
afterEach des copies et afterAll des références, y compris après un échec de setup.
Le reclassement de deux fichiers déplace leur coût vers subprocess, sans le supprimer.

Les copies utilisent cpSync avec recursive et verbatimSymlinks, selon la
[documentation Node 24.15.0](https://nodejs.org/download/release/v24.15.0/docs/api/fs.html#fscpsyncsrc-dest-options).
Pas de clone partagé, hardlinks, cache de résultat, augmentation de timeout,
nouveau skip, nouvelle dépendance ou modification de workflow CI.

## Campagnes observées

ORCH a exécuté les vérifications dans RUN. Aucun test n'a été lancé par WORK-2.
Cwd ciblé : `/Users/folpe/.local/share/git-worktrees/void-harness/work/seven-20260916/DEV-844`.

- RED catalogue : `/private/tmp/dev844-catalog-red.log`, exit 1, quatre passes
  et deux échecs attendus filesystem reçu au lieu de subprocess, avant marqueurs.
  SHA-256 : `c28d6cd50e72366912c8a4e835130f48836de4c561e28e86cb123ea76e230002`.
- Ciblé après marqueurs : `/private/tmp/dev844-targeted-green.log`, exit 1,
  six fichiers verts, un rouge, 83 passes et un échec. Le nom du log ne change
  pas son résultat rouge. Vitest rapporte 35,17 s internes ; ce n'est ni le
  temps mural du profileur ni une preuve de gain.
  SHA-256 : `97016c30436d7fdf5a964b2b27c89b93628538fbf43c7036253c875c5241d241`.
  Ce journal contient un NUL de fixture ; le décoder en remplaçant ce seul octet
  pour lecture, sans réécrire l'original ni imprimer son contenu binaire brut.

Commandes demandées à RUN : `pnpm exec vitest run` avec `--maxWorkers=1`, d'abord
`test/support/test-catalog.test.ts`, puis les six fichiers ciblés OWASP,
enforcement, promotion, force, parity et hook CLI. Le RUN observé regroupe le
catalogue et ces six fichiers. Le journal atteste Vitest 4.1.9 ; il ne contient
pas à lui seul une capture complète de la commande shell et de ses variables.

## Diagnostic de l'échec lifecycle, sans correction hors périmètre

Le test `names a skill the project recorded but can no longer resolve, from the
session after` échoue à `packages/hook-runner/src/cli.test.ts:250` : la seconde
bannière ne contient pas ticket-writer. Sa fixture projectWith fixe le timestamp
à `2026-08-19T10:00:00.000Z` (ligne 232).

`invocation.ts` définit LIVE_WINDOW_MS à 30 jours (ligne 108). Le filtre
recordedSkillNames exclut un événement plus ancien que nowMs moins cette fenêtre
(lignes 141-148). refreshInvocationVerdict transmet Date.now() (ligne 351).
La fixture expire après le 18 septembre 2026 à 10:00 UTC. Elle est encore dans
la fenêtre lors de la baseline du 16 septembre, mais hors fenêtre lors du RUN
du 19 septembre. Le recompute écrit donc un verdict sans alerte, que lit la
seconde bannière. Ceci explique directement l'observation sans supposer une
course asynchrone ni une interaction avec les copies Git.

Les trois sources cli.test.ts, cli.ts et invocation.ts sont identiques octet
pour octet à la base `1efeedf1f018de907fa008b18c96fd0727d2ebfc`, vérification en
lecture seule avec git show. Aucun chemin modifié par DEV-844 ne change ce
filtrage ou la fixture. Adjudication : défaut préexistant de fixture dépendante
de la date, révélé par le passage du temps, hors périmètre actuel. Il n'a pas
été reproduit par une relance sur la base : le diagnostic s'appuie sur l'échec
observé et le chemin de code inchangé. La campagne reste rouge, sans waiver.
ORCH doit disposer de ce blocage ; aucune modification du test n'a été faite.

## Baseline acquise et comparabilité

Preuves conservées dans le checkout principal :
`.void/machine/seven-20260916/dev844-before` (run.json, quatre résumés ressources,
logs et trois JSON Vitest). Quatre exits 0, 485 fichiers, 5353 tests.

| Classe | Wall profileur (s) | CPU user + sys (s) | Pic RSS agrégé échantillonné (MiB) | Pic processus échantillonné |
| --- | ---: | ---: | ---: | ---: |
| cpu | 34,373 | 85,87 | 790,95 | 9 |
| filesystem | 52,983 | 86,29 | 733,84 | 8 |
| subprocess | 161,850 | 232,86 | 774,09 | 16 |
| network | 4,247 | 3,35 | 571,06 | 6 |
| Total séquentiel | 253,454 | 408,37 | non additif | non additif |

HEAD consigné : `1efeedf1f018de907fa008b18c96fd0727d2ebfc`, dirty: true, sans
empreinte complète ni détail du dirty dans les preuves. Node v24.15.0, Vitest
4.1.9, darwin ; versions pnpm, Git et Semgrep non consignées dans ce dossier.
Commandes pnpm test:cpu/filesystem/subprocess avec reporters default et json,
maxWorkers 4/2/1 ; test:network utilise node scripts/test-network.mjs.

Cwd historique : `/Users/folpe/Developer/void-harness/.void/autopilot/seven-20260916/worktrees/DEV-844`.
La migration vers le cwd actuel change le contexte. Charge ambiante non mesurée,
une observation par classe, aucune variance établie. RSS descendant échantillonné
n'est pas pression globale du Mac ni mémoire exclusive. Aucune baseline ciblée
six fichiers distincte retrouvée ; leur présence dans les campagnes par classe
ne la remplace pas. Ne pas comparer cette campagne à la vérification ciblée pour
annoncer un gain. Ne pas inventer rétroactivement une baseline comparable.

## Règle de rétention et travaux restants

Qualité constante préalable. Juger le coût CPU agrégé et le parallélisme pour
les ressources, et séparément le temps mural total pour la vitesse. RSS reste
complémentaire. Retenir un gain ciblé seulement sans régression globale matérielle
reproductible, sur commandes/settings/arbres comparables ; sinon rejeter
l'optimisation ou proposer à ORCH une mesure qui résout le bruit. Aucun seuil
arbitraire, gain présumé ou compensation entre classes masquée.

À ce stade de la première campagne restaient mesures, types/lint et revue.
Les résultats complémentaires ci-dessous actualisent ce statut. Le prochain
blocage est la disposition produit/QA globale, pas une nouvelle campagne
arbitraire. Ce rapport ne constitue pas une certification finale.

## Attribution du diagnostic TypeScript ciblé

RUN supplémentaire : `/private/tmp/dev844-types.log`, exit 2, 27 diagnostics.
Trois sont introduits dans le nouveau cas catalogue, lignes 70, 72 et 73 : les
accès à entry.test et project.test omettent le caractère optionnel du type Vitest.
Correction bornée : chaînage optionnel sur test. Les assertions continuent à
échouer si le projet, include ou maxWorkers est absent ; aucune assertion ni
strictness affaiblie. Cette correction attend sa vérification dans RUN.

Les 24 autres diagnostics viennent du code préexistant sous la commande élargie :
22 accès optionnels dans le bloc catalogue existant (lignes 79 à 109), un toSorted
hors lib ES2022 (ligne 81) et modes absent du type readConfig dans force (ligne 67).
Le bloc catalogue existant est identique à HEAD ; force ne diffère que par son
marqueur de première ligne. Ces diagnostics n'ont pas été nettoyés.

Il n'existe pas de tsconfig racine : pnpm typecheck délègue aux workspaces.
Le tsconfig CLI inclut src/**/*, avec rootDir src et target ES2022 ; il couvre
OWASP, mais pas test/ ni packages/core/enforce/. La commande tsc explicite sur les
six fichiers a étendu ce périmètre avec les options CLI ; son rouge n'est pas
présenté comme celui du typecheck configuré. Le lot suivant sépare le contrôle
CLI applicable, ce diagnostic supplémentaire strict et les deux lints, exécutés
indépendamment. Aucun nouveau résultat n'est présumé.

## Retour RUN types/lint après correction bornée

`.void/machine/dev844-types-lint-correction-20260919/results.json` atteste :
types CLI configurés exit 0, lint des cinq chemins inclus exit 0, fichiers
inchangés pendant les contrôles. Ces acquis ne sont pas relancés.

Le diagnostic supplémentaire strict reste exit 2 avec exactement les 24 erreurs
préexistantes attribuées ci-dessus ; les trois diagnostics introduits ont disparu.
Aucun nettoyage hors périmètre n'est appliqué.

Le lint enforcement par stdin sort 1 avec uniquement « The contents aren't fixed ».
Sa sortie commence par les octets exacts du fichier, puis ce message générique,
sans diagnostic de règle ni différence de contenu. C'est un défaut du protocole
stdin utilisé, pas une régression source démontrée. La documentation CLI Biome
montre stdin avec --write : le contenu traité est émis sur stdout. Un contrôle
borné préparé pour RUN applique ce mode uniquement au buffer stdin, exige stdout
identique à l'entrée et vérifie le fichier source inchangé. Ce contrôle reste à
exécuter ; le rouge original n'est pas effacé.

Référence : https://biomejs.dev/reference/cli/#--stdin-file-pathpath-1

## Campagne ciblée comparable A/B/B/A, terminée

ORCH a exécuté la campagne seule dans RUN et communiqué exit 0. run.json
atteste quatre mesures valides, chaque commande exit 0, toutes assertions passées,
scan réel exécuté sans skip et entrées inchangées. ORCH a vérifié les 47 fichiers
de preuves et leurs empreintes. La lecture des ressources et rapports Vitest a
été effectuée par WORK-2 ; aucun test supplémentaire n'a été lancé.

Preuves scellées :
`/Users/folpe/.local/share/void-harness/measurements/dev844-targeted-abba-20260919/evidence`.
Le script exact exécuté y est conservé sous campaign-script.py. Le nettoyage
explicite des copies appartient à ORCH, après sauvegarde de son résumé ; il
conserve le dossier evidence. Aucun nettoyage par WORK-2 n'est revendiqué.

### Identité et protocole

A utilise les octets des six tests possédés à la base
`1efeedf1f018de907fa008b18c96fd0727d2ebfc`. B utilise leurs octets modifiés capturés.
Tous les autres fichiers, dépendances et artefacts construits proviennent du
même snapshot. L'identité repose sur les manifestes, pas sur le seul HEAD dirty.
Ce A est une variante contrôlée de l'expérience, pas une reconstruction de la
campagne historique du 16 septembre ni une certification complète du commit base.

Même cwd physique pour les quatre passages :
`/Users/folpe/.local/share/void-harness/measurements/dev844-targeted-abba-20260919/active`.
Ordre A/B puis B/A, aucune installation ni worktree supplémentaire. Versions
identiques aux quatre passages : Node v24.15.0, pnpm 10.34.5, Vitest 4.1.9,
Git 2.50.1 (Apple Git-155), Semgrep 1.176.0 ; Darwin arm64, 8 CPU logiques.

Commande commune : Node 24 explicite, node_modules/vitest/vitest.mjs run,
les cinq fichiers OWASP, enforcement, promotion, force et add/remove,
--maxWorkers=1 --reporter=default --reporter=json. Seul --outputFile varie.
Les commandes complètes figurent dans run.json. Le catalogue ajouté influence
le classement, mais n'est pas lui-même sélectionné pour la mesure ; hook CLI
et les suites inchangées ne sont pas relancés.

Les 634 liens pnpm observés avant la campagne étaient relatifs, internes et
résolus ; les copies préservent ce graphe. Les seules écritures exclues de
l'identité source sont node_modules/.vite et node_modules/.vite-temp, inventoriées
séparément. Chaque passage commence sans ces caches : cela borne la conclusion
à ce protocole. Les empreintes d'entrée avant/après sont égales à chaque passage.

SHA-256 des artefacts de référence :

- campaign-script.py : `596902438d873a2fad4f0ec2df9b1535810ebb0318987e0593fea5de4de4dbc3`
- variant-A-inputs.json : `6958c24ea7a3c360e475622efa93ff65c695505f5308cdab8ac19ef224cfe62b`
- variant-B-inputs.json : `bac8b69af5c861d85a417a2cd2a5f17c02319e9ee3b314224b45d8eb0200e9fd`
- run.json : `ae863508e32b73efbc1200d85cab69a564d17f2c3609643a6cbfe36a1e6672e9`
- SHA256SUMS.json : `fffb6358104dae889040ace6549bf7b8184a0d9b51882bf1565ff924e2540898`

### Ressources observées

| Passage | CPU user (s) | CPU sys (s) | CPU total (s) | Wall observateur (s) | Pic RSS échantillonné (MiB) | Processus simultanés max. échantillonnés | Échantillons | PID distincts observés |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 | 32,98 | 21,55 | 54,53 | 54,382 | 492,25 | 10 | 45 | 108 |
| B1 | 27,69 | 17,88 | 45,57 | 82,837 | 429,23 | 10 | 53 | 104 |
| B2 | 25,29 | 16,33 | 41,62 | 38,698 | 541,97 | 11 | 33 | 78 |
| A2 | 32,50 | 21,81 | 54,31 | 44,629 | 513,05 | 9 | 37 | 107 |

CPU moyen A : 54,420 s ; B : 43,595 s. Différence : 10,825 s, soit
**19,9 % de baisse moyenne CPU ciblée**. Les deux B sont sous les deux A dans
cette campagne. Deux observations par variante ne constituent pas un intervalle
de confiance ou une garantie sur d'autres machines ou charges.

Wall moyen A : 49,506 s ; B : 60,768 s. B1 est plus lent que A1, B2 plus rapide
que A2 : **aucune accélération murale démontrée**. La durée plus élevée en moyenne
reste visible, sans la transformer en gain CPU équivalent ni l'écarter. La charge
ambiante n'est pas contrôlée : loadavg 1 minute échantillonné varie de 14,65 à
18,57 pour A1, 15,36 à 34,38 pour B1, 18,42 à 25,04 pour B2, 16,08 à 18,79 pour A2.
Ces charges élevées sont un facteur de confusion, pas la preuve exclusive de la
cause de B1. Les pics processus et RSS sont également conflictuels : aucune
baisse démontrée du parallélisme maximal ou de la mémoire globale.

CPU vient de /usr/bin/time -l ; wall est la durée observée du processus complet.
La cadence demandée est une seconde mais l'échantillonnage subit le coût de ps
et l'ordonnancement ; processus brefs et pics peuvent échapper à la collecte.
Les PID distincts observés ne sont pas le nombre exhaustif de processus créés.
RSS cumulé peut compter des pages partagées et ne mesure pas la pression du Mac.
Les résultats ne ventilent pas le CPU par fichier ; les temps Vitest qui se
chevauchent ne sont pas additionnés pour fabriquer une telle ventilation.

### Inventaire, qualité et limites de la conclusion

Chaque A : 44 passes dans cinq fichiers (OWASP 4, enforcement 24, promotion 7,
force 4, add/remove 5). Chaque B : 43 passes (OWASP fusionné 3, autres inchangés).
Le scan réel est validé à chaque passage : deux cas scanner en A, un fusionné en B.
Le catalogue est déjà vert (6 cas) dans la campagne fonctionnelle ; la correction
optionnelle TypeScript ultérieure n'affaiblit pas ses assertions mais n'a pas
fait l'objet d'une nouvelle exécution comportementale du catalogue.

Les 83 passes initiales restent des preuves fonctionnelles acquises, avec l'échec
lifecycle conservé. Les types CLI configurés et le lint des cinq fichiers sont
verts. Le contrôle stdin enforcement complémentaire est maintenant vert, exit 0,
stdout identique à l'entrée et source inchangée, attestés dans
`.void/machine/dev844-lint-enforcement-stdin-20260919/result.json`.
Les 24 diagnostics du contrôle TypeScript supplémentaire hors périmètre configuré
restent attribués au code préexistant, sans baisse de strictness.

Les vrais scénarios Git exercent des copies indépendantes et leurs assertions
restent vertes. La campagne ne contient pas d'injection de panne de cpSync ni de
contrôle dynamique dédié des inodes : ne pas prétendre disposer de ces preuves.
La matrice runtime-pilot de 27 dépôts et le hook CLI restent inchangés ; ils n'ont
pas été rejoués dans l'expérience. L'absence de régression globale n'est donc
**pas établie**. L'ancienne baseline non comparable ne comble pas ce manque.

### Résultat soumis à la revue produit/QA

La réduction déterministe de scans et de constructions Git est conservée avec
un bénéfice CPU ciblé mesuré. La vitesse, les pics ressources et le coût global
n'ont pas de conclusion favorable démontrée. La règle de rétention exige une
disposition explicite du critère global et des limites QA ; cette revue doit
juger les preuves présentes, sans PASS implicite ni nouvelle campagne arbitraire.
Aucun writer-event d'implémentation, dispatch supplémentaire ou statut livré
n'est enregistré par cette mise à jour. DEV-844 reste prêt pour revue, non livré.

## Élargissement borné : fixture temporelle de vérification intégrée

Après l'avis ciblé, ORCH a autorisé la correction de la fixture lifecycle devenue
un blocage concret. Seul ts dans projectWith est remplacé : la date fixe du
19 août devient new Date().toISOString() au moment de la création de l'activation.
Le scénario porte sur une activation récente, pas sur l'expiration de la fenêtre.
Aucune production, assertion, fenêtre réelle ou timeout ne change. Le RED observé
et son diagnostic restent conservés ; le GREEN du cas est demandé à RUN, pas
présumé. Cette autorisation remplace la disposition antérieure « différée ».

Une seule paire globale A/B est préparée, sans exécution. Elle reprend les quatre
scripts test:cpu/filesystem/subprocess/network et leurs réglages existants. La
correction temporelle est commune à A et B pour ne pas confondre sa réparation
avec le coût des six changements d'optimisation. Le bac reste externe, sans
nouvelle worktree ni installation consommateur ; ses métadonnées Git proviennent
d'un clone indépendant sans hardlinks, les contrôles versionnés sont conservés,
et les preuves demeurent séparées des caches attendus. Commande RUN préparée :
python3 .void/machine/dev844-global-ab.py. Le critère global reste non disposé
jusqu'à ses faits et à l'avis produit/QA. Aucun lancement automatique n'est prévu.

## Arrêt de la paire globale A/B : trois fixtures expirées

ORCH rapporte le cas lifecycle corrigé GREEN (1/1, 34 hors filtre), log
/private/tmp/dev844-dated-fixture-targeted.log. La campagne globale suivante
s'arrête en A, lane filesystem : trois échecs ; B non exécuté. Preuve conservée
sans modification :
/Users/folpe/.local/share/void-harness/measurements/dev844-global-ab-20260919/evidence/A/filesystem/vitest.json.
Aucune comparaison globale valide ni gain global ne découle de cette campagne.

La lecture confirme la même cause : les deux cas cached verdict
(invocation.test.ts:358,372) et observeInvocation (invocation-health.test.ts:111)
écrivent le 19 août tandis que refreshInvocationVerdict et observeInvocation
passent Date.now() à la fenêtre réelle de 30 jours. Les événements sont expirés ;
les alertes deviennent undefined et la liste unresolved vide. Le RED est acquis.
L'autorisation bornée ajoute ces deux fichiers de tests à l'ownership : seul
l'horodatage des événements récents devient new Date().toISOString(). Le défaut
d'activation utilisé par les tests purs à horloge fixe reste inchangé, ainsi que
production, assertions, fenêtres et timeouts. GREEN demandé à RUN, non présumé.

Le script préparé dev844-global-ab.py déclare et empreinte les trois corrections
temporelles comme communes à A et B, hors des six différences d'optimisation.
Son refus d'écraser le bac existant reste actif : ORCH devra désigner un nouveau
bac avant toute reprise autorisée. Aucune nouvelle mesure exécutée. Les preuves
de l'essai arrêté et les résultats ciblés antérieurs restent conservés.

## Disposition proposée après la paire globale v2 (19 septembre)

Preuves immuables : /Users/folpe/.local/share/void-harness/measurements/dev844-global-ab-20260919-v2/evidence. Campagne exit 1 ; run.json valid=false.

Les manifests A/B diffèrent exactement sur les six fichiers d’optimisation. Les trois corrections temporelles sont communes ; sources et contrôles installés restent inchangés selon les empreintes avant/après. Même chemin actif, réglages des quatre lanes conservés, caches froids avant chaque variante. Versions A/B : Node 24.15.0, pnpm 10.34.5, Vitest 4.1.9, Git 2.50.1 (Apple Git-155), Semgrep 1.176.0.

| Variante / lane | Cas PASS / total | CPU user+sys (s) | Wall (s) | Pic RSS échantillonné (KiB) | Pic processus | Loadavg 1 min min–max | Exit |
|---|---:|---:|---:|---:|---:|---:|---:|
| A / cpu | 2414/2414 | 98.89 | 88.685 | 737888 | 8 | 20.005–22.781 | 0 |
| A / filesystem | 1788/1788 | 111.41 | 105.580 | 731616 | 10 | 16.890–20.487 | 0 |
| A / subprocess | 1121/1121 | 304.65 | 299.566 | 718528 | 13 | 12.351–34.856 | 0 |
| A / network | 30/30 | 7.47 | 12.104 | 481200 | 6 | 25.283–26.622 | 0 |
| B / cpu | 2416/2416 | 102.61 | 111.261 | 741280 | 9 | 20.427–32.705 | 0 |
| B / filesystem | 1779/1779 | 98.17 | 125.532 | 664000 | 8 | 26.047–54.864 | 0 |
| B / subprocess | 1126/1129 | 292.10 | 337.912 | 945456 | 16 | 20.343–42.999 | 1 |

A : 485 fichiers, 5353 PASS ; CPU total 522.42 s, wall total 505.935 s.
B : 483 fichiers exécutés, 5321 PASS / 5324 cas, trois FAIL ; network non exécuté.
Ses 492.88 s CPU et 574.705 s wall sont des totaux partiels incluant une lane
échouée : ils ne constituent pas une comparaison globale valide avec A.
Les deux fichiers déplacés de filesystem à subprocess changent le périmètre de
chaque classe ; il serait trompeur de présenter filesystem seule comme un gain.
Semgrep réel passe dans les deux variantes. Les trois échecs subprocess sont :

| Cas inchangé | A PASS (s) | B FAIL (s) | Timeout conservé (s) |
|---|---:|---:|---:|
| runtime-pilot.test.ts:85, seals all 27 real fixture workspaces | 14.706 | 31.316 | 30 |
| mission.test.ts:308, dispatches a TypeScript 7 mission | 6.330 | 10.158 | 10 |
| update.test.ts:298, writes the receipt | 2.972 | 14.497 | 10 |

La charge globale observée augmente notamment sur B filesystem (pic loadavg
54.864) et B subprocess (20.343–42.999 contre 12.351–34.856 en A). Les durées
murales augmentent aussi dans la lane cpu. Ces observations rendent une
contention de la machine plausible, sans attribuer les timeouts à une cause
prouvée : loadavg est global à la machine, les processus échantillonnés ne le
sont pas, aucune répétition ne sépare effet de l'ordre A/B, charge et changement.
Des fichiers inchangés peuvent subir un effet indirect ; leur identité ne prouve
pas l'absence de régression. RSS et nombres de processus restent des pics
échantillonnés, pas des maxima exhaustifs ni une preuve de réduction globale.

Disposition produit proposée : conserver le constat ciblé A/B/B/A de réduction
CPU moyenne de 19.8916 % (54.420 vers 43.595 s), et la réduction déterministe du
nombre de scans et d'initialisations Git. Aucune accélération murale démontrée.
La règle « retenir un gain ciblé seulement si aucune régression globale
matérielle reproductible sur commandes/arbres comparables » n'a pas de verdict
PASS ici : cette paire incomplète ne démontre ni une telle régression reproductible
ni son absence. Ne pas convertir cette incertitude en rejet causal des changements
ou en approbation implicite. Soumettre cette limite à l'avis produit frais requis ;
aucune nouvelle campagne n'est prescrite par défaut et aucune règle n'est modifiée.

Disposition QA proposée : les six fichiers ciblés, Semgrep réel, les contrôles
applicables précédents et les fixtures corrigées ont leurs preuves acquises.
ORCH rapporte GREEN 6/6 (44 hors filtre) dans /private/tmp/dev844-relative-fixtures.log,
en plus du lifecycle GREEN 1/1. La vérification intégrée B reste rouge : trois
scénarios n'atteignent pas leur fin, dont celui qui scelle les 27 workspaces runtime,
et network B n'a pas tourné. C'est la conséquence démontrée à disposer avant de
revendiquer une validation intégrée complète ; les 27 scénarios ne sont ni retirés
ni réputés validés en B. A est vert, mais ne remplace pas cette preuve B manquante.
Aucun changement des trois tests hors scope ou de leurs timeouts, aucune relance
pour fabriquer du vert. Ticket non livré, pas de writer-event ni dispatch.

Footprint versionné final : neuf fichiers de tests et cet audit.

- packages/cli/src/lib/security/owasp-fixture.test.ts
- packages/core/enforce/ci-enforce.test.ts
- test/workflows/promotion-integration.test.ts
- test/cli/force-preserves-co-owned.test.ts
- test/cli/add-remove-parity.test.ts
- test/support/test-catalog.test.ts
- packages/hook-runner/src/cli.test.ts
- packages/hook-runner/src/invocation.test.ts
- packages/cli/src/lib/invocation-health.test.ts
- docs/audits/2026-09-16-test-cost-optimization.md

Les artefacts locaux .void/machine (protocole, clarification, scripts et résultats)
restent des preuves de travail, hors changements de production. Aucun workflow CI,
configuration de strictness, dépendance ou harness installé modifié.

Contrôles restants proposés à RUN, séparément pour conserver chaque exit même si
un autre échoue. Ils couvrent seulement les deux projets affectés par les trois
fixtures depuis les preuves types/lint précédentes ; aucun diagnostic strict hors
configuration ni contrôle des six fichiers inchangés n'est redemandé.
Cwd : /Users/folpe/.local/share/git-worktrees/void-harness/work/seven-20260916/DEV-844

```sh
/Users/folpe/.local/share/pnpm/node node_modules/typescript/bin/tsc --noEmit --project packages/cli/tsconfig.json
/Users/folpe/.local/share/pnpm/node node_modules/typescript/bin/tsc --noEmit --project packages/hook-runner/tsconfig.json
/Users/folpe/.local/share/pnpm/node node_modules/@biomejs/biome/bin/biome lint --max-diagnostics=none packages/hook-runner/src/cli.test.ts packages/hook-runner/src/invocation.test.ts packages/cli/src/lib/invocation-health.test.ts
```

Aucun de ces contrôles n'a été exécuté par le worker ; RUN WORK1 actif.

Preuve run.json, SHA256 : 28882d25021fb9017ad3e11794f8903b578ca7c36ae9a75c92a58dff791a5683.

Preuve SHA256SUMS.json, SHA256 : c436be7fa9535dd7c517025da01062141472566b2469cec1f9cecd251097f907.

## Disposition indépendante et derniers contrôles acquis

ORCH rapporte GREEN pour les deux typechecks applicables (CLI et hook-runner)
et le lint des trois fixtures dans RUN dev844-final-fixtures-check. Log :
/private/tmp/dev844-final-fixtures-check.log ; SHA256 7aa0759fb864f0c99051703e888a6edaf97d407670818162d9ab28d457a90135.
La lecture du log constate « Checked 3 files », « No fixes applied » et 12
informations useLiteralKeys sur des lignes hors diff ; aucun nettoyage ajouté.
Les contrôles proposés dans la section précédente sont désormais acquis,
aucune relance des tests ou contrôles inchangés n'est demandée.

Avis indépendants produit et QA recueillis par ORCH : rétention provisoire du
gain CPU ciblé autorisée ; aucune régression introduite démontrée. Cette disposition
ne constitue pas un PASS global. La livraison reste bloquée jusqu'aux gates du
SHA intégré final, incluant les trois scénarios en timeout et network. ORCH porte
la vérification intégrée et la collecte des avis, sans nouvelle campagne performance
ni retries pour fabriquer du vert. Les preuves rouges et les limites de charge,
d'ordre de mesure et de comparabilité de la baseline historique sont conservées.

Le handoff local dev844-handoff-final-20260919.md prépare la transition writer
vers postreview de la même mission. Aucun writer-event, dispatch, completion ou
statut livré n'est émis par cette mise à jour. Les avis rapportés ne sont pas
transformés par le worker en completions canoniques inventées.
