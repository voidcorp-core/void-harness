# Deployment context: one instance, three shapes

Void Cortex has chosen its deployment target: one Docker instance per client, on a
European VPS. **Folpe set Machine's target on 25 September 2026: the same instance holds
Cortex, its Postgres and Machine, and Machine runs sandboxed there, because it acts** (it
writes code, runs commands, opens pull requests). The approved foundation plan still records
that no topology is chosen; turning this target into an accepted decision record, with that
plan updated in the same commit, is the first step of the unit that containerizes Machine.
Nothing here is built. It is written down because these constraints decide architecture,
and a constraint nobody wrote down is one that surfaces the day it is expensive.

Source of truth for the instance itself is the `voidcorp-core/void-cortex` repository:
`Dockerfile`, `deploy/instance/compose.yml`, `deploy/edge/`, `deploy/instance/new.sh`, and
`docs/plans/2026-09-24-installation-par-personne.md`. Its decisions: `adr:bbb6c7e8`
(topology), `adr:1315f6b2` (hybrid models), `adr:4778a07e` (frontier through OIDC),
`adr:95d62188` (exposure), `adr:29d0e949` (invitation only). When this note and that
repository disagree, that repository wins and this note is corrected.

## The promise: three shapes, each whole

A deployment is one of three shapes, and **each one must work on its own**:

1. **Cortex alone.** Machine is absent. Nothing in Cortex waits for it.
2. **Machine alone.** Cortex is absent, and the operator brings their own model. This is
   the shape that decides our design: Machine must deliver work with nothing but a
   repository, a runtime and a model endpoint the operator supplies. No Cortex API, no
   Cortex database, no Déclic account, no shared inference server, no GPU.
3. **Both.** The coupling adds value and is never required. It goes through Cortex's API
   and a proposed signature verification (JWKS), never through its tables. The pairing
   mechanism itself is still to be designed with the Cortex side.

The rule that follows, and that governs every later choice: **a capability that only
exists when Cortex is present is an adapter, never a dependency of the core.** If Machine
cannot start, run a unit and report without Cortex, the boundary has been crossed.

## Bring your own model

Two axes, deliberately not conflated (`docs/ARCHITECTURE.md`): the **agent runtime** that
executes a step, and the **model provider** behind it. Today Machine composes one runtime
adapter, the Claude CLI (`packages/void-machine/src/adapters/runtime/claude.ts`, behind the
`Execute` port), and that runtime reaches its provider itself. Machine has no model port of
its own yet.

So "bring your own model" means: the model endpoint and credential are configuration of
the chosen runtime, and Machine never contains a model nor assumes who serves it. Three
tiers, all optional, none built in:

- **Device.** A local runtime on the operator's machine.
- **Shared server.** An OpenAI-compatible API, named by URL and model name from the
  environment, hosted outside the instance.
- **Frontier.** Inside a Déclic instance, there is **no API key**: the host signs a short
  JWT per client and per service, written to a read-only mounted file and read through
  `ANTHROPIC_IDENTITY_TOKEN_FILE`, with a federation rule and an Anthropic workspace per
  client. Machine takes its own `sub` (`machine:<client>`), distinct from Cortex's.
  **Outside such an instance**, the operator supplies their own credential, and Machine
  must accept that shape too.

Any model choice is made with Folpe, on a sourced comparison.

## In the third shape, Cortex is the model

Folpe's intent for shape 3: Cortex becomes Machine's way to a model. Machine stops talking
to a provider and talks to Cortex, which decides behind it and brings its memory and
context.

**Proposed form, to settle with the Cortex side: Cortex exposes a model endpoint the
chosen runtime can already consume**, rather than a protocol of its own. Which shape that
is (OpenAI-compatible, Anthropic Messages, or both) follows from the runtime Machine
composes, and is not decided here. What matters is the property: an endpoint an existing
runtime speaks to means nothing about Cortex enters the core, shape 2 keeps working by
pointing the same configuration elsewhere, and no inference protocol is invented,
specified and maintained by two teams.

Two concerns stay separate:

- **Inference** goes through that endpoint.
- **Identity and permissions** would go through the proposed signature contract (JWKS):
  who the client is, what it may do, for how long.

If Cortex later offers more than that format can express (its memory, task routing, a
typed judgment), a native Cortex adapter is added behind a port, and the core is
untouched.

**This is a default, not a settled decision.** It is the cheapest shape that keeps the
three promises, and it is to be challenged when Machine is actually containerized, with
the Cortex side, on what its API can hold.

## What the instance imposes

- One client is one compose project, `cortex-<client>`; the project name comes from the
  file and a missing client fails the command. If Machine ships inside the instance, it
  enters as one or more services of that same project.
- **Migrations as a one-shot service**, like Cortex's `migrate`: a container that applies
  and exits, with the main service gated on `service_completed_successfully`. A failed
  migration leaves the service stopped.
