---
schemaVersion: 1
id: "adr:b0e2efe4-5805-4e9f-b33e-0e1de941d421"
createdAt: "2026-09-04T17:45:44.628Z"
title: "Project markers are the only cross-project discovery authority"
status: accepted
deciders: ["Folpe"]
supersedes: ["legacy:2026-07-09-cross-project-telemetry-rollup-via-a-self-registering-index"]
---

# Project markers are the only cross-project discovery authority

## Context

The hook runner wrote one pointer under `~/.void/projects/` whenever it recorded an event. On this
machine, repeated tests produced 54,853 pointers while the registry still knew fewer real projects
than the marker scanner delivered by DEV-622. A moved, deleted or never-invoked project made the
registry stale or incomplete by construction.

The `projects` command already discovers bounded roots through the versioned
`.void/config.json` marker. `audit` and `graph --all-projects` nevertheless kept a second answer,
so the same CLI disagreed with itself about which projects existed.

## Decision

The configured, bounded marker scan is the sole authority for cross-project discovery. Event
recording writes only project-local evidence and never registers the project in user-global state.
`projects`, `audit` and `graph` consume one configured-discovery composition.

The retired pointer directory is removed through a bounded migration that only unlinks regular
`.path` files from the exact, non-symlinked legacy directory. It never recursively deletes the
directory and a dry run performs no write.

## Consequences

Positive:

- Tests and runtime hooks stop accumulating global writes.
- A project is discoverable before any hook runs and disappears naturally when its marker does.
- Every cross-project reader reports the same bounded project set.

Negative:

- Users whose projects do not share the derived root must declare discovery roots once.
- Marker discovery performs a bounded filesystem scan when a cross-project command runs.

## Alternatives considered

- **Keep the registry and clean dead entries.** Rejected because cleanup cannot add a project that
  never registered, so incompleteness survives.
- **Write the registry during install instead of event capture.** Rejected because moves and
  removals still require mutable lifecycle bookkeeping and older installations remain absent.
- **Scan an unbounded home directory.** Rejected because discovery must have a predictable cost;
  configured roots and a depth ceiling keep the work finite.

## Reversal cost

Low. Restoring a registry would add a writer and swap the discovery composition; project data and
event formats do not change.
