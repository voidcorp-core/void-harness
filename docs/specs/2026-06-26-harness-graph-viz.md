# Spec — harness-graph: visualisation vivante des skills/agents et de leurs interactions

- **Date** : 2026-06-26
- **Statut** : design approuvé (brainstorm), à transformer en plan d'implémentation
- **Auteur** : Florent + Claude (brainstorming)
- **Sister-doc** : aucune (spec interne, pas de doctrine modifiée ici)

## 1. Intention

Donner au harness un **instrument de pilotage** : une représentation du graphe complet
des composants (skills, agents, hooks, commands, packs, workflows) et de leurs
relations, doublée d'analyses qui révèlent overlaps, conflits, orphelins, trous de
couverture et routes cassées — afin de **décider, améliorer et fine-tuner** le harness.

Ambition à terme (« poussée à l'extrême ») : détecter les **déclenchements manqués**
(« ce skill aurait dû tirer et ne l'a pas fait »). Cette analyse comportementale est
**Phase 2** ; elle exige une télémétrie enrichie que la Phase 1 **amorce** sans encore
l'exploiter.

## 2. Découpage par audience (décision structurante)

| Surface | Audience | Couche de donnée | Livraison |
| --- | --- | --- | --- |
| Structure / analyse | **Mainteneur** (repo void-harness) | le « should » (graphe déclaré + analyses) | repo-interne, non publié |
| Live | **Consommateur** (projet qui installe le harness) | le « is » (flux d'activations temps réel) | embarqué dans le CLI publié (P2) |

**Noyau commun** : un seul modèle de graphe (schéma nœuds/arêtes) partagé. La vue
mainteneur y superpose structure+analyse ; la vue consommateur y superpose un flux
d'events. Même carte, deux calques. Le modèle + le schéma d'event sont le contrat.

## 3. Architecture

```
packages/
  harness-graph/                 # NOYAU — TS pur, source de vérité, publishable (publié en P2)
    src/
      model/                     # schéma nœuds/arêtes (contrat partagé)
      derive/                    # dériveurs déterministes (scan packages/core, packs, agents, hooks)
      relations/                 # chargeur de relations.graph.yaml
      analyze/                   # détecteurs statiques
      build-model.ts             # derive + relations -> model.json
    relations.graph.yaml         # arêtes sémantiques déclarées, curées (evidence par arête)
    model.json                   # SORTIE générée, versionnée, diffable

apps/
  graph-studio/                  # SURFACE MAINTENEUR — Vite + Three.js/D3/GSAP, NON publiée
                                 # charge model.json -> 3D + calques d'analyse + workflow viewer

packages/cli/                    # gagne la commande `void-harness graph` (build|check|audit ; live en P2)
```

**Direction de dépendance** : `derive`/`analyze`/surfaces → `model` ; jamais l'inverse.
Le noyau ne dépend de rien d'externe ; seul `derive` lit le FS, isolé comme un adaptateur
(cohérent hexagonal). Le CLI orchestre, ne porte pas de logique métier (comme `audit.ts`).

## 4. Modèle de graphe (contrat)

**Nœuds** : `skill` (core+pack), `agent`, `hook`, `command`, `pack`, `workflow-def`.
P2 ajoute `workflow-run` et `activation-event` **en surcouche** (hors modèle statique).

Champs nœud : `id`, `type`, `description` (frontmatter), `lines` (anti-bloat),
`pack` d'origine, `source` (chemin).

**Arêtes** :

| `kind` | sens | sourcing |
| --- | --- | --- |
| `routes-to` | hand-off (brainstorming→writing-plans) | **déclaré** |
| `composes` | s'appuie sur sans remplacer | **déclaré** |
| `conflicts` / `overlaps` | collision / ambiguïté de trigger | **dérivé** (analyse) + override déclaré |
| `companion-of` (skill↔hook) | hook qui applique le skill | **dérivé** (convention de nom) |
| `invokes` (agent→skill) | l'agent invoque le skill | **dérivé** (référence explicite) |
| `extends` (pack→core) | le pack étend/surcharge | **dérivé** (overlay de fichiers) |

Champs arête : `from`, `to`, `kind`, `origin: derived|declared`, `evidence`.

## 5. Sourcing hybride + gate CI (confiance)

1. **Dériveur déterministe** : produit les arêtes mécaniques (companion par nom,
   `invokes` par référence, `extends` par overlay, métadonnées frontmatter).
2. **Relations déclarées** (`relations.graph.yaml`) : arêtes sémantiques non
   dérivables, curées, chacune avec une `evidence`.
3. **Gate CI `graph check`** échoue si : (a) une prose « composes with X » sans arête
   déclarée correspondante, ou une arête fantôme ; (b) arête vers un nœud inexistant
   (route cassée) ; (c) `model.json` committé a dérivé (régénération obligatoire, même
   pattern que le check « core-assets in sync »).

Amorçage initial de `relations.graph.yaml` : **une** passe d'extraction LLM puis revue
humaine. L'extraction n'est **jamais** dans le chemin de génération courant
(déterministe seulement).

## 6. Analyses statiques

Chaque détecteur émet `{severity, kind, nodes[], evidence, suggestion}`, consommé par
l'audit CLI **et** affiché en calque 3D.

| Détecteur | Trouve | Déterminisme |
| --- | --- | --- |
| Routes cassées / refs fantômes | arête/prose nommant un nœud inexistant | 100% → **gate CI** |
| Overlap / ambiguïté de trigger | descriptions couvrant les mêmes situations (règle anti-bloat >30%) | déterministe (Jaccard vocabulaire « Use when… ») → **warning**, compose `anti-bloat-check.sh` |
| Orphelins | nœud sans arête, ou skill jamais routé/composé/invoqué et absent de `usage.log` | déterministe + compose `audit.ts` |
| Trous de couverture | zone/situation gouvernée par aucun skill | **heuristique guidée** (signal, pas verdict) |
| Paires attendues manquantes | hook compagnon attendu absent ; pack masquant core sans `extends` | déterministe |
| Cycles de routing | boucle `routes-to` indue | déterministe |

Honnêteté : overlap et trous sont **heuristiques** (lexical, pas sémantique-vérité),
présentés comme « signaux à arbitrer ». Seuls les détecteurs sûrs (routes cassées)
deviennent une **gate CI bloquante**.

## 7. Vue 3D mainteneur (`apps/graph-studio`) -- IMPLEMENTED (Plan B, M4+M5)

> Note: le rendu a évolué de la vue plate force-graph par clusters de pack décrite
> ci-dessous vers une **vue orbitale 3D centrée sur l'orchestrateur** avec divulgation
> progressive (CLAUDE.md au centre, hubs de groupe repliables, focus au clic sur
> l'ego-network). Voir `docs/DECISIONS.md` (2026-06-29) et `apps/graph-studio/README.md`.

- **Stack** : Vite + TS, **3d-force-graph** (Three.js + d3-force), **GSAP** (caméra,
  bursts de particules, transitions de calques). Charge `model.json` + résumé `usage.log`,
  **sans backend** en P1.
- **Encodage** : taille nœud = lignes ; couleur = type ; halo = fréquence d'invocation ;
  clusters spatiaux par pack.
- **Calques** : *Structure* (arêtes filtrables par les 4 familles) ; *Analyse* (halos de
  conflit, orphelins en sourdine, marqueurs de trous, arêtes de tension d'overlap) ;
  *Flux structurel* (particules GSAP le long de `routes-to`/`composes` ; bouton « play
  flow » → impulsion dans une chaîne) ; *Workflows* (nœuds `workflow-def` ; clic →
  sous-vue DAG parallèle/séquentiel/réconciliation ; rejoue un run animé quand des events
  existent, P2).
- **Interaction** : clic → panneau latéral (description, lignes, arêtes, `evidence`,
  flags d'analyse, lien source) ; recherche, filtre, focus caméra.

## 8. Télémétrie enrichie + live consommateur (design P2, amorcé P1)

> **Livré (2026-06-29)** : M6 + M7, voir `docs/specs/2026-06-29-graph-live-p2.md`.
> Déviation assumée vs ci-dessous : le `kind` enregistré est `skill|agent|workflow|tool`
> (pas `hook`) — un hook PreToolUse voit des outils, jamais des hooks ; « ce hook
> aurait-il dû tirer » se dérive des situations (kind=tool) en M8, sans méta-logging.

- **Enrichir** `skill-usage-meter.sh` (+ meters agent/hook/workflow) → event JSONL par
  activation dans `.void/activations.jsonl` (livré sous forme du hook universel
  `activation-meter.sh` sur `PreToolUse *`) :
  ```
  { ts, kind: skill|agent|workflow|tool, name, event: PreToolUse|PostToolUse|…,
    trigger: { tool, fileGlobs[], ext[] }, sessionId, parent? }
  ```
  **Jamais de contenu de fichier, jamais de secret** — chemins/extensions seulement
  (relativisés/optionnellement hachés). Fichier local, **gitignored**, opt-in.
- **Pourquoi ça débloque le « should-have-fired »** : `trigger.fileGlobs` + `event` par
  session permettent de calculer *plus tard*, par session, les skills dont le prédicat de
  trigger matchait mais qui n'ont pas tiré. Le modèle tient les triggers déclarés ; le log
  tient les situations. **P1 livre l'enregistrement**, pas l'analyse.
- **Transport live (P2)** : `void-harness graph live` tail `activations.jsonl` + sert le
  modèle + un flux SSE/websocket ; la vue allume nœuds/arêtes à l'arrivée. **Replay** =
  même vue alimentée par l'historique + scrubber timeline.

## 9. Flux de données

1. `graph build` : derive + relations → `model.json`.
2. `graph check` (CI) : reconstruit, compare au committé, détecteurs déterministes → fail
   sur route cassée / désaccord prose↔déclaration / dérive.
3. `graph audit` : tous détecteurs + `usage.log` (compose `audit.ts`) → rapport.
4. `graph-studio` : `model.json` + résumé usage → 3D.
5. *(P2)* hooks → `activations.jsonl` → `graph live` SSE → calque live.

## 10. Erreurs & cas limites

- `SKILL.md` illisible → finding `malformed-node`, pas de crash.
- Référence vers nœud disparu → route cassée (CI rouge).
- `model.json` dérivé → CI rouge « run graph build ».
- `usage.log` vide → structure seule, sans halo.
- Packs non installés (consommateur) → modèle limité aux nœuds présents.
- Hook télémétrie : best-effort, erreurs avalées (`|| true`), ne bloque jamais la session.

## 11. Tests

- **Noyau** : unit vitest sur derivers (fixtures mini-arbre), loader relations, chaque
  détecteur (table-driven). Déterministe.
- **Gate CI** : fixture avec route cassée → `graph check` exit ≠ 0.
- **Studio** : transforms purs modèle→scène + smoke build (pas le WebGL).
- **Hook télémétrie** : stdin mocké → JSONL bien formé, jamais d'exit ≠ 0.

## 12. Jalons

**Phase 1**
- **M1** noyau : modèle + derive + relations + `graph build` → `model.json`.
- **M2** analyses + `graph check` (gate CI déterministe) + `graph audit` (compose `audit.ts`).
- **M3** amorçage : extraction LLM une fois → `relations.graph.yaml` curé ; commit `model.json`.
- **M4** studio 3D : structure + calques d'analyse + panneau + filtres.
- **M5** flux structurel (GSAP) + workflow-def DAG viewer.
- **M6** ✅ (2026-06-29) amorçage télémétrie : hook universel `activation-meter` `PreToolUse *` → `activations.jsonl` (enregistrement seul), gitignore + opt-in.

**Phase 2**
- **M7** ✅ (2026-06-29) vue live consommateur (`graph live` SSE data-only) + calque live + replay scrubber (studio).
- **M8** ✅ (2026-06-29) analyse comportementale `graph behavior` : dead-node + should-have-fired (triggers déclarés en frontmatter), advisory. Voir `docs/specs/2026-06-29-graph-behavior-m8.md`.

## 13. Décisions ouvertes / risques

- **Lib 3D** : 3d-force-graph retenu (compose Three.js + d3-force, GSAP-friendly) ; à
  reconfirmer au M4 selon perf/contrôle souhaité.
- **Mesure d'overlap** : lexicale en P1 ; une variante embeddings (cachée, hors CI) est
  un upgrade possible — non engagée.
- **Packaging du noyau** : publishable dès le départ mais publié seulement en P2 ; garder
  la frontière propre (zéro dépendance repo-spécifique dans `harness-graph`).
- **Anti-bloat** : `apps/graph-studio` est une app, pas un skill — hors plafond 400 lignes,
  mais découpée en modules focalisés.
