# Changelog

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
