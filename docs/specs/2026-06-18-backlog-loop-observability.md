---
title: backlog-loop — observable, subscription-billed, CLI + slash-command driven
date: 2026-06-18
status: approved
author: Florent Pellegrin + Claude
related:
  - packages/core/skills/autonomous-backlog-loop/
  - docs/DECISIONS.md
---

## Problème

Le `autonomous-backlog-loop` actuel se lance via
`MAX_ITERATIONS=2 TARGET_STATE=Todo bash ~/.claude/plugins/cache/.../autonomous-backlog.sh`.
Trois douleurs :

1. **Boîte noire.** Chaque ticket tourne dans un `claude -p` headless dont toute la
   sortie part dans un fichier log ; le terminal n'affiche que `[HH:MM:SS] iteration N/M`.
   Le travail réel (skill active, fichiers touchés, commits, décisions, gate de vérif)
   est invisible en temps réel.
2. **Lancement peu ergonomique.** Chemin de cache en dur + variables d'env à mémoriser.
   Pas de `--help`, pas de slash-command, pas de wizard.
3. **Pas de capitalisation des décisions.** Les choix structurants pris par les workers
   ne sont ni affichés ni résumés au moment où l'humain reprend la main (merge des PR).

## Objectif

Refondre la loop pour qu'elle soit **observable en direct**, **lançable simplement**
(CLI à flags + slash-command + wizard), **facturée sur l'abonnement Claude** (jamais
l'API), et qu'elle produise un **résumé final** des tickets traités et des décisions
prises. La doctrine de fond (process frais par ticket, HITL aux frontières, floor
sécurité, green-or-blocked) est **préservée** ; seule la couche orchestration/ergonomie
change.

## Décisions cadrées (issues du brainstorming)

- **Observabilité** : flux live **structuré et append-only** (pas de TUI qui réécrit les
  lignes en place — illisible dans la transcription Claude Code).
- **HITL** : run continu sans interruption + **résumé final** unique. Fidèle à « a
  session you can walk away from ».
