---
title: La directive permanente, rejouée par UserPromptSubmit
date: 2026-08-20
status: in-progress
spec: docs/specs/2026-08-20-standing-directive.md
ticket:
author: Folpe + Claude
high_risk: false
---

## Goal

Faire porter par le harnais les cinq exigences que le mainteneur réinjecte à la main à
presque chaque demande, en les rejouant à chaque tour par `UserPromptSubmit` — sur les deux
runtimes, reformulées en gestes exécutables, et sans qu'aucune ne suppose un interlocuteur :
le harnais est autosuffisant par défaut, l'humain est un bonus.

`high_risk: false` : le hook injecte du texte et ne bloque rien. Il ne touche ni paiement, ni
authentification, ni donnée de production. Son risque réel est d'être inutile, pas dangereux —
et c'est le checkpoint A qui le juge.

## Ce que le dépôt fournit déjà

Le plan n'invente aucun mécanisme ; il en réutilise un, éprouvé, dont voici les pièces :

| Pièce | Rôle |
| -- | -- |
| `packages/hook-runner/src/lifecycle/context.ts` | `sessionStartOutput()` compose un `hookSpecificOutput.additionalContext`. Modèle exact à suivre. |
| `packages/hook-runner/src/cli.ts:135` | route `lifecycle context <runtime>`. La nouvelle commande s'ajoute à côté. |
| `packages/core/.claude-plugin/plugin.json` | manifeste Claude : événement → matcher → `node _void-hook.mjs …`. |
| `packages/core/codex/hooks.json` | manifeste Codex, même forme, événements sous une clé racine `hooks`. |
| `packages/core/hooks/sessionstart-context.sh` | adaptateur shell de compatibilité, 10 lignes, `exec` vers le bundle Node. |

---

## Steps

### Step 1 — Livrer les quatre exigences inconditionnelles, de bout en bout, sur Claude

- **Goal**: à chaque tour d'une session Claude, le modèle relit quatre gestes exécutables — lire avant d'affirmer, rester dans les conventions du dépôt, refuser la rustine, viser le niveau attendu — et cela survit à une compaction.
- **Depends on**: none
- **TDD mode**: **strict**. C'est du code d'enforcement chargé chez chaque consommateur.
- **Fichiers**:
  - `packages/hook-runner/src/lifecycle/directive.ts` (+ `.test.ts`) — fonction pure `directiveOutput()`, calquée sur `sessionStartOutput()`, rendant `hookSpecificOutput.hookEventName = 'UserPromptSubmit'`.
  - `packages/hook-runner/src/cli.ts` — branche `lifecycle directive`.
  - `packages/core/hooks/userpromptsubmit-directive.sh` — adaptateur, copie conforme de `sessionstart-context.sh`.
  - `packages/core/.claude-plugin/plugin.json` — entrée `UserPromptSubmit`.
- **Contrainte de rédaction**: chaque ligne nomme un geste observable, aucune ne nomme une qualité. « Avant d'affirmer, lis la convention, la décision ou la doc officielle de la version installée » et non « sois rigoureux ». Le texte est du contenu, donc il se relit et se discute au checkpoint A.
- **Verification gate**: `npx vitest run packages/hook-runner/` vert ; `pnpm typecheck` et `pnpm lint` verts ; règle 5 de l'anti-bloat respectée (`bash scripts/anti-bloat-check.sh`) ; **et la preuve d'exécution réelle** — dans une session Claude d'un projet de test, le bloc apparaît au tour 1 et au tour suivant, cité verbatim.
- **Expected commits**:
  - `test(lifecycle): la directive permanente rendue à chaque tour`
  - `feat(lifecycle): rejouer la directive par UserPromptSubmit chez Claude`
- **Notes**: le texte n'est jamais calculé depuis `PHILOSOPHY.md` à l'exécution — lire un fichier du projet à chaque tour ajouterait une I/O par tour et rendrait le rappel dépendant d'un fichier que le projet peut avoir vidé. Le texte est constant, versionné, et le lien vers la doctrine complète est nommé dedans.

### Checkpoint A — après Step 1

Le seul livrable qui se juge à la lecture. Folpe relit les quatre lignes et dit si elles sont
exécutables ou si elles décorent. Un rappel permanent qui ne change rien est pire que rien : il
coûte un tour et ferme la question par erreur.

Arrêt. `verify`. Attendre le signal avant Step 2.

### Step 2 — Étendre la parité à Codex

- **Goal**: un projet consommateur sous Codex reçoit exactement le même rappel, au même moment.
- **Depends on**: [step-1]
- **TDD mode**: **strict**
- **Fichiers**: `packages/core/codex/hooks.json` ; `packages/cli/src/lib/codex-floor.ts` si la compilation du plancher énumère les événements.
- **Verification gate**: le test de parité des manifestes (`packages/core/hooks/codex-parity-hooks.test.ts`) couvre le nouvel événement ; `pnpm derive:check` vert ; `void-harness doctor` vert sur les checks Codex d'un projet de test.
- **Expected commits**: `feat(codex): rejouer la directive par UserPromptSubmit, à parité`
- **Notes**: contrat vérifié dans la doc officielle le 2026-08-20 — `hookSpecificOutput.additionalContext`, événements sous la clé racine `hooks`. Ne pas re-dériver depuis `docs/CODEX.md`, qui est faux (Step 4).

