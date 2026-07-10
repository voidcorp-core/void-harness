---
title: backlog-autopilot — drain autonome multi-cluster en session, une PR propre par ensemble logique
date: 2026-06-21
status: in-design
author: Florent Pellegrin + Claude
related:
  - docs/specs/2026-06-18-backlog-batch-parallel.md
  - docs/specs/2026-06-18-backlog-loop-observability.md
  - packages/core/skills/backlog-batch/
  - packages/core/skills/autonomous-backlog-loop/
  - packages/cli/src/lib/backlog/
  - docs/DECISIONS.md
---

## Problème

Deux skills coexistent et se recouvrent :

- `autonomous-backlog-loop` — séquentiel, walk-away, **un `claude -p` hors session** par
  ticket, une PR par ticket. **Défaut rédhibitoire** : hors session, on perd le MCP
  interactif, les connecteurs et l'héritage d'auth de la session.
- `backlog-batch` — attended, parallèle, tickets **indépendants**, une PR d'intégration,
  via un Workflow déterministe.

Aucune des deux ne couvre le besoin réel : draîner un pool Linear **sur plusieurs heures
en autonomie**, en regroupant les tickets en **ensembles logiques** (séquentiel /
parallèle / mix selon les dépendances), en produisant **une PR propre par ensemble**,
revue et (en option) auto-mergée sur `develop`/`main`, **sans conflit**, **en session**
(MCP/abonnement vivants), avec une **hygiène de contexte** qui tient la distance.

Naïvement, un orchestrateur LLM unique qui pilote 20 tickets sur 4 h pourrit son
contexte (context rot) : contraintes oubliées, décisions contradictoires. Le faire bien
suppose : orchestrateur **mince**, workers **jetables** au contexte frais, état durable
sur disque, ordonnancement conscient des dépendances, et des gates de qualité bloquants.

## Décision de fond

**Consolider** `backlog-batch` et `autonomous-backlog-loop` en **une seule** skill,
**`backlog-autopilot`**, lancée **en session**. `autonomous-backlog-loop` est
**supprimé franchement** (skill + commande `/void-backlog-loop` + le code CLI lié au
spawn `claude -p` et au parsing stream-json), pas d'alias déprécié. `backlog-batch` est
absorbé (le mode « batch de tickets indépendants » devient un cas du nouveau système).

Principe directeur : **orchestrateur mince, workers jetables.** L'agent pilote ne lit
jamais un fichier d'implémentation ; tout le contexte lourd vit dans des subagents au
contexte frais qui meurent en fin de ticket. On obtient « une session pilote unique »
*sans* context rot — option 3 (LLM orchestrateur) faite correctement = l'hybride.

## Architecture

Trois couches + un cœur déterministe réutilisé du CLI existant.

```
L0  Launcher (LLM, session principale, MCP/Linear vivants) ── MINCE
      pull pool → clustering (auto-détection) → confirmation (sauf --auto-merge)
      → boucle clusters → récap final
      ▼
L1  Cluster engine (Workflow déterministe JS, un par cluster)
      ordonnance les tickets (tri topologique) → fan-out subagents
      → reconcile → gate → PR
      ▼
L2  Worker pipeline (subagent par ticket, contexte FRAIS, hérite auth → abonnement)
      triage → [brainstorm] → plan → TDD → [passe UX] → review par ticket → COMMIT-ONLY
```

