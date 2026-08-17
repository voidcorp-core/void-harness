# Cartographie gstack + état de reprise (audit 2026-07-09)

> Artefact de session (2026-07-09). Input du futur plan de dé-gstackification.
> Contexte complet : audit void-harness+forge → issues GitHub #62-#77 (milestone
> "Audit top 5% (2026-07-09)") + forge#3-#4. Décisions en mémoire Claude
> (audit-2026-07-09-decisions, linear-org-voidcorp).

## Décisions actées (Folpe, 2026-07-09)

- Distribution **marketplace-only** (npm non publié, assumé).
- **Core-hub** : le core void-harness est toujours installé et fait la liaison
  entre plugins (forge route vers ticket-writer/writing-plans du core ; contrat
  d'artefact `docs/specs/` frontmatter `source: forge` comme interface).
- **Doctrine tracker** : ce qui arrive des projets consumers (feedback, gaps,
  télémétrie) → issues GitHub voidcorp-core/void-harness ; ce que Folpe apporte
  (initiatives, backlog planifié) → Linear voidcorp/DEV (projet "void harness").
- Fusion `compounding`+`capture-rule`+`harness-evolution` → `learning-capture`
  auto-déclenché (issue #75).
- Télémétrie : agrégation cross-projets locale + push opt-in des findings en
  issues GitHub (#72). Jamais de données brutes hors machine, HITL absolu.
- **Dé-gstackification** : remplacer progressivement gstack par void-harness.
- Accès Linear : MCP direct par projet (`.mcp.json` → `linear-voidcorp` ici,
  `linear-declik` dans DECLIK), plus de connecteur claude.ai multitenant.

## Cartographie gstack (v1.57.10, ~/.claude/skills/gstack/)

Monorepo bun/TS complet : 53 skills, 72 scripts bin/, daemon browser ~190
fichiers (CDP/Chromium), cluster iOS (DebugBridge SPM), système mémoire gbrain,
miroir 53 skills dans `.agents/skills/` (à supprimer aussi au teardown).
`auto_upgrade: true` dans `~/.gstack/config.yaml` : gstack se réinstalle seul
tant que ce flag n'est pas coupé.

### Données à préserver (les seules load-bearing)

- `~/.gstack/projects/<slug>/learnings.jsonl` + `decisions.jsonl`
  (concrètement : projets `declik`, `declik-ai-declik`)
  → migrer vers `.void/PROJECT-DOCTRINE.md` + `decisions/NNNN.md`.
- `~/.gstack/chromium-profile/` (cookies) : seulement si on garde browse.
- À dropper : developer-profile.json, builder-profile.jsonl (privacy),
  brain-cache (régénérable), `.gstack/` par projet (éphémère).

### Classification

**VENDOR (prose pure, ~65% de la valeur durable)** : plan-ceo-review,
plan-eng-review, plan-design-review, plan-devex-review, autoplan, retro,
office-hours, spec (moteur 5 phases), cso (prose), design-review (craft),
design-consultation (craft), investigate, ship (checklist), qa/qa-only
(méthodologie sans le driver). La plupart se fondent dans des skills harness
existants (writing-plans, brainstorming, compounding, security-guidance,
frontend-design, systematic-debugging, ticket-runner).

**REBUILD (repointer plutôt que porter)** : la prose QA/browser se rebranche
sur le MCP claude-in-chrome au lieu du daemon browse (port complet = semaines ;
re-point = jours). make-pdf = 1 script Chromium print. Cluster iOS : seulement
si iOS devient stratégique.

**KEEP-EXTERNAL** : gbrain (setup-gbrain, sync-gbrain, context-save/restore) -
produit parallèle lourd, garder tant que `.void` + compounding n'ont pas prouvé
qu'ils suffisent.

**DROP** : review et health (doublons harness), codex/review en tant que
wrappers, document-generate/release, landing-report, careful/freeze/unfreeze/
guard (hooks harness), plan-tune, benchmark-models, benchmark, skillify,
pair-agent, land-and-deploy/setup-deploy (plugin vercel), gstack-upgrade,
connect-chrome (symlink dupliqué de browse).

### Vagues

| Vague | Contenu | Coût |
|---|---|---|
| 0 | `auto_upgrade: false` + snapshot learnings/decisions.jsonl | 1h |  ✅ **FAIT (DEV-384, 2026-07-09)** |
| 1 | Vendorer les 4 plan-reviews + autoplan + retro + office-hours + prose cso | prose |
| 2 | Distiller ship / spec / investigate dans ticket-runner, systematic-debugging | prose |
| 3 | Design : design-review/consultation/shotgun → frontend-design + forge + impeccable | prose |
| 4 | QA browser repointée sur claude-in-chrome MCP ; make-pdf léger ; retirer le daemon | jours |
| 5 | Décider iOS et gbrain (différables, voire jamais) | lourd |
| 6 | Teardown : deux namespaces skills, symlink, ~/.gstack/ après extraction | 1h |

### Vague 0 exécutée (DEV-384, 2026-07-09)

- `~/.gstack/config.yaml` : `auto_upgrade: true → false` (gèle la v1.57.10.0 ;
  1.58.5 dispo, non appliquée). Gate d'upgrade confirmé à la source
  (`bin/gstack-session-update:31` : `exit 0` si `auto_upgrade != true`).
- **Snapshot** : `~/gstack-snapshots/2026-07-09-degstackification-vague0/`
  (hors `~/.gstack/`, structure par slug + `MANIFEST.txt` avec sha256).
  3 fichiers capturés (pas 4) : `declik/{learnings,decisions}.jsonl` +
  `declik-ai-declik/learnings.jsonl`. `declik-ai-declik` n'a jamais eu de
  `decisions.jsonl`. Intégrité vérifiée (sha256 source == copie), JSONL valide.
- Non copiés (délibéré) : developer-profile/builder-profile (absents + privacy),
  brain-cache (régénérable), timeline/reviews/designs/taste-profile/
  decisions.active.json (hors scope Vague 0), chromium-profile (browse vit
  jusqu'à Vague 4). Autres slugs : aucun learnings/decisions non vide.
- Migration du contenu vers `.void/PROJECT-DOCTRINE.md` + `decisions/NNNN.md` =
  Vague 6 (teardown).

## Grandes améliorations proposées (au-delà des issues #62-#77)

1. **GitHub Action void-harness** (enforcement server-side) : rejouer les
   checks des hooks sur chaque PR - le plancher devient incontournable, même
   pour un agent cloud ou un bypass local. Levier n°1. [approuvé pour plan+tickets]
2. **Eval harness des skills** : tests comportementaux (tâches fixtures avec/
   sans skill, scoring) - rend le vendoring gstack vérifiable et chaque modif
   de prose testable. Levier n°2. [approuvé pour plan+tickets]
3. `/harness:challenge` multi-modèle (Claude+Codex+Gemini + juge) aux gates
   spec/plan/pré-merge. [proposé]
4. Moment Apple : `idée → repo prêt` (forge ship_now → void-starter → harness
   init → premiers tickets). [proposé]
5. Briefing de session (sessionstart-context enrichi : ticket courant, PRs,
   CI, findings). [proposé]
6. `doctor --fix` (auto-remédiation des findings réparables). [proposé]

## Reprise - prochaines actions dans l'ordre

1. Vérifier l'auth MCP `linear-voidcorp` (workspace voidcorp choisi à l'OAuth).
2. `harness:writing-plans` : plan de dé-gstackification (vagues 0-6) + Action
   enforcement + eval harness.
3. Tickets du plan dans **Linear voidcorp/DEV**, projet "void harness".
4. Exécuter le backlog GitHub #62 → #77 avec `harness:ticket-runner`
   (commencer par #62, le fix path-anchor des hooks).
5. En attente de décision Folpe : améliorations 3-6 ci-dessus.
