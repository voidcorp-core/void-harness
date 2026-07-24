---
title: void-harness v3 - top-tier autonomous engineering team
date: 2026-07-24
status: in-design
author: Folpe + Codex
supersedes:
  - docs/specs/2026-07-21-void-harness-public-multiruntime-os.md
related:
  - docs/specs/2026-06-26-harness-graph-viz.md
  - docs/specs/2026-06-29-graph-live-p2.md
  - docs/specs/2026-06-29-graph-behavior-m8.md
  - docs/specs/2026-07-01-graph-cost-profiler.md
  - docs/specs/2026-07-02-graph-studio-cost-viz.md
  - plans/2026-07-10-harness-token-frugality-audit.md
---

# void-harness v3 - top-tier autonomous engineering team

## 0. Verdict et intention

void-harness v3 devient un **système d'exploitation d'équipe d'ingénierie pour agents de code**,
pas un catalogue de prompts. Pour chaque mission, il détecte le projet et le risque, mobilise les
spécialistes pertinents, orchestre leur travail, exige des preuves fraîches, mesure le coût et rend
le flux observable.

La promesse cible est :

> Donner à Claude Code, Codex et aux futurs runtimes le comportement cohérent d'une équipe senior
> complète, avec un niveau de qualité top 5 %, une autonomie contrôlée et un coût en contexte
> mesuré.

« Top 5 % » est une **cible de certification**, pas un slogan. Le harness ne pourra afficher cette
qualification que sur un périmètre couvert par des évaluations reproductibles et un benchmark
comparatif défini. Avant cela, il affiche les états réellement prouvés.

Le système reste :

- local-first, self-hosted et sans compte void-harness ;
- installable depuis le package npm sans GitHub, marketplace, `gh`, `jq`, Python ou Bun ;
- agnostique du runtime, du modèle, du langage et du framework dans son coeur ;
- extensible sans permettre à une extension d'affaiblir silencieusement le socle qualité ;
- économe en tokens par sélection, compilation de contexte, cache et parallélisme utile ;
- honnête : pas de `verified`, `live`, `effective` ou `certified` sans preuve correspondante.

## 1. Constat vérifié

### 1.1 Usage réel

L'historique local de Declik, Sesame et Solaar contient 29 sessions et 13 595 activations. Les
invocations explicites se concentrent sur sept conducteurs :

| Famille | Invocations historiques |
|---|---:|
| autonomie backlog | 35 |
| ticket-runner | 19 |
| writing-plans | 18 |
| brainstorming | 16 |
| TDD | 12 |
| ticket-writer | 8 |
| frontend-design | 7 |

Ces conducteurs représentent environ 84 % des invocations explicites observées. Les compétences
DDD, hexagonale, observabilité, migrations, sécurité, QA, PDF et les patterns de stack apparaissent
peu ou pas dans ce compteur.

Cette donnée ne prouve pas leur inutilité. Le compteur actuel enregistre principalement les appels
explicites de skills. Il ne prouve ni la lecture passive d'une doctrine, ni la composition décrite
en prose dans `ticket-runner`, ni le travail réellement exécuté par un spécialiste. Les hooks
appliquent quelques règles mécaniques, mais n'invoquent pas ces spécialistes.

### 1.2 Écart entre intention et exécution

`ticket-runner` décrit déjà des passes d'architecture, migrations, TDD, E2E, UX/UI, sécurité,
revue, vérification et livraison. Le problème n'est donc pas principalement l'absence de doctrine.
Le problème est que `compose` est une convention textuelle :

- son déclenchement n'est pas déterministe ;
- son exécution n'est pas traçable ;
- son résultat n'a pas de contrat de preuve ;
- son absence peut rester verte ;
- son coût est attribué grossièrement à la session entière ;
- les composants passifs, non installés et réellement inutiles sont parfois confondus.

### 1.3 Écart d'autosuffisance

Le package actuel est public et possède une base Claude/Codex réelle, mais le chemin par défaut
reste partiellement dépendant de la marketplace Claude et de `gh`. Les hooks shell et `jq` rendent
le comportement fragile hors macOS/Linux configuré. Le dépôt source lui-même n'exécute pas encore
le produit publié de manière vérifiable.

### 1.4 Actifs à préserver

La v3 réutilise au lieu de réécrire :

- le graphe de catalogue et ses analyses statiques ;
- les journaux d'activation et d'outcome ;
- le serveur local en loopback, SSE, historique et replay ;
- le Graph Studio Three.js et son mode reduced-motion ;
- le contrat de capacité, les adapters de runtime et `ProjectState` déjà amorcés ;
- les skills experts existants et leur discipline de sourcing ;
- le CLI publié, le packaging autonome et la certification gelée par release ;
- les workflows `brainstorming`, `writing-plans`, `ticket-writer`, `ticket-runner` et
  `backlog-autopilot`.

## 2. Principes non négociables

### 2.1 Chaque rôle est évalué, seuls les rôles pertinents sont approfondis

Une mission possède une matrice d'applicabilité complète. Chaque rôle obligatoire reçoit un état :

- `not-applicable`, avec le prédicat et la preuve qui le justifient ;
- `pending` ;
- `running` ;
- `completed` ;
- `degraded` ;
- `blocked` ;
- `failed` ;
- `waived`, avec exception humaine bornée ;
- `invalidated`, quand le diff ou une dépendance rend sa preuve obsolète.

Un rôle n'est jamais silencieusement ignoré. L'architecture DDD/hexagonale, l'observabilité, les
migrations, la sécurité, la QA et les patterns de stack sont **toujours évalués**. Ils ne produisent
une mission spécialiste profonde que lorsque leurs prédicats s'appliquent.

### 2.2 La qualité est une propriété de preuves, pas du nombre d'agents

Multiplier les agents sans séparation de responsabilités produit du consensus coûteux. La v3
préfère :

- un responsable d'écriture par tranche verticale ;
- des spécialistes en lecture seule pour éclairer et critiquer ;
- des revues indépendantes avec contexte frais ;
- une boucle evaluator-optimizer bornée ;
- un ledger de findings et de preuves relié au diff.

