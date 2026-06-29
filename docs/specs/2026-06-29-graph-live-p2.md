# Spec — graph live (P2) : télémétrie enrichie (M6) + vue live/replay (M7)

- **Date** : 2026-06-29
- **Statut** : approuvé et livré (2026-06-29) — voir `plans/2026-06-29-graph-live-p2-plan.md`
- **Auteur** : Florent + Claude (brainstorming)
- **Related** : `docs/specs/2026-06-26-harness-graph-viz.md` (§8 télémétrie + live, §12 jalons M6/M7) ; `plans/2026-06-26-harness-graph-studio-plan.md` ; `plans/2026-06-26-harness-graph-kernel-plan.md` (Task 17 amorce M6)

## 1. Intention

Construire le calque « is » du harness-graph : le flux d'activations temps réel. On
**voit** les nœuds (skills, agents, workflows) s'allumer à mesure que le harness
travaille, et on **rejoue** l'historique avec un scrubber. C'est le socle qui répond,
plus tard (M8), à « quels composants ne tirent jamais ? ».

Increment unique, ordre imposé : **M6 enrichi d'abord** (capturer la donnée), **puis
M7** (la transporter et la rendre).

## 2. Décision de reconnaissance — correction du `kind` enum

La spec mère §8 énumérait `kind: skill|agent|hook|workflow`. Cette spec **corrige** :
le meter enregistre `kind: skill | agent | workflow | tool` — **pas `hook`**.

**Pourquoi** : un hook `PreToolUse` observe des *outils*, jamais des *hooks*. Logger
« quel hook a tiré » imposerait à chaque hook de s'auto-logger (méta-logging fragile,
N fichiers à maintenir). À la place le meter enregistre les **situations** (chaque
tool-use + son contexte fichier sous `kind: tool`) ; « ce hook aurait-il dû tirer ? »
se **dérive** en M8 en croisant les situations contre les matchers déclarés du hook
(le modèle tient les triggers ; le log tient les situations). Plus robuste, et c'est
exactement ce que demande la question « lesquels ne tirent jamais ».

## 3. Périmètre

**Inclus :**
- M6 : meter universel `PreToolUse *` → `.void/activations.jsonl` enrichi (kind +
  `trigger.fileGlobs[]/ext[]`), absorbant l'actuel `skill-usage-meter`.
- M7 : `void-harness graph live` (serveur SSE, données seulement) + calque live +
  replay scrubber dans le studio.

**Hors périmètre (explicite) :**
- Tout-en-un : `graph live` servant le `dist/` du studio (incrément packaging dédié ;
  le contrat HTTP ci-dessous est conçu comme un sur-ensemble pour zéro rework).
- Analyse comportementale M8 « should-have-fired » (on **amorce la donnée**, on ne la
  calcule pas).
- Hachage des chemins dans `trigger.fileGlobs` (réservé ; relativisation seule en P2).

## 4. Architecture (4 phases)

```
Phase A — M6 : meter universel (shell)
  packages/core/hooks/activation-meter.sh   (PreToolUse *)  -- absorbe skill-usage-meter
        | append-only, best-effort, exit 0 toujours
        v
  .void/activations.jsonl   { ts, kind, name, event, trigger:{tool,fileGlobs[],ext[]}, sessionId }
  .void/usage.log           (conserve pour kind=skill -- audit + halos studio)

Phase B — M7 transport : graph live SSE (CLI, node:http, zero dep)
  void-harness graph live [--port] [--log]
     GET /model.json   le modele
     GET /history      historique borne (scrubber replay)
     GET /events       SSE: tail de activations.jsonl -> event: activation
  (contrat = sur-ensemble du futur tout-en-un ; GET / -> dist ajoute plus tard, non cassant)

Phase C — studio core pur (vitest)
  scene/live.ts     buildActivationIndex(model), nodeIdForActivation, frameAt(events,cursor,window)
  ui/live-state.ts  reducer scrubber (mode live|replay, cursor, playing, speed)

Phase D — studio shell (smoke build)
  render/live.ts    EventSource -> buffer -> pulse emissif via frameAt (respecte reduced-motion)
  ui/scrubber.ts    timeline DOM play/pause/scrub/speed/live-toggle
  + 5e calque 'live' dans le LayerName existant
```

## 5. Le mouvement de qualité central — une fonction pure pour live ET replay