Cœur déterministe (`packages/cli/src/lib/backlog/`) :
`select` · `partition` · `plan` · `integrate` (push/PR/merge/**cascade rebase**) ·
`worktree` · `branch-protection` · `billing` (héritage abonnement) · `mcp` · `summary`.

### Ce qui dégage du CLI

- `orchestrator.ts` (spawn `claude -p`) — supprimé.
- `stream.ts` (parsing stream-json du worker) — supprimé.
- `prompt.ts` (worker prompt embarqué + AUTONOMOUS_SETTINGS) — supprimé ; remplacé par
  le prompt worker porté dans le Workflow / la skill.
- `billing.ts` — la partie env-strip `claude -p` devient « les subagents héritent de
  l'auth de session → abonnement » (rien à stripper, on hérite).

### Ce qui reste (réutilisé, étendu)

`batch-select.ts`, `batch-partition.ts`, `batch-plan.ts`, `integrate.ts`,
`worktree.ts`, `branch-protection.ts`, `mcp.ts`, `summary.ts`, `config.ts`, `render.ts`,
`run.ts`. Logique pure, déjà unit-testée.

## Auto-détection du mode

Entrée (pool) — multi-source, toutes supportées :

1. **Projet / milestone Linear** (frontière naturelle d'un ensemble logique).
2. **Graphe parent-enfant / dépendances-blocages** Linear (lien technique).
3. **Label ou cycle** Linear.
4. **Liste manuelle d'IDs** au lancement.

Analyse de cohérence sur le pool, par ordre de robustesse des signaux :
**graphe de dépendances/blocages Linear** > parenté > labels/cycle > proximité
sémantique titres/descriptions. Puis :

- S'il existe un **ensemble logique** (≥2 tickets liés) → **mode cluster** : 1 cluster =
  1 PR, ordonnancement parallèle/séquentiel/mix selon le graphe.
- Sinon → **mode batch-de-4** : 4 tickets indépendants en parallèle, 1 PR d'intégration
  (l'ancien `backlog-batch`).
- Un run **alterne** librement : plusieurs clusters puis un batch de reliquats.

**Risque à verrouiller** : éviter les faux ensembles. Privilégier les signaux de graphe
Linear ; n'utiliser la proximité sémantique qu'en appoint, jamais seule pour fusionner.

## Pipeline qualité adaptatif par ticket (L2)

Triage (Opus) classe le ticket d'après : complétude de la description, présence de
critères d'acceptation, footprint fichiers estimé, touche-t-il l'UI, risque
(migration / lockfile / sécurité / boundary).

| Classe | Pipeline |
|---|---|
| **trivial** (rename, bump, copie) | plan léger → TDD (souple) → **review par ticket** |
| **standard** | plan → TDD (mode auto par chemin) → [passe UX si UI] → review par ticket |
| **ambigu / risqué** | **brainstorm** (auto-décisions top 5 %, journalisées) → plan → TDD (strict) → [passe UX si UI] → review par ticket |

- **Brainstorm autonome** : déclenché sur manque d'info. Explore 2-3 approches, **choisit
  la meilleure au bar top 5 %** lui-même (zéro HITL), **journalise la décision +
  alternatives rejetées** dans l'état `.void`. Aucun gate bloquant. (Le HITL « spec
  approuvée » est remplacé par les critères d'acceptation du ticket, curés en amont.)
- **Passe UX/UI — statique par défaut** : `frontend-design` (anti-AI-slop) +
  `accessibility-first` (WCAG 2.2 AA) sur le **code**, uniquement si le ticket touche
  l'UI. QA navigateur live (`/design-review`, `/qa`) = **opt-in** (exige une app lancée,
  fragile en run long).
- **TDD** : skill `tdd`, mode auto par chemin. Iron law respecté en strict.
- **Review par ticket** : `code-review` dans le cycle worker (niveau 1, voir §gates).
- **Worker commit-only** : pas de `push` / `gh pr`. Le cœur déterministe pousse + ouvre.

## Réconciliation & gates du cluster (L1)

- **Ordonnancement** : tri topologique du graphe intra-cluster. Indépendants →
  **parallèle**, chacun son **worktree** (isolation *uniquement* là où il y a
  parallélisme réel). Dépendants, ou touchant lockfile / migrations → **séquentiel sur
  la branche du cluster, sans worktree**.
- **Reconcile subagent** : merge des branches vertes dans l'ordre topo sur
  `cluster/<id>` ; résout les conflits en gardant l'intention des deux tickets.
- **Fichiers append-partagés (résolus à l'intégration, pas par les workers)** — la
  partition parallèle/séquentiel ne suffit pas : des branches séquentielles depuis la
  même base collisionnent quand même sur la queue appendée ou les octets régénérés.
  Protocole (cf. skill, section « Shared-append files ») :
  - **Artefacts générés** (`model.json`, `void-graph.mjs`, miroir `core-assets`) — les
    workers ne les commitent PAS ; le reconcile subagent les rebuild **une fois** après
    tous les merges (`graph build` + `build:void-graph` + `copy-core-assets`), gate
    `graph:check` + `graph:check-bundle`. Supprime la plus grosse surface de conflit.
  - **Numéros ADR** — réservés **par ticket au plan time** (max courant sur la base) ;
    fallback : renumérotation déterministe en ordre topo à la réconciliation.
  - **`docs/DECISIONS.md`** — chaque worker n'append que SON bloc ; le reconcile
    **concatène** en ordre topo (jamais de 3-way merge de la queue). Cible durable :
    un-fichier-par-décision + index généré.
  - **Registres** (coverage-matrix, decision-matrix, routing) — lignes distinctes par
    worker ; re-dérivation à la réconciliation sur conflit de ligne réel.
- **Gate avant PR** (tout vert) : `lint` + `typecheck` + **suite complète** +
  `verification-before-completion` (12 points observés, pas supposés).
- **Code-review deux niveaux, bloquante** :
  - **Niveau 1** — par ticket, dans le cycle worker.
  - **Niveau 2** — `/harness:code-review` sur la branche d'intégration.
  - Boucle **review → fix bornée à K passes**. Si non convergence → blocked + rapport.
- **Ticket rouge — décision adaptative « le mieux pour le projet »** : exclure le rouge
  **+ sa descendance dépendante**, livrer les verts ; si le rouge est une **racine** dont
  tout dépend → cluster bloqué (pas de PR), branches préservées, run continue.

## Boucle multi-cluster sur plusieurs heures (L0)

- **Base cible** : `develop` si la branche existe, sinon `main`. (Ici : `develop` existe.)
- **Séquencement par dépendances** entre clusters. Cluster indépendant → branche depuis
  la base. Cluster dépendant d'une PR **non mergée** → **branche depuis cette PR (PR
  stackée)**.
- **`--auto-merge` (opt-in)** : `gh pr merge --auto --squash` ; GitHub merge quand la CI
  passe. **Cascade** sur PR stackées : au merge d'une base, **retarget + rebase
  déterministe** des PR enfants (dans `integrate.ts`). Sans `--auto-merge` → PR posée,
  **HITL au merge**, on enchaîne sans bloquer.
- **Garantie « sans conflit » par construction** : ordre topo + stacking + rebase
  déterministe avant PR. L'auto-merge doit tourner **tout seul**.

**Risque #1 à verrouiller dans le plan** : la cascade auto-merge sur PR stackées
(retarget de base + rebase sans conflit). C'est le point le plus délicat ; tests
déterministes obligatoires.

## Gestion du contexte

- **État machine durable** : `.void/autopilot/<runId>/`
  - `state.json` — pool, clusters, progression, PR ouvertes/mergées, base, curseur.
  - `decisions.md` — journal des choix top-5 % + alternatives rejetées (traçabilité a
    posteriori).
  - `pr/<cluster>.md` — corps de PR (références tickets, dette source, récap décisions).
  - Relu à chaque cycle → **reprise sur crash**.
- L'orchestrateur **reste mince** : entre deux clusters il ne garde que l'état, pas les
  diffs. Les subagents portent le contexte lourd et meurent (≈ `/clear` implicite).
- **Fin de run** : un `/context-save` gstack lisible **pour la session humaine** + un
  récap dense (clusters faits, PR ouvertes/mergées, bloqués + raisons, journal décisions).

## Frontières HITL

- **En amont** : curation du backlog par l'humain = spec approuvée (critères
  d'acceptation des tickets).
- **Au merge** : défaut = HITL au merge ; ou délégué à la **protection de branche + revue
  async** quand `--auto-merge`.
- **Pendant le run** : **zéro HITL.** Traçabilité via le journal de décisions +
  commentaires Linear/PR, réajustables a posteriori.

## Sécurité (héritée, inchangée)

- Hooks `protect-sensitive-files` + `block-dangerous-bash` vivants.
- **Préflight** : protection de branche serveur sur la base (sinon refus de démarrer).
- Workers **commit-only** ; push / PR / merge réservés au cœur déterministe trusté.
- `--dangerously-skip-permissions` sandbox-gated.
- Subagents héritent l'auth de session → **abonnement** (pas d'API à l'usage).
- **Worktree seulement** en parallélisme réel.

## Modèles & coût

**Opus partout** (qualité homogène, bar top 5 %). Déroge à `llm-cost-discipline`
(Sonnet par défaut) ; justifié par run sur **abonnement** (pas API à l'usage) et exigence
de jugement constant. **À logger en DECISION.** Override possible par flag (`--model`).

## Approche de test & modes TDD

- **Cœur CLI (pur)** — TDD **strict** : `select`, `partition`, `plan`, `integrate`
  (push/PR/merge), **cascade-rebase**, `worktree`, `branch-protection`. Helpers purs,
  pas d'I/O.
- **Workflow JS d'orchestration** — tests d'intégration sur fixtures (comme l'existant).
- **Skill `.test.ts`** — conformité anti-bloat : ≤ 400 lignes, `description` ≤ 200 chars,
  frontmatter valide, un seul sujet.

## Rollout phasé (chaque phase mergeable seule)

- **P1 — Consolidation.** Rename → `backlog-autopilot` ; suppression
  `autonomous-backlog-loop` (skill + commande + CLI `claude -p` / stream-json) ; mode
  batch-de-4 conservé/étendu ; docs + DECISIONS dans le **même commit** (meta-règle).
- **P2 — Clustering logique.** Auto-détection du mode ; ordonnancement séquentiel/mix ;
  worktree conditionnel.
- **P3 — Pipeline qualité adaptatif.** Triage ; brainstorm autonome top-5 % ; passe UX
  statique ; review deux niveaux bornée.
- **P4 — Autonomie longue.** Base `develop`/`main` ; PR stackées + auto-merge cascade
  (rebase déterministe) ; état `.void/autopilot` + reprise crash + `/context-save` final.

## Migration / suppression de `autonomous-backlog-loop`

Atomique, sans casser les références :

- Skill `packages/core/skills/autonomous-backlog-loop/` → supprimée.
- Commande `/void-backlog-loop` + entrée CLI `backlog-loop` → supprimées.
- CLI : `orchestrator.ts`, `stream.ts`, `prompt.ts` → supprimés ; `billing.ts` adapté.
- Renommer `packages/core/skills/backlog-batch/` → `backlog-autopilot/` ; commande
  `/harness:backlog-batch` → `/harness:backlog-autopilot` ; CLI `backlog-batch` →
  `backlog-autopilot`.
- Mettre à jour : `CLAUDE.md`, `AGENTS.md` (sync obligatoire même commit),
  `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `README.md`, skill-audits, tests
  référençant les anciens noms.

## Contraintes anti-bloat

- Skill consolidée **≤ 400 lignes** : la doctrine va dans `docs/`, la logique dans le
  CLI, le contrôle dans le Workflow. La skill **route**, elle n'implémente pas.
- `description` frontmatter ≤ 200 chars, auto-discovery précise.
- Pas de recouvrement résiduel : une seule skill backlog après consolidation.

## Risques à verrouiller dans le plan

1. **Cascade auto-merge sur PR stackées** (retarget base + rebase déterministe sans
   conflit) — le plus délicat.
2. **Détection de cohérence** (clustering) — signaux de graphe Linear prioritaires.
3. **Suppression de loop** — migration atomique, zéro référence orpheline.
4. **Anti-bloat** — skill ≤ 400 lignes malgré le périmètre élargi.

## Décisions à journaliser dans `docs/DECISIONS.md`

- 2026-06-21 — Consolidation `backlog-batch` + `autonomous-backlog-loop` →
  `backlog-autopilot` ; suppression du `claude -p` hors-session (perte MCP/abonnement) ;
  orchestrateur hybride en session (mince + Workflow déterministe).
- 2026-06-21 — Auto-détection cluster vs batch-de-4.
- 2026-06-21 — Auto-merge cascade sur PR stackées (base `develop`/`main`).
- 2026-06-21 — Opus partout (dérogation justifiée à `llm-cost-discipline`).

## Révision post-autoplan (2026-06-21) — changements liants

Revue `/autoplan` (CEO + Eng + DX, doubles voix Claude + Codex). Corrections retenues,
qui **remplacent** les passages correspondants ci-dessus :

- **Auto-merge — pas de « cascade déterministe sans conflit ».** Mécanisme infaisable
  sur des stacks **squash-mergées** (`--squash` change le SHA du parent ; GitHub ne
  re-targete pas sans suppression de branche ; le `reconcile` LLM n'est pas
  déterministe). Remplacé par : **merge stacké strictement séquentiel** (attendre le
  parent mergé, rebaser le seul enfant suivant, **gate humain sur conflit**) + machine
  d'états qui **classifie** (conflit/stale/protection/CI/merge-queue) et **bloque
  proprement**. Le mot « garantie » est retiré.
- **Auto-merge risk-gated (UC2).** `--auto-merge` vers `develop`/`main` ne s'arme que
  pour un cluster **low-risk** (petit diff, hors UI/sécurité/migration, chemins possédés,
  pas une racine de stack) ; sinon **PR à merger à la main**. Protection de branche
  **inconnue = FATALE** sous `--auto-merge`.
- **Worktree (T2).** Pas « seulement si parallèle » : **toujours un worktree** — un de
  cluster en séquentiel, un par ticket en parallèle (sûreté crash/dirty-state).
- **Cluster.** Un lien de graphe Linear ne suffit pas à fusionner : exiger un **overlap
  de footprint fichiers** corroborant + cap de taille + score de confiance + split.
- **Crash-resume.** Écritures **atomiques** + **réconciliation de l'état distant**
  (`gh pr list`, SHA, PR, base, checks) au lieu de rejouer le curseur ; actions externes
  idempotentes.
- **Orchestrateur mince.** Contrat **machine-readable** des sorties worker (protocole
  `VOID_EVENT` **porté** de `stream.ts`, pas supprimé sèchement) + **compaction
  explicite** entre clusters + **circuit breaker** budget (tokens/rate-limit/temps).
- **DX opérateur.** Contrat de commande concret (sources de pool, `--dry-run` défaut,
  preview avant `--auto-merge`) + sous-commandes `status`/`resume`/`explain-blocked`/
  `abort` + schéma de rapport « blocked ».
- **Headless différé (UC1).** Le vieux `claude -p` hors-session est supprimé, mais un
  **mode headless futur** de `backlog-autopilot` est inscrit (même skill, même contrat
  worker) pour ne pas jeter la capacité walk-away/cron.
- **Premisse (note ouverte).** Le vrai goulot peut être la bande passante de **revue**,
  pas le débit de PR. Kill-criterion suggéré : si le temps de revue par PR ne baisse pas,
  la feature est net-négative — à mesurer après P3.
- **Batch défaut = 4** (le code est à `k=3`, à aligner).