### 2.3 La vitesse vient de l'orchestration

Le mode rapide ne supprime pas un pass applicable. Il accélère par :

- fan-out des analyses indépendantes ;
- contexte minimal par rôle ;
- réutilisation de résultats encore valides ;
- suppression des secondes opinions redondantes ;
- tests et graphes incrémentaux ;
- arrêt précoce sur blocker réel.

### 2.4 TDD frontend et backend

Le TDD s'applique au comportement, quel que soit le côté :

- domaine, services, API et intégrations ;
- composants, hooks, stores et états UI ;
- accessibilité et navigation clavier ;
- erreurs, chargement, vide, permissions, responsive et offline ;
- contrats entre frontend et backend.

Les E2E complètent le TDD. Ils ne le remplacent pas.

### 2.5 Le graphe est dérivé, jamais autoritaire

Le code, la configuration et les événements restent les sources de vérité. Un graphe stale,
partiel ou invalide déclenche un fallback vers la source et la recherche locale. Aucune décision
critique ne peut dépendre uniquement d'une inférence de graphe.

### 2.6 Le contrôle humain est proportionné

Un contrôle humain reste obligatoire pour :

- l'approbation de spec et de plan à enjeu ;
- les opérations irréversibles ou coûteuses ;
- les changements de politique de sécurité ;
- une dérogation au quality floor ;
- le déploiement ou la migration de production ;
- l'exploitation active d'une cible externe ;
- le merge selon la politique du projet.

Les opérations locales, réversibles, bornées et traçables peuvent être autonomes.

## 3. Architecture cible

### 3.1 Bounded contexts

```text
                         Runtime natif
                   Claude Code | Codex | futur
                               |
                       Runtime Adapter
                               |
                 +-------------v-------------+
                 |      Mission Engine       |
                 | controller | risk | DAG   |
                 +------+------+-------------+
                        |      |
            +-----------+      +----------------+
            |                                   |
    Context Compiler                      Evidence Ledger
            |                                   |
    ProjectGraph + CatalogGraph        MissionGraph + EvidenceGraph
            |                                   |
            +----------------+------------------+
                             |
                    Mission Control local
                             |
                    Certification Lab
```

Le système est découpé en huit contextes :

1. **Contract & Catalog** - capacités, spécialistes, workflows, profils, politiques.
2. **Mission Orchestration** - applicabilité, risque, DAG, modes et transitions.
3. **Context Intelligence** - ProjectGraph, sélection de contexte et budgets.
4. **Runtime Integration** - compilation vers les primitives natives du runtime.
5. **Enforcement** - garde locale portable et floor CI.
6. **Evidence & Telemetry** - événements, findings, preuves, coût et invalidation.
7. **Certification** - conformance, évaluations comportementales et release gates.
8. **Mission Control** - projection locale live, historique, replay et diagnostic.

Chaque contexte expose des ports versionnés. Il ne lit pas directement les fichiers internes d'un
autre contexte.

### 3.2 Coeur fonctionnel et coquille impérative

Le coeur contient des fonctions déterministes pour :

- classifier l'applicabilité et le risque ;
- construire et valider un plan de mission ;
- réduire des événements vers un état ;
- valider et fusionner les contrats ;
- calculer les invalidations ;
- sélectionner un sous-graphe ;
- compiler un paquet de contexte ;
- produire les scores et états de certification.

La coquille impérative réalise :

- lecture/écriture atomique ;
- lancement des commandes et agents ;
- horloge et identifiants ;
- collecte runtime ;
- serveur local ;
- interaction utilisateur.

### 3.3 Runtime et modèle

Le coeur ne connaît ni Claude, ni Codex, ni un fournisseur de modèle. Il émet un plan canonique,
des contrats de rôle et des besoins en outils. Un adapter traduit vers les primitives natives :

- Claude Code : agents, skills, hooks et settings supportés ;
- Codex : agents TOML, skills, règles et mécanismes d'exécution supportés ;
- futur runtime : nouvel adapter et suite de conformance.

La v3 ne construit pas de proxy LLM universel. Le runtime choisi possède le modèle, l'authentification
et les outils. Le Certification Lab peut lancer un runtime réel via un adapter dédié, sans introduire
un fournisseur dans le coeur.

### 3.4 Dépendances

Le chemin de base exige uniquement :

- Node.js à la version minimale supportée par le package ;
- les primitives de fichiers, processus et réseau local de Node ;
- le runtime d'agent que l'utilisateur a déjà choisi.

Les dépendances tierces existantes restent acceptées lorsqu'elles évitent une réimplémentation
risquée et passent l'audit supply-chain. Aucune dépendance externe n'est ajoutée pour un gain
cosmétique. Le navigateur, Playwright, un moteur PDF, un scanner DAST ou Graphify sont des adapters
optionnels.

## 4. Contrat canonique d'ingénierie

### 4.1 Objets du catalogue

Le catalogue canonique possède cinq objets distincts :

| Objet | Responsabilité |
|---|---|
| `conductor` | orchestre un cycle utilisateur complet |
| `specialist` | produit un avis expert borné et structuré |
| `policy` | règle obligatoire, prédicat, sévérité et dérogation |
| `profile` | connaissance d'une stack, d'un langage ou d'un domaine |
| `adapter` | capacité externe ou compilation runtime |

Un skill peut matérialiser un conductor ou une capacité directement invocable. Il ne devient pas
l'unité universelle de l'architecture.

### 4.2 Hiérarchie de configuration

Les contrats se composent dans cet ordre :

```text
core < profile < organization < project
```

Leur provenance est explicite :

- `core` vient de l'artefact certifié ;
- `profile` vient du core, d'une extension installée ou de `.void/profiles/` ;
- `organization` vient de `.void/organization/` dans le projet ou d'un chemin explicitement
  configuré ;
- `project` vient de `.void/policies/`, `.void/specialists/` et `.void/workflows/`.

