---
title: graph studio cost viz (sub-project C)
date: 2026-07-02
status: approved
author: Folpe + Claude
related:
  - docs/specs/2026-07-01-graph-cost-profiler.md
  - docs/specs/2026-07-01-graph-consumer-delivery.md
  - docs/specs/2026-06-26-harness-graph-viz.md
---

# graph studio cost viz (sub-project C)

## Contexte

Troisième volet de l'initiative graph self-optimization (A cost profiler → B consumer delivery →
C viz). A a livré `analyzeCost` + `CostReport` (`packages/harness-graph/src/cost/`). B a livré le
studio consommateur server-fed. C **affiche le coût dans le studio 3D** pour rendre lisibles les
composants qui ne gagnent pas leur place (morts, sous-utilisés, coûteux) — le but de l'initiative.

Le coût n'est aujourd'hui **pas** dans le studio : `StudioData` = `{model, findings, usage,
workflows}`, aucun champ cost ; ni `prepare-data.ts` (build) ni le `studioDataJson` de `graph
live` (server-fed) ne calculent le coût. Le rendu encode taille=√lignes, couleur=type ; le seul
encodage par métrique existant est le halo `usage.counts` (`haloForCount`). Il existe une couche
`analysis` qui recolore les nœuds par finding (`applyAnalysisStyling`) — C la calque.

## Périmètre (décidé)

**Couche coût (flags) + panneau coût.** Une couche `cost` calquée sur `analysis` recolore les
nœuds par leur flag de coût dominant ; le panneau du nœud affiche ses lignes de coût. Le coût est
plombé dans `StudioData` aux deux producteurs.

**Hors périmètre (follow-up) :** le **ticking live du coût** (accumulateur par nœud au fil des
activations SSE) — déféré. L'encodage par magnitude (rampe de coût sur taille/couleur) — écarté au
profit des flags (miroir analysis), plus fidèle au but trim/tune.

## Décisions verrouillées (brainstorm 2026-07-02)

1. **Encodage = flags seuls**, miroir de la couche `analysis` : couleur par flag dominant
   (dead/dead-hook → rouge, expensive → magenta vif, underused → ambre, low-yield → atténué,
   sans flag → neutre), taille inchangée.
2. **Métrique = réel quand dispo (mode full), fallback statique** — c'est `analyzeCost` qui le
   décide (comme `graph cost`). Le studio ne recalcule rien.
3. **`StudioData.cost?: CostReport`** — le type kernel réutilisé tel quel (le studio dépend déjà de
   `@voidcorp/harness-graph`), indexé par `nodeId` côté studio.

## Architecture

`analyzeCost` (déjà testé) tourne chez les **producteurs** ; le studio est un pur consommateur du
`CostReport`. La couche `cost` swap le styling des nœuds (patron `applyAnalysisStyling`), le panneau
lit la row du nœud. Aucune logique de coût neuve.

```
producteurs → StudioData.cost (CostReport)
  → indexé par nodeId côté studio
  → couche 'cost' ON : applyCostStyling (flag dominant → couleur)  |  panneau : lignes coût
```

## Composants

1. **`StudioData.cost`** (`apps/graph-studio/src/data/{types,load}.ts`). Ajoute `cost?: CostReport`
   (import type depuis `@voidcorp/harness-graph`). Un index `Map<nodeId, CostRow>` dérivé une fois
   au boot pour le lookup O(1) (rendu + panneau).

2. **Producteur build-time** (`apps/graph-studio/scripts/prepare-data.ts`). Calcule
   `analyzeCost(model, parseActivations(readIfExists('.void/activations.jsonl')), {})` en
   **static-only** (pas de lecture de transcripts → aucune dépendance au paquet cli, cohérent avec
   le snapshot dev), écrit `src/generated/cost.json`. Importé statiquement par `loadData()`.

3. **Producteur server-fed** (`packages/cli/src/commands/graph.ts`, sous-cmd `live`). Câble
   `readSessionCosts(cwd)` + `parseActivations` + `loadPricing` + `analyzeCost` (le même trio que
   la sous-cmd `cost`) et ajoute `cost` à `studioDataJson`. C'est là que le consommateur obtient son
   **coût réel** (mode full quand des transcripts existent).

