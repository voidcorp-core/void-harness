---
date: 2026-07-24
title: "The publish job must not set setup-node's registry-url (it silently disables OIDC)"
---

## 2026-07-24: The publish job must not set setup-node's registry-url (it silently disables OIDC)

Publishing 2.0.0 from CI failed with `npm error code E404 / PUT
https://registry.npmjs.org/voidharness - Not found`, and no OIDC exchange appeared
anywhere in the logs.

The cause was not the npm side. `actions/setup-node` reacts to a `registry-url:`
input by writing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into a temp
`.npmrc` and pointing `NPM_CONFIG_USERCONFIG` at it, with `NODE_AUTH_TOKEN`
defaulting to the literal placeholder `XXXXX-XXXXX-XXXXX-XXXXX`. npm then sees a
credential already configured, **never initiates the trusted-publishing OIDC
exchange**, and authenticates with that garbage token. The registry answers a
permission failure as `E404`, which reads like "the package does not exist".
Upstream: actions/setup-node#1551.

`registry.npmjs.org` is the default registry, so the input bought nothing and cost
the entire tokenless-publish flow. It is now removed, with a comment on the step
saying why it must not come back.

### The expensive part was the misdiagnosis

`docs/RELEASING.md` carried a note from the package rename saying the trusted
publisher had not been bootstrapped for the new name and that "until it is, the CI
publish job will fail auth". That note was stale (the bootstrap had happened) but
it matched the symptom perfectly, so the investigation went to the npm account
settings and concluded the maintainer had to re-link the publisher. They did not:
it was configured all along. 2.0.0 was then published manually, which is why it
carries **no provenance attestation**.

Lesson recorded in `docs/RELEASING.md`: an `E404` on publish is a credential
problem, and the credential to suspect first is the one the workflow injected, not
the one npm is missing. A stale doc that explains a symptom is more dangerous than
no doc, because it terminates the search early.