- **Health and limits**: a light health endpoint that fails when required environment is
  missing; a `mem_limit` set from a measurement (median and max over 30 readings, at rest
  and after warm-up), never a guess.
- **Non-root user, base images pinned by digest**, and images built for **arm64** (Folpe's
  Mac, for development and tests) and **amd64** (the client VPS).
- **No durable secret in the container** when an alternative exists.
- **Invitation only.** An instance belongs to a person. An exposed Machine service makes
  the same promise and never opens public signup.
- **Exposure**, when a service is exposed: a Caddy route per client under
  `$DECLIK_HOME/edge/sites/`, written by provisioning. Cloudflare Tunnel terminates TLS on
  the Mac, Caddy terminates it on the VPS, and the client address arrives in
  `X-Forwarded-For`.

## Machine acts, so it runs sandboxed

Cortex answers; Machine executes. A process that runs code it did not write, from
repositories and tools it does not control, must be contained so that a mistake or a
hostile input (a prompt injection in an issue, a dependency's install script) stays inside
the sandbox. A container is where that containment starts, not all of it: by default it
shares the host kernel and gives root inside. What the containment is expected to hold,
each item to be checked against the official documentation before it is written:

- **No way out through the host.** Non-root user, no Docker socket mounted, no privileged
  mode, capabilities dropped, a read-only root filesystem with the work area on a volume.
- **A stronger boundary than the shared kernel** where the risk warrants it: a user-space
  kernel (gVisor) or a micro-VM runtime (Kata Containers, Firecracker) under the same
  compose file. To measure against its cost before choosing.
- **Network out by allowlist.** The forge, the package registries and the model endpoint;
  nothing else, and never Cortex's Postgres directly.
- **Secrets as short-lived identities in mounted files**, as the frontier tier already
  does, never long-lived keys in the environment; forge credentials scoped to the client's
  repositories.
- **Bounded resources**: memory, CPU, processes, disk, and a wall-clock limit per mission.
- **The runtime's own sandbox inside it**: the agent runtime's command and file sandbox
  still applies within the container; the container does not replace it.

## Distribution: what npm is still for

The instance installs Machine from an image, not from `npx`. That moves the primary
channel, and raises a question to settle with Folpe before the containerizing unit:

- **The image becomes the channel for instances**: built in CI from the repository, pinned
  by digest, published to a registry with a provenance attestation, the way npm
  provenance works today.
- **npm keeps a reason only if installing the harness into one's own project stays a
  promise** of the open-source repository (`npx voidharness`). The code stays public either
  way; the question is whether direct installation outside an instance is still offered.
- Recommendation, to confirm: keep npm for the open-source harness as long as that promise
  stands (it is built, and its provenance is verified), and add the image channel when
  Machine is containerized, rather than dropping npm before the image exists.

## Open decisions, to settle with Folpe before the Dockerfile

- **Topology record.** The target above, as an accepted decision record, with the
  foundation plan updated in the same commit. Cortex's repository stays the source of truth
  for the instance itself.
- **Sandbox depth.** Hardened container alone, or a user-space kernel or micro-VM under
  it, chosen on measured cost and on what Machine is allowed to do.
- **Distribution.** Whether npm stays alongside the image, as above.

- **Storage.** Machine's durable mission journal is files today. If it needs a database:
  its own role and database inside the instance's Postgres, or its own container. Cortex's
  Postgres stays Cortex's alone either way. The Node 24 floor makes `node:sqlite` reachable
  but the decision that raised the floor records it as a release candidate there, and
  nothing yet shows how it behaves on a mounted volume; reopening the file-journal decision
  needs that evidence, not the mere availability.
- **Exposure shape.** Subdomain (`machine.<client>.declik.ai`) or path, and whether
  Machine is exposed at all in the first client instance.
- **Coupling contract with Cortex.** Issuer, audience, permissions, lifetime, rotation and
  revocation, specified with the Cortex side before any implementation, along with the
  shape of the model endpoint proposed above.
- **Per-client environment.** The list of variables Machine needs, to extend `new.sh`.

## What this changes in current work

- A model port, if one is created for task routing, must accept a credential the operator
  owns **or** an identity file at a path; it must never require an API key read straight
  from the environment.
- The child environment is an allowlist today (`packages/void-machine/src/application/cli.ts`),
  and it passes no `ANTHROPIC_*` variable. A frontier tier inside a container, with no login
  in `HOME`, means widening that list deliberately, by name, not by accident.
- The mission journal and any future store must survive a container that is replaced
  rather than repaired: state belongs to a mounted volume or a database, never to the
  container's own filesystem.
- Nothing in the core may import a Cortex client. The coupling, when it exists, is an
  adapter behind a port, and its absence is an ordinary configuration, not an error.
