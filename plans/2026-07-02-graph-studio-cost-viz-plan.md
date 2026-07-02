---
title: graph studio cost viz (sub-project C)
date: 2026-07-02
status: done
spec: docs/specs/2026-07-02-graph-studio-cost-viz.md
author: Folpe + Claude
high_risk: false
---

# Plan — graph studio cost viz (sub-project C)

## Goal

Afficher le coût dans le studio 3D : une couche `cost` calquée sur `analysis` recolore les nœuds
par leur flag de coût dominant, et le panneau du nœud affiche ses lignes de coût. Le coût
(`CostReport`, réutilisé du kernel) est plombé dans `StudioData` aux deux producteurs — statique au
build (`prepare-data`), réel en server-fed (`graph live`). Aucune logique de coût neuve. Le ticking
live et l'encodage par magnitude sont différés.

## Slices

- **C-1** (steps 1-3) — chemin data : cost dans StudioData + index + lignes panneau. Le coût est
  visible dans le panneau, end-to-end, avant tout encodage visuel.
- **C-2** (step 4) — couche visuelle : flag dominant → couleur, toggle dans les controls.

## Steps

### Step 1 — `StudioData.cost` + index par nodeId

- **Goal**: ajouter `cost?: CostReport` à `StudioData` et un helper pur `indexCost(report) →
  Map<nodeId, CostRow>` pour le lookup.
- **Depends on**: none
- **TDD mode**: strict (le helper d'index) + souple (le champ de type)
- **Verification gate**: `pnpm -F @voidcorp/graph-studio test` (nouveau helper) + `typecheck` verts.
- **Expected commits**:
  - `test(graph-studio): indexCost maps rows by nodeId`
  - `feat(graph-studio): StudioData.cost (CostReport) + indexCost helper`
- **Notes**: `apps/graph-studio/src/data/types.ts` (ou load.ts) `import type { CostReport, CostRow }
  from '@voidcorp/harness-graph'`. `indexCost` dans `src/data/cost.ts` : Map des rows, tolérant à
  `undefined` (retourne map vide). Cas : row présente, nodeId absent, report undefined.

### Step 2 — Producteurs : cost au build (static) + en live (full)

- **Goal**: `prepare-data.ts` calcule `analyzeCost` static-only → `cost.json` ; `graph live` câble
  le trio transcripts + `analyzeCost` → `studioDataJson.cost`.
- **Depends on**: [step-1]
- **TDD mode**: souple
- **Verification gate**: `prepare-data` écrit un `cost.json` static-only valide ; `graph live` inclut
  `cost` dans `/studio-data.json` (smoke réel : curl montre un objet cost). Suites CLI + studio +
  `graph:check`/`check-bundle` verts.
- **Expected commits**:
  - `feat(graph-studio): prepare-data computes static-only cost`
  - `feat(cli): graph live serves cost in studio-data (real when transcripts present)`
- **Notes**: build-time = `analyzeCost(model, parseActivations(readIfExists('.void/activations.jsonl')),
  {})` (aucune dépendance cli, static-only). `loadData()` importe `cost.json`. Server-fed : réutilise
  `readSessionCosts`/`loadPricing`/`parseActivations` déjà présents dans `graph.ts` (sous-cmd cost).
  Rebuild model + void-graph.mjs si le graphe change (prepare-data/graph.ts ne sont pas des nœuds ;
  mais activations peut faire varier — vérifier `graph:check`).

### Step 3 — Lignes coût dans le panneau + câblage index

- **Goal**: `renderPanel` reçoit l'index coût et affiche les lignes du nœud (invocations, static
  tokens, real tokens/$/cache% en full, flags) ; `main.ts` dérive l'index au boot et le passe.
- **Depends on**: [step-2]
- **TDD mode**: souple + vérif exploratoire
- **Verification gate**: studio build OK ; clic sur un nœud avec row → lignes coût affichées ; nœud
  sans row → panneau propre sans coût. `pnpm -F @voidcorp/graph-studio typecheck` + test verts.
- **Expected commits**:
  - `feat(graph-studio): cost lines in the node panel`
- **Notes**: `renderPanel(panel, model, overlays, node, costIndex)` — signature étendue. Rendu DOM
  impératif comme l'existant. Absence de row = pas de section coût (dégradation propre).

### Checkpoint A — après Step 3

Le chemin data est complet : le coût arrive dans le studio (2 producteurs) et s'affiche dans le
panneau. Stop. `harness:verification-before-completion`. Attendre le signal avant la couche visuelle.

### Step 4 — Couche `cost` (flag dominant → couleur)

- **Goal**: `costStyleForFlags` (pur) + `applyCostStyling` (miroir `applyAnalysisStyling`) + `'cost'`
  dans `LayerName`/`LAYERS`/`defaultViewState` + effet dans `main.ts onChange`.
- **Depends on**: [step-3]
- **TDD mode**: strict (mapping) + exploratoire (rendu 3D)
- **Verification gate**: `costStyleForFlags` testé (priorité dead>expensive>underused>low-yield,
  sans flag/row → neutre) ; activer la couche recolore les nœuds par flag, les couches existantes
  inchangées (vérif visuelle). typecheck + test + `graph:check`/`check-bundle` verts.
- **Expected commits**:
  - `test(graph-studio): costStyleForFlags dominant-flag priority`
  - `feat(graph-studio): cost layer recolors nodes by dominant cost flag`
- **Notes**: `costStyleForFlags(flags) → color` dans `scene/encode.ts` (à côté de `colorForType`),
  palette calquée sur les `DIM_*` de `render/graph.ts`. `applyCostStyling(costIndex)` dans
  `render/overlays.ts` (miroir `applyAnalysisStyling`). `'cost'` : `scene/select.ts` (LayerName +
  defaultViewState), `ui/controls.ts` (LAYERS), `main.ts` (onChange → handle.setView + swap builder).
  Mutuellement exclusif avec `analysis` ? Non — les couches se composent ; documenter l'ordre de
  priorité de styling si cost + analysis sont toutes deux ON (dernière gagne, comme l'existant).

## Review checkpoints

- **Checkpoint A** — après Step 3 (chemin data complet, avant la couche visuelle).

## Done criteria (feeds verification-before-completion)

1. Couche `cost` ON → nœuds recolorés par flag dominant ; morts/coûteux/sous-utilisés ressortent.
2. Panneau d'un nœud avec row → coût affiché (statique + réel/$/cache en full + flags).
3. `graph live` sert `cost` réel dans `/studio-data.json` ; build sert le coût statique.
4. `cost` absent / nœud sans row → dégradation propre, jamais d'erreur.
5. Non-régression : couches existantes inchangées ; suites + drift gates verts.

## Resume point

**Next step**: Step 1 (`StudioData.cost` + indexCost)

**Completed**: none

**Pending**:
- ⏳ Step 1 — StudioData.cost + indexCost (strict/souple)
- ⏳ Step 2 — producteurs cost (build static + live full) (souple)
- ⏳ Step 3 — lignes coût panneau + câblage (souple) → Checkpoint A
- ⏳ Step 4 — couche cost flag→couleur (strict/exploratoire)
