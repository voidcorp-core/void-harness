---
title: graph live (P2) — M6 télémétrie enrichie + M7 vue live/replay
date: 2026-06-29
status: in-progress
spec: docs/specs/2026-06-29-graph-live-p2.md
author: Florent + Claude
high_risk: false
---

> **Pour les workers agentiques :** SOUS-SKILL REQUIS — `superpowers:executing-plans`
> (séquentiel, checkpoints) pour ce plan. Les étapes suivent une numérotation ; cocher
> au fur et à mesure et mettre à jour la section *Resume point*.

## Goal

Construire le calque « is » du harness-graph : capturer un flux d'activations enrichi
(M6, meter universel `PreToolUse *` → `.void/activations.jsonl`), le transporter via un
serveur SSE data-only (`void-harness graph live`), et le rendre dans le studio en temps
réel **et** en replay scrubbé — les deux pilotés par une unique fonction pure
`frameAt`. Ordre imposé : M6 d'abord (la donnée), puis M7 (le transport et le rendu).
Hors périmètre : tout-en-un CLI servant le `dist` studio, et le calcul M8
« should-have-fired » (on amorce la donnée, on ne la calcule pas).

## Découpage en tranches verticales

- **Tranche A (M6)** : le meter écrit des activations enrichies sur disque — testable de
  bout en bout (lancer un outil → une ligne JSONL bien formée).
- **Tranche B (M7 live mince)** : le plus petit chemin live de bout en bout — `graph
  live` sert `/events` SSE, le studio allume un nœud à l'arrivée. Coupe à travers
  CLI + cœur pur + rendu.
- **Tranche C (M7 replay)** : `/history` + scrubber → rejouer le passé, par-dessus le
  `frameAt` de la tranche B.

---

## Tranche A — M6 : meter universel d'activations

### Step 1 — Écrire `activation-meter.sh` + son test de comportement

- **Goal** : un hook unique, branché plus tard sur `PreToolUse *`, qui append une ligne
  JSONL enrichie à `.void/activations.jsonl` pour chaque outil, et conserve la ligne
  `usage.log` pour `kind=skill`.
- **Depends on** : none
- **TDD mode** : souple (hook shell, testé par comportement stdin → fichier)
- **Fichiers** :
  - Créer : `packages/core/hooks/activation-meter.sh`
  - Créer : `packages/core/hooks/activation-meter.test.ts`
  - Supprimer (absorbé) : `packages/core/hooks/skill-usage-meter.sh`
- **Contrat de sortie** (une ligne JSONL) :
  ```
  { ts, kind: 'skill'|'agent'|'workflow'|'tool', name, event,
    trigger: { tool, fileGlobs: string[], ext: string[] }, sessionId }
  ```
  Classification par `tool_name` : `Skill→skill` (name = `tool_input.skill // .name //
  .command`), `Task→agent` (name = `tool_input.subagent_type // 'claude'`),
  `Workflow→workflow` (name = `tool_input.name // 'inline'`), sinon `tool` (name =
  `tool_name`). `trigger.fileGlobs` = chemins relativisés à la racine repo depuis
  `tool_input.file_path // .path // .pattern` (best-effort) ; `ext` = extensions
  dérivées. **Jamais de contenu, jamais de secret.** Quand `kind=skill`, append AUSSI la
  ligne historique `usage.log` (`TS<TAB>name`). `exit 0` toujours ; jq absent → fallback
  ligne minimale (kind/name/tool seuls).
- **Test (table-driven, `spawnSync` bash, temp `CLAUDE_PROJECT_DIR`)** : pour chaque
  payload mocké sur stdin — (a) Skill → 1 ligne `kind:"skill"` + 1 ligne `usage.log` ;
  (b) Task → `kind:"agent"`, name = subagent_type ; (c) Workflow → `kind:"workflow"` ;
  (d) Edit avec `file_path` → `kind:"tool"`, `trigger.fileGlobs` relativisé + `ext` ;
  (e) sans jq dans le PATH → fallback bien formé, pas de crash ; (f) tout payload →
  `exit 0`.
- **Verification gate** : `pnpm vitest run packages/core/hooks/activation-meter.test.ts`
  vert ; `shellcheck packages/core/hooks/activation-meter.sh` propre (si dispo).
- **Expected commits** :
  - `test(graph-live): activation-meter ecrit un JSONL enrichi par outil`
  - `feat(graph-live): meter universel d'activations (absorbe skill-usage-meter)`