Les niveaux supérieurs peuvent :

- rendre une règle plus stricte ;
- ajouter un rôle, une preuve ou un déclencheur ;
- préciser un budget ;
- remplacer une recommandation non obligatoire.

Ils ne peuvent pas affaiblir silencieusement une règle du core. Un affaiblissement exige une
exception explicite, datée, motivée, bornée et visible dans Mission Control.

### 4.3 Formats

Le format suit l'auteur et l'usage :

- YAML pour les politiques, spécialistes, profils et workflows écrits par un humain ;
- JSON pour les contrats compilés, états, snapshots et receipts ;
- JSON canonique pour les hashes et preuves signables ;
- JSONL append-only pour les événements ;
- `.jsonl.gz` pour les archives ;
- JSON compact pour SSE ;
- Markdown pour les context packs et rapports lisibles ;
- node-link JSON pour les graphes.

`.void/config.json` reste la configuration machine d'installation actuelle. La v3 ne la migre pas
vers YAML sans bénéfice mesuré. Les extensions humaines vivent sous :

```text
.void/policies/
.void/specialists/
.void/profiles/
.void/organization/
.void/workflows/
```

### 4.4 Fraîcheur des profils

Un profil de stack déclare :

- les technologies et plages de versions couvertes ;
- les détecteurs qui l'activent ;
- ses sources officielles ;
- sa date de revue ;
- ses invariants et patterns conditionnels ;
- sa politique d'obsolescence.

Une version non couverte ou un profil expiré devient `degraded` et déclenche une revue
source-driven. Le harness ne présente pas une recommandation ancienne comme « état de l'art ».

### 4.5 ADR sans conflit

L'état actuel est partiellement correct :

- void-harness possède déjà une source par décision sous `docs/decisions-log/` ;
- `docs/DECISIONS.md` est une projection générée ;
- le skill distribué `adr-workflow` recommande encore un compteur séquentiel
  `decisions/0001-*.md`.

Le compteur et la projection committée restent deux points de contention pour plusieurs features
en parallèle. La v3 impose :

- un ADR = un fichier source immuable ;
- aucun compteur ou réservation de numéro partagé ;
- un identifiant collision-resistant généré par le CLI avec création exclusive et retry ;
- un nom lisible `<YYYY-MM-DD>-<slug>--<id>.md` ;
- un frontmatter versionné avec `id`, `createdAt`, `status`, `deciders` et `supersedes` ;
- une reversal par nouvel ADR, jamais par réécriture de la décision acceptée ;
- aucun worker ne modifie un index partagé ;
- validation CI des schémas, IDs dupliqués, liens de supersession et cycles ;
- projection chronologique construite à la demande par le CLI et Mission Control.

`docs/DECISIONS.md` devient une page d'entrée stable vers les fichiers et la commande de
visualisation. Ce n'est plus un artefact régénéré dans chaque branche. Les 96 décisions historiques
restent valides et ne sont pas renommées en masse ; le loader supporte leur format legacy.

Le skill `adr-workflow`, ses assets compilés Claude/Codex, les templates projet et la documentation
doivent converger sur ce contrat dans la même tranche. Le défaut d'un nouveau projet est
`docs/decisions/`, mais un chemin existant comme `docs/decisions-log/` est détecté et conservé.

### 4.6 Schéma minimal d'un spécialiste

```yaml
schemaVersion: 1
id: core:security-reviewer
version: 1
scope: review
independence: fresh-context
writeAccess: none
appliesWhen:
  any: [trust-boundary, auth, secrets, external-input, dependency-change]
inputs: [mission, diff, project-subgraph, threat-contract]
outputs: [findings, verdict, evidence-requests]
budgets:
  contextTokens: 12000
  maxTurns: 2
failurePolicy: block-on-critical
```

Le contrat ne contient pas de syntaxe propre à un runtime. L'adapter décide comment matérialiser le
rôle.

## 5. Mission Engine

### 5.1 Entrée et sortie

Une mission reçoit :

- l'intention ou le ticket ;
- le mode demandé ;
- le diff et l'état du dépôt ;
- la stack détectée ;
- les politiques applicables ;
- les capacités et outils disponibles ;
- l'historique de preuves réutilisables.

Elle produit :

- une classification de risque expliquée ;
- une matrice d'applicabilité complète ;
- un DAG de passes et spécialistes ;
- des context packs bornés ;
- un journal d'événements ;
- un ledger de findings ;
- des preuves reliées au diff ;
- un verdict final honnête.

### 5.2 Cycle canonique

```text
ingest
  -> reconnaissance et classification du risque
  -> brainstorm produit / domaine / UX / menaces
  -> design et arbitrages
  -> plan de tranches verticales
  -> implémentation TDD par lead writer
  -> revues indépendantes en parallèle
  -> boucle de correction bornée
  -> vérification et verdict
  -> capture de rétrospective proposée
```

Les étapes déjà accomplies avec une preuve fraîche ne sont pas rejouées. Une modification de leur
input les invalide.

### 5.3 Modes

#### `team` - défaut

- Tous les rôles sont évalués.
- Chaque spécialiste applicable est réellement invoqué comme subagent natif.
- Un seul lead writer possède une tranche verticale.
- Les revues pertinentes utilisent un contexte frais.
- Les findings bloquants doivent être corrigés ou explicitement dérogés.

#### `fortress` - risque élevé

Ce mode est automatiquement imposé si la mission touche notamment :

- authentification, autorisation, paiement ou données personnelles ;
- multi-tenancy ou isolation ;
- migration destructive ou backfill sensible ;
- upload, parsing de documents ou contenu non fiable ;
- exécution de code, shell, outils LLM ou permissions d'agent ;
- supply-chain, secrets, cryptographie ou surface publique critique.

Il ajoute :

- threat modeling explicite ;
- revue sécurité adversariale indépendante ;
- vérification de rollback et recovery ;
- DAST/pentest sûr quand une surface exécutable existe ;
- seconde preuve pour les invariants critiques.

