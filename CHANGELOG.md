# Changelog

## [0.13.0](https://github.com/voidcorp-core/void-harness/compare/v0.12.1...v0.13.0) (2026-06-29)


### Features

* **cli:** void-harness graph build|check|audit ([35f140e](https://github.com/voidcorp-core/void-harness/commit/35f140e6d11aa889ee2471b6031a9e1b73657763))
* **graph-behavior:** behavioral analysis core (advisory findings) ([87364c3](https://github.com/voidcorp-core/void-harness/commit/87364c31d337c49922e8abfec8ac9b5b966cc181))
* **graph-behavior:** declarable triggers in skill frontmatter -&gt; GraphNode ([d9463fc](https://github.com/voidcorp-core/void-harness/commit/d9463fcb5b454e6c8a0a6a963f012449892e5e0c))
* **graph-behavior:** graph behavior CLI report (advisory) ([bb3f00a](https://github.com/voidcorp-core/void-harness/commit/bb3f00ae7a5c9a035525837573ba16eea503adeb))
* **graph-behavior:** M8 should-have-fired + dead-node analysis ([1030eaf](https://github.com/voidcorp-core/void-harness/commit/1030eafa76c2641feae6b2ce4829a87f4bc7cf0e))
* **graph-behavior:** pure activation parse + trigger matching ([e11681b](https://github.com/voidcorp-core/void-harness/commit/e11681b502d031d02c3eef9c37653d964b3e564f))
* **graph-behavior:** seed declarative triggers on six path-driven skills ([dff4e54](https://github.com/voidcorp-core/void-harness/commit/dff4e54a6da87f51fcbf35e86e1ee99632b82582))
* **graph-live:** brancher activation-meter sur PreToolUse * + mirror + modele ([d0c2e1c](https://github.com/voidcorp-core/void-harness/commit/d0c2e1cb96e5edf935a8bf197792f9ebad6f0b0d))
* **graph-live:** calque live studio -- EventSource + pulse via frameAt ([f745f56](https://github.com/voidcorp-core/void-harness/commit/f745f56f5369ca760990960245c52a6a4b587b55))
* **graph-live:** coeur pur du calque live (frameAt unique) ([92fdb98](https://github.com/voidcorp-core/void-harness/commit/92fdb98328987522cb6deb5d936b0daf5e172479))
* **graph-live:** endpoint /history borne pour le replay ([87146eb](https://github.com/voidcorp-core/void-harness/commit/87146eb565d6339f6ddb7303f14670ccb9019de1))
* **graph-live:** etat pur du scrubber ([a8b5467](https://github.com/voidcorp-core/void-harness/commit/a8b54670801a73b49a533821edaadaedbbec0630))
* **graph-live:** graph live -- serveur SSE data-only (model + events) ([625496e](https://github.com/voidcorp-core/void-harness/commit/625496eed40b786c6a0daff91cb7e7397894bba2))
* **graph-live:** helpers purs de lecture du flux d'activations ([9176e7b](https://github.com/voidcorp-core/void-harness/commit/9176e7b7e3e3da84014275df0e83b353930fb225))
* **graph-live:** meter universel d'activations (absorbe skill-usage-meter) ([15f7779](https://github.com/voidcorp-core/void-harness/commit/15f7779c021292ca145cd88cd2ea8bb675aeeba4))
* **graph-live:** scrubber de replay timeline (live/replay unifies via frameAt) ([f99d97b](https://github.com/voidcorp-core/void-harness/commit/f99d97b32bf6d18fdb7e7e350129d1b2c5b725f0))
* **graph-studio:** analysis layer (halos, muted orphans, overlap edges) ([a47d626](https://github.com/voidcorp-core/void-harness/commit/a47d626adb963701fc3db93195fcd1ca41fdb908))
* **graph-studio:** build static model/usage/findings/workflows blobs ([98ed0d8](https://github.com/voidcorp-core/void-harness/commit/98ed0d81887f69bfd044a2dab70b8b749572d59a))
* **graph-studio:** click-to-focus ego-network, hub count badges, decluttered labels ([38ff4b0](https://github.com/voidcorp-core/void-harness/commit/38ff4b0ec75d18bb8a1d5403f1dab18753bad3c0))
* **graph-studio:** derive analysis overlays from findings + tension edges ([c6631f0](https://github.com/voidcorp-core/void-harness/commit/c6631f008ddd7b817306e6c9ac51ebabac64f63b))
* **graph-studio:** holographic HUD pass (bloom, fog, reticle, boot intro) ([32c0ee3](https://github.com/voidcorp-core/void-harness/commit/32c0ee3e585769df57a8ef61b32b1d8537d8508e))
* **graph-studio:** make Flow and Workflows layer toggles functional ([bfc5462](https://github.com/voidcorp-core/void-harness/commit/bfc54627c61dec36dcb9c0322ece5f2d2efa0d10))
* **graph-studio:** orchestrator-centric 3D orbital view with progressive disclosure ([be24688](https://github.com/voidcorp-core/void-harness/commit/be246880a7ede6e1b42826c2bb7ece13d785bf87))
* **graph-studio:** partition edge kinds into the four filter families ([bf723d0](https://github.com/voidcorp-core/void-harness/commit/bf723d0a1666b96b3b15136f27371af5f226b6fe))
* **graph-studio:** Plan B — holographic 3D view of the harness graph ([b4194e9](https://github.com/voidcorp-core/void-harness/commit/b4194e9a78d9abeade8884a1b50861bbc36ca8f0))
* **graph-studio:** pure layer/family/search selection ([c37eae5](https://github.com/voidcorp-core/void-harness/commit/c37eae532379ceaa3db44711fee366ad0cb99a8c))
* **graph-studio:** pure visual encoding (size/color/halo/cluster) ([831ffd4](https://github.com/voidcorp-core/void-harness/commit/831ffd46e1bcc1be91a610a64e1802e079d83aa6))
* **graph-studio:** render the structural 3D graph (force-graph + camera) ([bf29b93](https://github.com/voidcorp-core/void-harness/commit/bf29b93d0f82039ea6556266e30adbfb31a73aae))
* **graph-studio:** scaffold the Vite + TS app and wire it into the workspace ([6fb7fd2](https://github.com/voidcorp-core/void-harness/commit/6fb7fd2b87f4433c77c1476a67a76c9464c9f963))
* **graph-studio:** side panel, layer/family/search controls ([5efee90](https://github.com/voidcorp-core/void-harness/commit/5efee908da55363dbab322ee5803d9fd036476c6))
* **graph-studio:** structural flow impulse (GSAP particle bursts) ([7612811](https://github.com/voidcorp-core/void-harness/commit/76128111246465d985fac62ba22aeb36720290ae))
* **graph-studio:** workflow-def viewer (phase schematic + neighbors) ([296a526](https://github.com/voidcorp-core/void-harness/commit/296a52697be2418563d37246eef1c3cdce54398c))
* **harness-graph:** analysis finding type + detector signature ([61505dc](https://github.com/voidcorp-core/void-harness/commit/61505dc66eb05ab65630b7d45e3cb2ca27f387b8))
* **harness-graph:** assemble + stably serialize the model ([a299c16](https://github.com/voidcorp-core/void-harness/commit/a299c1698a31a52b612cad3b472ec7a989f5127b))
* **harness-graph:** derive mechanical edges (companion/invokes/extends) ([bb2340e](https://github.com/voidcorp-core/void-harness/commit/bb2340e72e189b7c7e1078ac8c012e38b649f09f))
* **harness-graph:** derive nodes from core + packs ([a5cdd62](https://github.com/voidcorp-core/void-harness/commit/a5cdd62ac6ba0af6f4663a2541fef792bf802466))
* **harness-graph:** detect broken routes / dangling refs ([45b7a84](https://github.com/voidcorp-core/void-harness/commit/45b7a8430cc85db2dd0e681836b647334010dcee))
* **harness-graph:** detect orphan nodes, composing usage data ([8a14df4](https://github.com/voidcorp-core/void-harness/commit/8a14df4b7d812f51aa169bdd18fa5845fc826408))
* **harness-graph:** detect routes-to cycles ([94693cb](https://github.com/voidcorp-core/void-harness/commit/94693cb1a43fc7fe09545375075c7c9bcc87fd6e))
* **harness-graph:** detector registry + analyze aggregate ([4f779ca](https://github.com/voidcorp-core/void-harness/commit/4f779caf7ca34189fede1c5d1ca40fd8dbeec566))
* **harness-graph:** graph kernel + analyses + CLI + telemetry seed (Plan A) ([557fe39](https://github.com/voidcorp-core/void-harness/commit/557fe39e6dbaad1ebb1f95c4a248a7bdc9a0f700))
* **harness-graph:** graph model types + stable node ids ([be3783e](https://github.com/voidcorp-core/void-harness/commit/be3783e7025a4f0be9469cb7479327dfbf4ac143))
* **harness-graph:** lexical overlap detector (anti-bloat signal) ([2a5b516](https://github.com/voidcorp-core/void-harness/commit/2a5b51643c2e14b173e2020f9a992af92cf3d4f7))
* **harness-graph:** load declared semantic relations from yaml ([2c01b49](https://github.com/voidcorp-core/void-harness/commit/2c01b49f6d89f683b4e2cfa9cdbe993431f86746))
* **harness-graph:** pure frontmatter + LOC readers ([3172024](https://github.com/voidcorp-core/void-harness/commit/3172024e840ac9a718b0ccfcd520775b75379331))
* **harness-graph:** scaffold the graph kernel package ([9f4ac20](https://github.com/voidcorp-core/void-harness/commit/9f4ac20a49545fba2068d8efc8bf6090dc2a9a60))
* **harness-graph:** seed declared relations + first model.json ([a09a06e](https://github.com/voidcorp-core/void-harness/commit/a09a06eb7b93311dd333f9f5e1b9ffddbbf743b1))
* **harness:** seed enriched activation telemetry (jsonl) ([7195489](https://github.com/voidcorp-core/void-harness/commit/719548963035b7a669bde54ceb4784d6a37f4483))
* **skills:** ticket-writer + ticket-runner expert cycle; backlog-autopilot delegates ([1d8cf09](https://github.com/voidcorp-core/void-harness/commit/1d8cf09a03626af464026cef8e04b71cd1f2d081))
* **skills:** ticket-writer + ticket-runner expert cycle; backlog-autopilot delegates ([3fe5698](https://github.com/voidcorp-core/void-harness/commit/3fe569816656b1fb8734ab49e7bb1ed9826beb43))


### Bug Fixes

* **graph-behavior:** drop tdd from trigger seed (at anti-bloat 400-LOC cap) ([ad06674](https://github.com/voidcorp-core/void-harness/commit/ad06674de2dbad1df16eaccf8858bbbd3430b5cd))
* **graph-studio:** align three with 3d-force-graph internal copy ([2eacdb5](https://github.com/voidcorp-core/void-harness/commit/2eacdb5c5906c72af3fa76fa8f353c38e3ad4f2c))
* **graph-studio:** guard camera focus against an at-origin node ([9a7cd6a](https://github.com/voidcorp-core/void-harness/commit/9a7cd6aa612159d06575808efd3c96d654c50788))
* **graph-studio:** keep search focus on redraw, add noopener to source link ([91698d1](https://github.com/voidcorp-core/void-harness/commit/91698d17399d672fcbe8d61a858f7c4ee9252046))
* **graph-studio:** repair focus camera and global search from re-review ([38d1374](https://github.com/voidcorp-core/void-harness/commit/38d137447c449474e5b4651e0db3e22f3ae2e037))
* **graph-studio:** tune bloom for legibility over spectacle ([77a64dd](https://github.com/voidcorp-core/void-harness/commit/77a64dd0c33d21391d9ccabcf341bd0a764bb249))
* **harness-graph:** correct pack-skills path and prefer source over mirror ([b1837c9](https://github.com/voidcorp-core/void-harness/commit/b1837c931eb7b116d1cba5e0d8ce4e16447bdd86))
* **harness-graph:** make rel() clone-dir-agnostic; use ICU-stable cmp sort ([458dfec](https://github.com/voidcorp-core/void-harness/commit/458dfecf897e0795e01835fa8d12d600a4006af2))
* **release:** add harness-graph to the version lockstep ([401c326](https://github.com/voidcorp-core/void-harness/commit/401c32654e8204e94a5f738c9cea4b0e53643c92))
* **release:** add harness-graph to the version lockstep ([380e1cc](https://github.com/voidcorp-core/void-harness/commit/380e1ccf2ac5ce72ab103dede780d2587b5ea363))

## [0.12.1](https://github.com/voidcorp-core/void-harness/compare/v0.12.0...v0.12.1) (2026-06-26)


### Bug Fixes

* **backlog:** configurable autopilot auto-merge method, default merge ([8622076](https://github.com/voidcorp-core/void-harness/commit/8622076942a571814e9e2ec93e8d65714a2873ca))
* **backlog:** make autopilot auto-merge method configurable, default merge ([381a713](https://github.com/voidcorp-core/void-harness/commit/381a713aa468d44ff04fbff3315afb99f4ca922e)), closes [#31](https://github.com/voidcorp-core/void-harness/issues/31)

## [0.12.0](https://github.com/voidcorp-core/void-harness/compare/v0.11.0...v0.12.0) (2026-06-22)


### Features

* **cli:** autopilot long-run loop, budget breaker and operator subcommands ([b2046c5](https://github.com/voidcorp-core/void-harness/commit/b2046c554c7b70bc23ad10b1a56b6a681a64e6ac))
* **cli:** base detection and per-cluster stacked branch base ([b306b49](https://github.com/voidcorp-core/void-harness/commit/b306b49113c505d77b188efa693582c3b1c57736))
* **cli:** cluster-aware autopilot plan with batch-of-4 default ([f1095db](https://github.com/voidcorp-core/void-harness/commit/f1095dbfa729d822ec6cdaaa6c1b9cfafe6dd2a7))
* **cli:** cluster-detect with footprint corroboration, size cap and split ([dd9c7b0](https://github.com/voidcorp-core/void-harness/commit/dd9c7b067549cca0ea7835e8db901928bf6df7c7))
* **cli:** cluster-order with topological sort and T2 worktree isolation ([0dad969](https://github.com/voidcorp-core/void-harness/commit/0dad969df04d9ee87121af520e79826c67245791))
* **cli:** durable run state with atomic writes and remote reconciliation ([fb71a9d](https://github.com/voidcorp-core/void-harness/commit/fb71a9d5b9d041f5cf9f4eb692f0193169324218))
* **cli:** red-handling excludes a red ticket and its dependents ([40898e1](https://github.com/voidcorp-core/void-harness/commit/40898e1bc1848c6fdf6317e359531056da641e5d))
* **cli:** risk-gated sequential stacked auto-merge state machine ([968f6c2](https://github.com/voidcorp-core/void-harness/commit/968f6c2f7be19327245348a8ecc361f1219dd581))
* consolidate backlog skills into backlog-autopilot ([d74fd2b](https://github.com/voidcorp-core/void-harness/commit/d74fd2bc15d60b866d4aa56d087b5291d5eb6fdc))
* **skills:** adaptive per-ticket quality cycle and two-level review ([e471536](https://github.com/voidcorp-core/void-harness/commit/e4715367cb0357945ae242493bec1dd4a8aa110c))
* **skills:** cluster engine in the backlog-autopilot Workflow ([717e976](https://github.com/voidcorp-core/void-harness/commit/717e976e7a247bffc76044e88e57258818ca6916))

## [0.11.0](https://github.com/voidcorp-core/void-harness/compare/v0.10.0...v0.11.0) (2026-06-19)


### Features

* implement void-harness audit + feedback push (issue [#17](https://github.com/voidcorp-core/void-harness/issues/17) cluster C) ([5fc5d5b](https://github.com/voidcorp-core/void-harness/commit/5fc5d5b186219734e5d5718c5ea6264872dc1c37))
* **pack-server:** testing-server-modules skill (issue [#17](https://github.com/voidcorp-core/void-harness/issues/17) B3) ([f3e10d5](https://github.com/voidcorp-core/void-harness/commit/f3e10d5c44e0325b4ad3fc5a3f33a88a7c5827a6))
* trigger void-plugins pin bump on release ([ddf883a](https://github.com/voidcorp-core/void-harness/commit/ddf883a53e50bc876c1154ba69f86a7cb86be484))
* trigger void-plugins pin bump on release ([b3e0de2](https://github.com/voidcorp-core/void-harness/commit/b3e0de28368611aafff3e70ef483a6716dd63c1e))
* void-harness audit + feedback push CLI (issue [#17](https://github.com/voidcorp-core/void-harness/issues/17) cluster C) ([2d4105c](https://github.com/voidcorp-core/void-harness/commit/2d4105c20b110c66ad38fb09559254b550a37318))


### Bug Fixes

* **block-dangerous-bash:** scope force-push match to the push command ([b0a87c5](https://github.com/voidcorp-core/void-harness/commit/b0a87c575bf3d060c20bb798cb18e8ede817a016))
* issue [#17](https://github.com/voidcorp-core/void-harness/issues/17) cluster B — FormData, fail-soft HTTP, server-only testing (guidance) ([27019ee](https://github.com/voidcorp-core/void-harness/commit/27019ee9d862254db7b9202ce40d74678d2881e1))
* **server-action,form-pattern:** multi-value FormData guidance (issue [#17](https://github.com/voidcorp-core/void-harness/issues/17) B2) ([f8c67d1](https://github.com/voidcorp-core/void-harness/commit/f8c67d1aa5497d58d62539842fe720ecfdfa99f4))

## [0.10.0](https://github.com/voidcorp-core/void-harness/compare/v0.9.0...v0.10.0) (2026-06-19)


### Features

* block-protected-push hook as the secondary push net ([7ba3d06](https://github.com/voidcorp-core/void-harness/commit/7ba3d06332850ae864b0f8cdd5c42d5394a94936))
* harden the backlog-loop git + allowlist gates (issue [#17](https://github.com/voidcorp-core/void-harness/issues/17) cluster A) ([609f0fa](https://github.com/voidcorp-core/void-harness/commit/609f0fa08f1af6694e781c8625a1b87f54424e5a))
* isolate each backlog-loop iteration in its own git worktree ([97dfb5f](https://github.com/voidcorp-core/void-harness/commit/97dfb5f5c6535de8f114d9c067beeabdfb8aaef7))
* move push + PR creation into the trusted orchestrator ([8d9efdc](https://github.com/voidcorp-core/void-harness/commit/8d9efdc5bb325483a7b9659dc40bb125b47131e6))
* narrow the autonomous git allowlist + block exec rebase flags ([c1f0e59](https://github.com/voidcorp-core/void-harness/commit/c1f0e59a8b75e787c1b4fb6213eb91667f090b02))
* refuse an unprotected base branch at backlog-loop preflight ([2ae2584](https://github.com/voidcorp-core/void-harness/commit/2ae2584e69985a7be91e690efb6ce9e738397008))
* rewrite the worker prompt as commit-only ([87143ed](https://github.com/voidcorp-core/void-harness/commit/87143ed99b8462931fa534bdf06adcf6a6830b92))
* **source-driven-development:** offline branch + blocking source-debt ([5ff20d0](https://github.com/voidcorp-core/void-harness/commit/5ff20d0e4c03cce2549f7111cb4cd5d90bfb3754))


### Bug Fixes

* address code-review findings on the loop hardening (issue [#17](https://github.com/voidcorp-core/void-harness/issues/17)) ([9568ba5](https://github.com/voidcorp-core/void-harness/commit/9568ba5808ef54f227a642d2175e2d06157f139c))
* **backlog-batch:** parse args delivered as a JSON string (issue [#21](https://github.com/voidcorp-core/void-harness/issues/21)) ([5492ce5](https://github.com/voidcorp-core/void-harness/commit/5492ce5ac134faaf71b8035942c495904b1c7d80))

## [0.9.0](https://github.com/voidcorp-core/void-harness/compare/v0.8.2...v0.9.0) (2026-06-18)


### Features

* backlog-batch — attended parallel ticket drain (worktree subagents → integration PR) ([44b076e](https://github.com/voidcorp-core/void-harness/commit/44b076e324a7b2f1975b7d0df7f1209a2fa9232b))
* **core:** backlog-batch skill + /harness:backlog-batch command ([817f822](https://github.com/voidcorp-core/void-harness/commit/817f822ad4fcfb756a0cedb2c93b683abfa1a418))

## [0.8.2](https://github.com/voidcorp-core/void-harness/compare/v0.8.1...v0.8.2) (2026-06-18)


### Bug Fixes

* **backlog-loop:** grant the worker the Linear MCP it is told to use ([a02f782](https://github.com/voidcorp-core/void-harness/commit/a02f78286aa641d0733b0bb7228a1556eca04b5f))
* **backlog-loop:** grant the worker the Linear MCP it is told to use ([d0a63d5](https://github.com/voidcorp-core/void-harness/commit/d0a63d5c83b74c6ccde96b06bdb843db2eda0065))

## [0.8.1](https://github.com/voidcorp-core/void-harness/compare/v0.8.0...v0.8.1) (2026-06-18)


### Bug Fixes

* **commands:** /void-* invoke the void-harness binary, not npx (404) ([7ac81d8](https://github.com/voidcorp-core/void-harness/commit/7ac81d807d7991a096ebf740a879ab51f453f02d))
* **commands:** invoke void-harness binary, not npx @voidcorp/harness ([d65f729](https://github.com/voidcorp-core/void-harness/commit/d65f729e69e5d81a1054885f4025b771a30d60bf))

## [0.8.0](https://github.com/voidcorp-core/void-harness/compare/v0.7.0...v0.8.0) (2026-06-18)


### Features

* **cli:** backlog-loop command skeleton with --help and --dry-run ([1d75b2b](https://github.com/voidcorp-core/void-harness/commit/1d75b2b6df51ffc1c2e98358756c788f14379a04))
* **cli:** backlog-loop config resolution ([cf27444](https://github.com/voidcorp-core/void-harness/commit/cf2744446e877be7009cff4e47087e55991dcfef))
* **cli:** backlog-loop run loop, circuit-break, and dense summary ([7d43138](https://github.com/voidcorp-core/void-harness/commit/7d43138295c0eabcb57c35b6fbcef830789c20e4))
* **cli:** backlog-loop stream-json parser to domain events ([4164f72](https://github.com/voidcorp-core/void-harness/commit/4164f7258cdebf92d75a837a4b38b0fd666a6e22))
* **cli:** first-run wizard for backlog-loop config ([6a8e53e](https://github.com/voidcorp-core/void-harness/commit/6a8e53e4e7e60cc5a4ebdb9869777f1905afc680))
* **cli:** single-iteration orchestrator + live append-only renderer ([3ea5b99](https://github.com/voidcorp-core/void-harness/commit/3ea5b99ec3084e80725d76403a446a74de8361b5))
* **cli:** subscription billing guard for backlog-loop ([6198906](https://github.com/voidcorp-core/void-harness/commit/61989069164b3eef013de052b43221f2b8d4af29))
* **cli:** wire backlog-loop command to the live loop ([ad69c1d](https://github.com/voidcorp-core/void-harness/commit/ad69c1deea60f33f6a11e5a5605a43eca99c9bdc))
* **core:** /void-backlog-loop slash-command ([8de39d3](https://github.com/voidcorp-core/void-harness/commit/8de39d335cd56a1b2e55ecb7b061290b21c1c1cf))


### Bug Fixes

* rename void: skill prefixes in .source metadata ([de8ac5f](https://github.com/voidcorp-core/void-harness/commit/de8ac5f60e9637bfbc10f851857cb5fd5b76c53e))
* rename void: skill prefixes in .source metadata files ([3cc7ccc](https://github.com/voidcorp-core/void-harness/commit/3cc7ccc0ebbb16a4b497e0b369407ea232bb0b57))

## [0.7.0](https://github.com/voidcorp-core/void-harness/compare/v0.6.1...v0.7.0) (2026-06-12)


### ⚠ BREAKING CHANGES

* skill prefixes /void:* -> /harness:*, enabledPlugins ids void*@void-harness -> harness*@voidcorp, marketplace registration now targets voidcorp-core/void-plugins. Consumers re-run init.

### Features

* rename to harness@voidcorp and move the catalog to void-plugins ([af3b0f0](https://github.com/voidcorp-core/void-harness/commit/af3b0f08b24e80db848fc54d910551c720e7c7fd))

## [0.6.1](https://github.com/voidcorp-core/void-harness/compare/v0.6.0...v0.6.1) (2026-06-05)


### Bug Fixes

* **cli:** check points to void-harness update (clears the drift it measures) ([b1139aa](https://github.com/voidcorp-core/void-harness/commit/b1139aab97691286b360aa5f07573b09a3c9f755))
* **cli:** check suggests `void-harness update`, not `/plugin marketplace update` ([d3d7fee](https://github.com/voidcorp-core/void-harness/commit/d3d7fee6a15f2acdbd1949c29c946fd7d64fcd1c))