- **Notes** : best-effort total (`|| true`, `set -euo pipefail` mais sorties redirigées).
  Le hook tourne sur CHAQUE appel d'outil → garder minimal (un `jq` par appel, pas de
  boucle). Relativisation : `${path#"$ROOT"/}`.

### Step 2 — Réenregistrer le hook, mirrorer, rebuild le modèle, MAJ refs

- **Goal** : brancher `activation-meter.sh` sur `PreToolUse *`, retirer l'ancien
  enregistrement, propager dans le mirror et le modèle, MAJ la doc qui le cite.
- **Depends on** : [step-1]
- **TDD mode** : souple (wiring config + assets)
- **Fichiers** :
  - Modifier : `packages/core/.claude-plugin/plugin.json` (entrée `PreToolUse` matcher
    `*` → `activation-meter.sh` ; retirer l'entrée `skill-usage-meter` ; MAJ le compte de
    hooks dans `description`)
  - Modifier : `packages/core/skills/harness-evolution/SKILL.md`,
    `packages/core/commands/void-audit.md` (référence au meter renommé)
  - Régénérer : `packages/cli/core-assets/**` via `pnpm --filter @voidcorp/harness
    build:assets`
  - Régénérer : `packages/harness-graph/model.json` via `node` `graph build` (le nœud
    `hook:skill-usage-meter` devient `hook:activation-meter`)
- **Verification gate** : `jq . packages/core/.claude-plugin/plugin.json` valide ;
  `node packages/cli/dist/... graph check` (ou `pnpm --filter @voidcorp/cli build` puis
  `graph check`) **passe** (modèle à jour, pas de route cassée) ; `git status
  packages/cli/core-assets` montre le hook renommé.
- **Expected commits** :
  - `feat(graph-live): brancher activation-meter sur PreToolUse * + mirror + modele`
- **Notes** : le rebuild du modèle est **obligatoire** sinon `graph check` (gate CI)
  échoue sur dérive. Vérifier qu'aucun autre hook ne dépendait du nom
  `skill-usage-meter`. `usage.log` reste la source de `void-audit` (inchangé).

### Checkpoint A — après Step 2

L'utilisateur vérifie : lancer une session courte, confirmer que
`.void/activations.jsonl` se remplit avec des kinds variés (skill/agent/tool) et que
`usage.log` continue d'être écrit pour les skills. Lancer
`harness:verification-before-completion`. Attendre le signal avant la tranche B.

---

## Tranche B — M7 : live mince (une activation, de bout en bout)

### Step 3 — Cœur pur CLI : parsing + tail-par-offset