#### `fast` - faible risque explicite

- Autorisé uniquement si le classifieur ne trouve aucun prédicat high-risk.
- Conserve le même quality floor.
- Réduit les doublons, les explications et les secondes opinions non requises.
- Utilise cache, graphes incrémentaux et parallélisme.
- Se promeut automatiquement en `team` ou `fortress` si le risque augmente.

### 5.4 Règle d'écriture

Un spécialiste de revue est read-only. Un lead writer peut modifier les fichiers de sa tranche.
Deux agents ne modifient pas simultanément le même périmètre. Les migrations, lockfiles et contrats
partagés sont toujours sérialisés.

### 5.5 Boucle evaluator-optimizer

Après implémentation :

1. les reviewers émettent des findings structurés ;
2. le controller déduplique et arbitre par preuve ;
3. le lead writer corrige un lot cohérent ;
4. seules les preuves affectées sont invalidées ;
5. les reviewers concernés vérifient à nouveau.

La boucle est bornée par une politique de tours. Si un blocker persiste, la mission devient
`blocked`. Elle ne passe pas en vert par épuisement de budget.

## 6. Équipe de spécialistes

### 6.1 Conducteurs visibles

La surface utilisateur reste volontairement courte, environ 6 à 10 conducteurs :

- brainstorming ;
- writing-plans ;
- ticket-writer ;
- ticket-runner ;
- backlog-autopilot ;
- security-audit ;
- QA ;
- retrospective ;
- devex-audit ;
- UI review.

### 6.2 Rôles internes

Le Mission Engine sélectionne dans une équipe extensible :

| Rôle | Moment principal | Produit |
|---|---|---|
| Product Challenger | amont | valeur, angles morts, version x10 |
| Domain Architect | design | langage, bounded contexts, invariants |
| Solution Architect | design | frontières, ports, dépendances, ADR |
| Data & Migration Engineer | design + review | modèle, migration, rollback |
| API & Integration Engineer | design + review | contrats, compatibilité, résilience |
| Observability/SRE Engineer | design + review | signaux, SLO, runbook, failure modes |
| Security Engineer | menace + review | threat model, findings, remédiation |
| Experience Designer | amont UI | parcours, hiérarchie, copy, états |
| Frontend Engineer | implémentation/review | architecture UI, TDD, performance |
| Visual Craft Director | post-UI | screenshots, cohérence, anti-slop |
| Test/QA Engineer | plan + review | stratégie, couverture, QA live |
| Accessibility Specialist | design + review | clavier, lecteurs, contrastes, mobile |
| Performance Engineer | review ciblée | budgets et profils |
| DevEx/Docs Engineer | finition | TTHW, API/CLI/docs, adoption |
| Independent Code Reviewer | post-diff | défauts, simplicité, maintenabilité |

Ces rôles ne deviennent pas tous quinze prompts chargés dans chaque mission. Le CatalogGraph et le
classifieur chargent seulement les contrats applicables.

Chaque rôle est aussi matérialisé comme subagent natif directement invocable par l'utilisateur. Une
invocation manuelle et une invocation orchestrée utilisent le même contrat, les mêmes permissions
et le même format de sortie.

### 6.3 UX/UI anti-slop

Une mission UI fait intervenir deux moments distincts :

1. **Experience Designer, avant le code**
   - parcours et objectif utilisateur ;
   - architecture d'information ;
   - hiérarchie visuelle ;
   - charge cognitive et copy ;
   - états loading, empty, error, success, permission et offline ;
   - mobile, desktop, clavier et accessibilité ;
   - deux ou trois directions seulement si un arbitrage réel existe.
2. **Visual Craft Director, après le code, en contexte frais**
   - inspection de screenshots réels mobile et desktop ;
   - contrôle des états significatifs ;
   - chasse aux défauts typiques de génération AI ;
   - cohérence typographique, rythme, densité, contraste, mouvement ;
   - comparaison avec le contrat de design du projet.

Sans browser ou screenshots exploitables alors que la preuve visuelle est requise, le pass est
`blocked`, pas `completed`.

### 6.4 Sécurité et pentest

Toute mission reçoit un baseline sécurité :

- secrets et données sensibles ;
- validation des entrées et sorties ;
- authn/authz et isolation ;
- injection, XSS, CSRF, SSRF et traversée de chemin selon la surface ;
- dépendances et provenance ;
- permissions des outils d'agent ;
- logs, erreurs et fuite de contexte ;
- abus, rate-limit et replay si applicables.

Le mode `fortress` ajoute des tests adversariaux. Un pentest actif :

- cible par défaut une instance locale ou éphémère ;
- reste non destructif ;
- exige une autorisation explicite pour une cible externe ;
- journalise la portée et les commandes ;
- produit reproduction, sévérité, preuve et correction ;
- ne masque jamais un scanner absent.

Des missions périodiques peuvent exécuter le baseline et les scanners configurés en CI. Le coeur ne
dépend d'aucun vendeur de scanner.

## 7. Applicabilité et quality floor

### 7.1 Matrice minimale

| Pass | Toujours évalué | Approfondi lorsque |
|---|---|---|
| Product/feature challenge | oui | feature ou changement de parcours |
| DDD/hexagonal | oui | domaine, frontière, modèle, API ou module |
| TDD | oui | tout changement de comportement |
| QA | oui | tout changement testable |
| Security | oui | baseline toujours, deep sur trust boundary |
| Observability | oui | comportement runtime ou opérationnel |
| Migration | oui | données, schéma, format durable |
| UX/UI | oui | interaction ou sortie visuelle |
| Accessibility | oui | UI ou contenu consommé |
| Performance | oui | hot path, volume, bundle, requête, coût LLM |
| Stack patterns | oui | profil détecté et fichiers concernés |
| PDF | oui | entrée ou livrable PDF |
| Retrospective | oui | fin de release, incident ou fenêtre définie |

### 7.2 Preuve de non-applicabilité

`not-applicable` contient :