- **Lancement** : `void-harness backlog-loop` (flags, `--help`, dry-run) + slash-command
  `/void-backlog-loop` qui wrappe la même chose. Verbe extensible (`backlog-loop` laisse
  la place à d'autres loops).
- **Config** : `.void/autonomous.json`, mergée avec env + flags ; **wizard interactif au
  1er run** si le fichier est absent.
- **Facturation** : **abonnement obligatoire**. Le worker est spawné avec un env dont
  `ANTHROPIC_API_KEY` et `ANTHROPIC_AUTH_TOKEN` sont retirés ; pré-flight qui refuse net
  si une var cloud-provider (`CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY`) force l'API.
- **Langage** : orchestrateur déplacé de bash vers **TypeScript** dans `packages/cli`.
- **Compat** : le script `autonomous-backlog.sh` est **supprimé** (aucun autre
  utilisateur), pas de shim.

## Architecture

Orchestrateur en TypeScript dans `packages/cli`, exposé par la sous-commande
`backlog-loop` (convention existante : module TS `async function(args)`, dispatch par
switch dans `main.ts`, helpers de rendu dans `lib/render.ts`). Le slash-command est un
fichier markdown dans `packages/core/commands/` (+ miroir `packages/cli/core-assets/commands/`)
qui invoque `void-harness backlog-loop …` en subprocess — **le process frais par ticket
est ainsi préservé** (on ne pilote pas les workers via l'outil Agent, qui partagerait le
process).

Source d'observabilité **hybride** :
- `claude -p --output-format stream-json` fournit gratuitement le **mécanique** (skill
  invoquée, edit, commit, résultat de commande/test).
- Le worker émet en plus des événements **sémantiques** que le JSON brut ne peut pas
  deviner : `VOID_EVENT: PHASE <pick|brainstorm|plan|execute|verify|ship|compound>`,
  `VOID_EVENT: DECISION <texte>`, en plus de la ligne finale `VOID_AUTONOMOUS_RESULT: …`.

Rendu **append-only** : chaque événement ajoute une ligne lisible (arbre par ticket),
jamais de redraw en place — fonctionne identiquement dans un vrai terminal et dans la
conversation `/void-backlog-loop`.

## Composants

| Module | Rôle | Pureté |
|---|---|---|
| `packages/cli/src/commands/backlog-loop.ts` | Entrée : parse flags, `--help`, `--dry-run`, charge/merge config, lance le wizard si pas de config, pilote l'orchestrateur | shell |
| `packages/cli/src/lib/backlog/config.ts` | Merge `flags > env > .void/autonomous.json > defaults` + wizard interactif | pur (sauf wizard) |
| `packages/cli/src/lib/backlog/stream.ts` | Parse les lignes stream-json + lignes `VOID_EVENT`/`VOID_AUTONOMOUS_RESULT` → événements métier discriminés (`TicketPicked`, `Phase`, `SkillInvoked`, `FileEdited`, `Committed`, `VerifyResult`, `Decision`, `Shipped`, `Blocked`, `Result`) | **pur** |
| `packages/cli/src/lib/backlog/render.ts` | Événements → lignes d'arbre live append-only (via `lib/render.ts`) | shell |
| `packages/cli/src/lib/backlog/summary.ts` | Accumule les événements → état de run → résumé final | **pur** |
| `packages/cli/src/lib/backlog/billing.ts` | Construit l'env enfant garantissant l'abonnement ; pré-flight qui détecte les vars d'API/cloud | pur |
| `packages/cli/src/lib/backlog/orchestrator.ts` | La loop : pré-flight, spawn `claude -p` par ticket, pipe stream→render+summary, classify, circuit-break | shell |
| `packages/core/commands/void-backlog-loop.md` (+ miroir core-assets) | Slash-command wrappant `void-harness backlog-loop …` | — |
| `packages/core/skills/autonomous-backlog-loop/scripts/iteration-prompt.md` | Étendu : émission des `VOID_EVENT: PHASE/DECISION` | — |

Modules **purs** (TDD strict) : `stream.ts`, `summary.ts`, `config.ts` (merge),
`billing.ts`. Modules **shell** (TDD souple) : `orchestrator.ts`, `render.ts`,
`backlog-loop.ts`, wizard.

## Flux de données

```
flags + env + .void/autonomous.json
   └─→ config.ts (merge, ou wizard si absent)
        └─→ orchestrator.ts ── pré-flight (git propre, claude/jq, billing) ──┐
             boucle par ticket :
               childEnv = billing.subscriptionEnv(process.env)   // strip API vars
               spawn `claude -p --output-format stream-json --settings autonomous`
               stdout(lignes) ─→ stream.ts ─→ events ─┬─→ render.ts  (arbre live)
                                                      └─→ summary.ts (accumulation)
               dernière ligne ─→ classify ─→ COMPLETED / BLOCKED / NO_TICKETS / échec
        └─→ summary.render()  → résumé final (tickets, décisions/ADR, PR, blocages)
   exit code = nb de blocages (0 = tout vert)
```

## Garantie de facturation (abonnement)

Précédence d'auth de Claude Code (officiel) : vars cloud > `ANTHROPIC_AUTH_TOKEN` >
`ANTHROPIC_API_KEY` > `apiKeyHelper` > `CLAUDE_CODE_OAUTH_TOKEN` > OAuth `/login`. En
headless, une `ANTHROPIC_API_KEY` présente est utilisée **sans prompt** → API facturée.

`billing.subscriptionEnv(env)` retourne une copie de l'env **sans** `ANTHROPIC_API_KEY`
ni `ANTHROPIC_AUTH_TOKEN`, forçant le retour aux creds OAuth de l'abonnement. Pré-flight
`billing.assertSubscription(env)` :
- vars cloud (`CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY`) présentes → **die** avec message
  clair (ne peuvent pas être « strippées » sans casser l'intention ; refus net sauf
  `--allow-api` explicite).
- sinon : log `billing: abonnement (ANTHROPIC_API_KEY retirée de l'env worker)` si une
  clé était présente.

`--allow-api` (caché, opt-in explicite) désactive le strip pour qui veut délibérément
l'API. Par défaut : abonnement garanti.

## Gestion d'erreurs

- Pré-flight inchangé sur le reste : repo git, arbre propre, `claude`/`jq` présents,
  refus si `VOID_HARNESS_ALLOW_*` setté, full-auto sandbox-gated. **Le floor sécurité
  (allowlist `settings.autonomous.json` + hooks) ne bouge pas.**
- Ligne stream-json malformée → ignorée (event `Unknown`), jamais de crash ; le brut
  reste tee'd dans le log de run.
- Worker qui plante / pas de ligne `VOID_AUTONOMOUS_RESULT` → compteur d'échec,
  circuit-break à `MAX_FAILURES`.
- `--no-stream` : fallback `--output-format text`, rendu dégradé (log brut) si le
  stream-json pose problème dans un environnement donné.

## Approche de test (modes TDD)

- `stream.ts` — **strict** : fixtures de stream-json enregistrées (un échantillon réel
  capturé une fois), table-driven event-mapping, lignes `VOID_EVENT` et malformées.
- `summary.ts` — **strict** : accumulation déterministe d'une liste d'événements → objet
  résumé ; rendu testé sur lignes-clés.
- `config.ts` (merge) — **strict** : précédence `flags > env > file > defaults`.
- `billing.ts` — **strict** : strip des bonnes vars, assertion qui die sur vars cloud.
- `orchestrator.ts` — **souple** : intégration avec un **faux `claude`** (script stub sur
  PATH crachant du stream-json canné) → classify + circuit-break + cap d'itérations +
  env enfant sans `ANTHROPIC_API_KEY`.
- `render.ts`, wizard — **souple** : asserts sur lignes-clés, pas de snapshot creep.

Tests via `pnpm test`. Naming `Name.ts` / `Name.test.ts`.

## Phases (→ deviendront le plan writing-plans)

1. **Config + flags + wizard** : `config.ts`, squelette `backlog-loop.ts` + câblage
   `main.ts`. TDD strict sur le merge.
2. **Billing guard** : `billing.ts` + pré-flight. TDD strict.
3. **Parser stream-json** : `stream.ts` + fixtures. TDD strict.
4. **Orchestrateur + faux-claude** : `orchestrator.ts`. TDD souple.
5. **Renderer live + résumé** : `render.ts`, `summary.ts`. Strict sur summary, souple sur
   render.
6. **Worker + intégration** : étendre `iteration-prompt.md` (émission `VOID_EVENT`),
   slash-command `void-backlog-loop.md` (+ miroir), **suppression** de
   `autonomous-backlog.sh`, MAJ `SKILL.md` / `.source` / `plans/skill-audits/`,
   entrée `DECISIONS.md` (bash→TS, suppression du shim, garantie abonnement),
   MAJ `docs/*` si une convention CLI nouvelle est introduite. Sync `CLAUDE.md`/`AGENTS.md`
   pour le nouveau point d'entrée.

## Hors scope (YAGNI)

- Pas de TUI/dashboard web, pas de redraw en place.
- Pas de pause par-ticket ni de checkpoints interactifs (run continu décidé).
- Pas de persistance d'un dashboard fichier vivant à tailer (flux live terminal suffit ;
  le log brut de run reste pour le post-mortem).
- Pas de parallélisme multi-tickets (un ticket à la fois, fresh process — doctrine).
