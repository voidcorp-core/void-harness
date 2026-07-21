---
date: 2026-06-29
title: "graph-studio is orchestrator-centric with progressive disclosure, not a flat force-cloud"
---

## 2026-06-29: graph-studio is orchestrator-centric with progressive disclosure, not a flat force-cloud

Context: the first graph-studio build rendered all 102 nodes as a single
3d-force-graph force-directed cloud (spec §7's literal "clusters spatiaux par pack").
In use this was beautiful but illegible: it answered "what exists / where is it
dense" but not "how does the harness articulate" -- the edges (the actual relations)
were drowned, and a force layout encodes neither hierarchy nor flow. Dogfooding
feedback: "c'est compliqué de comprendre comment tout s'articule."

Decision: re-centre the view on the orchestrator (CLAUDE.md / the routing doctrine)
and use progressive disclosure instead of showing everything at once. The
orchestrator sits at the centre; group hubs (core + each pack) orbit it in a 3D
volume; components are collapsed by default (overview = ~8 labelled hubs with count
badges); clicking a hub expands its components; clicking a component isolates its
ego-network (focused node + its semantic neighbours + directional arrows, rest
hidden). This is the agent-flow "few nodes at a time, drill down" model. The
holographic aesthetic (bloom, fog, reticle, gravitation spin) is retained but tuned
down for legibility.

Alternative rejected: keep the flat force-cloud and only tune bloom / add focus.
Tried; the all-102-at-once layout stays cluttered because `core` alone has ~68
components. Progressive disclosure is the only way to have both the full graph and
legibility. The pure articulation overlay (`src/scene/articulation.ts`: orchestrator
+ hubs + containment + 3D orbital layout + ego-network) is unit-tested; spec §7's
pack-cluster wording is superseded by this entry.
