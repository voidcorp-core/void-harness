---
title: Fermer la boucle de dispatch des agents spécialistes
date: 2026-08-21
status: approved
author: Folpe + Codex
ticket:
related:
  - docs/specs/2026-07-24-void-harness-v3-top-tier-engineering-team.md
  - docs/plans/2026-07-24-void-harness-v3-top-tier-engineering-team-plan.md
  - docs/decisions-log/2026-07-28-route-specialists-from-canonical-contracts--746a9448-0aaf-44d7-adbe-d7c6d3deaf0d.md
---

# Fermer la boucle de dispatch des agents spécialistes

## Résumé

Les seize spécialistes sont installés et routés, mais le chemin vivant s'arrête avant leur
exécution : le contrôleur produit `invoke-specialists`, aucun adaptateur ne le consomme, et
`void-implement` nomme encore trois rôles en dur. En parallèle, le compteur Codex classe
`collaborationspawn_agent` comme un outil générique. Le rapport de comportement conclut donc que
tous les agents sont morts alors que des sous-agents ont effectivement été lancés.

Cette tranche ferme la boucle sans transformer les hooks en orchestrateur :

1. le compteur reconnaît les primitives natives de spawn et leurs noms d'agents ;
2. le rapport compare les activations aux agents réellement installés et sépare les missions
   synthétiques des sessions humaines ;
3. un protocole de dispatch déterministe transforme `invoke-specialists` en invocations bornées ;
4. `void-implement` exécute chaque spécialiste applicable, sans liste de rôles locale ;
5. le cycle de vie `started/completed/failed` rend les lancements, fins et échecs observables ;
6. un corpus réaliste mesure précision, rappel, dispatch et complétion.

## Invariants

- Le Mission Engine décide quels spécialistes sont applicables. Une skill ou un runtime ne
  recalcule jamais cette liste.
- Le dispatcher transporte des identifiants, versions de contrat, étapes, rounds et hashes. Il
  n'interprète pas le domaine.
- Codex exécute avec `spawn_agent`; Claude Code avec `Agent`. Les hooks observent ces appels mais
  ne les provoquent pas.
- Un résultat de spécialiste est validé avant d'être journalisé. Un résultat absent, invalide,
  obsolète ou provenant d'un autre spécialiste échoue fermé.
- Une capacité `unavailable` bloque le dispatch. Une capacité `degraded` autorise les revues mais
  interdit un verdict `verified`; ses limitations restent dans le verdict.
- Aucune mission synthétique `mis_selfhost_*` ou smoke interne ne compte comme preuve d'usage
  humain dans `graph behavior`.
- Un événement d'agent étranger au catalogue ne suffit pas à effacer un `telemetry-gap` pour les
  agents installés.
- Le dispatcher n'exécute ni shell ni modèle lui-même. Il émet un contrat que le runtime actif
  consomme avec sa primitive native.

## Contrat de dispatch

Pour chaque action `invoke-specialists`, le contrôleur produit une enveloppe par spécialiste :

```json
{
  "schemaVersion": 1,
  "missionId": "mis_...",
  "runtime": "codex",
  "specialistId": "core:security-engineer",
  "agentName": "security-engineer",
  "contractVersion": 2,
  "stage": "post-implementation",
  "reviewRound": 1,
  "inputHash": "sha256:..."
}
```

L'ordre est stable et reprend exactement `specialistIds`. Un nom non résolu, une version absente,
un hash non canonique ou un doublon invalide toute l'action. Le runtime ne lance donc jamais un
sous-ensemble silencieux.

Le cycle de vie canonique est :

```text
specialist.requested -> specialist.started -> specialist.completed
                                      \----> specialist.failed
```

`specialist.completed` conserve le résultat structuré déjà compris par `reduceReviewLoop`.
`specialist.failed` garde un code et une raison bornés, sans prompt ni sortie brute.

## Intégration runtime

Le CLI expose le prochain état sûr en JSON. `void-implement` boucle dessus :

1. demander la prochaine action ;
2. pour `invoke-specialists`, lancer chaque enveloppe avec l'agent natif exact ;
3. enregistrer le début puis la complétion ou l'échec ;
4. redemander la prochaine action jusqu'à correction, vérification, arrêt ou complétion.

Les descriptions natives restent importantes mais ne sont plus l'unique mécanisme. La
documentation Codex actuelle précise que la délégation suit une demande directe ou une instruction
applicable d'`AGENTS.md`/skill ; la documentation Claude Code indique que la description guide la
délégation automatique. Le protocole explicite donne aux deux runtimes la même décision, tout en
leur laissant leur primitive native :

- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://code.claude.com/docs/en/sub-agents

## Télémétrie

Le compteur adapte au minimum :

| Primitive observée | Catégorie | Nom |
|---|---|---|
| Claude `Agent` / `Task` | `agent` | `subagent_type` ou `agent` |
| Codex `collaborationspawn_agent` | `agent` | `agent_type` |
| forme qualifiée `collaboration.spawn_agent` | `agent` | `agent_type` |

Les événements explicites du contrôleur prouvent le lifecycle métier. Les événements
`runtime.tool.*` prouvent que la primitive runtime a bien été appelée. Les deux signaux se
complètent ; aucun n'est inféré de l'autre.

`graph behavior` calcule la vie sur les noms installés. Une activation `agent:claude-code-guide`
ne prouve rien sur `security-engineer`. Le rapport affiche aussi le nombre d'événements et de
sessions synthétiques exclus.

## Mesures d'acceptation

Un corpus versionné contient au moins 40 missions couvrant backend, UI, sécurité, données,
performance, produit, DevEx, PDF et contrôles négatifs. Le score publie :

- précision de routage ;
- rappel de routage ;
- taux d'enveloppes émises sur spécialistes attendus ;
- taux de complétions reconnues sur enveloppes émises ;
- faux verts, obligatoirement à zéro.

Le corpus déterministe doit atteindre 100 % sur ces invariants avant merge. Les evals LLM restent
une couche complémentaire et ne remplacent pas les tests de contrat.

## Hors périmètre

- Faire des hooks un moteur d'orchestration.
- Lancer un modèle depuis le CLI.
- Certifier verte une isolation runtime non prouvée.
- Inventer une seconde logique de routage dans les skills.
- Auto-appliquer une modification de doctrine ou ouvrir un ticket de feedback sans confirmation.

## Décision

La spec v3 et l'ADR de routage ont déjà fixé la direction. Cette spec ferme un écart
d'implémentation ; elle ne crée pas une nouvelle architecture. Folpe a approuvé l'exécution le
2026-08-21.
