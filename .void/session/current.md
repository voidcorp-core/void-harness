---
date: 2026-08-17
branch: folpe/dev-621-resume
---

## Objective

Livrer le Command Center: voir les 8 projets d'un coup, et reprendre l'un d'eux sans
reconstruire le contexte de tête.

## Position

Phase 1 livree (PR #216, non mergee: panne GitHub). Phase 2 en cours sur cette branche.
Restent la phase 3 (conformite avec reparation, spec ecrite) et la phase 4 (graphe), qui
n'est plus sur le chemin critique.

## State

`projects`, `ui` et `resume` tournent sur le parc reel. 8 projets decouverts en 22 ms,
506 decisions lisibles dans trois formats. Suite complete verte au dernier passage
(2832 tests), hors le flake de charge DEV-561 sur build.test.ts.

## Next action

Merger PR #216 des que l'API GitHub repond, puis ouvrir la PR de cette branche.

## Open loops

- PR #216 bloquee par la panne GitHub, pas par un check rouge.
- Le sort de DEV-459/460 (Mission Control x10) n'est pas tranche: ils contredisent la spec
  Command Center.
- 432 Ko de telemetrie restent dans l'historique git (19edb25), reecriture non decidee.
- `pnpm verify --artifacts --fix` demande deux passes pour converger.

## Dead ends

- Un registre de projets: celui qui existe deja porte 15 997 pointeurs de tests et ne
  connait que 3 projets sur 8. Remplace par la decouverte par marqueur.
- Compter la derive de format comme "attention": signalait 8 projets sur 8, donc plus rien.

## Assumptions

- Non verifie: que le checkpoint suffise sans `intent.yaml` ni `knowledge.json`. C'est le
  pari de la sequence, a valider a l'usage.

## Working set

- packages/cli/src/lib/session/checkpoint.ts
- packages/cli/src/lib/session/resume.ts
- packages/cli/src/commands/resume.ts
- packages/core/skills/session-handoff/SKILL.md