- l'identifiant du prédicat évalué ;
- les entrées examinées ;
- la raison ;
- le hash de ces entrées ;
- le classifieur et sa version.

Exemple : migrations non applicables si aucun fichier, contrat ou nœud de graphe durable n'est
touché et si le ticket ne décrit aucun changement de données persistées.

### 7.3 Verdict

Une mission ne peut être `verified` que si :

- tous les passes obligatoires sont `completed` ou `not-applicable` avec preuve ;
- aucune preuve requise n'est stale ;
- aucun finding critique ou haut non accepté ne reste ouvert ;
- les commandes de vérification requises passent sur le diff courant ;
- le runtime et les adapters utilisés ont une conformance suffisante ;
- les exceptions sont visibles et encore valides.

Une livraison avec exception prend l'état `shipped-with-exception`, jamais `verified`.

Ces défauts ne peuvent jamais être rendus verts par dérogation :

- secret exposé ;
- vulnérabilité critique prouvée ;
- migration destructive sans recovery prouvé ;
- tests requis en échec ;
- violation d'isolation tenant ;
- altération ou absence de preuve annoncée comme présente.

## 8. Context Compiler et maîtrise des tokens

### 8.1 Pipeline

```text
mission + diff
  -> prédicats d'applicabilité
  -> sous-graphe pertinent
  -> sources et contrats minimaux
  -> déduplication + budget
  -> context pack par spécialiste
```

Le Context Compiler ne verse jamais le graphe complet ni tout le catalogue dans un prompt. Il
émet une vue adaptée au rôle :

- objectif et contraintes ;
- fichiers/nœuds nécessaires ;
- décisions et politiques applicables ;
- findings ouverts ;
- preuves attendues ;
- budget et format de sortie.

### 8.2 Budgets

Chaque mission et chaque spécialiste déclarent :

- limite de contexte ;
- limite de tours ;
- niveau de modèle recommandé lorsque le runtime le supporte ;
- redondance autorisée ;
- politique d'escalade.

Seuils globaux :

- 70 % : avertissement et suppression du contexte non chargé ;
- 90 % : réduction de la redondance optionnelle, réutilisation agressive des preuves valides ;
- 100 % : pause ou escalation.

La qualité obligatoire n'est jamais abaissée silencieusement pour respecter le budget.

### 8.3 Mesure

Chaque coût porte une source :

- `runtime-reported` ;
- `transcript-derived` ;
- `estimated` ;
- `unknown`.

Les valeurs estimées ne sont pas additionnées à des valeurs exactes sans distinction. Le harness
n'attribue plus le coût complet d'une session à chaque skill invoqué. L'attribution suit les
intervalles et corrélations disponibles ; sinon elle reste `unknown`.

## 9. ProjectGraph natif et compatibilité Graphify

### 9.1 Décision

La v3 implémente nativement les mécanismes de graphe indispensables à l'autonomie et aux économies
de contexte. Graphify reste :

- une source d'inspiration documentée ;
- un importer optionnel ;
- un benchmark de qualité et performance ;
- un module avancé possible pour des langages ou analyses non couverts.

Le chemin principal ne requiert ni Python, ni service, ni compte, ni Graphify.

### 9.2 Quatre graphes logiques

| Graphe | Question |
|---|---|
| `CatalogGraph` | quelles capacités existent et se composent ? |
| `ProjectGraph` | comment le projet est structuré et dépend ? |
| `MissionGraph` | qui fait quoi, dans quel ordre et dans quel état ? |
| `EvidenceGraph` | quelles preuves soutiennent quel verdict et quel diff ? |

Ils partagent une enveloppe node-link versionnée et des identifiants namespacés :

```json
{
  "schemaVersion": 3,
  "graphId": "project:current",
  "graphType": "project",
  "source": {
    "kind": "native",
    "version": "3.0.0-alpha",
    "rootHash": "sha256:..."
  },
  "nodes": [],
  "edges": [],
  "hyperedges": []
}
```

Chaque relation porte :

- origine `declared`, `extracted`, `observed` ou `inferred` ;
- confiance ;
- provenance ;
- hash ou version de source ;
- timestamp seulement lorsqu'il s'agit d'une observation.

### 9.3 Extraction

Le socle générique indexe :

- workspace et packages ;
- fichiers, tests, docs et configurations ;
- relations de dépendance détectables ;
- ownership Git et zones modifiées ;
- liens mission, findings et preuves.

Des extracteurs par profil ajoutent les symboles et relations de stack. L'ordre initial est guidé
par les consommateurs réels : TypeScript/JavaScript, workspaces, React, Next.js, Expo/mobile, SQL
et services Node. Le contrat d'extracteur reste indépendant du parseur choisi.

Le cache est incrémental par SHA-256. Les identifiants sont stables entre deux builds lorsque la
source logique ne change pas.

### 9.4 Requêtes

Le noyau doit fournir au minimum :

- `explain(node|edge)` ;
- `path(from,to)` ;
- `impact(changedNodes)` ;
- `subgraph(seeds,budget)` ;
- `owners(nodes)` ;
- `testsFor(nodes)` ;
- `evidenceFor(verdict)` ;
- `staleness(graph)`.

Les communautés et algorithmes avancés ne sont ajoutés que si le benchmark démontre un gain.

### 9.5 Import Graphify

L'importer :

- valide la version et la taille ;
- normalise les chemins en relatif sans sortir du root ;
- mappe les IDs sous le namespace `graphify:*` ;
- conserve toute provenance ;
- rend les ambiguïtés visibles ;
- n'accorde aucune confiance implicite à une inférence ;
- met le graphe en quarantaine s'il est invalide.

### 9.6 Benchmark

Declik, Sesame, Solaar et void-harness servent de corpus. Trois stratégies sont comparées :

1. recherche locale + exploration classique ;
2. ProjectGraph natif ;
3. Graphify optionnel.

Le graphe devient le chemin préféré sur une classe de tâche seulement si :

