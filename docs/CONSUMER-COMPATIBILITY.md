# Consumer toolchain compatibility

The harness's development dependencies are not the consumer's version policy.
Profiles describe engineering guidance. Technical adapters and consumer commands
prove separate capabilities. An applicable profile does not certify a compiler.

## Profile contract

Existing technology entries keep `minimumVersion` and `maximumVersionExclusive`.
An entry may instead use `versionIndependent: true` when its advice needs no
version-specific API or configuration option. Mixing this declaration with a
range is invalid. It bypasses only version applicability, never review expiry,
incomplete detection, required verification or adapter capability checks.

Unavailable advice outside the changed files is visible in the plan's reasons
and `sourceReviewRequired`, and in specialist context omissions. It is not
activated. If its precise required selector matches, degradation still blocks.
Required review remains owned by the existing profile/mission proof gate: update
reviewed advice through normal review, then restart the frozen mission. There
is no prose waiver or silent fallback.

## Audit of shipped profiles

| Profile | Classification and reason |
| --- | --- |
| base | No package dependency; general change discipline. |
| typescript | Independent: strictness, narrow types, input validation. |
| react | Independent: pure rendering, behavioral tests, accessible semantics. |
| node-server | Independent: trust boundaries and bounded resource lifetimes. |
| monorepo | Independent: ownership, dependency direction and test coverage. |
| pwa | Independent: explicit cache policy and offline behavior verification. |
| sql | Independent: migration safety, domain constraints and transactions. |
| nextjs | General ownership and source-verification principles; exact `next.config.*` advice is separated into bounded `nextjs-config`. |
| expo | General platform validation; exact app/EAS configuration advice is separated into bounded `expo-config`. |

Selectors use OR semantics; broad extensions or directory names must not be
added to the required configuration profiles. A package upgrade cannot be
certified by the profile alone: the consumer's mandatory build, typecheck,
audit and tests remain required and use its configured tooling.

## TypeScript 7 and existing consumers

TypeScript 7 can receive general mission guidance without an upper version bound.
The graph extractor still requires its supported classic compiler API. Microsoft
states that [TypeScript 7.0 ships without that API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
The extractor must report lost capabilities; it must not substitute the harness's
compiler or claim a complete graph. No native API adapter is added by this change.

After publication, update the consumer through the normal `void-harness update`
path and start a new mission. Frozen old mission hashes cannot be overwritten.
A merge to develop alone neither publishes a release nor updates a consumer.
