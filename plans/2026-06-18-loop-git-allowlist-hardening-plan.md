---
title: harden the backlog-loop git + allowlist gates (issue #17 cluster A)
date: 2026-06-18
status: in-progress
spec: docs/specs/2026-06-18-loop-git-allowlist-hardening.md
author: Florent Pellegrin + Claude
high_risk: true
---

## Goal

Durcir les gates git/allowlist de `autonomous-backlog-loop` face aux conditions réelles
(issue #17 cluster A) : **A1** rendre impossible le clobber d'une branche protégée (hook
pre-push + `git switch -c` + push refspec explicite + `push.default current`), **A2**
isoler chaque worker dans son worktree, **A3** rendre `source-driven-development` satisfiable
hors-ligne sans ouvrir l'egress, **A4** autoriser un sous-ensemble git non-destructif. Sans
affaiblir le deny-by-default.

Tranches par valeur de sécurité décroissante et indépendance : le hook de garde (autonome,
testable) d'abord, puis l'isolation worktree, puis les couches allowlist/prompt/skill.

---

## Steps

### Step 1 — Hook `block-protected-push.sh` + test (A1, cœur sécurité)

- **Goal**: un hook PreToolUse qui bloque tout `git push` dont la cible résolue est `main`/`master`, sauf `AUTO_MERGE=1`.
- **Depends on**: none
- **TDD mode**: souple (shell)
- **Verification gate**: test shell — stdin JSON `git push origin HEAD:refs/heads/main` → exit 2 ; `git push` nu avec upstream `origin/main` → exit 2 ; push de feature-branch → exit 0 ; `AUTO_MERGE=1` → exit 0. `node --check`/`bash -n` OK ; anti-bloat « shell syntax: all hooks » passe.
- **Expected commits**:
  - `test: block-protected-push hook refuses pushes resolving to a protected branch`
  - `feat: block-protected-push PreToolUse hook`
- **Notes**: ≤ 100 lignes. Parse le tool-call JSON (jq) ; résout la cible via la commande + `git rev-parse @{u}` ; précis (jamais bloquer une feature-branch). Fichier `packages/core/hooks/block-protected-push.sh`.

### Step 2 — Worktree par ticket dans l'orchestrateur (A2) + `push.default` (A1)

- **Goal**: chaque itération s'exécute dans un worktree dédié ; le worker (cwd = worktree) crée sa branche dedans ; HEAD du repo principal jamais touché.
- **Depends on**: none (parallélisable avec Step 1)
- **TDD mode**: souple
- **Verification gate**: test faux-claude étendu — l'orchestrateur crée un worktree, passe son chemin en cwd, pose `push.default current` dedans, nettoie après, et le HEAD du repo principal est intact ; une branche committée par le faux worker survit au `worktree remove`.
- **Expected commits**:
  - `test: orchestrator isolates each iteration in its own worktree`
  - `feat: per-ticket git worktree isolation for the loop`
- **Notes**: branche temp sans upstream (désamorce A1). Échec `worktree add` → die clair. Compose avec le pattern worktree de `backlog-batch` (pas d'extraction commune — YAGNI).

### Step 3 — Câbler le hook pre-push dans les settings du run (A1)

- **Goal**: l'orchestrateur ajoute une entrée `hooks.PreToolUse` (matcher Bash) au settings du run, pointant le hook bundlé.
- **Depends on**: [step-1, step-2]
- **TDD mode**: souple
- **Verification gate**: test — le settings écrit par l'orchestrateur contient l'entrée `hooks.PreToolUse` avec le chemin du hook ; le chemin résolu (`<cli>/core-assets/hooks/block-protected-push.sh`) existe après `build:assets`. Smoke : un faux `git push origin HEAD:main` dans le run est bloqué.
- **Expected commits**:
  - `feat: wire block-protected-push into the autonomous run settings`
- **Notes**: chemin résolu depuis les assets bundlés du CLI (linké comme npm). `AUTO_MERGE=1` propagé en env au worker pour le bypass.

### Checkpoint A — après Step 3

Le chemin worker durci (worktree isolé + branche sans upstream + push refspec + hook qui bloque un push vers `main`) est complet et testé. Stop, `harness:verification-before-completion`, attendre le signal.

### Step 4 — `AUTONOMOUS_SETTINGS` : sous-ensemble git non-destructif (A4)

- **Goal**: autoriser `cherry-pick`, `rebase --onto`, `merge --no-ff`, `format-patch`, `apply` ; garder le destructif denié.
- **Depends on**: none
- **TDD mode**: strict
- **Verification gate**: `pnpm test` vert — assertions : les 5 nouvelles entrées sont dans `allow` ; `reset --hard`, `push --force`/`-f` toujours dans `deny` ; pas de `git config`/`git rebase` nu/`git reset` ajoutés.
- **Expected commits**:
  - `test: autonomous allowlist grants the non-destructive git subset only`
  - `feat: allow narrow non-destructive git ops in the autonomous profile`
- **Notes**: étend la surface déjà touchée par le merge MCP (`mcp__linear__*`). Patterns scopés (`Bash(git rebase --onto:*)`, pas `git rebase:*`).

### Step 5 — Prompt worker : création de branche + push sûrs (A1)

- **Goal**: le prompt instruit `git switch -c <prefix><ticket>` (jamais `checkout -b … origin/main`) et `git push -u origin HEAD:refs/heads/<prefix><ticket>`.
- **Depends on**: none
- **TDD mode**: souple
- **Verification gate**: `pnpm test` vert — `renderPrompt` contient `git switch -c` et le push refspec explicite ; pas de `checkout -b` vers un remote.
- **Expected commits**:
  - `test: worker prompt instructs safe branch creation + explicit push refspec`
  - `feat: worker prompt uses git switch -c and explicit push refspec`
- **Notes**: dernière couche A1 (avec hook + worktree). Garde les marqueurs `VOID_EVENT` intacts.

### Step 6 — `source-driven-development` : branche offline (A3)

- **Goal**: section « Offline / no-network » — port injecté, Zod au bord, source-debt (commit + ADR + PR + label `source-debt`).
- **Depends on**: none
- **TDD mode**: souple (doc)
- **Verification gate**: anti-bloat (SKILL ≤ 400, description ≤ 200) ; la section existe et nomme le label `source-debt` ; audit note `plans/skill-audits/source-driven-development.md` mise à jour (ou créée).
- **Expected commits**:
  - `docs(source-driven-development): offline/no-network branch + source-debt label`
- **Notes**: zéro élargissement d'egress (décision A3). Cohérent avec `security-guidance`/`hexagonal`.

### Step 7 — Docs, sync, clôture partielle #17

- **Goal**: entrée `DECISIONS.md` ; `CLAUDE.md`/`AGENTS.md` si une convention change ; core-assets régénéré ; commentaire sur l'issue #17 (cluster A traité, B/C à suivre).
- **Depends on**: [step-1, step-2, step-3, step-4, step-5, step-6]
- **TDD mode**: souple
- **Verification gate**: `pnpm test` vert ; `pnpm version:check` ; `sync:docs` (parité) ; `anti-bloat:check` ; `void-harness doctor` ; aucun marqueur de conflit ; le hook bundlé présent dans core-assets.
- **Expected commits**:
  - `docs: DECISIONS + core-assets + issue #17 cluster A follow-up`
- **Notes**: ne pas fermer l'issue (B/C restent). Commenter le mapping A1-A4 → commits.

---

## Review checkpoints

- **Checkpoint A — après Step 3** : chemin worker durci (worktree + hook pre-push) complet.

## Autoplan

`high_risk: true` (sécurité du loop autonome + frontière git). Lancer `gstack:/autoplan` sur ce
plan **avant** d'exécuter, à la demande de l'utilisateur.

---

## Resume point

**Next step**: autoplan, puis Step 1

**Completed**: —

**Pending**:
- ⏳ Step 1: Hook block-protected-push + test (A1)
- ⏳ Step 2: Worktree par ticket (A2) + push.default (A1)
- ⏳ Step 3: Câbler le hook dans les settings du run (A1) — Checkpoint A
- ⏳ Step 4: Allowlist sous-ensemble git non-destructif (A4)
- ⏳ Step 5: Prompt worker branche/push sûrs (A1)
- ⏳ Step 6: source-driven-development branche offline (A3)
- ⏳ Step 7: Docs, sync, clôture partielle #17