- les tâches complexes consomment au moins 30 % de tokens de contexte en moins ;
- aucune dépendance critique n'est omise ;
- la précision régresse de moins de 5 % sur les tâches non critiques ;
- le build incrémental reste assez rapide pour le cycle interactif ;
- le fallback source reste disponible.

## 10. Evidence Ledger et événements

### 10.1 Arborescence d'un run

```text
.void/runs/<mission-id>/
  mission.json
  plan.json
  events.jsonl
  findings.jsonl
  evidence.jsonl
  context/
  artifacts/
  summary.md
```

Les artefacts volumineux peuvent être référencés plutôt que copiés. Les secrets, prompts complets
et réponses complètes ne sont jamais journalisés par défaut.

### 10.2 Événement unifié

Tout producteur écrit le même contrat :

```json
{
  "schemaVersion": 1,
  "seq": 184,
  "eventId": "evt_...",
  "missionId": "mis_...",
  "ts": "2026-07-24T12:00:00.000Z",
  "source": "runtime:codex",
  "kind": "specialist.started",
  "subject": "core:security-reviewer",
  "causationId": "evt_...",
  "correlationId": "mis_...",
  "payload": {}
}
```

Un sequencer local unique attribue `seq` aux événements concurrents. `seq` est monotone dans un
run. Les reducers sont idempotents par `eventId`. Les lignes invalides sont isolées et signalées,
pas silencieusement avalées.

### 10.3 Preuve

Une preuve de commande contient au minimum :

- commande normalisée ;
- exit code ;
- début, fin et durée ;
- runtime et outil ;
- hash du diff ;
- nœuds affectés ;
- résumé de sortie borné et redacted ;
- emplacement de l'artefact complet si nécessaire.

Une preuve de revue contient :

- spécialiste et version de contrat ;
- inputs et context hash ;
- verdict ;
- findings structurés ;
- limites et outils manquants.

### 10.4 Invalidation

Le ProjectGraph relie diff, passes et preuves. Une modification invalide seulement :

- les preuves dont l'input change ;
- leurs dépendants ;
- les verdicts qui les utilisent.

Un changement de CSS ne relance pas une migration. Un changement d'autorisation invalide sécurité,
tests concernés et QA du parcours.

## 11. Mission Control self-hosted

### 11.1 Rôle

Mission Control est la projection opérateur du système, pas sa source de vérité. Il conserve
l'identité holographique/3D actuelle, mais la fiabilité du flux et l'accessibilité précèdent le
polish.

### 11.2 Vues

1. **Live Mission** - timeline, DAG, agents, états, blockers et flux réel.
2. **Team Graph** - spécialistes, responsabilités, invocations et résultats.
3. **Consumption** - tokens, temps, cache, coût et niveau de confiance.
4. **Quality & Evidence** - quality floor, findings, preuves et exceptions.
5. **History & Replay** - reconstruction déterministe d'un run.
6. **Catalog & Extensions** - capacités installées, actives, certifiées et provenance.

### 11.3 Protocole live

Le serveur reste local en loopback avec CORS restrictif. Il expose :

- snapshot initial ;
- deltas ordonnés ;
- SSE avec champ `id` ;
- reprise via `Last-Event-ID` ;
- backfill borné ;
- heartbeat ;
- état explicite de gap.

La surface est read-only par défaut. Un token de session local protège les flux non publics. Toute
future action mutable exige un contrat distinct, une protection CSRF et une confirmation
proportionnée.

L'interface affiche sans ambiguïté :

- `LIVE` ;
- `RECONNECTING` ;
- `STALE` ;
- `REPLAY` ;
- `PARTIAL` ;
- `OFFLINE`.

Une animation 3D ne se déclenche que sur un événement réel. Une vue 2D accessible et une timeline
mobile fournissent la même information. `prefers-reduced-motion` est respecté.

### 11.4 Scope de cette spec

Cette spec verrouille les contrats de données, les vues et les invariants. Le design x10 de
Mission Control fera l'objet d'un brainstorming et d'une spec UI dédiés avant sa refonte.

## 12. Enforcement portable

### 12.1 Node runner

Les contrôles cross-runtime migrent vers un runner Node portable :

- protocole stdin/stdout JSON versionné ;
- règles pures testables ;
- wrappers runtime de moins de 100 lignes ;
- aucun `jq`, `sed`, Bash avancé ou shell spécifique requis ;
- timeouts, limites de taille et erreurs explicites ;
- aucune sortie `console.log` hors logger du projet.

Les scripts shell conservés doivent être strictement runtime-spécifiques ou de compatibilité.

### 12.2 Deux étages

1. **Inline** - garde au moment de l'action lorsque le runtime le permet.
2. **CI floor** - replay déterministe des invariants critiques, indépendant du runtime.

La profondeur réellement disponible est déclarée par adapter. `ci-only` ne peut pas être affiché
comme équivalent à une garde inline.

### 12.3 Installation transactionnelle

```text
stage
  -> compile canonical contracts
  -> smoke runtime assets
  -> doctor postconditions
  -> atomic swap
  -> receipt
```

Un échec conserve l'installation précédente. Le receipt liste les fichiers possédés et permet une
suppression ou un rollback ciblé sans toucher aux fichiers utilisateur.

## 13. Self-host et dogfood

### 13.1 Commande

Dans le dépôt void-harness :

```text
void-harness self-host sync
void-harness self-host doctor
```

`sync` compile les sources courantes vers une staging `.void/generated/`, exécute les smokes, puis
matérialise atomiquement les assets natifs Claude et Codex dans des chemins gitignored possédés par
le harness. Un receipt contient le hash source exact.

`doctor` vérifie :

- que les assets générés correspondent au source hash ;
- que les deux runtimes peuvent découvrir les conducteurs et spécialistes ;
- que les hooks réels se déclenchent ;
- que le dépôt exécute le même contract que celui qui sera packagé ;
- que Mission Control lit les événements courants.

### 13.2 Progression

Le dogfood passe par :