`frameAt(events, cursorMs, windowMs) -> Map<nodeId, intensity 0..1>` (decay exponentiel
par demi-vie).

- **Live** = curseur épinglé à « maintenant », avance auto, nourri par le flux SSE.
- **Replay** = curseur détaché, balaye `/history`.

Même calcul, deux pilotes. Le calque allume nœuds (et arêtes incidentes) selon
`intensity`. Testable à 100 % sans WebGL.

## 6. Contrat de données

Event d'activation (une ligne JSONL) :

```
{ ts: string, kind: 'skill'|'agent'|'workflow'|'tool', name: string,
  event: string, trigger: { tool: string, fileGlobs: string[], ext: string[] },
  sessionId: string }
```

- `name` : forme « bare » (ex. `tdd`, `code-explorer`). Skill : `tool_input.skill //
  .name // .command`. Agent (Task) : `tool_input.subagent_type // 'claude'`. Workflow :
  `tool_input.name // 'inline'`. Tool : le `tool_name`.
- `trigger.fileGlobs` : chemins relativisés à la racine repo extraits de
  `tool_input.file_path` / `.path` / `.pattern` (best-effort) ; `ext` : extensions
  dérivées. **Jamais de contenu de fichier, jamais de secret.**

Mapping activation -> nœud (pur) : `(kind,name) -> nodeId` par préfixe
(`agent->agent:`, `workflow->workflow-def:`). `kind=skill` couvre skills **et**
slash-commands (tous deux passent par l'outil `Skill`) : il résout vers `skill:<name>`
ou, à défaut, `command:<name>` selon le nœud qui existe dans le modèle. `kind=tool` ne
mappe aucun nœud (situation pure, réservée M8). Tolérant : nom inconnu -> ignoré.

## 7. Flux de données

`tool call -> activation-meter.sh -> activations.jsonl -> graph live (tail) -> SSE
/events -> render/live -> frameAt -> pulse`.
Replay : `/history -> scrubber -> frameAt -> pulse`.

## 8. Erreurs & cas limites

- `activations.jsonl` absent -> `/history` vide, SSE ouvert, studio affiche « en
  attente d'activité ».
- Ligne JSONL malformée -> ignorée (parse tolérant).
- Déconnexion SSE -> EventSource reconnecte ; le serveur ré-attache le tail à la fin
  courante (pas de doublon ; le passé vient de `/history`).
- `prefers-reduced-motion` -> pas d'animation de pulse, état binaire allumé/éteint.
- Hook : best-effort, n'allonge jamais la session, `exit 0` toujours.
- CORS : le serveur autorise l'origine dev du studio (studio servi séparément).

## 9. Tests

- **M6** (Phase A) : vitest pipe des stdin mockés (Skill, Task->agent, Workflow, Edit
  avec `file_path`, fallback sans jq) -> 1 ligne JSONL bien formée, bon
  `kind`/`name`/`trigger`, `usage.log` toujours écrit pour Skill, `exit 0` toujours.
- **Phase B** : helpers purs `parseActivationLine`, découpe-lignes-par-offset -> vitest
  strict. Serveur HTTP/SSE -> smoke + run manuel.
- **Phase C** : `buildActivationIndex`, `nodeIdForActivation`, `frameAt` (decay/fenêtre),
  reducer scrubber -> vitest strict.
- **Phase D** : shell (HTTP client, EventSource, Three.js, scrubber DOM) -> smoke build
  + run manuel, jamais unit-WebGL (spec mère §11).

## 10. Modes TDD par phase

- A : **souple** (hook shell, testé par comportement stdin->fichier).
- B : **strict** sur helpers purs, **souple** sur le shell HTTP.
- C : **strict** (cœur pur, le joyau testable).
- D : **exploratory/souple** (rendu WebGL + DOM, smoke build).

## 11. Contraintes de packaging / doctrine

- Meter universel : un seul hook remplace `skill-usage-meter.sh` (renommé
  `activation-meter.sh`), réenregistré sur `PreToolUse *` dans le settings template, et
  **mirroré** dans `packages/cli/core-assets` (asset-mirror gate). `usage.log` conservé
  pour compat audit + halos studio.
- `graph live` : `node:http` natif, **zéro dépendance** ajoutée au CLI.
- `apps/graph-studio` reste privé/non publié (le live se connecte via `VITE_LIVE_URL`).
- `.void/activations.jsonl` déjà gitignored ; rester opt-in et best-effort.
