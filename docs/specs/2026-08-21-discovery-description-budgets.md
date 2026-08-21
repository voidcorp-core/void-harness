---
title: Budgets de description pour la découverte des skills et agents
date: 2026-08-21
status: in-design
author: Folpe + Codex
ticket:
related:
  - docs/plans/2026-08-19-skill-invocation-surface-plan.md
  - docs/decisions-log/2026-08-21-discovery-description-budget--81cbd775-9ba2-4e94-a172-47968ff44180.md
  - AGENTS.md
  - CLAUDE.md
---

# Budgets de description pour la découverte

## Résumé

Les descriptions de frontmatter ont deux fonctions de routage : elles annoncent
quand charger une skill et quand déléguer à un agent. Le dépôt documente encore
un plafond de 200 caractères, tandis que `anti-bloat-check.sh` accepte 512
caractères. Cette spec remplace cette contradiction par une règle à deux niveaux :
une cible éditoriale à 250 caractères et un plafond bloquant à 500.

La longueur supplémentaire est un moyen, pas le résultat recherché. Une bonne
description dit l'intention utilisateur, les situations qui déclenchent la
sélection et, lorsqu'une collision est plausible, la frontière qui route vers un
autre composant. Les étapes d'exécution restent dans le corps.

## État vérifié

Au 2026-08-21, les sources contiennent 90 descriptions de skills et d'agents :

- 15 698 caractères au total, 174 en moyenne ;
- deux descriptions au-dessus de 200 ;
- une description au-dessus de 250 ;
- aucune description au-dessus de 500.

Le gate global couvre déjà les skills core, les skills de packs et les agents,
mais utilise 512. Les documents vivants et plusieurs tests spécialisés utilisent
encore 200.

La spécification Agent Skills autorise 1 à 1 024 caractères et demande de décrire
ce que la skill fait, quand l'utiliser et les mots-clés qui facilitent sa
sélection. Claude Code documente que la description d'un sous-agent participe à
la délégation automatique. Les hooks, eux, s'arment sur des événements et des
matchers explicites.

Sources :

- https://agentskills.io/specification#description-field
- https://agentskills.io/skill-creation/optimizing-descriptions
- https://code.claude.com/docs/en/sub-agents#understand-automatic-delegation
- https://code.claude.com/docs/en/hooks#hook-events

## Comportement cible

### Skills et agents

Toute description de skill ou d'agent :

1. vise au plus 250 caractères ;
2. peut atteindre 500 caractères quand des déclencheurs, synonymes ou exclusions
   supplémentaires améliorent réellement le routage ;
3. échoue au gate au-dessus de 500 caractères ;
4. décrit l'intention et le moment de sélection, jamais la procédure interne ;
5. nomme une frontière négative seulement lorsqu'elle évite une collision avec
   un composant adjacent.

Une longueur de 251 à 500 est valide. Le contrôle la rapporte comme une note non
bloquante afin que la différence avec la cible soit visible sans créer un échec
artificiel.

La règle couvre :

- `packages/core/skills/*/SKILL.md` ;
- `packages/packs/*/skills/*/SKILL.md` ;
- `packages/core/agents/*.md`.

Les miroirs générés sous `packages/cli/core-assets/` héritent de la source et ne
sont pas contrôlés une seconde fois.

### Hooks

Aucun budget de description ne s'applique aux hooks. Leur déclenchement dépend :

- de l'événement runtime (`PreToolUse`, `PostToolUse`, `Stop`, etc.) ;
- du matcher ;
- du code de décision et de ses tests.

Le plafond de 100 lignes par hook reste inchangé. Une amélioration de routage des
hooks se prouve par des fixtures d'événement et de matcher, pas par davantage de
prose.

## Contrôles et documentation

L'implémentation doit :

- faire afficher au gate la cible 250 et le plafond 500 ;
- rapporter sans échouer les descriptions entre 251 et 500 ;
- échouer à 501 ;
- aligner le test global de portabilité sur 500 ;
- aligner les tests spécialisés qui présentent 200 comme le budget global ;
- mettre à jour `AGENTS.md` et `CLAUDE.md` ensemble ;
- mettre à jour `README.md`, `docs/CONTRIBUTING.md`, le template d'audit de skill
  et la doctrine courante du `doctrine-critic` ;
- laisser intacts les plans, specs et décisions historiques qui documentent le
  seuil en vigueur lors de leur rédaction.

Le changement du `doctrine-critic` doit rester reflété à l'octet dans le miroir
CLI et son audit note doit expliquer l'adaptation.

## Vérification

TDD strict pour le gate :

1. un test échoue d'abord parce que la doctrine et le contrôle ne portent pas les
   nouveaux seuils ;
2. des cas limites prouvent 250, 251, 500 et 501 ;
3. `pnpm anti-bloat:check`, les tests ciblés, `pnpm sync:docs`,
   `pnpm skills:check-references` et `pnpm derive:check` passent ;
4. le diff généré est inspecté pour éviter qu'une régénération n'embarque des
   artefacts sans rapport.

## Limites

Ce changement rend les descriptions plus aptes à porter un bon signal de
découverte ; il ne prouve pas qu'un runtime sélectionnera mieux chaque composant.
Une évaluation A/B du routage automatique est un chantier séparé. Cette spec ne
réécrit pas les 90 descriptions et ne modifie ni les événements ni les matchers
des hooks.

## Critères d'acceptation

- Une description de 250 caractères respecte la cible sans note.
- Une description de 251 ou 500 caractères passe avec une note non bloquante.
- Une description de 501 caractères fait échouer le gate.
- La règle s'applique aux skills core, aux skills de packs et aux agents.
- Aucun texte courant ne présente encore 200 ou 512 comme plafond global.
- Les hooks restent gouvernés par le plafond de 100 lignes et leur routage
  événementiel.