1. `shadow` - observation sans blocage ;
2. `warn` - écarts visibles ;
3. `enforce` - quality floor local ;
4. `release-gate` - aucun release si self-host ou artefact packagé diverge.

void-harness est le premier fixture réel. Declik, Sesame et Solaar deviennent ensuite des fixtures
de conformance et de non-régression, sans copier leurs règles spécifiques dans le core.

## 14. Extensions tierces

La v3 prépare le seam, pas une marketplace.

Une extension peut contribuer :

- spécialistes ;
- conducteurs/skills ;
- profils ;
- politiques ;
- adapters ;
- extracteurs de graphe ;
- évaluations ;
- assets Mission Control.

Chaque extension déclare :

- namespace et version ;
- provenance et licence ;
- permissions fichiers, réseau, processus et secrets ;
- compatibilité runtime ;
- migrations de schéma ;
- procédures de suppression ;
- preuves de certification disponibles.

Règles :

- aucun hook implicite ;
- aucune exécution à l'installation ;
- permissions deny-by-default ;
- collision de namespace bloquée ;
- politique core non affaiblie sans exception explicite ;
- mode code-only/local privilégié ;
- suppression guidée par receipt.

Le registre public, la signature et l'expérience de découverte sont différés jusqu'à ce que le
contrat d'extension soit éprouvé localement.

## 15. Défaillances et recovery

### 15.1 Politique générale

- Fail closed sur qualité, sécurité, preuves et intégrité.
- Fail soft sur dashboard, visualisation et services optionnels.
- Reprise idempotente depuis le dernier événement et les receipts.

### 15.2 Agent indisponible

1. retry unique avec contexte réduit si l'échec est transitoire ;
2. remplacement par un spécialiste du même niveau ;
3. exécution séquentielle seulement si l'indépendance n'est pas essentielle ;
4. `blocked` sinon.

`team` et `fortress` exigent de vrais subagents pour les revues indépendantes. Une simulation
séquentielle par le même contexte ne peut pas porter le même label.

### 15.3 Outil indisponible

| Outil/capacité | Comportement |
|---|---|
| Browser/Playwright requis | bloque la preuve UI |
| DAST requis en fortress/prelaunch | bloque la preuve sécurité |
| Graphify | fallback ProjectGraph natif puis source |
| ProjectGraph stale/partiel | fallback recherche et lecture source |
| moteur PDF pour un livrable PDF | bloque ce livrable |
| Linear/GitHub | bloque seulement l'action externe |
| donnée de coût absente | valeur `unknown`, jamais zéro |

### 15.4 Live

Un gap de séquence déclenche :

1. backfill depuis le dernier `eventId` ;
2. snapshot si le backfill est trop ancien ;
3. état `PARTIAL` si la continuité ne peut être prouvée.

## 16. Certification Lab

### 16.1 Quatre niveaux

1. **Déterministe, chaque PR**
   - schémas, graphes, compilation, hooks, install, rollback, state reducers.
2. **Conformance runtime**
   - vrais Claude Code et Codex ;
   - discovery, subagents, hooks, permissions, événements et erreurs.
3. **Efficacité spécialiste**
   - avec/sans spécialiste ;
   - sensitivity test ;
   - cas adversariaux ;
   - qualité, omissions, faux positifs et coût.
4. **Dogfood réel**
   - void-harness, Declik, Sesame, Solaar ;
   - missions représentatives et régressions enregistrées.

### 16.2 États

Une capacité traverse :

```text
available -> installed -> verified -> observed -> effective -> certified
```

- `verified` : structure et smoke passent ;
- `observed` : utilisée sur un run réel ;
- `effective` : amélioration mesurée sur les cellules déclarées ;
- `certified` : conformance, efficacité et artefact release sont tous valides.

Les cellules restent explicites par runtime, version de contrat et classe de tâche.

### 16.3 Gates release

La release est bloquée si :

- un spécialiste change sans évaluation correspondante ;
- un adapter ne passe plus la conformance ;
- un hook annoncé ne se déclenche pas ;
- un scénario rouge obtient un faux vert ;
- un graphe stale est présenté comme courant ;
- le self-host est rouge ;
- l'artefact packagé diffère des sources certifiées ;
- la qualité régresse au-delà du seuil ;
- le coût régresse sans décision documentée.

### 16.4 UX subjective

La certification UX combine :

- contrôles déterministes accessibilité et performance ;
- screenshots d'états et viewports définis ;
- critique indépendante ;
- échantillonnage humain sur les décisions de goût.

Un juge LLM seul ne peut pas certifier une qualité visuelle top 5 %.

## 17. Critères de succès

### 17.1 Honnêteté

- 0 faux vert sur le corpus de blockers critiques.
- 100 % des passes obligatoires ont un état et une preuve d'applicabilité.
- 100 % des preuves affichées sont reliées au diff courant.
- aucun coût inconnu n'est présenté comme exact ou nul.

### 17.2 Portabilité

- init Claude-only, Codex-only et multi-runtime sans `gh`, marketplace, `jq`, Python ou Bun.
- même mission canonique et mêmes invariants sur Claude et Codex.
- ajout d'un adapter sans modification du Mission Engine.
- hooks de base testés sur macOS, Linux et Windows supportés par Node.

### 17.3 Qualité

- aucune omission critique sur les suites architecture, migration, sécurité, QA et UX.
- amélioration statistiquement visible dans les evals avec/sans spécialiste.
- TDD observé sur les comportements frontend et backend des fixtures.
- le label top 5 % reste absent tant que le benchmark de référence ne le prouve pas.

### 17.4 Efficience

- au moins 30 % de réduction de contexte sur les tâches complexes éligibles au ProjectGraph.
- aucune régression de précision supérieure à 5 % hors cas critiques.
- aucune perte de quality floor en mode `fast`.
- coût par spécialiste attribué avec sa source et son niveau de confiance.

### 17.5 Opérations

- live reconnectable sans doublon ni trou silencieux.
- reprise d'une mission interrompue sans répéter un side effect validé.
- rollback d'installation complet sur le périmètre possédé.
- self-host vert obligatoire avant release stable.