4. **Couche `cost`** (`apps/graph-studio/src/scene/select.ts` + `ui/controls.ts` +
   `render/overlays.ts`). `'cost'` ajouté à `LayerName`, aux `LAYERS` (checkbox), à
   `defaultViewState().layers` (off par défaut). Nouveau `applyCostStyling(costIndex)` miroir de
   `applyAnalysisStyling` : recolore chaque nœud par son flag dominant (priorité
   dead > expensive > underused > low-yield ; sans flag ou sans row → neutre atténué). Palette
   calquée sur les `DIM_*` de `render/graph.ts`.

5. **Panneau coût** (`apps/graph-studio/src/ui/panel.ts`). `renderPanel` reçoit le cost index et,
   si le nœud a une row, ajoute des lignes : invocations, static tokens, real total tokens + $/sess
   + cache% (mode full), flags. Absent proprement sinon.

6. **Câblage** (`apps/graph-studio/src/main.ts`). Passe le cost index à `createGraph` et
   `renderPanel` ; branche l'effet de la couche `cost` dans `renderControls.onChange` (patron `live`/
   `analysis`).

## Flux de données

`analyzeCost` (build: static-only ; live: full) → `StudioData.cost: CostReport` → `Map<nodeId,
CostRow>` au boot → couche ON: `applyCostStyling` (flag → couleur) ; clic nœud: lignes coût dans le
panneau.

## Gestion d'erreurs

- **`cost` absent** (undefined — producteur n'a rien calculé) → couche `cost` no-op (styling par
  défaut conservé), panneau sans lignes coût. Jamais d'erreur.
- **Nœud sans row** (`pack`, nœuds synthétiques `orchestrator`/`group`, ou hors
  `COMPONENT_TYPES`) → neutre dans la couche, pas de lignes panneau.
- **Mode static-only** (pas de transcripts) → flags toujours utiles (dead/underused) ; colonnes
  réelles ($/tokens/cache) omises du panneau.
- **Volume insuffisant** (`sufficient:false`) → le `CostReport` reste exploitable (flags statiques) ;
  la couche fonctionne, le panneau note le mode.

## Approche de test

| Cible | Mode | Notes |
|---|---|---|
| `costStyleForFlags` (flag dominant → couleur, pur) | **strict** | priorité des flags, sans flag → neutre, row absente → neutre |
| index `Map<nodeId,CostRow>` (helper pur) | souple | jointure, nœud absent |
| `prepare-data` cost static-only | souple | écrit cost.json, static-only shape |
| `graph live` cost dans studioDataJson | souple | + smoke réel (cost présent dans /studio-data.json) |
| couche `cost` + panneau (rendu 3D/DOM) | exploratoire/visuel | vérif navigateur, pas de test unitaire de rendu |

Aucune logique kernel neuve : `analyzeCost` et `CostReport` sont réutilisés tels quels.

## Phases

- **C-1** — cost dans `StudioData` aux deux producteurs + index + lignes coût dans le panneau.
  Chemin data visible (le panneau affiche le coût). *Souple + strict (index/mapping).*
- **C-2** — couche `cost` : `costStyleForFlags` + `applyCostStyling` + `'cost'` dans controls/state +
  câblage `main.ts`. Visuel. *Strict (mapping) + exploratoire (rendu).*

## Critères de succès

1. Dans le studio (build ou server-fed), activer la couche **cost** recolore les nœuds par flag de
   coût dominant ; les nœuds morts/coûteux/sous-utilisés ressortent, les neutres s'atténuent.
2. Le panneau d'un nœud avec une row affiche son coût (invocations, static tokens, + réel/$/cache en
   mode full, flags).
3. `graph live` sert `cost` (réel quand transcripts présents) dans `/studio-data.json` ; le build
   sert le coût statique.
4. `cost` absent ou nœud sans row → dégradation propre (no-op / neutre), jamais d'erreur.
5. Non-régression : couches structure/analysis/flow/workflows/live inchangées ; suite complète +
   drift gates verts.