- **Goal** : helpers purs pour transformer le fichier append-only en events.
- **Depends on** : [step-1] (contrat d'event)
- **TDD mode** : strict
- **Fichiers** :
  - Créer : `packages/cli/src/lib/graph-live.ts`
  - Créer : `packages/cli/src/lib/graph-live.test.ts`
- **Interfaces (pures)** :
  - `parseActivationLine(line: string): ActivationEvent | null` — JSON tolérant + valide
    la forme (kind ∈ union, name string, trigger objet) ; ligne vide/malformée → `null`.
  - `splitNewLines(buf: string): { lines: string[]; rest: string }` — découpe un buffer
    accumulé en lignes complètes, renvoie le reste partiel (pour le tail incrémental).
- **Test** : parse d'une ligne valide → event typé ; ligne tronquée → `null` ; buffer
  `"a\nb\npar"` → `{ lines:['a','b'], rest:'par' }` ; buffer sans `\n` → `{ lines:[],
  rest:buf }`.
- **Verification gate** : `pnpm vitest run packages/cli/src/lib/graph-live.test.ts` vert ;
  `tsc --noEmit` propre.
- **Expected commits** :
  - `test(graph-live): parse + tail-par-offset purs`
  - `feat(graph-live): helpers purs de lecture du flux d'activations`
- **Notes** : ces helpers sont réutilisés par le shell SSE (Step 5) ET `/history`
  (Step 8). Aucune I/O ici.

### Step 4 — Cœur pur studio : index + frameAt

- **Goal** : le joyau testable — mapping activation→nœud et la fonction unique qui
  pilote live ET replay.
- **Depends on** : [step-1] (contrat d'event ; le studio redéfinit son propre type,
  voir Notes — pas de dépendance au code CLI)
- **TDD mode** : strict
- **Fichiers** :
  - Créer : `apps/graph-studio/src/scene/live.ts`
  - Créer : `apps/graph-studio/src/scene/live.test.ts`
- **Interfaces (pures)** :
  - `buildActivationIndex(model: GraphModel): ActivationIndex` — map `(kind,name)` →
    nodeId par préfixe (`agent→agent:`, `workflow→workflow-def:`) ; `kind=skill` résout
    `skill:<name>` ou à défaut `command:<name>` ; `kind=tool` → aucun nœud.
  - `nodeIdForActivation(index, ev): string | null` — tolérant (nom inconnu → null).
  - `frameAt(events: readonly Lit[], cursorMs: number, windowMs: number): Map<string,
    number>` où `Lit = { nodeId: string; ts: number }` ; intensité = decay exponentiel
    (demi-vie = `windowMs/2`) des events dans `[cursor-window, cursor]`, clampée 0..1 ;
    déterministe, pas de `Date.now()`.
- **Test** : index résout skill/agent/workflow/command + ignore tool et inconnus ;
  `frameAt` → event exactement au curseur ≈ 1 ; event à `cursor-window` ≈ 0 ;
  monotonie décroissante avec l'ancienneté ; événements hors fenêtre exclus ;
  déterminisme (même entrée → même sortie).
- **Verification gate** : `pnpm vitest run apps/graph-studio/src/scene/live.test.ts`
  vert ; `pnpm --filter @voidcorp/graph-studio typecheck` propre.
- **Expected commits** :
  - `test(graph-live): index activation->noeud + frameAt (live/replay unifies)`
  - `feat(graph-live): coeur pur du calque live (frameAt unique)`
- **Notes** : définir le type `ActivationEvent`/`Lit` côté studio dans `live.ts` (le
  studio ne dépend pas du CLI). `frameAt` consomme des `Lit` déjà mappés → garder le
  mapping ts(string ISO)→ms hors de `frameAt` (helper `toLit(index, ev): Lit | null`).

### Step 5 — Shell CLI : sous-commande `graph live` (SSE data-only)

- **Goal** : `void-harness graph live` sert `/model.json` + `/events` (SSE tail).
- **Depends on** : [step-3]
- **TDD mode** : souple (shell HTTP, smoke + run manuel)
- **Fichiers** :
  - Modifier : `packages/cli/src/commands/graph.ts` (branche `sub === 'live'`)
- **Comportement** : `node:http` natif (zéro dep). Args `--port` (def. 4317) `--log`
  (def. `.void/activations.jsonl`). Routes : `GET /model.json` → le modèle sérialisé ;
  `GET /events` → `Content-Type: text/event-stream`, header CORS
  `Access-Control-Allow-Origin: *`, et tail du fichier (poll taille toutes ~500ms ou
  `fs.watch`) → pour chaque nouvelle ligne complète (`splitNewLines` + `parseActivationLine`)
  émettre `event: activation\ndata: <json>\n\n`. À la connexion : ne réémet PAS le passé
  (réservé `/history`, Step 8) — attache le tail à la fin courante du fichier. Fichier
  absent → SSE ouvert, aucun event. Heartbeat commentaire `: ping\n\n` toutes ~15s pour
  garder la connexion.
- **Verification gate** : `pnpm --filter @voidcorp/cli build` puis smoke manuel :
  démarrer `graph live`, `curl -s :4317/model.json | jq .nodes[0]` OK ; `curl -N
  :4317/events &` puis `echo '<event valide>' >> .void/activations.jsonl` → l'event
  apparaît dans le flux.
- **Expected commits** :
  - `feat(graph-live): graph live -- serveur SSE data-only (model + events)`
- **Notes** : source-driven — relire l'API `node:http` / SSE pour la version Node
  installée. Nettoyer les watchers/timers à la fermeture de connexion (pas de fuite).
  `allow-console` cohérent avec le style existant de `graph.ts`.

### Step 6 — Shell studio : calque live (EventSource → pulse)

- **Goal** : un 5e calque `live` qui s'abonne au flux et fait pulser les nœuds.
- **Depends on** : [step-4, step-5]
- **TDD mode** : souple/exploratory (WebGL + DOM, smoke build)
- **Fichiers** :
  - Modifier : `apps/graph-studio/src/scene/select.ts` (ajouter `'live'` à `LayerName`
    + `defaultViewState`)
  - Modifier : `apps/graph-studio/src/ui/controls.ts` (entrée `LAYERS`)
  - Créer : `apps/graph-studio/src/render/live.ts`
  - Modifier : `apps/graph-studio/src/main.ts` (wiring)
  - Modifier : `apps/graph-studio/src/ui/state.test.ts` si `defaultViewState` y est
    asserté (garder vert)
- **Comportement** : `render/live.ts` ouvre un `EventSource(VITE_LIVE_URL + '/events')`
  (def. `http://localhost:4317`), accumule les `Lit` via `toLit`, et à chaque frame
  applique `frameAt(now)` pour piloter l'émissif/echelle des nœuds (et arêtes
  incidentes). `prefers-reduced-motion` → pas d'animation, binaire allumé/éteint.
  Calque off → fermer l'EventSource (pas de connexion inutile).
