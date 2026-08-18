# Changelog

## [2.7.0](https://github.com/voidcorp-core/void-harness/compare/v2.6.0...v2.7.0) (2026-08-18)


### Features

* **doctor:** retire the pre-journal streams, and write down the layout rule ([0808cff](https://github.com/voidcorp-core/void-harness/commit/0808cffb59353ba347194371075691bf94ba58b2))
* **layout:** ranger .void en trois niveaux nommés, avec migration (DEV-631) ([af58008](https://github.com/voidcorp-core/void-harness/commit/af580087fe73fe28227709276411880c08163e1c))
* **layout:** three named levels in .void, and a migration that renames ([3abf42f](https://github.com/voidcorp-core/void-harness/commit/3abf42f0be2bc4f796d7f4b23001e39265fb2651))


### Bug Fixes

* **cli:** make update honour --force, so its own remedy can be applied ([0c26b29](https://github.com/voidcorp-core/void-harness/commit/0c26b29ab1baa6f36de3baefe30cdeb7b0432427))
* **cli:** update honore --force, pour que son propre remède soit applicable ([fb976cb](https://github.com/voidcorp-core/void-harness/commit/fb976cb98a6119b1aed1e63bdef6b60cc4843692))
* **layout:** autonomous-runs holds plans, not machine state ([ccc8b4b](https://github.com/voidcorp-core/void-harness/commit/ccc8b4b6af763688001e8fa791af2b9927ad75b4))
* **layout:** keep the runner committed, and file the doctrine under installed/ ([a76a6e8](https://github.com/voidcorp-core/void-harness/commit/a76a6e827adefa42ea8f1f046496f988d383f6d2))
* **test:** point the checkpoint skill test at the renamed skill ([359a615](https://github.com/voidcorp-core/void-harness/commit/359a615a8fb3d788513eda9e860aa82d5d35ba1c))
* **update:** drop restorable content instead of relocating it ([612fbb4](https://github.com/voidcorp-core/void-harness/commit/612fbb4e057611473902502eacd66b99a7ca28f1))
* **update:** empty the previous machine directory whole, and file dead streams apart ([45d9bbf](https://github.com/voidcorp-core/void-harness/commit/45d9bbf96df665baf0294eb3575e0a0e21e328e1))
* **update:** migrate the legacy .void layout instead of reporting it forever ([41a3546](https://github.com/voidcorp-core/void-harness/commit/41a354607426b1dd9ad5f753c478905e582e5384))
* **update:** supprimer le restaurable au lieu de le déplacer (DEV-631) ([a80537b](https://github.com/voidcorp-core/void-harness/commit/a80537b5c264d84d5d989229270fd736319928d8))

## [2.6.0](https://github.com/voidcorp-core/void-harness/compare/v2.5.1...v2.6.0) (2026-08-17)


### Features

* **cli:** ask the project graph in paths, and never present a partial answer as complete ([57b58c4](https://github.com/voidcorp-core/void-harness/commit/57b58c404382705acf7c6a530dca72fa127acfb9))
* **cli:** report an unfollowable edge against the files in the answer, not the whole project ([9158b94](https://github.com/voidcorp-core/void-harness/commit/9158b940d845e8c587e979c00d8d9f80ac8e5266))
* **cli:** serve the projects view on localhost with void-harness ui ([bc4c48f](https://github.com/voidcorp-core/void-harness/commit/bc4c48f00933b7d4b2dd218361d135ef661f5c07))
* **cli:** show every Void project and where attention is owed ([cb2b1ae](https://github.com/voidcorp-core/void-harness/commit/cb2b1aed054b3486b4f966d69a8fec647a25fb02))
* **cli:** void-harness projects, le parc et ce qui mérite attention (DEV-622) ([3d295c0](https://github.com/voidcorp-core/void-harness/commit/3d295c0e2a0a916cf1b7f883a3ddb3b3d6ea3295))
* **cli:** void-harness resume, la reprise depuis le checkpoint (DEV-621) ([4dbd1f4](https://github.com/voidcorp-core/void-harness/commit/4dbd1f4d020808efe93ab46012cf8912c10025da))
* **cli:** void-harness resume, pick a project back up from its checkpoint ([3c97ce0](https://github.com/voidcorp-core/void-harness/commit/3c97ce0bb6f8cd0bdbd12c10b408aff6808cdb4f))
* **doctor:** conformité structurelle avec réparation (DEV-628) ([13a894d](https://github.com/voidcorp-core/void-harness/commit/13a894dc289e0531a9721e822795abb4402aa080))
* **doctor:** report structural drift and repair it with --fix ([2414c8e](https://github.com/voidcorp-core/void-harness/commit/2414c8e2f3b128d16324d6cf0306a2f5d0565f19))
* **graph:** a renamed path answers for what it became, proved against a real extraction ([f677e44](https://github.com/voidcorp-core/void-harness/commit/f677e446d8ef77772282530b9ae02c96a117672d))
* **graph:** the seven ProjectGraph queries, bounded and honest about what they do not know ([f5b47a4](https://github.com/voidcorp-core/void-harness/commit/f5b47a4bb4002ab66202f83c4b7b2834841491bc))
* **graph:** the seven ProjectGraph queries, their CLI surface, and what the benchmark does not cover ([88f4e4a](https://github.com/voidcorp-core/void-harness/commit/88f4e4a3ab323a7088f88adf22297a99c818dcf1))
* **hydrate:** an exact manifest, and a restore that proves itself ([1bda140](https://github.com/voidcorp-core/void-harness/commit/1bda14052daef15bd32210d895ca89b7f8bdb9fc))
* **hydrate:** an exact manifest, and a restore that proves itself ([10a1b03](https://github.com/voidcorp-core/void-harness/commit/10a1b03c8cb8e94f989952ebfe31c1caab94124a))
* **layout:** reopen the derived decision, now that hydrate can prove the restore ([9d3352a](https://github.com/voidcorp-core/void-harness/commit/9d3352ab33fed9141cd4ddca3b2aa8a8066d88b9))
* **layout:** reopen the derived decision, now that hydrate can prove the restore ([b959c7f](https://github.com/voidcorp-core/void-harness/commit/b959c7f2faa248f7f7236c7a23e3de5bd9eda34e))
* **layout:** split .void by ownership so what ships is what the project wrote ([9ca1c6a](https://github.com/voidcorp-core/void-harness/commit/9ca1c6a5c58e1b80a7d234d678a238b9ed08ba64))
* **layout:** split .void by ownership so what ships is what the project wrote ([0982056](https://github.com/voidcorp-core/void-harness/commit/0982056da44a9e6575cabd0af4214bd253736609))
* **layout:** stop committing regenerated content, keep what a clone needs to work ([967aa3c](https://github.com/voidcorp-core/void-harness/commit/967aa3c7caa3f0e79ab923abf5a22eec1b4d1c8a))
* **release:** bound what consumers download instead of discovering it after publish ([5b87c37](https://github.com/voidcorp-core/void-harness/commit/5b87c37c24c55ab479aa16bd4c60ae5a37ae8d5d))
* **release:** bound what consumers download instead of discovering it after publish ([17f2622](https://github.com/voidcorp-core/void-harness/commit/17f2622198c280f6c1d2eb5f451f7375cff265b3))
* **session:** route the handoff residue to a checkpoint resume can read ([374ca67](https://github.com/voidcorp-core/void-harness/commit/374ca679971bacdaa05e9cc2e3fd13e954ad93d4))


### Bug Fixes

* **cli:** doctor stops sending operators after problems that are not theirs ([4b4ee9e](https://github.com/voidcorp-core/void-harness/commit/4b4ee9ef974564a8046172aff37453216ce215c1))
* **cli:** doctor stops sending operators after problems that are not theirs ([b82374c](https://github.com/voidcorp-core/void-harness/commit/b82374c7cdee5fcdbb958ebd868a4a4d8c4050ac))
* **cli:** stop counting an unfollowable edge as a path extraction missed ([15d6689](https://github.com/voidcorp-core/void-harness/commit/15d6689f870839e9ed2ceb9fae90172f4a958cb6))
* **cli:** stop counting an unfollowable edge as a path extraction missed ([c4430a4](https://github.com/voidcorp-core/void-harness/commit/c4430a49d54c5e52335a16c421e33010d41e1645))
* **decisions:** restore the accepted record, and put the forward pointer where it belongs ([19edb25](https://github.com/voidcorp-core/void-harness/commit/19edb2516786f32f15d58b0c96d0beac00c3687e))
* **graph:** a build is partial when its completeness is in doubt, not when one edge is unknowable ([fcb9c88](https://github.com/voidcorp-core/void-harness/commit/fcb9c88f3ccc1677d7e0d9722dbe24e249adf9a4))
* **graph:** alias the createRequire import so a bundling host can inline this package ([02d1c1f](https://github.com/voidcorp-core/void-harness/commit/02d1c1f7781385f56ce4500787d3fde7ef47f042))
* **graph:** dedupe related answers, and refuse a missing argument before the store opens ([d3a51dc](https://github.com/voidcorp-core/void-harness/commit/d3a51dc6089d578f33eca0c80756bf28d5a7ed74))
* **graph:** make partial mean something again, and stop a big file from switching off verification ([257ad91](https://github.com/voidcorp-core/void-harness/commit/257ad91a8b67e4b1d4e6494a4e4c967e1aaa7a4d))
* **layout:** carry the split through the conformance scripts and the fleet rollup ([37080ce](https://github.com/voidcorp-core/void-harness/commit/37080cee3a165602db960b448b0e9d5e829cf793))
* **layout:** ownership comes from the install receipt, never from the directory ([e678905](https://github.com/voidcorp-core/void-harness/commit/e6789059832f82d90f53713419f1eb5ca7f4958a))
* **scripts:** exempt the installer-managed block from the sister-doc parity gate ([0397c9b](https://github.com/voidcorp-core/void-harness/commit/0397c9bc5052ebddef5fc3ab45f03e5f92bb776f))
* **ui:** keep the projects link usable for the life of the process ([860124b](https://github.com/voidcorp-core/void-harness/commit/860124bae05d430310069c375d085fcb77f0a197))
* **ui:** refresh the view on return, and show the read time in local time ([8e89a82](https://github.com/voidcorp-core/void-harness/commit/8e89a8211fd74b1a36e35f8825963e133a4b46c5))


### Reverts

* **layout:** take the derived-content decision out of this PR ([455d5ec](https://github.com/voidcorp-core/void-harness/commit/455d5ec148bfc8186628b9fe45b5741bd4495264))

## [2.5.1](https://github.com/voidcorp-core/void-harness/compare/v2.5.0...v2.5.1) (2026-08-03)


### Bug Fixes

* **cli:** make --help explain instead of act, and stop calling unknown a failure ([ee030a7](https://github.com/voidcorp-core/void-harness/commit/ee030a7a975ab74889b18450ea1e12b7c85671f0))
* **cli:** make --help explain instead of act, stop calling unknown a failure, and drop the unproven claim ([933181c](https://github.com/voidcorp-core/void-harness/commit/933181cf38c00e682be125c48fa37ecf01c1b51a))
* **install:** delete the lint auto-repair, which could have switched a project's linter off ([452751e](https://github.com/voidcorp-core/void-harness/commit/452751e378ec6ec3083ac2c3df4877bb8b62e17c))
* **install:** read the project root, not the staging directory, when checking lint ([519d280](https://github.com/voidcorp-core/void-harness/commit/519d2803b5b7566cfd0c0600f73334dbb1837052))
* **install:** read the project root, not the staging directory, when checking lint ([86f7606](https://github.com/voidcorp-core/void-harness/commit/86f760645b5d7c2123853d371ec5175cd407186d))
* **project-graph:** check the root identity instead of watching for it ([5a76710](https://github.com/voidcorp-core/void-harness/commit/5a7671040d82ecbe0c190918ad5e33c6a97924a7))
* **test:** wait for the watch event instead of for fifty milliseconds ([4787ebe](https://github.com/voidcorp-core/void-harness/commit/4787ebeba32fbc47e454f10250be45df8f310484))
* **test:** wait for the watch event instead of for fifty milliseconds ([a110b13](https://github.com/voidcorp-core/void-harness/commit/a110b13f3261b12f1a88d2d1f21a23aeed296ee2))
* **test:** wait for the watch event instead of for fifty milliseconds ([ee09218](https://github.com/voidcorp-core/void-harness/commit/ee09218a23f61dc94b24c803564c0647af3eb945))

## [2.5.0](https://github.com/voidcorp-core/void-harness/compare/v2.4.0...v2.5.0) (2026-08-03)


### Features

* **autopilot:** delegate workers to ticket-runner because ticket quality must have one owner ([47b2a48](https://github.com/voidcorp-core/void-harness/commit/47b2a481f8a6062867edc6047962d3a61fe72d67))
* **autopilot:** publish one reconciliation PR because CI cost belongs at the cluster boundary ([9697e5a](https://github.com/voidcorp-core/void-harness/commit/9697e5a73327976efe479b50af719ed4b6ade68e))
* **autopilot:** range B — worker contract and worktree fan-out ([9515bfc](https://github.com/voidcorp-core/void-harness/commit/9515bfc558c4a2d0f1cdb0c0cf6128047cc811b9))
* **autopilot:** reconcile exact ticket ranges because one PR must retain per-ticket provenance ([e5f76f4](https://github.com/voidcorp-core/void-harness/commit/e5f76f4713f339d5e75cabc64c3be127ad8fe2ee))
* **autopilot:** reconcile remote and tracker state because session resume must be idempotent ([e2c03e8](https://github.com/voidcorp-core/void-harness/commit/e2c03e8ddd5201cf19928aad55be5d854516a83d))
* **autopilot:** run one bounded ticket cluster because parallelism must stay isolated ([5d86841](https://github.com/voidcorp-core/void-harness/commit/5d868413b48b4ff53189435b64f9da385c67ceaf))
* **autopilot:** seal local verification because publication must start from a green integration SHA ([3ea6f4b](https://github.com/voidcorp-core/void-harness/commit/3ea6f4b67433613c91fecbe85d4da3d9a905841c))
* **docs:** generate the cheat sheet from the catalogue, and link it ([695fa02](https://github.com/voidcorp-core/void-harness/commit/695fa0277ccd67b193911ab8ef6e0dfecefe3ad8))
* **dx:** add one verify command ([bdacc79](https://github.com/voidcorp-core/void-harness/commit/bdacc79d648bbc1cc0c3f1b0a9557c0e6c86b9ef))
* **dx:** add one verify command because knowing the gate list should not be the gate ([640ab03](https://github.com/voidcorp-core/void-harness/commit/640ab03797c25b21cbee2a8abb81a00f852bebd4))
* **project-graph:** analyse each project with its own compiler, and record which one ([3090b93](https://github.com/voidcorp-core/void-harness/commit/3090b935d5032f6a5d417c5353a4e586cb121014))
* **security:** add the security command, and let each scanner declare what its exit codes mean ([16ab47a](https://github.com/voidcorp-core/void-harness/commit/16ab47abc1cc0ef0a2f2332747abeee3481486a0))
* **security:** baseline sécurité locale et refus par défaut de toute cible non autorisée ([acc315b](https://github.com/voidcorp-core/void-harness/commit/acc315bf23ea5dd657f563d1eda28388f89ed776))
* **security:** decide severity from the class because a scanner is untrusted input ([1b191cb](https://github.com/voidcorp-core/void-harness/commit/1b191cbf74bcf075918edcb532d5dd6a65f94be7))
* **security:** describe scanners in a manifest that cannot execute or grade anything ([41571d7](https://github.com/voidcorp-core/void-harness/commit/41571d74840c7c66fb9114f115c39aaae7e2a9d1))
* **security:** ship the periodic CI template, an OWASP fixture that proves detection, and route the audit skill to the command ([4d0e1ce](https://github.com/voidcorp-core/void-harness/commit/4d0e1cec5bd92428e5761eb5c30018e3639d5b1e))
* **security:** turn scanner output into findings the engine judges, and never quote a secret back ([14a4e8a](https://github.com/voidcorp-core/void-harness/commit/14a4e8a590a0ae08717522b5b84f12ba9eab4491))
* **skills:** add session-handoff because the expensive half of a session is what you ruled out ([3d6011c](https://github.com/voidcorp-core/void-harness/commit/3d6011ca4688a31f1ac92d31fc65cd1c138fc0aa))


### Bug Fixes

* **cli:** bundle picomatch because the published tarball installs offline ([5e15329](https://github.com/voidcorp-core/void-harness/commit/5e1532918a6aba8f7d9f4bcd19dfcb6e0e051ebf))
* **graph:** stop counting sourced hook libraries as hooks ([0066107](https://github.com/voidcorp-core/void-harness/commit/006610732ae416fa083004828178135003edc0a4))
* **hooks:** judge cross-package imports against declared dependencies, not an invented topology ([005ae70](https://github.com/voidcorp-core/void-harness/commit/005ae702b570ec53817e856d7f41f42a2c304c70))
* **hooks:** let the project's own linter config decide, instead of overruling it ([c162970](https://github.com/voidcorp-core/void-harness/commit/c162970a60d28311a55c66721ae38986725545ee))
* **install:** keep the harness out of the consumer's lint ([8a62ef0](https://github.com/voidcorp-core/void-harness/commit/8a62ef0b9e774a610893b6dd48ed6879f19f25ca))
* **install:** keep the harness out of the consumer's lint, because it put the file there ([3c2a8fb](https://github.com/voidcorp-core/void-harness/commit/3c2a8fb0b5bbb673ad19be8353c48b3fd79558c5))
* **lint:** correct two diagnostics the truncated gate was hiding ([e47e8aa](https://github.com/voidcorp-core/void-harness/commit/e47e8aa1e4fb01f172de5d45578863f178501db9))
* **lint:** report every diagnostic because a truncated gate is a blind gate ([9e73026](https://github.com/voidcorp-core/void-harness/commit/9e73026780cee878651cddfed7edb1a0f67df7ca))
* **readme:** count from the graph model ([4e4c779](https://github.com/voidcorp-core/void-harness/commit/4e4c77981219d776b9ec62380bcdfe9569eca28d))
* **readme:** count from the graph model, because two answers to one question is the bug ([06b38ee](https://github.com/voidcorp-core/void-harness/commit/06b38eeef01d24243b77f5703cb32927797a07f9))

## [2.4.0](https://github.com/voidcorp-core/void-harness/compare/v2.3.0...v2.4.0) (2026-07-29)


### Features

* **autopilot:** add the isolated planning core because cutover needs a tested destination ([91cec27](https://github.com/voidcorp-core/void-harness/commit/91cec270727ac66a267f28fb365a4cb87b451ffc))
* **autopilot:** load the active program contract because sessions need durable authority ([5790fdc](https://github.com/voidcorp-core/void-harness/commit/5790fdc0ea0bc37bb393dc925e8e7a611ecd4f81))
* **autopilot:** persist one versioned run state because sessions need idempotent recovery ([7157252](https://github.com/voidcorp-core/void-harness/commit/7157252007d9e405b4372350fc28eff0e44b699c))
* **autopilot:** plan a reobserved lease because workers need converged ownership ([c987ed0](https://github.com/voidcorp-core/void-harness/commit/c987ed021b7048ab585a5f1736c00964638803b7))
* **autopilot:** range A — planner, active program contract, lease and run state ([a60ee28](https://github.com/voidcorp-core/void-harness/commit/a60ee28f9827fdbd787cd20066908f29abbbb36d))


### Bug Fixes

* **release:** approve by head sha because the release branch outlives its runs ([addb271](https://github.com/voidcorp-core/void-harness/commit/addb271ef0fe995a3e17ae84287e5e7a9dcbdd9e))
* **release:** approve by head sha, not by branch ([05361bf](https://github.com/voidcorp-core/void-harness/commit/05361bf8bb5184c3a1ae191d08400e76954dd2bc))
* **release:** approve the waiting PR checks ([a0281ec](https://github.com/voidcorp-core/void-harness/commit/a0281eccd5cf1907ca4b776af04eda66d256e6cd))
* **release:** approve the waiting PR checks because dispatched runs do not unblock a merge ([c1fc393](https://github.com/voidcorp-core/void-harness/commit/c1fc393cc4eee8c9d39d1b98f3747c1c869c2bf5))
* **release:** poll for the release PR and its runs ([201e511](https://github.com/voidcorp-core/void-harness/commit/201e5119b17d37fd142b45bf99244fd7c683b788))
* **release:** poll for the release PR and its runs because both appear after the signal that announces them ([714a999](https://github.com/voidcorp-core/void-harness/commit/714a999f7eed2f3dd5ab7271afda5b2b275b2719))

## [2.3.0](https://github.com/voidcorp-core/void-harness/compare/v2.2.0...v2.3.0) (2026-07-29)


### Features

* add native project topology and dynamic specialist routing (DEV-436, DEV-440) ([e1cd55d](https://github.com/voidcorp-core/void-harness/commit/e1cd55d1861807bab83bcc9c5e3a3f5cff429ab6))
* **graph:** add native project topology extraction ([ea32cfa](https://github.com/voidcorp-core/void-harness/commit/ea32cfab4b8b8e8f8977829dee7a761fcd4129c0))
* **specialists:** complete dynamic team routing ([7078014](https://github.com/voidcorp-core/void-harness/commit/707801492b5499ca89b35fa03129ec1b0409d209))


### Bug Fixes

* **benchmark:** honour the stability signal because an advisory journal is not an invariant ([031a8b4](https://github.com/voidcorp-core/void-harness/commit/031a8b4e77ef39dc292f24a85115ccc262dad0fa))
* **ci:** build before the ProjectGraph benchmark because it resolves cross-package dist exports ([26401d3](https://github.com/voidcorp-core/void-harness/commit/26401d3017acca1de453257465a381d9c2013272))
* **project-graph:** canonicalise the cache root key with the native realpath because casing must match the root port ([ad2ea29](https://github.com/voidcorp-core/void-harness/commit/ad2ea29ea37548777b555279b5b6776f873c1679))
* **project-graph:** launch pnpm through the shared helper because Windows rejects cmd shims ([c3e3e5d](https://github.com/voidcorp-core/void-harness/commit/c3e3e5d12170a16956444ff2127d9609e80149cf))
* **release:** name the repository for the CI dispatch ([c92da52](https://github.com/voidcorp-core/void-harness/commit/c92da52973cebd5e038d6f7879821da5a039b069))
* **release:** name the repository for the CI dispatch because gh has no worktree to infer it from ([d6f5c0b](https://github.com/voidcorp-core/void-harness/commit/d6f5c0b6c9a1de09c3924bd35b68af471375cc1a))
* **test:** mirror the root test timeout because a filtered run must not judge differently ([4dffb7b](https://github.com/voidcorp-core/void-harness/commit/4dffb7b703b963e3d7b2c961adf8a6b4993e785f))

## [2.2.0](https://github.com/voidcorp-core/void-harness/compare/v2.1.0...v2.2.0) (2026-07-28)


### Features

* **cli:** render the active-program bootstrap because consumers lose the thread between sessions ([6076da4](https://github.com/voidcorp-core/void-harness/commit/6076da4ca6a5dae31dd33c183358ce05d3154786))
* **cli:** report the published version in status and doctor ([f68ce97](https://github.com/voidcorp-core/void-harness/commit/f68ce9708e9f654b4b4a6b0dd1d8f4ab00812f10))
* **freshness:** compare the installed harness against the published version ([2d89911](https://github.com/voidcorp-core/void-harness/commit/2d89911e598ffaeaf0fc5ba2f885d70dbc205cdc))
* **hook:** tell a session once when its harness is outdated ([6ab45b1](https://github.com/voidcorp-core/void-harness/commit/6ab45b11fd491c08c2797898a4dba4a6df7e4b59))
* recover the active program across sessions ([faf4cf6](https://github.com/voidcorp-core/void-harness/commit/faf4cf64a6eec129e952fe55b896e2f108a8e3d3))
* **skills:** make the tracker lifecycle part of execution because a PR is not completion ([9c6e909](https://github.com/voidcorp-core/void-harness/commit/9c6e909c5cb11a6a3d6824e522a5fc79469163b0))
* tell a project when its harness is behind the published version ([fb92025](https://github.com/voidcorp-core/void-harness/commit/fb92025f3fdc465d735379b98f26be2f97d2358f))

## [2.1.0](https://github.com/voidcorp-core/void-harness/compare/v2.0.2...v2.1.0) (2026-07-28)


### Features

* add UI quality, stack profiles, and Graph v3 ([afa4275](https://github.com/voidcorp-core/void-harness/commit/afa4275925eaa92f7601069ec3c2c060d3125d35))
* build v3 Foundation and prove installed hooks ([bf2c4f0](https://github.com/voidcorp-core/void-harness/commit/bf2c4f0bc65fd324046b3c49e930a70156824806))
* **config:** emit argv commands because portable execution must avoid shell parsing ([4ffba37](https://github.com/voidcorp-core/void-harness/commit/4ffba37176c6d1ab0d6e616c77c527f7450bae28))
* **conformance:** execute installed hooks across runtimes ([5336596](https://github.com/voidcorp-core/void-harness/commit/5336596955caec5fc590eee6f7911a293fc55ab1))
* **decisions:** isolate ADR writes because parallel agents need conflict-free ownership ([a39d8ad](https://github.com/voidcorp-core/void-harness/commit/a39d8adab4828d8cd36b7e1ab8cd01079f202266))
* **enforce:** port critical guards to Node because the safety floor must be cross-platform ([7cc4071](https://github.com/voidcorp-core/void-harness/commit/7cc4071ab0956159745099b0544bd9ffb583e0b9))
* **events:** add canonical mission replay because live truth must expose gaps ([74b2e6c](https://github.com/voidcorp-core/void-harness/commit/74b2e6c96ecdd8d59571ddec12aadcf23d601916))
* **events:** record hook outcomes because lifecycle degradation must be observable ([49811da](https://github.com/voidcorp-core/void-harness/commit/49811daea085d47e5a4f7b52c9c2312b86cccf03))
* **evidence:** bind verdicts to fresh proofs because stale success must stay red ([f079a6e](https://github.com/voidcorp-core/void-harness/commit/f079a6ec7644ef12236526211df139028180e9de))
* **graph:** add a validated v3 envelope because compatibility must preserve provenance ([8c3f8da](https://github.com/voidcorp-core/void-harness/commit/8c3f8da7ff94472656ca62cfc133b2a88b864e52))
* **hooks:** make size review provider-agnostic because advisory evidence must travel with Git ([6909c40](https://github.com/voidcorp-core/void-harness/commit/6909c405dfc24f7dc460939d6f8aefd513d4e276))
* **hooks:** port scoped quality rules because agnostic enforcement must stay relevant ([fc4f819](https://github.com/voidcorp-core/void-harness/commit/fc4f819b0494f5b38107ff0c629c3fdf6bb59425))
* **init:** add ownership receipts because updates and removal must be reversible ([2aa2223](https://github.com/voidcorp-core/void-harness/commit/2aa2223648113d127356b7d532e7e44e2c2b5cc5))
* **init:** materialize local runtime assets because account-free install is the primary path ([650f983](https://github.com/voidcorp-core/void-harness/commit/650f983502f594ba46353aa75e04b57daef6aadd))
* **lifecycle:** add pure portable plans because adapters need deterministic policy ([4579b6e](https://github.com/voidcorp-core/void-harness/commit/4579b6ec6cedc6c9ed3ea6ac59de905a11208721))
* **lifecycle:** replace shell policy with bounded Node adapters because hooks must degrade visibly ([e7f610a](https://github.com/voidcorp-core/void-harness/commit/e7f610ae5497f4e747a05038824d071ecd4a0816))
* **mission-engine:** gate team reviews because command proof cannot replace specialists ([ef0b6a6](https://github.com/voidcorp-core/void-harness/commit/ef0b6a6a3a9a53d5c66aedc0f7f563d01399c149))
* **mission:** add risk modes and idempotent recovery ([73ff56a](https://github.com/voidcorp-core/void-harness/commit/73ff56a3e304f2ecf12cb928f3f0fc776fa0de32))
* **mission:** add risk modes and idempotent recovery because quality must survive interruption ([753cb79](https://github.com/voidcorp-core/void-harness/commit/753cb7919629b8547ba24fc02f464f71c49c46cc))
* **mission:** compile policies because every pass needs proof ([4870cf5](https://github.com/voidcorp-core/void-harness/commit/4870cf547650e3dac300809342776d064f4a058b))
* **packs:** reconcile local assets because lifecycle commands must honor receipts ([079420e](https://github.com/voidcorp-core/void-harness/commit/079420e6fca657667340b8ecc8c6179e5b814b5d))
* **profiles:** route fresh stack guidance because monorepos need local expertise ([4823cc9](https://github.com/voidcorp-core/void-harness/commit/4823cc9d0080ebc1d31a9f7d64912c1a6ac79a25))
* **runtime:** install one Node asset because native hooks must be dependency-free ([fc6f018](https://github.com/voidcorp-core/void-harness/commit/fc6f01868ec8b4e5c9d608f542c10d99fc7a3e3f))
* **self-host:** compile local runtime assets because the harness must consume itself ([f281525](https://github.com/voidcorp-core/void-harness/commit/f281525e85348f6075f647b62fbac4fc35da81aa))
* **specialists:** compile native architecture, security, and QA agents ([#160](https://github.com/voidcorp-core/void-harness/issues/160)) ([b6bc309](https://github.com/voidcorp-core/void-harness/commit/b6bc3097462087582c2ec82a29af3839f7c9ffae))
* **ticket-runner:** orchestrate the native MVP team ([6de2865](https://github.com/voidcorp-core/void-harness/commit/6de2865ab86646c6a08bc71b7f44e6ecf27d8323))
* **ticket-runner:** scope native reviews because one writer needs independent proof ([2ef4bac](https://github.com/voidcorp-core/void-harness/commit/2ef4bac8d4bdb53e7ca41f6159ad74515c2d41db))
* **ui:** gate approval on fresh evidence because builders cannot self-certify ([a6c0b51](https://github.com/voidcorp-core/void-harness/commit/a6c0b51be11d0b6191741fa799c49b019bacb89a))


### Bug Fixes

* **build:** order clean checkout CLI dependencies ([2ad7d52](https://github.com/voidcorp-core/void-harness/commit/2ad7d5200553a7d361fd0e66f74e1b491bd755b8))
* **ci:** fetch ADR comparison base because immutability must fail honestly ([e1758f2](https://github.com/voidcorp-core/void-harness/commit/e1758f2ca7f644cde90620e71c79b4299dabc6b7))
* **conformance:** launch package managers through Node because Windows rejects cmd shims ([256933d](https://github.com/voidcorp-core/void-harness/commit/256933deab3100ccdc9890491baf15320cd598ed))
* **doctor:** execute runtime postconditions because installed must not mean working ([3852ae0](https://github.com/voidcorp-core/void-harness/commit/3852ae0c71d24e056dddcd576024e2d55dd5811d))
* **enforce:** exempt certified artifacts because bounded scans must fail usefully ([dd8cc73](https://github.com/voidcorp-core/void-harness/commit/dd8cc73711099ee97a5fafd4a83c3cb1e50c9f81))
* **hooks:** preserve executable adapters because compatibility must remain live ([234af19](https://github.com/voidcorp-core/void-harness/commit/234af19e32071dec20c292c3cad48fcade93fbf9))
* **hooks:** preserve lifecycle edge contracts because portability must not hide failures ([3ec8700](https://github.com/voidcorp-core/void-harness/commit/3ec8700de3bb7e6ea26cbfe6471ef1d0971a4185))
* **hooks:** reject malformed refs without control regexes because the lint gate is part of portability ([b726059](https://github.com/voidcorp-core/void-harness/commit/b726059f87cd07f1bab68b776d50d5ab728e430e))
* **release:** drop obsolete marketplace dispatch because releases are self-hosted (DEV-519) ([c359a06](https://github.com/voidcorp-core/void-harness/commit/c359a06873913bce855670772b89743350856f76))
* **release:** drop obsolete void-plugins dispatch (DEV-519) ([673ea6a](https://github.com/voidcorp-core/void-harness/commit/673ea6ae21617b07eb8e7008c504a0d18d85734b))
* **self-host:** close source and credential gaps because dogfood must be trustworthy ([bce4130](https://github.com/voidcorp-core/void-harness/commit/bce41305c5e5e1822823f5333f650b85a1728738))
* **skills:** parse CRLF frontmatter because Windows installs must retain the skill surface ([5e70780](https://github.com/voidcorp-core/void-harness/commit/5e70780ff39a240f8f689364c1f451a668ae2738))
* **studio:** project scrubber status through pure state ([126f83d](https://github.com/voidcorp-core/void-harness/commit/126f83d43eb8e44f89393b6bc9846606503625ee))
* **tdd:** ignore non-executable assets because UI proof is not a sibling file ([2b8af76](https://github.com/voidcorp-core/void-harness/commit/2b8af76bd5f9e8dd5118096b197c6eb2a9e1642a))

## [2.0.2](https://github.com/voidcorp-core/void-harness/compare/v2.0.1...v2.0.2) (2026-07-24)


### Bug Fixes

* **release:** declare provenance explicitly, and stop the README claiming it ([#154](https://github.com/voidcorp-core/void-harness/issues/154)) ([00c18ca](https://github.com/voidcorp-core/void-harness/commit/00c18ca7017dd0a88584a5ff97f7f7c6ce1144ed))

## [2.0.1](https://github.com/voidcorp-core/void-harness/compare/v2.0.0...v2.0.1) (2026-07-24)


### Bug Fixes

* **ci:** build before typecheck in the publish gate ([#150](https://github.com/voidcorp-core/void-harness/issues/150)) ([3772698](https://github.com/voidcorp-core/void-harness/commit/377269847e8b476759f7b6324f82acd5a043be2d))
* **ci:** drop setup-node's registry-url, which silently disabled OIDC publishing ([#153](https://github.com/voidcorp-core/void-harness/issues/153)) ([4615574](https://github.com/voidcorp-core/void-harness/commit/4615574401f1c583861344a128da7ba7a4e7c1c2))

## [2.0.0](https://github.com/voidcorp-core/void-harness/compare/v1.2.0...v2.0.0) (2026-07-24)


### ⚠ BREAKING CHANGES

* **init:** transactional install — preflight before writing, rollback on failure ([#142](https://github.com/voidcorp-core/void-harness/issues/142))
* **cli:** the CLI npm package is now `voidharness`, not `@voidfactory/harness`. Requires a one-time npm Trusted Publisher re-bootstrap under the new name (see docs/RELEASING.md "First publish").

### Features

* **cli:** rename npm package @voidfactory/harness -&gt; voidharness, add `vh` bin alias ([#140](https://github.com/voidcorp-core/void-harness/issues/140)) ([ffa1f5d](https://github.com/voidcorp-core/void-harness/commit/ffa1f5da89c533afd46a566a807b644472969834))
* **codex:** mirror the full Claude enforcement surface and compile the agents ([58013d1](https://github.com/voidcorp-core/void-harness/commit/58013d1c524a8f7e1ab9d267d78c8ec490dc217a))
* **codex:** stage skills into .agents/skills so Codex can discover them ([#125](https://github.com/voidcorp-core/void-harness/issues/125)) ([#131](https://github.com/voidcorp-core/void-harness/issues/131)) ([d6b6938](https://github.com/voidcorp-core/void-harness/commit/d6b6938af2633b5f7ae4eb2f316d783849cbda7c))
* **marketplace:** self-host the plugin catalog in this repo ([#133](https://github.com/voidcorp-core/void-harness/issues/133)) ([366dc3f](https://github.com/voidcorp-core/void-harness/commit/366dc3f3ab18cda863a3d22f8215aeb1047836f2))
* **status:** enforcement scored as coverage, not the strongest single tier ([#126](https://github.com/voidcorp-core/void-harness/issues/126)) ([#135](https://github.com/voidcorp-core/void-harness/issues/135)) ([ee2cba2](https://github.com/voidcorp-core/void-harness/commit/ee2cba20647eb781f08e44567308f80fd0f1e133))
* **status:** install-state filters by activated packs, not the whole catalog ([#126](https://github.com/voidcorp-core/void-harness/issues/126)) ([#134](https://github.com/voidcorp-core/void-harness/issues/134)) ([171a779](https://github.com/voidcorp-core/void-harness/commit/171a77996ba3c566bfb2542418e7562dd0c5a2f3))


### Bug Fixes

* **init:** --pack installs the pack's skills instead of reporting a fake success ([ba501e2](https://github.com/voidcorp-core/void-harness/commit/ba501e2b57471d01d71b35d3d5e69a8c46745126))
* **init:** transactional install — preflight before writing, rollback on failure ([#142](https://github.com/voidcorp-core/void-harness/issues/142)) ([ac9e3cd](https://github.com/voidcorp-core/void-harness/commit/ac9e3cd12849b71dfdc857626ada7b0528d0a171))
* **skills:** valid-YAML frontmatter for the 7 colon-carrying descriptions ([#130](https://github.com/voidcorp-core/void-harness/issues/130)) ([#136](https://github.com/voidcorp-core/void-harness/issues/136)) ([9bf17f7](https://github.com/voidcorp-core/void-harness/commit/9bf17f7e5a488b49691290defddaf90e408d940c))
* **status:** activation is pending when usage is unobservable (Codex), not 0 ([#143](https://github.com/voidcorp-core/void-harness/issues/143)) ([feca777](https://github.com/voidcorp-core/void-harness/commit/feca7778a021c626c76f8932cbf0f8c05e4008b2))
* **status:** call it "structure score" until there's behavioral evidence ([#6](https://github.com/voidcorp-core/void-harness/issues/6)) ([#146](https://github.com/voidcorp-core/void-harness/issues/146)) ([479420a](https://github.com/voidcorp-core/void-harness/commit/479420a43b20e452658c3fcf8cab2979568d2cce))

## [1.2.0](https://github.com/voidcorp-core/void-harness/compare/v1.1.0...v1.2.0) (2026-07-22)


### Features

* **cli:** give `help` the void identity + a pnpm-dlx hint ([71ee231](https://github.com/voidcorp-core/void-harness/commit/71ee231879481d5433b6719ed9111f6d92e1a39f))
* **cli:** help screen gets the void identity + pnpm-dlx hint ([b26147d](https://github.com/voidcorp-core/void-harness/commit/b26147d8ecbce83423c9413e37318e0f0fd19efc))


### Bug Fixes

* **cli:** chmod +x staged Codex hooks (pack strips the exec bit) ([0bcba92](https://github.com/voidcorp-core/void-harness/commit/0bcba92653e4867e894c98ebf827a8cf19b6ad27))
* **cli:** chmod +x the staged Codex hooks — pack strips the exec bit ([54d88f3](https://github.com/voidcorp-core/void-harness/commit/54d88f37402ab72233cce06d524a411d8545ff2e))
* **release:** bump repo to pnpm 10 so OIDC trusted publishing works; add manual re-publish ([638f66f](https://github.com/voidcorp-core/void-harness/commit/638f66f7a6d0eac967db82fb51993d7a4657bee2))
* **release:** pnpm 10 for OIDC publishing + manual re-publish ([22327a0](https://github.com/voidcorp-core/void-harness/commit/22327a08bc0e107da01118951ddbabab13832052))

## [1.1.0](https://github.com/voidcorp-core/void-harness/compare/v1.0.0...v1.1.0) (2026-07-22)


### Features

* **cli:** a "void in the shell" visual identity + README refresh for 1.0.0 ([23c78c2](https://github.com/voidcorp-core/void-harness/commit/23c78c2e52b7c2dfc8eaa08b58705379dbacaa3e))
* **cli:** void-in-the-shell visual identity + README refresh for 1.0.0 ([11aa3e7](https://github.com/voidcorp-core/void-harness/commit/11aa3e78bef80c37c33e53f3c11eb596d5484ed3))

## [1.0.0](https://github.com/voidcorp-core/void-harness/compare/v0.17.0...v1.0.0) (2026-07-22)

First public release. Declares the CLI's public surface stable; from here,
Conventional Commits map to standard SemVer (breaking → major).

### Features

* **cli:** multi-runtime harness via a runtime-adapter seam — `init`/`runtime add`/`doctor` iterate runtime adapters (Claude Code + Codex), each owning its wiring and doctrine doc; add a runtime a-posteriori without friction ([#111](https://github.com/voidcorp-core/void-harness/pull/111))
* **cli:** `graph` reporting works standalone by reusing the shipped model.json ([#114](https://github.com/voidcorp-core/void-harness/pull/114))

### Continuous Integration

* **release:** tokenless, provenance-signed npm publish via Trusted Publishing (OIDC), gated on the release-PR merge ([#113](https://github.com/voidcorp-core/void-harness/pull/113), [#116](https://github.com/voidcorp-core/void-harness/pull/116))

## [0.17.0](https://github.com/voidcorp-core/void-harness/compare/v0.16.0...v0.17.0) (2026-07-21)


### Features

* **hooks:** trim oversized Bash/MCP tool output (token frugality) ([#104](https://github.com/voidcorp-core/void-harness/issues/104)) ([6aab377](https://github.com/voidcorp-core/void-harness/commit/6aab37789f250935bd5ced762e881b403283c9cc))

## [0.16.0](https://github.com/voidcorp-core/void-harness/compare/v0.15.0...v0.16.0) (2026-07-10)


### Features

* **audit:** cross-project telemetry rollup + opt-in issue push ([#72](https://github.com/voidcorp-core/void-harness/issues/72)) ([89d83c0](https://github.com/voidcorp-core/void-harness/commit/89d83c05dd725fce5c58da9c28ef910dec52fa93))
* **backlog-autopilot:** per-worker model tier driven by ticket stakes (DEV-404) ([d97407d](https://github.com/voidcorp-core/void-harness/commit/d97407ddfe7083fa96e1de2e798a99049aeb3fe8))
* **backlog-autopilot:** per-worker model tier driven by ticket stakes (DEV-404) ([f070f3a](https://github.com/voidcorp-core/void-harness/commit/f070f3a8e2f238cd8d37a4f94556a8b4310e9302))
* **backlog-autopilot:** shared-append conflict protocol — owned by integration (DEV-402) ([063c59a](https://github.com/voidcorp-core/void-harness/commit/063c59affc9fe0109fb4847c7cdd34f6fc3494b9))
* **backlog-autopilot:** shared-append conflict protocol — owned by integration, not workers (DEV-402) ([825968c](https://github.com/voidcorp-core/void-harness/commit/825968cdd63c2ca66f087c6e46f031e92c7a8307))
* **brainstorming:** sharpen the demand pre-emption and the per-turn assignment (DEV-386) ([56caf99](https://github.com/voidcorp-core/void-harness/commit/56caf9998f2b38ce12c8658a90a4248b19be2132))
* **cli:** doctor validates config by schema + checks hook/pack health ([#68](https://github.com/voidcorp-core/void-harness/issues/68)) ([7a06636](https://github.com/voidcorp-core/void-harness/commit/7a06636f1257f21ea54bf3e44b4c0d927c1c8f91))
* **cli:** init fails loud on missing prerequisites, never pins a stale version ([#67](https://github.com/voidcorp-core/void-harness/issues/67)) ([61c7b06](https://github.com/voidcorp-core/void-harness/commit/61c7b06dd05fd7b0245b16f6dd589f0b3b644c06))
* **contract:** forge-&gt;harness spec artifact contract on the core-hub model ([#76](https://github.com/voidcorp-core/void-harness/issues/76)) ([6eaf759](https://github.com/voidcorp-core/void-harness/commit/6eaf7596f0ee75e4a1975169f83d78b7b64a9ac1))
* **devex-audit:** vendor the live DX audit as a dedicated audit-ceiling skill (DEV-398) ([7591bc4](https://github.com/voidcorp-core/void-harness/commit/7591bc4471249c9efe1a121ae3353937efde4ef8))
* **devex-audit:** vendor the live DX audit as a dedicated audit-ceiling skill (DEV-398) ([79e9259](https://github.com/voidcorp-core/void-harness/commit/79e9259c7e0a483c7c0a1f91d4f31220dce30e7e))
* **enforce:** replay the floor server-side via a shared-logic GitHub Action (DEV-393) ([8d9ca7b](https://github.com/voidcorp-core/void-harness/commit/8d9ca7bde4dcf1bb3b15e53f0e248ae46f4773e0))
* **enforce:** server-side floor via a shared-logic GitHub Action (DEV-393) ([ccc2226](https://github.com/voidcorp-core/void-harness/commit/ccc22263aa848eb4cdc00582bbb476eb6597cef5))
* **eval-harness:** behavioral skill evals — measure prose effect, not form (DEV-394) ([7b13aae](https://github.com/voidcorp-core/void-harness/commit/7b13aae48c0cbcc936c024c0da81e5c5fd275634))
* **eval-harness:** behavioral skill evals — measure the prose's effect, not its form (DEV-394) ([c3f37f5](https://github.com/voidcorp-core/void-harness/commit/c3f37f51b9a6f21b16f97ce53154a8ad576e5124))
* **eval-harness:** LLM judge (injected port, last resort) + blind head-to-head (DEV-397) ([4bc1896](https://github.com/voidcorp-core/void-harness/commit/4bc1896e41ff2f3f8084c3d059cd429d6e16af4b))
* **eval-harness:** LLM judge (injected port, last resort) + blind head-to-head (DEV-397) ([2c8401a](https://github.com/voidcorp-core/void-harness/commit/2c8401aee94d44ac2035479c6ddb62cd94ae42d0))
* **hooks:** secret-in-content (blocking) + stop-typecheck (advisory) ([#77](https://github.com/voidcorp-core/void-harness/issues/77)) ([86e178a](https://github.com/voidcorp-core/void-harness/commit/86e178a13f155e2b7f12645a329907c1a287bad1))
* **make-pdf:** rebuild gstack make-pdf on marked + puppeteer-core, page numbers (DEV-391) ([d32999b](https://github.com/voidcorp-core/void-harness/commit/d32999b9eb8b51558345fa3cc76bf8c807986fe1))
* **make-pdf:** rebuild on marked + puppeteer-core, page numbers (DEV-391) ([a9208be](https://github.com/voidcorp-core/void-harness/commit/a9208bee829a0b6570fc0875060f8b5ebf31fcd1))
* **qa:** vendor live browser QA re-pointed onto the claude-in-chrome MCP (DEV-390) ([2268f27](https://github.com/voidcorp-core/void-harness/commit/2268f27f5b37d5dab0b072b1750061a8de4a1bbb))
* **qa:** vendor live browser QA re-pointed onto the claude-in-chrome MCP (DEV-390) ([28c1090](https://github.com/voidcorp-core/void-harness/commit/28c109078a29736883e6d6a0508dc94d56fa0ea0))
* **skills:** fold ship/spec/investigate deltas into existing skills (DEV-388) ([d35805e](https://github.com/voidcorp-core/void-harness/commit/d35805e3f9afb28f3cc8f943b576fa8d2944f875))
* **skills:** fold ship/spec/investigate deltas into existing skills (DEV-388) ([46a94b7](https://github.com/voidcorp-core/void-harness/commit/46a94b756aa12a8a008925fac99d6d4530f21429))
* **skills:** split design craft into frontend-design (build) + new ui-review (audit); internalise impeccable (DEV-389) ([7b593b9](https://github.com/voidcorp-core/void-harness/commit/7b593b9f6aeed9b396535deb3eb2718903d72759))
* **skills:** split design craft into frontend-design (build) + ui-review (audit); internalise impeccable (DEV-389) ([b42a20c](https://github.com/voidcorp-core/void-harness/commit/b42a20c13b0ff7a018cb27b71e60cd3f635d0580))
* **skills:** vendor gstack /cso as a dedicated security-audit skill (DEV-387) ([3f8bb0f](https://github.com/voidcorp-core/void-harness/commit/3f8bb0f98217f9c18a5609cccceb7d2bd29a9e15))
* **skills:** vendor gstack /cso as a dedicated security-audit skill (DEV-387) ([14db394](https://github.com/voidcorp-core/void-harness/commit/14db3949f764753136c96aa58ef39274803eb190))
* **skills:** vendor gstack /office-hours into brainstorming (DEV-386) ([1bc18a6](https://github.com/voidcorp-core/void-harness/commit/1bc18a69ab6397c2cd0c64dfd51e03165405083c))
* **skills:** vendor gstack /office-hours into brainstorming as an idea pressure-test mode (DEV-386) ([beab071](https://github.com/voidcorp-core/void-harness/commit/beab071515a81c437c98324c65697e4ce107e4b1))
* **skills:** vendor gstack /retro as harness:retrospective (DEV-396) ([3f7750b](https://github.com/voidcorp-core/void-harness/commit/3f7750b32c6ea877ca731b57a4696b330a1bffba))
* **skills:** vendor gstack /retro as harness:retrospective, gamification dropped (DEV-396) ([481d846](https://github.com/voidcorp-core/void-harness/commit/481d8467cf657705af37f92a14a89a70354b9293))
* **skills:** vendor the 4 gstack plan-reviews + autoplan as one plan-review skill (DEV-385) ([a373ef1](https://github.com/voidcorp-core/void-harness/commit/a373ef1f751a1d56b0d3085a2341fd85f050d3de))
* **skills:** vendor the 4 gstack plan-reviews + autoplan as one plan-review skill (DEV-385) ([60f864b](https://github.com/voidcorp-core/void-harness/commit/60f864b6c798237362020b539e2626e969ec0791))
* **telemetry:** capture outcomes to turn cost telemetry into a cost/value ledger ([#71](https://github.com/voidcorp-core/void-harness/issues/71)) ([0647116](https://github.com/voidcorp-core/void-harness/commit/0647116785632fe692313c377c6fe21b63992790))
* **ticket-runner:** apply migrations to dev/local before tests, prod via CI only ([cc0ea21](https://github.com/voidcorp-core/void-harness/commit/cc0ea215ef8f71f269f7a932154d5adf491e4aed))
* **ticket-runner:** apply migrations to dev/local before tests, prod via CI only ([deaadc6](https://github.com/voidcorp-core/void-harness/commit/deaadc60fb48dc3b5509be5d955be749297f38d3))


### Bug Fixes

* **enforce:** allow a lockfile change accompanied by a manifest change (DEV-393 follow-up) ([4b04403](https://github.com/voidcorp-core/void-harness/commit/4b04403b931397648d978846835d7ee8f2fd4a25))
* **enforce:** allow a lockfile change accompanied by a manifest change (DEV-393 follow-up) ([16eb1bd](https://github.com/voidcorp-core/void-harness/commit/16eb1bdc7c30ae795a1dba50d8d312690b3f0300))
* **hooks:** normalize absolute tool paths against the project root ([#62](https://github.com/voidcorp-core/void-harness/issues/62)) ([73c65a1](https://github.com/voidcorp-core/void-harness/commit/73c65a1baf3a09563ad04b7ced2fc69861703119))
* **hooks:** rewrite no-as-cast-grep in POSIX ERE, not PCRE ([#64](https://github.com/voidcorp-core/void-harness/issues/64)) ([e3b71eb](https://github.com/voidcorp-core/void-harness/commit/e3b71eb1b965bd0dc0e91d3c9fda58971a395a68))


### Performance Improvements

* **harness:** token-frugality audit + tier type-design-analyzer/estimator down (DEV-403) ([ac660dd](https://github.com/voidcorp-core/void-harness/commit/ac660ddde3189427ca642a5f3e8b9a436b6e2755))
* **harness:** token-frugality audit + tier type-design-analyzer/estimator down (DEV-403) ([143e395](https://github.com/voidcorp-core/void-harness/commit/143e395fb2b715364a16104a132f8ec83f7cfbbe))

## [0.15.0](https://github.com/voidcorp-core/void-harness/compare/v0.14.0...v0.15.0) (2026-07-06)


### Features

* **graph:** close cost/behavior telemetry blind spots via activation mode ([#58](https://github.com/voidcorp-core/void-harness/issues/58)) ([72abada](https://github.com/voidcorp-core/void-harness/commit/72abada6e165ebe71b323b0e02f6d41096fa7f21))
* **graph:** telemetry-gap finding collapses unrecorded firing kinds ([#61](https://github.com/voidcorp-core/void-harness/issues/61)) ([7019b9b](https://github.com/voidcorp-core/void-harness/commit/7019b9ba6b8c9b637918d0829f3a77cb04c545cb))


### Bug Fixes

* **activation-meter:** count Agent spawns as kind=agent ([#60](https://github.com/voidcorp-core/void-harness/issues/60)) ([f6e40bf](https://github.com/voidcorp-core/void-harness/commit/f6e40bf412dc6634459f8d3d87b9162079d92fd1))

## [0.14.0](https://github.com/voidcorp-core/void-harness/compare/v0.13.1...v0.14.0) (2026-07-02)


### Features

* backlog-autopilot --auto-merge MVP (attended batch) ([#51](https://github.com/voidcorp-core/void-harness/issues/51)) ([d5d3e44](https://github.com/voidcorp-core/void-harness/commit/d5d3e44086c287b03daeb9c86564d74c717006d0))
* **core:** ticket-runner UX/UI pass leads with impeccable for interface craft ([#52](https://github.com/voidcorp-core/void-harness/issues/52)) ([34c1e8d](https://github.com/voidcorp-core/void-harness/commit/34c1e8d689b0d4109756db70a7fa7b42e7472ed2))
* graph consumer delivery — /void-graph (sub-project B) ([#50](https://github.com/voidcorp-core/void-harness/issues/50)) ([889c65b](https://github.com/voidcorp-core/void-harness/commit/889c65b1cd7235491a519909a5fa716dc65b4770))
* graph studio cost viz — cost layer + panel (sub-project C) ([#54](https://github.com/voidcorp-core/void-harness/issues/54)) ([cec38d3](https://github.com/voidcorp-core/void-harness/commit/cec38d3ea076b5a0dab97b64e7f9d813e7944b8e))
* **harness-graph:** 'enforces' edge kind + wire agents/hooks into the graph ([#57](https://github.com/voidcorp-core/void-harness/issues/57)) ([af42d1b](https://github.com/voidcorp-core/void-harness/commit/af42d1b1a1cf97c970287a4bfe755d369ca70eb2))
* **harness-graph:** graph cost profiler (sub-project A) ([#48](https://github.com/voidcorp-core/void-harness/issues/48)) ([2a21536](https://github.com/voidcorp-core/void-harness/commit/2a21536493932112ca3731eb5108f3126b0c6477))


### Bug Fixes

* **core:** isolate the backlog-autopilot reconcile agent in its own worktree ([#53](https://github.com/voidcorp-core/void-harness/issues/53)) ([01d11e2](https://github.com/voidcorp-core/void-harness/commit/01d11e247486f0d1d9ced3f0b387e0646b423b04))
* harden graph live (loopback + scoped CORS) + release gates + stale docs ([#55](https://github.com/voidcorp-core/void-harness/issues/55)) ([91a6cbb](https://github.com/voidcorp-core/void-harness/commit/91a6cbbfa6dd4acf7dc87d29b5fe27638f71680b))

## [0.13.1](https://github.com/voidcorp-core/void-harness/compare/v0.13.0...v0.13.1) (2026-06-29)


### Bug Fixes

* **release:** pass the released tag to void-plugins bump-shas ([d18f924](https://github.com/voidcorp-core/void-harness/commit/d18f924701e1b0630e0744e8deda13aa78612f30))
* **release:** pass the released tag to void-plugins bump-shas ([b71afe2](https://github.com/voidcorp-core/void-harness/commit/b71afe217bb2f314daf7f12bb7f666d9a5b270f5))

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