### Step 3 — Livrer la cinquième ligne : résoudre, nommer, ne jamais bloquer

- **Goal**: face à une ambiguïté, le modèle la lève par les moyens du harnais, et si elle subsiste il avance sous hypothèse nommée au lieu de s'arrêter. Vrai en session comme dans un worker.
- **Depends on**: [step-1]
- **TDD mode**: **strict**
- **Cadrage corrigé, à ne pas rouvrir**: une première version conditionnait cette ligne à la présence d'un humain, avec « humain présent » pour défaut. Mauvais sens. **Le harnais est autosuffisant par défaut, l'humain est un bonus.** La ligne ne demande donc aucun marqueur et aucune détection : elle est identique partout. Le seul comportement qu'elle interdit est de **bloquer sur une question**.
- **Fichiers**: `packages/hook-runner/src/lifecycle/directive.ts`.
- **Verification gate**: un test couvre la chaîne complète (l'hypothèse est nommée dans la sortie, l'exécution ne s'interrompt pas) ; un worker `autopilot` lancé sur un ticket volontairement sous-spécifié termine en consignant son hypothèse, sans jamais s'arrêter pour interroger.
- **Expected commits**:
  - `test(lifecycle): une ambiguïté résiduelle devient une hypothèse nommée, pas un arrêt`
  - `feat(lifecycle): résoudre, nommer, ne jamais bloquer`
- **Notes**: supprime le besoin d'un marqueur « humain dans la boucle », qu'aucune variable existante ne portait. Un mécanisme en moins à construire et à maintenir, obtenu en corrigeant le cadrage plutôt qu'en ajoutant du code.

### Step 4 — Corriger `docs/CODEX.md`, qui documente quatre des onze événements

- **Goal**: la documentation du dépôt cesse de faire croire que sept ancrages n'existent pas.
- **Depends on**: none (parallélisable avec 1–3)
- **TDD mode**: **souple** — documentation, aucune logique.
- **Fichiers**: `docs/CODEX.md` (et `CLAUDE.md`/`AGENTS.md` si l'un d'eux reprend la liste).
- **Verification gate**: les onze événements listés, chacun avec sa capacité (bloque / injecte du contexte) et la source citée ; `pnpm sync:docs` vert.
- **Expected commits**: `docs(codex): onze événements de hook, pas quatre`
- **Notes**: c'est cette erreur qui a failli faire concevoir une dégradation Codex inutile. Les sept événements retrouvés (`SessionEnd`, `PermissionRequest`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`) alimentent la carte des ancrages de DEV-650 — les inventorier ici évite de refaire la recherche là-bas.

### Step 5 — Prouver sur un vrai projet consommateur

- **Goal**: la chaîne complète tient dans un projet installé, pas seulement en test unitaire.
- **Depends on**: [step-1, step-2, step-3]
- **TDD mode**: **souple** — vérification, pas de logique nouvelle.
- **Verification gate**: les deux vérifications mécaniques de la spec, citées avec leur sortie :
  1. le rappel est présent au tour 1 et à un tour tardif d'une session longue, compaction comprise ;
  2. un worker sans humain ne s'arrête jamais pour poser une question.
  Plus : `void-harness doctor` vert, et le surcoût par tour mesuré et cité.
- **Expected commits**: `test(dogfood): la directive tient sur un projet installé`
- **Notes**: la preuve se fait sur un projet réel ou fraîchement installé, jamais sur une fixture — l'install réelle a déjà trouvé cinq défauts que 2600 tests verts n'avaient pas vus.

---

## Ce que le plan ne fait pas

- Il ne mesure pas l'effet par une métrique inventée. Le signal est comportemental et il est
  dans la spec : le jour où la consigne n'est plus ajoutée, le harnais la porte. Compter les
  injections prouverait que le hook tire, jamais qu'il agit.
- Il ne touche pas au taux d'activation des skills (1 % mesuré). Problème voisin, cause
  distincte.
- Il ne déplace aucune règle de `PHILOSOPHY.md`. C'est DEV-650, dont ce plan est un cas
  particulier traité en premier parce qu'il est mesuré.

## Resume point

**Next step**: Step 1 (les quatre exigences inconditionnelles, de bout en bout sur Claude)

**Completed**: aucune

**Pending**:
- ⏳ Step 1 — les quatre lignes, hook Claude, preuve en session
- ⏸ Checkpoint A — Folpe relit le texte
- ⏳ Step 2 — parité Codex
- ⏳ Step 3 — résoudre, nommer, ne jamais bloquer
- ⏳ Step 4 — `docs/CODEX.md` : onze événements
- ⏳ Step 5 — preuve sur un projet consommateur