- **Verification gate** : `pnpm --filter @voidcorp/graph-studio typecheck` + `build`
  propres ; tests purs studio toujours verts ; run manuel : `graph live` + `pnpm dev`,
  activer le calque live, déclencher une activité (lancer un skill) → le nœud
  correspondant pulse.
- **Expected commits** :
  - `feat(graph-live): calque live studio -- EventSource + pulse via frameAt`
- **Notes** : `VITE_LIVE_URL` via `import.meta.env`. Ne pas casser les calques existants
  (structure/analyse/flow/workflows). Documenter la variable dans
  `apps/graph-studio/README.md`.

### Checkpoint B — après Step 6

Live de bout en bout vérifié (déclencher → voir s'allumer). L'utilisateur valide le
ressenti (pulse, decay, lisibilité) avant d'investir dans le replay. Lancer
`harness:verification-before-completion`.

---

## Tranche C — M7 : replay scrubber

### Step 7 — Cœur pur studio : reducer scrubber

- **Goal** : l'état pur du scrubber (live vs replay, curseur, lecture, vitesse).
- **Depends on** : [step-4]
- **TDD mode** : strict
- **Fichiers** :
  - Créer : `apps/graph-studio/src/ui/live-state.ts`
  - Créer : `apps/graph-studio/src/ui/live-state.test.ts`
- **Interfaces (pures)** :
  - `type LiveMode = 'live' | 'replay'` ; `interface LiveState { mode: LiveMode; cursorMs:
    number; playing: boolean; speed: number }` ; `defaultLiveState(): LiveState` ;
    `liveReducer(state, action): LiveState` avec actions `play|pause|seek(ms)|setSpeed(n)
    |toLive|toReplay(atMs)|tick(deltaMs)` (tick avance le curseur de `delta*speed` en
    replay quand `playing`).
  - `clampCursor(ms, range): number` (bornes [minTs, maxTs]).
- **Test** : seek borne le curseur ; toLive remet mode=live ; tick en pause = no-op ;
  tick en replay×2 avance de 2·delta ; setSpeed clampé (>0).
- **Verification gate** : `pnpm vitest run apps/graph-studio/src/ui/live-state.test.ts`
  vert ; typecheck propre.
- **Expected commits** :
  - `test(graph-live): reducer scrubber (live/replay/seek/speed)`
  - `feat(graph-live): etat pur du scrubber`
- **Notes** : aucune DOM, aucun timer ici — le `tick` est piloté par le shell.

### Step 8 — Shell CLI : endpoint `/history`

- **Goal** : exposer l'historique borné pour alimenter le scrubber.
- **Depends on** : [step-3, step-5]
- **TDD mode** : souple
- **Fichiers** :
  - Modifier : `packages/cli/src/commands/graph.ts` (route `GET /history`)
- **Comportement** : `GET /history` → lit le fichier log, `splitNewLines` +
  `parseActivationLine` sur tout, renvoie un JSON `ActivationEvent[]` borné (def. derniers
  5000, override `--history-max`), CORS ouvert. Fichier absent → `[]`.
- **Verification gate** : build CLI ; smoke : `curl -s :4317/history | jq 'length'`
  renvoie un nombre ; lignes malformées exclues.
- **Expected commits** :
  - `feat(graph-live): endpoint /history borne pour le replay`
- **Notes** : borne pour éviter de charger un log énorme d'un coup ; documenter la limite.

### Step 9 — Shell studio : scrubber timeline

- **Goal** : la barre de replay (play/pause/scrub/vitesse/toggle live) qui pilote le
  même calque via `frameAt`.
- **Depends on** : [step-6, step-7, step-8]
- **TDD mode** : souple/exploratory (DOM, smoke build)
- **Fichiers** :
  - Créer : `apps/graph-studio/src/ui/scrubber.ts`
  - Créer : `apps/graph-studio/src/ui/scrubber.css` (ou bloc dans `styles.css`)
  - Modifier : `apps/graph-studio/src/render/live.ts` (consommer `/history` + l'état
    replay pour choisir `cursorMs` ; en live cursor=now, en replay cursor=state.cursorMs)
  - Modifier : `apps/graph-studio/src/main.ts` (monter le scrubber quand calque live ON)
- **Comportement** : au passage en replay, fetch `GET /history` une fois → bornes
  [minTs,maxTs] ; la timeline DOM scrub le curseur ; play/pause/vitesse via `liveReducer`
  + un `tick` rAF ; toggle live revient au flux temps réel. Style HUD cohérent
  (palette holographique). `prefers-reduced-motion` respecté (pas d'auto-play forcé).
- **Verification gate** : typecheck + `build` studio propres ; tests purs verts ; run
  manuel : avec de l'historique, scruber dans le passé → les bons nœuds s'allument selon
  le curseur ; play rejoue ; toggle live reprend le flux.
- **Expected commits** :
  - `feat(graph-live): scrubber de replay timeline (live/replay unifies via frameAt)`
- **Notes** : réutiliser strictement `frameAt` (Step 4) — aucune logique d'intensité
  dupliquée dans le scrubber.

### Step 10 — Doc & clôture

- **Goal** : refléter la livraison dans la doc et journaliser la décision non-évidente.
- **Depends on** : [step-9]
- **TDD mode** : souple (doc)
- **Fichiers** :
  - Modifier : `docs/specs/2026-06-26-harness-graph-viz.md` (cocher M6/M7 livrés, noter
    la déviation `kind` enum référant cette spec)
  - Modifier : `docs/DECISIONS.md` (entrée 2026-06-29 : `kind=tool` plutôt que `hook`
    — hook-firing dérivé des situations, pas auto-loggé ; + SSE data-only sur-ensemble
    du tout-en-un ; + `frameAt` unique live/replay)
  - Modifier : `apps/graph-studio/README.md` et le README CLI / aide `graph` (sous-cmd
    `live`, `VITE_LIVE_URL`, endpoints)
- **Verification gate** : `pnpm test` global vert ; `graph check` passe ; `pnpm lint`
  propre ; relecture doc.
- **Expected commits** :
  - `docs(graph-live): journaliser kind=tool + SSE data-only + frameAt ; MAJ jalons`
- **Notes** : meta-rule CLAUDE.md — toute décision non-évidente avec alternative
  crédible va dans `docs/DECISIONS.md` (ici la déviation du `kind` enum).

---

## Review checkpoints (récap)

- **Checkpoint A** — après Step 2 (M6 capture vérifiée sur disque).
- **Checkpoint B** — après Step 6 (live de bout en bout vérifié).

## Critères de « Done »

- `pnpm test` + `graph check` + `pnpm lint` verts.
- `.void/activations.jsonl` enrichi (kinds variés, `trigger.fileGlobs/ext`), `usage.log`
  préservé pour les skills.
- `void-harness graph live` sert `/model.json`, `/events` (SSE), `/history`.
- Studio : calque live (pulse temps réel) + scrubber de replay, pilotés par `frameAt`,
  respectant `prefers-reduced-motion`.
- DECISIONS.md et jalons M6/M7 à jour.

## Resume point

**Next step** : Step 1 (Écrire `activation-meter.sh` + son test de comportement)

**Completed** : aucun.

**Pending** :
- ⏳ Step 1 — activation-meter.sh + test
- ⏳ Step 2 — réenregistrer + mirror + rebuild modèle
- ⏳ Step 3 — cœur pur CLI (parse + tail)
- ⏳ Step 4 — cœur pur studio (index + frameAt)
- ⏳ Step 5 — graph live (SSE)
- ⏳ Step 6 — calque live studio
- ⏳ Step 7 — reducer scrubber
- ⏳ Step 8 — endpoint /history
- ⏳ Step 9 — scrubber timeline
- ⏳ Step 10 — doc & clôture