## 18. Rollout

Cette spec est un contrat de programme, pas l'autorisation d'un plan monolithique. Chaque phase est
une tranche livrable avec son plan revu. Une phase qui introduit un comportement non verrouillé ici
repasse par une spec dédiée. Mission Control conserve explicitement son brainstorming UI séparé.

### Phase 0 - spec mère et décisions

- approuver cette architecture ;
- produire les decision logs qui la verrouillent ;
- décomposer le programme en plans et tranches verticales.

### Phase 1 - truth foundation

- unifier événements, preuves, états et coûts ;
- corriger les faux positifs de `doctor` et `status` ;
- établir receipts, invalidation et postconditions honnêtes.
- rendre les ADR conflict-free et supprimer l'écriture d'un index partagé par les workers.

### Phase 2 - portability foundation

- rendre l'init account-free ;
- remplacer le socle shell/`jq` par le Node runner ;
- fiabiliser adapters et rollback Claude/Codex.

### Phase 3 - Mission Engine

- contrats canoniques ;
- classifieur risque/applicabilité ;
- DAG, modes, budgets et recovery ;
- migration de `ticket-runner` vers une orchestration prouvée.

### Phase 4 - virtual team

- contrats spécialistes ;
- agents natifs Claude et Codex ;
- UX/UI double-pass ;
- sécurité, QA, architecture, data/migration, observabilité ;
- évaluations comportementales initiales.

### Phase 5 - Graph v3

- quatre couches de graphes ;
- ProjectGraph natif ;
- Context Compiler ;
- import/benchmark Graphify ;
- attribution de coût corrigée.

### Phase 6 - Certification Lab

- conformance runtime réelle ;
- adversarial et sensitivity evals ;
- gates release et manifest certifié.

### Phase 7 - self-host et consommateurs

- dogfood void-harness ;
- fixtures Declik, Sesame, Solaar ;
- shadow, warn, enforce, release-gate.

### Phase 8 - Mission Control x10

- brainstorming UI dédié ;
- données live fiables ;
- vues opérateur ;
- amélioration 3D, 2D accessible et mobile.

### Phase 9 - ecosystem seam

- SDK local d'extension ;
- permissions et receipts ;
- modules Graphify et autres ;
- marketplace différée.

La livraison commence en `3.0.0-alpha` sur le self-host, passe en beta sur les trois consommateurs,
puis en release candidate avant stable. Aucun big bang ne remplace la v2 sans preuve.

## 19. TDD par phase

| Phase | Mode | Raison |
|---|---|---|
| Truth foundation | strict | contrats, reducers, faux verts |
| Portability | strict | installation et sécurité |
| Mission Engine | strict | machine d'état et politiques |
| Specialist prose initiale | souple + behavioral eval | signal principalement comportemental |
| Runtime agents | strict sur compilation, conformance réelle | drift runtime |
| ProjectGraph | strict + benchmark | exactitude et performance |
| Mission Control data | strict | reprise et séquences |
| Mission Control visuel | souple + screenshots + QA | qualité perceptuelle |
| Extensions | strict + adversarial | frontière de confiance |

Tout comportement frontend suit red-green-refactor au même titre que le backend.

## 20. Hors périmètre initial

- marketplace publique d'extensions ;
- proxy LLM universel ;
- support immédiat de tous les runtimes ;
- remplacement de Git, des test runners ou de l'observabilité du projet ;
- exploitation offensive d'une cible externe sans autorisation ;
- visualisation x10 avant fiabilisation des données ;
- algorithmes de graphe avancés sans benchmark ;
- stockage binaire ou base embarquée sans preuve qu'ils battent JSON/JSONL ;
- auto-écriture de doctrine depuis la télémétrie ;
- suppression des skills experts existants avant preuve de redondance.

## 21. Risques et réponses

| Risque | Réponse |
|---|---|
| orchestration plus chère que le gain | modes, budgets, graphes, eval coût/qualité |
| quinze agents deviennent une cérémonie | applicabilité prouvée et contexte à la demande |
| consensus artificiel | responsabilités séparées, reviewer frais, arbitrage par preuve |
| faux sentiment de sécurité | DAST/pentest explicite, état degraded/blocked, faux verts gate |
| graphe incorrect | provenance, confiance, staleness et fallback source |
| dépendance à Claude ou Codex | contrat canonique et conformance adapters |
| dépendance à Graphify | coeur natif, importer optionnel |
| plugin tiers malveillant | permissions, namespace, provenance, pas de hook implicite |
| dashboard joli mais faux | événements séquencés et états de connexion explicites |
| prompt bloat | conducteurs courts, spécialistes internes, Context Compiler |
| top 5 % invérifiable | label conditionné à un benchmark publié et reproductible |

## 22. Décisions à journaliser après approbation

Cette spec implique au minimum des decision logs séparés pour :

1. le Mission Engine déterministe pilotant une équipe multi-agent ;
2. les trois modes et leur quality floor commun ;
3. le contrat canonique YAML/JSON/JSONL ;
4. ProjectGraph natif avec Graphify optionnel ;
5. fail-closed qualité et fail-soft visualisation ;
6. self-host comme release gate ;
7. runtime-owned models, sans proxy LLM core ;
8. spécialistes read-only et single-writer par tranche ;
9. certification obligatoire avant le label top 5 %.
10. un fichier immuable par ADR sans compteur ni index partagé.

## 23. Références de conception

- Codex subagents :
  `https://learn.chatgpt.com/docs/agent-configuration/subagents`
- Anthropic, building effective agents :
  `https://www.anthropic.com/engineering/building-effective-agents`
- Graphify :
  `https://github.com/Graphify-Labs/graphify`
- Graphify, how it works :
  `https://github.com/Graphify-Labs/graphify/blob/v8/docs/how-it-works.md`
- Graphify, architecture :
  `https://github.com/Graphify-Labs/graphify/blob/v8/ARCHITECTURE.md`
