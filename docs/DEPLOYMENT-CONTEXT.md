# Deployment context: one instance, three shapes

Void Machine will ship inside the same Docker instance as Void Cortex, one instance per
client. Nothing here is built yet. It is written down because these constraints decide
architecture, and a constraint nobody wrote down is one that surfaces the day it is
expensive.

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
   Cortex database, no Declik account, no shared inference server, no GPU.
3. **Both.** The coupling adds value and is never required. It goes through Cortex's API
   and signature verification (JWKS), never through its tables.

The rule that follows, and that governs every later choice: **a capability that only
exists when Cortex is present is an adapter, never a dependency of the core.** If Machine
cannot start, run a unit and report without Cortex, the boundary has been crossed.

## Bring your own model

Machine reads a model endpoint from configuration; it never contains a model and never
assumes who serves it. Three tiers, all optional, none built in:

- **Device.** A local runtime on the operator's machine.
- **Shared server.** An OpenAI-compatible API, named by URL and model name from the
  environment, hosted outside the instance.
- **Frontier.** Inside a Declik instance, there is **no API key**: the host signs a short
  JWT per client and per service, written to a read-only mounted file and read through
  `ANTHROPIC_IDENTITY_TOKEN_FILE`, with a federation rule and an Anthropic workspace per
  client. Machine takes its own `sub` (`machine:<client>`), distinct from Cortex's.
  **Outside such an instance**, the operator supplies their own credential, and Machine
  must accept that shape too.

So the model port takes **either** a credential the operator owns **or** an identity file
the host renews, and neither is special-cased in the core. Any model choice is made with
Folpe, on a sourced comparison.

## In the third shape, Cortex is the model

Folpe's intent for shape 3: Cortex becomes Machine's way to a model. Machine stops talking
to a provider and talks to Cortex, which decides behind it and brings its memory and
context.

**Proposed form, to confirm with the Cortex side: Cortex exposes an OpenAI-compatible
API.** That is already the shape of the shared-server tier, so Machine keeps **one** model
adapter and the three cases differ only by URL and credential. Nothing about Cortex enters
the core, shape 2 keeps working by pointing the same adapter elsewhere, and no inference
protocol has to be invented, specified or maintained by two teams.

Two concerns stay separate:

- **Inference** goes through that endpoint.
- **Identity and permissions** stay the signature contract (JWKS): who the client is, what
  it may do, for how long.

If Cortex later offers more than that format can express — its memory, task routing, a
typed judgment — a second, native Cortex adapter is added beside the first, and the core
is untouched.

**This is a default, not a settled decision.** It is the cheapest shape that keeps the
three promises, and it is to be challenged when Machine is actually containerized, with
the Cortex side, on what its API can hold.

## What the instance imposes

- One client is one compose project, `cortex-<client>`; the project name comes from the
  file and a missing client fails the command. Machine enters it as one or more services
  of that same project.
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

## Open decisions, to settle with Folpe before the Dockerfile

- **Storage.** Machine's durable mission journal is files today. If it needs a database:
  its own role and database inside the instance's Postgres, or its own container. Cortex's
  Postgres stays Cortex's alone either way. Note that the Node floor is now 24, so
  `node:sqlite` exists; that reopens the journal decision on its own merits.
- **Exposure shape.** Subdomain (`machine.<client>.declik.ai`) or path, and whether
  Machine is exposed at all in the first client instance.
- **Coupling contract with Cortex.** Issuer, audience, permissions, lifetime, rotation and
  revocation, specified with the Cortex side before any implementation, along with the
  shape of the model endpoint proposed above.
- **Per-client environment.** The list of variables Machine needs, to extend `new.sh`.

## What this changes in current work

- The model port designed for task routing takes its credential **or** an identity file
  from a path; it never reads an API key from the environment directly.
- The mission journal and any future store must survive a container that is replaced
  rather than repaired: state belongs to a mounted volume or a database, never to the
  container's own filesystem.
- Nothing in the core may import a Cortex client. The coupling, when it exists, is an
  adapter behind a port, and its absence is an ordinary configuration, not an error.
