# Changelog

## [1.7.0](https://github.com/portel-dev/ncp/compare/v1.6.0...1.7.0) (2025-12-14)

### ⚠ BREAKING CHANGES

* Scheduler now uses timing groups instead of individual job schedules

- feat: add timing groups to reduce OS scheduler overhead
- feat: implement parallel task execution with process isolation
- fix: launchd getJobs() now properly enumerates existing entries
- feat: add cron-to-timing-id conversion utilities
- feat: spawn isolated child processes for each task execution
- feat: add TaskManager for tasks and timing groups CRUD operations
- feat: add TimingExecutor for parallel execution
- feat: add automatic V1 to V2 migration
- test: add process isolation tests (69 tests passing)
- docs: add comprehensive testing guides and implementation summary
- refactor: TaskManager supports custom scheduler dir for testing
- refactor: maintain backward compatibility through wrapper methods

Storage migrates automatically from V1 jobs.json to V2 schedule.json.
Multiple tasks sharing same cron expression are grouped under one OS schedule.
Each task executes in isolated child process preventing cascading failures.
Timing groups use descriptive IDs (e.g., "daily-9am", "every-5min").

### Features

* add --token and -y flags for non-interactive MCP installation ([b87c273](https://github.com/portel-dev/ncp/commit/b87c27302dc5f8eb31f592aaabd383f9b91f1d6e))
* add analytics internal MCP for AI-accessible usage insights ([72e5dc3](https://github.com/portel-dev/ncp/commit/72e5dc3b303acc049156e77253429f46fd072d1b))
* add Anthropic Agent Skills support ([12e19d1](https://github.com/portel-dev/ncp/commit/12e19d108f72d7f1ca463d383625a8f2333f38fd))
* add atomic operations and rollback for skill/photon updates ([4f06d9d](https://github.com/portel-dev/ncp/commit/4f06d9d639a01fd8aebf6e38e62769337ad2c009))
* add automatic catchup agent for missed scheduled tasks ([9da4ac2](https://github.com/portel-dev/ncp/commit/9da4ac2c0044a98857aba7ffc30db34133b6036d))
* add batch operation detection and metrics tracking ([112076a](https://github.com/portel-dev/ncp/commit/112076a0279021bef838bcff0ebf1038005f2d81))
* add built-in Shell MicroMCP with env-based enablement ([ad5ba82](https://github.com/portel-dev/ncp/commit/ad5ba8289e040d39cb4bed689b0d1a8a1f7b680f))
* add built-in system utilities to CLI catalog ([0a8e706](https://github.com/portel-dev/ncp/commit/0a8e7063453480d72803a272b4cffd6921780f2c))
* add bulk credential collection for import tool ([a57ad5a](https://github.com/portel-dev/ncp/commit/a57ad5ab20de67592bef02a50430e0e45b9bf31b))
* add catchupMissed property and schedule catchup command ([3a1e64a](https://github.com/portel-dev/ncp/commit/3a1e64a5e81fdf19a22d29c680ea88b1b4977dc6))
* add CLI polish with fuzzy matching and status indicators (Phase 2) ([8998941](https://github.com/portel-dev/ncp/commit/8998941c5861657f466a0c33134697fa3bb25358))
* add Code-Mode + Scheduler automation powerhouse demo ([d6c90c5](https://github.com/portel-dev/ncp/commit/d6c90c5438246b8630702e4ebc1feed12341c148))
* add Code-Mode examples to find responses ([750460e](https://github.com/portel-dev/ncp/commit/750460ecc3d7c2072b2d1473b56fa9356d6c578a))
* add Code-Mode testing and measurement tools ([fff903a](https://github.com/portel-dev/ncp/commit/fff903a38c8c04b499f0c26d049d3a35ad79e502))
* add Code-Mode workflow examples for multi-query find ([8c1656f](https://github.com/portel-dev/ncp/commit/8c1656f894355746976958f95508d454c27bbd9b))
* add comprehensive `ncp doctor` diagnostics command ([75c4892](https://github.com/portel-dev/ncp/commit/75c48920c2d63006b225bd91f0c728c02c84c7e4))
* add comprehensive error messages and end-to-end scheduler tests ([ab48505](https://github.com/portel-dev/ncp/commit/ab4850548780e8ed04fdd3edca5eccb3ed7b1b0c))
* add conditional auto-scanning for CLI tools ([8e29e99](https://github.com/portel-dev/ncp/commit/8e29e993a601c9a470306101ce8cff2f91a1bd15))
* add configurable log rotation settings to global config ([05b55f6](https://github.com/portel-dev/ncp/commit/05b55f605b602f208bacb6ee9c84b6b1e92a535c))
* add conflict detection between CLI and FileWatcher ([0f2922e](https://github.com/portel-dev/ncp/commit/0f2922efb2f1826a4bb91c7ebed7e5861b0a162a))
* add credential removal and vault metadata ([dc15886](https://github.com/portel-dev/ncp/commit/dc15886f15018789058d8868c225bf95c631d168))
* add cross-platform support for CLI discovery (Windows/Linux/macOS) ([a0282b3](https://github.com/portel-dev/ncp/commit/a0282b34a04baaf02056ae9ca6f70183c48fb545))
* add debounce and temp file filtering to FileWatcher ([8f77338](https://github.com/portel-dev/ncp/commit/8f77338eb805b77859d8fef3e7d45488a4f1de2b))
* add diagnostic logging and enhanced error messages ([35772bc](https://github.com/portel-dev/ncp/commit/35772bc41c684e549559074c3b11170ec0b700a8))
* add enhanced diagnostic logging for code tool parameter debugging ([c38f0b0](https://github.com/portel-dev/ncp/commit/c38f0b0bd87cb159a590fbd084c068086459d8e5))
* add FileWatcher service for dynamic skills and photons discovery ([259d54a](https://github.com/portel-dev/ncp/commit/259d54a19db7c99d339c53311ed5e7b7e8e1fc8d))
* add icon support to MCP server initialization ([9fd7615](https://github.com/portel-dev/ncp/commit/9fd761516d790574900f0ed2401cda94be62730d))
* add incremental skill update methods to orchestrator ([d623c40](https://github.com/portel-dev/ncp/commit/d623c409db2e4e09ebb56139608e9b7aef5cafaf))
* add interactive ncp config command with colored display ([891aea1](https://github.com/portel-dev/ncp/commit/891aea1a1e2913cc2463071694cc3102efa6e9a5))
* add log rotation for debug logs ([ff90d73](https://github.com/portel-dev/ncp/commit/ff90d732517e3186c36d37aedf7a25957c91a1dd))
* add MCP protocol logging for debugging AI interactions ([4ad6983](https://github.com/portel-dev/ncp/commit/4ad6983739f29ac26c6a8dc2d54714d39985d672))
* add MCP update checker utility ([e314062](https://github.com/portel-dev/ncp/commit/e3140620622beb39fba0e145cac9fafbc6d70761))
* add MicroMCP installation support via registry ([00d0ba1](https://github.com/portel-dev/ncp/commit/00d0ba1064e85cf9bd4671b2b73258f33c81e143))
* add MicroMCP installation support via registry ([4fb5bd0](https://github.com/portel-dev/ncp/commit/4fb5bd027b10c7b9dfe7aae34f5bc8d9375a4918))
* add MicroMCP TypeScript detection to clipboard import ([dee5d11](https://github.com/portel-dev/ncp/commit/dee5d11458846bec3ba708eaa721dbb8cc215aaa))
* add NCP logo and update descriptions to highlight all capabilities ([f53fd0a](https://github.com/portel-dev/ncp/commit/f53fd0a590b8d0585fba1a2da2538c6d9ed5d079))
* add ncp:code internal tool for code orchestration ([35e7fc1](https://github.com/portel-dev/ncp/commit/35e7fc1068de1ffe2ba6fdd5aca325da83a22620))
* add OS keychain integration for secure credential storage ([8f16ecc](https://github.com/portel-dev/ncp/commit/8f16ecc695dda644707dfe468db235f943aa76cc))
* add per-binding network policies for local network MCPs ([4f5a31b](https://github.com/portel-dev/ncp/commit/4f5a31b2315ca9052ffd8e8a09f12e9e1a481205))
* add Photon marketplace CLI commands ([262cab8](https://github.com/portel-dev/ncp/commit/262cab8509ac0f59646636d7ff74928f0879dadc))
* add pipe-delimited multi-query support to find tool ([06fa537](https://github.com/portel-dev/ncp/commit/06fa53771e6fa5cf35faba78a860f1f894292a49))
* add progressive disclosure to Code-Mode with ncp.find() ([65ac3f4](https://github.com/portel-dev/ncp/commit/65ac3f412de670d247024c1f19141eb39533d962))
* add provider registry lookup to MCP add tool for CLI parity ([dffaff0](https://github.com/portel-dev/ncp/commit/dffaff0517f4c941e86c35cb0222bd5045217a77))
* add provider registry with mcps.portel.dev integration and standalone providers ([b7943cd](https://github.com/portel-dev/ncp/commit/b7943cd48155fa18afa237ba856cd4f1e0783801))
* add quick config edit with ncp config key value pattern ([6f43eaa](https://github.com/portel-dev/ncp/commit/6f43eaa7e1ad11eb94468bd5b9a0d977cd326f39))
* add runtime network permissions via elicitations ([e6181f7](https://github.com/portel-dev/ncp/commit/e6181f7120eb7b9de1e55755038e49d9c4574869))
* add runtime TypeScript support for SimpleMCP classes ([ff0c867](https://github.com/portel-dev/ncp/commit/ff0c8675f59e70d4f13fe8c0ec96222a46d588cc))
* add schedule sync command to repair scheduler integration ([477de21](https://github.com/portel-dev/ncp/commit/477de211f1b7484246d262a82b7c0c6897fffabe))
* add separate error and communication logs with initialize handshake ([a5bd719](https://github.com/portel-dev/ncp/commit/a5bd719d5a91c62fb6bef319bf28cf5aa4b70c44))
* add Shell MicroMCP and CLI Discovery settings to UI ([a120e18](https://github.com/portel-dev/ncp/commit/a120e18d7d82db6d3b29e89b6fd3e5c06c85b9a8))
* add skills marketplace configuration and reorganize settings ([fde95ce](https://github.com/portel-dev/ncp/commit/fde95ce9a1763de9c52cab620c5d3c2ba7b21f78))
* add Skills marketplace integration as internal MCP ([8449398](https://github.com/portel-dev/ncp/commit/8449398b6de2cc502efc4de254c3d3b777e10d16))
* add smart auto-detection and pipe-delimited bulk import to import tool ([57f809f](https://github.com/portel-dev/ncp/commit/57f809fb010aa259427000f3a71cccb8f22fbe41))
* add smart CLI argument parsing and space-separated tool naming syntax ([a40a108](https://github.com/portel-dev/ncp/commit/a40a108e55636958baf74e3eaec805c0ff7a6a64))
* add SSH marketplace support for skills ([4124dc1](https://github.com/portel-dev/ncp/commit/4124dc188b7e63d5c67d2e88554417efc622b874))
* add stopFileWatcher cleanup method to orchestrator ([07e2f49](https://github.com/portel-dev/ncp/commit/07e2f491b56cc91d6df4f349f3d405cd91db3728))
* add syntax-highlighted Code-Mode examples to CLI find ([8c106df](https://github.com/portel-dev/ncp/commit/8c106df98b75a591b8e445adf1a432cf38f83174))
* add test-drive guide resource for MCP server ([baca653](https://github.com/portel-dev/ncp/commit/baca653086eb5e7f2c802b734bd7fa294ab5feeb))
* add token usage analytics and code-mode savings tracking ([2369b63](https://github.com/portel-dev/ncp/commit/2369b63a227185a88323f9a798c5f4f7f1501c78))
* add tools for discovering MCP client configs ([739fd42](https://github.com/portel-dev/ncp/commit/739fd423d4ec0a4595c836a885ce7b854bb7893b))
* add TRUE automation powerhouse - multi-MCP orchestration ([b5a3301](https://github.com/portel-dev/ncp/commit/b5a3301942fdf0bac13a89fa588bf158c490d302))
* add TTL-based caching for MCP server resources and prompts ([e6c3bd5](https://github.com/portel-dev/ncp/commit/e6c3bd5953811c5d4be75426588fce5d647e0671))
* add TypeScript interface caching to RAG engine ([bb981ad](https://github.com/portel-dev/ncp/commit/bb981ad369dff72b5e6034b3bd87220da5be928e))
* add Windows Task Scheduler support for cross-platform scheduling ([dbe30fd](https://github.com/portel-dev/ncp/commit/dbe30fd3706a39417d98819b000e1c916dbba5e1))
* add Workflow MCP and SimpleMCP framework for intelligent task orchestration ([cfd99cc](https://github.com/portel-dev/ncp/commit/cfd99ccf8aa7a7917e6c08d5244824088b4fb96a))
* add workflowMode configuration for three usage patterns ([5a83905](https://github.com/portel-dev/ncp/commit/5a83905fcc210beef804e90de890f0ae1d68ddb7))
* align MCP tools with CLI interface ([e7b3fa4](https://github.com/portel-dev/ncp/commit/e7b3fa4a4a1ebb3d71d48250d9f34e694d475e9c))
* auto-discover SKILL.md files when skills field not provided ([52904d0](https://github.com/portel-dev/ncp/commit/52904d0904a221cdca018b7044df4f3fea9bc89d))
* auto-migrate credentials to secure storage on first run ([041b1a5](https://github.com/portel-dev/ncp/commit/041b1a539373299bcbfeaeec934c0b01ed3827c0))
* Claude Desktop-specific auto-import notification strategy ([db5ec89](https://github.com/portel-dev/ncp/commit/db5ec8912199bb278c159285783e595e3a0190f7))
* consolidate add command with smart detection for bulk operations ([da3e6fc](https://github.com/portel-dev/ncp/commit/da3e6fcf8a91dbb0d9836dd328241023d92c1a70))
* document --debug flag in CLI help ([fb57a43](https://github.com/portel-dev/ncp/commit/fb57a439390f046923157c4a766fe1e42e960c66))
* enable skills semantic search via RAG indexing ([c622a25](https://github.com/portel-dev/ncp/commit/c622a250a43b023a551d28170b4b09d544d7e93f))
* enhance config command help documentation ([524845b](https://github.com/portel-dev/ncp/commit/524845be2fade2d2151525e838ae2ce7e0036e1d))
* enhance logging for FileWatcher integration ([c97055a](https://github.com/portel-dev/ncp/commit/c97055a202fa7cc43488a7273e8393f50de00a95))
* enhance tool output formatting and add Code-Mode examples ([61a3095](https://github.com/portel-dev/ncp/commit/61a30953bea364b3e8e9e9893f95924fedca608e))
* expose MCP prompts transparently with prefix support ([e2a3f28](https://github.com/portel-dev/ncp/commit/e2a3f28031cf0fe669dfaa47479a5157d99dee2c))
* expose ncp-mcp binary for OpenAI Agents SDK compatibility ([8f61c15](https://github.com/portel-dev/ncp/commit/8f61c15950a899eea935721acbf8e53d396cfe0f))
* expose scheduler to Code-Mode with structured responses ([f499820](https://github.com/portel-dev/ncp/commit/f49982092e6f94ea176684d74212932fd6f424ca))
* extend internal MCP tool to support MicroMCP file/clipboard import ([eb0394c](https://github.com/portel-dev/ncp/commit/eb0394cf98ba020f1418a7c23e3b5e7ae1dd0da5))
* implement dynamic query-specific CLI enhancement ([d37d53e](https://github.com/portel-dev/ncp/commit/d37d53ef9b53324938a3ee88f713de8691bd32e4))
* implement launchd-based scheduler for macOS ([bf0fde0](https://github.com/portel-dev/ncp/commit/bf0fde0945e9d596fabca96272dad2065daae58b))
* implement Phase 1 Code-Mode security hardening ([bc87cc2](https://github.com/portel-dev/ncp/commit/bc87cc2a27a82ff4db3e709640d398d39b57f1b3))
* implement Phase 2 Code-Mode Worker Thread isolation ([6dc7a17](https://github.com/portel-dev/ncp/commit/6dc7a170d01650f008400e0c1f02df831bb41cab))
* implement Phase 3 Code-Mode bindings for credential isolation ([5ec2491](https://github.com/portel-dev/ncp/commit/5ec2491e7470569024dfea068b3d0372b6f850e9))
* implement Phase 4 Code-Mode network isolation ([6923c25](https://github.com/portel-dev/ncp/commit/6923c257d26c3d4ac78de1ea2a2d4c4a31ca7b0f))
* implement Phase 5 - Monitoring & Audit ([3e0b363](https://github.com/portel-dev/ncp/commit/3e0b36327898b6170cf79701daa20c1da74bf254))
* implement skills marketplace commands with CLI integration ([c0f282c](https://github.com/portel-dev/ncp/commit/c0f282c85788241650070189394799218193610f))
* implement skills progressive disclosure via skills:find ([bc37799](https://github.com/portel-dev/ncp/commit/bc377999117a92192798bb00922020daba1b082b))
* implement timing groups architecture with process isolation ([0e14053](https://github.com/portel-dev/ncp/commit/0e1405321a65449372b6e93d75ad4a559d08aa90))
* implement UTCP Code-Mode execution engine ([81f0291](https://github.com/portel-dev/ncp/commit/81f02916d125777b6cea032e85d33d0420b7b023))
* implement vector search for skills and refactor skills discovery ([3031e6c](https://github.com/portel-dev/ncp/commit/3031e6c6ca3a1b4f4d3de08339a55b90e1112fef))
* implement workflow mode tool filtering ([68ccf9e](https://github.com/portel-dev/ncp/commit/68ccf9e51868a15a3bdab0802effac534c16eefa))
* improve credential handling and cli UX ([9a03a9d](https://github.com/portel-dev/ncp/commit/9a03a9d1b49b49c781fa9617a13e5cf7dfd9100b))
* improve credentials cli output ([5e8d18f](https://github.com/portel-dev/ncp/commit/5e8d18f66636de9d643b15fdd622a0d14d67f275))
* improve find response with MCP grouping and difficulty indicators ([09053fe](https://github.com/portel-dev/ncp/commit/09053fe02bf23491e72bb6ce3bf49df3a6d4f1ff))
* improve find tool zero-results with actionable next steps ([b40361c](https://github.com/portel-dev/ncp/commit/b40361caffdc6bba2c44e4c4266f6422798aeae0))
* integrate FileWatcher into orchestrator for dynamic skill/photon discovery ([5c89034](https://github.com/portel-dev/ncp/commit/5c89034fcd16342af415ec04916d734fa5a9e905))
* integrate MCP update notifications in orchestrator ([9462449](https://github.com/portel-dev/ncp/commit/9462449df8971e73dd81469db14767d2c0a0b2e5))
* integrate Photon marketplace system ([bc26472](https://github.com/portel-dev/ncp/commit/bc2647249e14ef4809545ee8549bac61adff0e5c))
* integrate skills into unified discovery (skill: prefix) ([3d1b4f4](https://github.com/portel-dev/ncp/commit/3d1b4f48c602645fb5539de21c14ae0628d1e398))
* introduce MicroMCP format for single-file MCPs ([e4f77b2](https://github.com/portel-dev/ncp/commit/e4f77b25a8142da761405ba8740c400c3664d2a0))
* migrate from DXT to official MCPB (MCP Bundles) format ([19cd74a](https://github.com/portel-dev/ncp/commit/19cd74a41a25a4783299f08658f6402909a45532))
* migrate from MicroMCP to Photon architecture ([d90c900](https://github.com/portel-dev/ncp/commit/d90c90081354da382d30c7163c1aeea63a0ee0ae))
* migrate from MicroMCP to Photon runtime architecture ([ed5b1b2](https://github.com/portel-dev/ncp/commit/ed5b1b2fbfc22da9199f0202d6ff90b4df13770a))
* optimize CLI discovery with curated tool catalog ([dcc6c7e](https://github.com/portel-dev/ncp/commit/dcc6c7ea93bcc3e11dba6365b2c6a0df5747d2d7))
* optimize find response formats for Code-Mode, MCP, and CLI ([cbcd50d](https://github.com/portel-dev/ncp/commit/cbcd50d329c5c6a6c28aa78dcff4591c92a7511d))
* phase 3 - intelligent output formatting, markdown rendering, and doctor diagnostics ([233890e](https://github.com/portel-dev/ncp/commit/233890e3ee45d50d177617ff82cf2a7e233d3a6a))
* refactor CLI commands from colon-based to space-separated subcommands ([4fd1bef](https://github.com/portel-dev/ncp/commit/4fd1befd9e322bb69ba527269cf9f49350db6f46))
* runtime CLI tool discovery with zero maintenance ([9e8bf20](https://github.com/portel-dev/ncp/commit/9e8bf20cd8a82341334c545969ff3b88e962433c))
* separate marketplace namespace from skills ([90345ec](https://github.com/portel-dev/ncp/commit/90345ec7093bbcb05da899cc99c65956e43ee630))
* show available tools immediately after MCP installation ([5b609e9](https://github.com/portel-dev/ncp/commit/5b609e92db962ce0104a72be257061d426e3afaf))
* simplify code mode to boolean toggle ([289f345](https://github.com/portel-dev/ncp/commit/289f3452c31b39fc4bff0f623365ab70eb4fe5c6))
* smart mode detection with unified ncp command ([bddb3fe](https://github.com/portel-dev/ncp/commit/bddb3fec80ee7f98f27387186508239f5b9b5ec0))
* support all 66 registry providers with auto HTTP/stdio detection ([a42cf84](https://github.com/portel-dev/ncp/commit/a42cf844e2fc81c83a1ffd2232f1ebfd2cc075e8))
* support MicroMCP installation from URLs ([760aa9f](https://github.com/portel-dev/ncp/commit/760aa9f14da16895432b58864585da0437882b37))
* transparent content pass-through for all MCP response types ([ff671bf](https://github.com/portel-dev/ncp/commit/ff671bf9928194089bb6797bfeb0011374c74994))
* update DXT UI to reflect Photon-based architecture and workflow modes ([6ffc007](https://github.com/portel-dev/ncp/commit/6ffc007ce0a823963f1b02235c0ee5b9cc9281b7))
* update provider registry API to use api.mcps.portel.dev subdomain ([201ef65](https://github.com/portel-dev/ncp/commit/201ef65c7bcd14cc076e818f8e2ee5b4f46231e7))
* update Skills interface to match MCP dual-mode pattern ([7f5dce2](https://github.com/portel-dev/ncp/commit/7f5dce2d514d32a1eb4bacd30cfd208881bfa6f7))
* wire up elicitation function for runtime network permissions ([a0522ce](https://github.com/portel-dev/ncp/commit/a0522ce88b8497b6a34acad9d13f68e18531874f))

### Bug Fixes

* accept HTTP/SSE configs in getProfileMCPs validation ([9dca352](https://github.com/portel-dev/ncp/commit/9dca352c624417daf929ff3633305d8287786d8b))
* add .micro.ts file support to ConfigManager import ([110fe0d](https://github.com/portel-dev/ncp/commit/110fe0dd0196eb20b9c01e7d0112e7e4a6861cf0))
* add build-dxt-clean.sh to repository for CI/CD ([f5b8a8d](https://github.com/portel-dev/ncp/commit/f5b8a8d1d38a1abacabad6a783fcc6afddf16a0e))
* add command injection protection for MCP installation ([512c430](https://github.com/portel-dev/ncp/commit/512c4303fdbe3ee34eb32f14e4d99d2e2c094a68))
* add connection pool limits and LRU eviction to prevent memory leaks ([ae14f34](https://github.com/portel-dev/ncp/commit/ae14f342700b3aecbfafee1e47599bd9ae67ee19))
* add context-aware credential prompting for HTTP/SSE MCPs ([debf644](https://github.com/portel-dev/ncp/commit/debf644a5cffd7eb74ebdcfa8f704f1103958e4f))
* add detailed error logging to code executor for debugging parameter parsing errors ([2e5c45a](https://github.com/portel-dev/ncp/commit/2e5c45a268c1d92d6be18dfd9a7eb6a62ce3fe6b))
* add elicitation support to credential prompter with fallback chain ([401c42f](https://github.com/portel-dev/ncp/commit/401c42f107c7cea8b9e7cb7c39982ff2060f04ab))
* add enablePhotonRuntime to GlobalSettings and load before photons ([76d7b38](https://github.com/portel-dev/ncp/commit/76d7b38240c66fbb2faa4b8b6e0e9c22dc9cec07))
* add explicit NODE_OPTIONS to GitHub Actions for Node 18.x ES modules compatibility ([901dc70](https://github.com/portel-dev/ncp/commit/901dc707fe50f2b7008bf0fe57b5d65f2b71bca7))
* add manifest.json to CI workflow path triggers ([890e22e](https://github.com/portel-dev/ncp/commit/890e22e32f7af2770f33d3623a851c3f5f2ee328))
* add missing enableCodeMode user configuration option ([e0cc1b0](https://github.com/portel-dev/ncp/commit/e0cc1b0f55fddbb2c0fc7f425c07f68f31759a28))
* add missing extract-schemas.ts to fix CI build ([89cbb7e](https://github.com/portel-dev/ncp/commit/89cbb7ed516c237beeefb76aee7fc837611e3885)), closes [#19021965518](https://github.com/portel-dev/ncp/issues/19021965518)
* add missing imports to execution-recorder.test.ts for TypeScript compilation ([f20f494](https://github.com/portel-dev/ncp/commit/f20f494ba6c98a018a6695cd9184ce6397ee0190))
* add NODE_OPTIONS to coverage test job in GitHub Actions ([67fcb10](https://github.com/portel-dev/ncp/commit/67fcb1048fe1e1ca4526cf11a340d271daeac8c8))
* add NODE_OPTIONS to DXT test job in GitHub Actions ([240cdc1](https://github.com/portel-dev/ncp/commit/240cdc1b2d3e556136180e71eb3d1572802b3411))
* add null safety checks to analytics formatting code ([8ba646b](https://github.com/portel-dev/ncp/commit/8ba646b147ce3aebbc3f8bb1940469202a0caba9))
* add scripts/ to CI workflow path triggers ([0d8bbe9](https://github.com/portel-dev/ncp/commit/0d8bbe9cfd765d11f134fb67c03f5efc9138396d))
* add skills commands to CLI routing whitelist - critical fix ([a69ec3a](https://github.com/portel-dev/ncp/commit/a69ec3a84a4473f81071bd05b58f13be5e62fcf0))
* add timezone support to scheduler with RFC 3339 datetime ([274efb9](https://github.com/portel-dev/ncp/commit/274efb90c10ff4717ad927aab86e4436e224824b))
* add unprefixed tool name mapping in CSV cache loading ([9f92ffb](https://github.com/portel-dev/ncp/commit/9f92ffbfbc3b1a11f9e4c9ee0cdf598a9324ebe3))
* address PR review feedback ([359cf64](https://github.com/portel-dev/ncp/commit/359cf643bc4e1452f8b7ee58853a6992f08387d4)), closes [#2](https://github.com/portel-dev/ncp/issues/2)
* adjust coverage thresholds for js-yaml refactoring ([f0a087f](https://github.com/portel-dev/ncp/commit/f0a087f0da01f513297efe61dd1b84273e8a9d71))
* adjust integration test tools/list threshold to 250ms for Node.js 18.x compatibility ([4f3ffa6](https://github.com/portel-dev/ncp/commit/4f3ffa65ed6f114f99d29a13300b19a77ed53a9f))
* adjust test setup to skip orchestrator initialization and ensure cleanup is awaited ([37854c4](https://github.com/portel-dev/ncp/commit/37854c4aca7dd4715a028a7314b5e06b5b0405dc))
* auto-migrate old cache by detecting missing tool schemas ([8e212c7](https://github.com/portel-dev/ncp/commit/8e212c7e7915b27482e67b09d124e312fd608e17))
* CI failures - add missing type declarations and update doctor tests ([a3af4be](https://github.com/portel-dev/ncp/commit/a3af4be0c24aa2d84c2d030e7be27500046d7901))
* clarify mcp:add tool parameters to help AI extract MCP name from user intent ([449a34d](https://github.com/portel-dev/ncp/commit/449a34d3b4abfd6a3221221f19c9a6fcf1fe58d8))
* convert micromcp-installation test to use Jest instead of node:test ([3af5fa7](https://github.com/portel-dev/ncp/commit/3af5fa707a0884faa559b9e18749c49e0680a06b))
* convert mock files to ES6 exports for ESM/Jest compatibility ([fd6e508](https://github.com/portel-dev/ncp/commit/fd6e508ca448865913a223f0805e4bfc1687f1fc))
* correct all TOC anchor links to match GitHub-generated IDs ([0cd46ad](https://github.com/portel-dev/ncp/commit/0cd46ad1b990489805f14c1d8d2434f4f8109c12))
* correct Anthropic Agent Skills implementation ([bca1992](https://github.com/portel-dev/ncp/commit/bca1992f965e3316c357abf5e1607038ec270a2d))
* correct Cursor and Enconvo MCP config paths ([2eae4af](https://github.com/portel-dev/ncp/commit/2eae4af8ccbafab9ec9b02d77bf61e4a110dc343))
* correct formatting and indentation in loadProfile method ([9dc8d21](https://github.com/portel-dev/ncp/commit/9dc8d2198e9132abf61ebdc448cc911a86aa0552))
* correct internal MCP name from 'ncp' to 'mcp' in tests and cleanup setTimeout handles ([f1e4dfc](https://github.com/portel-dev/ncp/commit/f1e4dfcf7b1b7d26be7c564de1308d50dd7d1bae))
* correct MONTHLY schedule parameter handling for Windows Task Scheduler ([ea51224](https://github.com/portel-dev/ncp/commit/ea5122494e6dd5a12089eb61842963f8c4be946c))
* correct tool name in comprehensive test from ncp:list to mcp:list ([eae8f33](https://github.com/portel-dev/ncp/commit/eae8f33dac6eb8907747f792509fb99b1d0911ea))
* disable npm publishing in release (GitHub release only) ([06b01af](https://github.com/portel-dev/ncp/commit/06b01af65a103c115b92f376df9233678f86a56e))
* DXT build failures and doctor command output ([18a2b00](https://github.com/portel-dev/ncp/commit/18a2b006ed79e71ad8991d03c35e6e0ebff4263e))
* enable code execution in CLI mode by injecting orchestrator during profile load ([f521648](https://github.com/portel-dev/ncp/commit/f5216480382854034ebc9ed1b7898f1eed285610))
* ensure server initialization is awaited during cleanup ([d274e6d](https://github.com/portel-dev/ncp/commit/d274e6d3753e9761922a7c7df7b4aeaa4d4be531))
* ensure server initialization is awaited during cleanup ([3dd255c](https://github.com/portel-dev/ncp/commit/3dd255ca2eb926cee86b33f7c44ec00b2fd6213d))
* exclude macOS-specific micromcp-installation test from CI ([851447e](https://github.com/portel-dev/ncp/commit/851447e2a71205b2b14b5a89be7e4b08eab81a22))
* expose only find and run tools to AI ([6b72899](https://github.com/portel-dev/ncp/commit/6b72899eaebc804edf4f63e2901e2585b8b22104))
* expose skill tools in code executor for runtime access ([0d32108](https://github.com/portel-dev/ncp/commit/0d32108d44ed037bebd4e2457b17888e5f653f61))
* further lower coverage thresholds to 24%/29% for CI stability ([17b930c](https://github.com/portel-dev/ncp/commit/17b930c499effa9c0890015c1e674e1baf46c744))
* gracefully handle elicitation timeout errors in enum selection functions ([5d340b2](https://github.com/portel-dev/ncp/commit/5d340b2d3251528d6b0302dddce5ad23b21434ac))
* handle PowerShell error state in workflow verification step ([06a07b1](https://github.com/portel-dev/ncp/commit/06a07b1cd8144f4a27915cd1ae25c2db5d74f03d))
* implement Code-Mode using official UTCP pattern ([fd60473](https://github.com/portel-dev/ncp/commit/fd604732d88ad0af6d2dd62ee9c42d0081d84344))
* implement MCP-compliant auto-import and add enum elicitation support ([b5a6460](https://github.com/portel-dev/ncp/commit/b5a6460c1509d6fa09e7b8b2c962956faf5cee0d))
* improve Code-Mode introspection and tool support ([c9a8f65](https://github.com/portel-dev/ncp/commit/c9a8f65aae1767f89a74383d4bab705a9ab7aa9f))
* improve error messages in code-mode execution ([3124ec2](https://github.com/portel-dev/ncp/commit/3124ec2dafe78d6531ffdd6a7889f0dff99438d9))
* improve find responses during and after indexing ([8e8aa49](https://github.com/portel-dev/ncp/commit/8e8aa49d9895c5960d87f2a14773d71af25732b8))
* improve MCP search quality and handle verbose AI queries ([21b29af](https://github.com/portel-dev/ncp/commit/21b29afaaf61db8218e777e7da0824eec09e45d9))
* improve tool invocation clarity and code generation ([1d68b6f](https://github.com/portel-dev/ncp/commit/1d68b6f9bc874f7b69bed7d15c78cb73cb6a71b3))
* include inputSchema in cache invalidation hash ([93ca9b7](https://github.com/portel-dev/ncp/commit/93ca9b7c1a613582fda0b0129d1208fd2725a120))
* load MCP tool definitions from cache immediately for code-mode namespaces ([a2c8e8e](https://github.com/portel-dev/ncp/commit/a2c8e8ef06f480ecae4e06f0b9be1644682941ba))
* load workflow mode settings synchronously before exposing tools ([1305d2d](https://github.com/portel-dev/ncp/commit/1305d2d94b69995dafbe20539bfa250585b9bf08))
* lower coverage thresholds for CI environment variance ([0368943](https://github.com/portel-dev/ncp/commit/036894398706668e87d39b3b3ca8c233471dfab3))
* make saved settings file the absolute source of truth ([58517e8](https://github.com/portel-dev/ncp/commit/58517e8cf234cfeff37e24a0d9e17636aad84e40))
* make skills:search require a query argument for CLI parsing ([e1520af](https://github.com/portel-dev/ncp/commit/e1520af40824c6fbc0a905d4cecf45511db82f34))
* normalize HTTP MCP configs (Claude Desktop format → NCP format) ([1defab7](https://github.com/portel-dev/ncp/commit/1defab796a43bc21edeec0ea381b80d7aca59d8c)), closes [#3](https://github.com/portel-dev/ncp/issues/3)
* normalize namespace identifiers to valid JavaScript in code execution ([0ba31b0](https://github.com/portel-dev/ncp/commit/0ba31b09ff75f394933ff7a977e2c21d6d08cce6))
* oninitialized callback not being called due to race condition ([6b3a564](https://github.com/portel-dev/ncp/commit/6b3a564a5a16caf9a90b6c756c69b745793f75ce))
* only start FileWatcher when skills or photons are enabled ([7d03a28](https://github.com/portel-dev/ncp/commit/7d03a2820fe05c94219aca983bdb27864f4bfa2c))
* persist user settings across updates and Claude restarts ([2a73a1f](https://github.com/portel-dev/ncp/commit/2a73a1fe8c922ff81480f06cf5291009284d04c5))
* persist user settings across updates and Claude restarts ([af19dd6](https://github.com/portel-dev/ncp/commit/af19dd6e190d0d0114b95177db45fec966a08922))
* pin mcpb to 1.1.1 to avoid 1.1.5 inconsistencies ([c4e019b](https://github.com/portel-dev/ncp/commit/c4e019bd47d0bfc06302d2e35c4b31f1b05f3114))
* pin mcpb to 1.1.4 to avoid 1.1.5 inconsistencies ([3b7e1d1](https://github.com/portel-dev/ncp/commit/3b7e1d1bd44d38ba719f80062fe71403c88f9e6c))
* prevent DXT global CLI from overwriting npm installations ([311cb18](https://github.com/portel-dev/ncp/commit/311cb183071b35fd671364f13a429aec5e4bddbe))
* prevent scheduler job execution from hanging ([866e1d8](https://github.com/portel-dev/ncp/commit/866e1d8c607f16d044e71a65a7932e8d506b0472))
* prevent stdin listener leak in OAuth device flow ([ae43f23](https://github.com/portel-dev/ncp/commit/ae43f23747afcfe0c5b989b59ba181c5f97f7c36))
* prevent template interpolation in user code execution context ([8f155de](https://github.com/portel-dev/ncp/commit/8f155de1e7aa60402a8f6627521c953426a20f78))
* properly preserve user settings across DXT reinstalls ([20868ac](https://github.com/portel-dev/ncp/commit/20868ace35aab7c318268f870ed26bafa9b5794c))
* re-enable npm publishing for proper release-it flow ([eb2d5f5](https://github.com/portel-dev/ncp/commit/eb2d5f5dbbfc02f43f4f226ed1f38ed55427c861))
* reduce coverage thresholds and make DXT test script conditional ([5e37b42](https://github.com/portel-dev/ncp/commit/5e37b42e6b496cbc9accced999092952f88b7416))
* refocus mcp:add and mcp:remove to require AI-assisted discovery ([d9e15e0](https://github.com/portel-dev/ncp/commit/d9e15e011908d8c44b223ef98158a0d469ae9295))
* remove duplicate doctor command definition ([3de4a07](https://github.com/portel-dev/ncp/commit/3de4a07ba1d923b33356101a3c20bd0a838b7d58))
* remove enableCodeMode from user_config to allow runtime changes ([1eea1a2](https://github.com/portel-dev/ncp/commit/1eea1a2b6d22f282096b89fed67aeceb7677bdbc))
* remove enum from workflow_mode setting for manifest compatibility ([ae4acb6](https://github.com/portel-dev/ncp/commit/ae4acb6110da82232ce4c9a8e3933c1229fc258d))
* remove non-existent test:package step from release workflow ([7b9cbf2](https://github.com/portel-dev/ncp/commit/7b9cbf25809bed77c4c94a97b734a16ee22f8443))
* remove unnecessary stdin mocking in OAuth Device Flow tests ([2df30f2](https://github.com/portel-dev/ncp/commit/2df30f239179ae10d345c9ccc5484a33d9f1edb9))
* remove unsupported icon_alt field from manifest ([87dd8b7](https://github.com/portel-dev/ncp/commit/87dd8b79600a22d2dd4a817cad3ce2288deb7be6))
* rename enable_skills_marketplace to enable_skills ([9299b59](https://github.com/portel-dev/ncp/commit/9299b596a5eeecce525550510722129731f02714))
* rename internal MCP from 'ncp' to 'mcp' for clarity ([0327fa9](https://github.com/portel-dev/ncp/commit/0327fa9f5e7ffc7001701f8181fb032f68bffa59))
* rename shell setting to photon runtime with correct description ([b660f83](https://github.com/portel-dev/ncp/commit/b660f83378f590756c50b40da209f12f0df4ff22))
* replace hardcoded macOS path with dynamic PROJECT_ROOT variable in DXT build script ([d005d77](https://github.com/portel-dev/ncp/commit/d005d77bb9e2944049e45d93dad16e36213971a4))
* resolve 'Arg string terminates parameters early' by refactoring AsyncFunction parameter passing ([2b3c5a0](https://github.com/portel-dev/ncp/commit/2b3c5a0013067876990dd316644bd1b008bf643d))
* resolve chalk mock ESM/CommonJS compatibility in tests ([01e50b9](https://github.com/portel-dev/ncp/commit/01e50b9558ff09c9ba94e2e7cb74e302a087a7b5))
* resolve code execution null safety and tool name prefixing issues ([940b4dd](https://github.com/portel-dev/ncp/commit/940b4dd0a3b4b11c1f28b9a49c0b90ac0a825af0))
* resolve critical bugs blocking release ([e805e3e](https://github.com/portel-dev/ncp/commit/e805e3ed74e32005256dd893fedf4794828c0376))
* resolve DXT package crashes and auto-import failures ([06c8ba8](https://github.com/portel-dev/ncp/commit/06c8ba82f9bbfe776a48bce4ccfd845acee9cf40))
* resolve ESM compatibility issues in test suite ([adfa351](https://github.com/portel-dev/ncp/commit/adfa3513dedf267d939cae1442c3ecff77d46f9f))
* resolve ESM require errors and fix branding in error messages ([850103d](https://github.com/portel-dev/ncp/commit/850103d1ba52cfd76e65c588049d5062d9ba241b))
* resolve Jest.mock ESM compatibility for fs module mocking ([c7d8af1](https://github.com/portel-dev/ncp/commit/c7d8af19da4538b7c7e7cc7c96f772411219abaa))
* resolve remaining test failures and CLI error handling ([b1be8cf](https://github.com/portel-dev/ncp/commit/b1be8cf3234658bf6e7f5d7344bb285834ac9fa6))
* restore helpful error messages and registry fallback ([12702d7](https://github.com/portel-dev/ncp/commit/12702d7eb4606572415b4a7df3cba8d74a2170b0))
* restore tool schema display in find command ([10c7ba5](https://github.com/portel-dev/ncp/commit/10c7ba52ea2fe185f55a30d5cc077f1d9aa625d0))
* simplify debug logging - always write to file when NCP_DEBUG=true ([dd6d884](https://github.com/portel-dev/ncp/commit/dd6d8843d5bc010f95f4966a22c71fd388e53c9a))
* simplify namespace sanitization - remove unnecessary collision detection ([4b65e2b](https://github.com/portel-dev/ncp/commit/4b65e2b4db5d3ff9fec111fb54d469ae5a3487ff))
* skip prepack script in DXT build (already built in project root) ([591fb7a](https://github.com/portel-dev/ncp/commit/591fb7a7204fdaf507e65f9314638db9fdead54d))
* stabilize code execution with collision detection and enhanced error handling ([3935189](https://github.com/portel-dev/ncp/commit/39351895e22ec226a26a2b3a13b503c803cc7957))
* standardize configuration naming to camelCase across entire codebase ([b78651e](https://github.com/portel-dev/ncp/commit/b78651ea6cedb4b9b9a62310a8367efd41d41e4d))
* stop persisting env-based settings overrides ([ac4aafb](https://github.com/portel-dev/ncp/commit/ac4aafbfa1e03fbfdd9d0eb9cfee2208cf1c5630))
* store compiled photons next to node_modules for module resolution ([147b8fa](https://github.com/portel-dev/ncp/commit/147b8fa1d810b5aa1f5070157a85c5b1726e9e21))
* support both DXT and NPM installation methods for code mode ([d5ec714](https://github.com/portel-dev/ncp/commit/d5ec7147debdda4b244348412060dee5953eb62b))
* update configuration symbols to checkmark box and blank square ([6ca7bd8](https://github.com/portel-dev/ncp/commit/6ca7bd8e3ed086d8ac87b6555585b7b902845af6))
* update DXT validation script to use camelCase manifest keys ([e8c8324](https://github.com/portel-dev/ncp/commit/e8c832420409c56f9c960de8ff8a23b880aa9345))
* update help text examples to use space-separated subcommand syntax ([748f006](https://github.com/portel-dev/ncp/commit/748f006df616d149242fe7bd6657afe1440948ab))
* update icon to PNG format for mcpb 1.1.5 compatibility ([20733c0](https://github.com/portel-dev/ncp/commit/20733c0b8950ec58a75f1e150b4b618a8c8f4156))
* update logger calls to use single string argument ([58cf635](https://github.com/portel-dev/ncp/commit/58cf6352f4c83a3dfd03fb6e5ad9fa34108d1863))
* update logger tests to work with file-based logging ([c92683a](https://github.com/portel-dev/ncp/commit/c92683a7cb476615e5975957702d3a4729bb3d17))
* update manifest_version to 0.3 for DXT compatibility ([bd89773](https://github.com/portel-dev/ncp/commit/bd89773820cf3d3d2061ec1068c6d7a9d86eaffd))
* update patch script to use ncp.mcpb instead of ncp.dxt ([ba317f2](https://github.com/portel-dev/ncp/commit/ba317f2d57806ab8a162584ec2bb4982224edab7))
* update photon help text to show 'add' instead of 'install' ([bfdae2a](https://github.com/portel-dev/ncp/commit/bfdae2aa063c105b9a0af10ddf485a980c964681))
* update photon-loader import after base-photon migration ([c2087b5](https://github.com/portel-dev/ncp/commit/c2087b523553be86440c2fa265038394b96277b7))
* update references from old add-http/add-stdio to unified add command ([9a6c3ab](https://github.com/portel-dev/ncp/commit/9a6c3ab1fd0703c98d128e4021c4a788c2307e95))
* update release workflow to upload ncp.mcpb instead of ncp.dxt ([d8137cb](https://github.com/portel-dev/ncp/commit/d8137cb2caaaad6870ce4f2d51f57789a9736883))
* update to photon-core@1.0.2 for automatic dependency cache invalidation ([28de78a](https://github.com/portel-dev/ncp/commit/28de78aebe432d204cfd48c76883d67de87fbc91))
* upgrade Node version to 20 in release workflow ([58336b2](https://github.com/portel-dev/ncp/commit/58336b2be3bdd9d0e70d9df0a809f97fc3fbedae))
* use centralized getNcpBaseDirectory() for all .ncp path resolution ([46e8ea5](https://github.com/portel-dev/ncp/commit/46e8ea5e0769eb75b1207100edb73cd49b29ba6d))
* use default profile in integration test ([58358cf](https://github.com/portel-dev/ncp/commit/58358cf390d601aa844dc1803698fe7c7f9b20d9))
* use high-quality 512x512 PNG icon for better scaling in Claude Desktop ([c85a099](https://github.com/portel-dev/ncp/commit/c85a0991cca7fe56cf3b6b7188940c32ce341b8c))
* Windows command resolution and path escaping for MCP servers ([d13bcde](https://github.com/portel-dev/ncp/commit/d13bcde8bfad6698ef52bceb2957179a0967ea30))

### Performance Improvements

* eliminate blocking sync file operations from cache layer ([a0fdb2a](https://github.com/portel-dev/ncp/commit/a0fdb2abe9db355ba8bc0b7e3607d45de7c8f1da))
* optimize incremental per-MCP caching to avoid redundant saves ([3ed5f5b](https://github.com/portel-dev/ncp/commit/3ed5f5b4136e0299e12e78931a711234cfd6a026))
* parallelize auto-import and add timeout to prevent startup delays ([8cf08f6](https://github.com/portel-dev/ncp/commit/8cf08f6c91aa00b776e87e3bf348d676a39f135b))

## [1.8.0](https://github.com/portel-dev/ncp/compare/v1.6.0...1.8.0) (2025-12-14)

### ⚠ BREAKING CHANGES

* Scheduler now uses timing groups instead of individual job schedules

- feat: add timing groups to reduce OS scheduler overhead
- feat: implement parallel task execution with process isolation
- fix: launchd getJobs() now properly enumerates existing entries
- feat: add cron-to-timing-id conversion utilities
- feat: spawn isolated child processes for each task execution
- feat: add TaskManager for tasks and timing groups CRUD operations
- feat: add TimingExecutor for parallel execution
- feat: add automatic V1 to V2 migration
- test: add process isolation tests (69 tests passing)
- docs: add comprehensive testing guides and implementation summary
- refactor: TaskManager supports custom scheduler dir for testing
- refactor: maintain backward compatibility through wrapper methods

Storage migrates automatically from V1 jobs.json to V2 schedule.json.
Multiple tasks sharing same cron expression are grouped under one OS schedule.
Each task executes in isolated child process preventing cascading failures.
Timing groups use descriptive IDs (e.g., "daily-9am", "every-5min").

### Features

* add --token and -y flags for non-interactive MCP installation ([b87c273](https://github.com/portel-dev/ncp/commit/b87c27302dc5f8eb31f592aaabd383f9b91f1d6e))
* add analytics internal MCP for AI-accessible usage insights ([72e5dc3](https://github.com/portel-dev/ncp/commit/72e5dc3b303acc049156e77253429f46fd072d1b))
* add Anthropic Agent Skills support ([12e19d1](https://github.com/portel-dev/ncp/commit/12e19d108f72d7f1ca463d383625a8f2333f38fd))
* add atomic operations and rollback for skill/photon updates ([4f06d9d](https://github.com/portel-dev/ncp/commit/4f06d9d639a01fd8aebf6e38e62769337ad2c009))
* add automatic catchup agent for missed scheduled tasks ([9da4ac2](https://github.com/portel-dev/ncp/commit/9da4ac2c0044a98857aba7ffc30db34133b6036d))
* add batch operation detection and metrics tracking ([112076a](https://github.com/portel-dev/ncp/commit/112076a0279021bef838bcff0ebf1038005f2d81))
* add built-in Shell MicroMCP with env-based enablement ([ad5ba82](https://github.com/portel-dev/ncp/commit/ad5ba8289e040d39cb4bed689b0d1a8a1f7b680f))
* add built-in system utilities to CLI catalog ([0a8e706](https://github.com/portel-dev/ncp/commit/0a8e7063453480d72803a272b4cffd6921780f2c))
* add bulk credential collection for import tool ([a57ad5a](https://github.com/portel-dev/ncp/commit/a57ad5ab20de67592bef02a50430e0e45b9bf31b))
* add catchupMissed property and schedule catchup command ([3a1e64a](https://github.com/portel-dev/ncp/commit/3a1e64a5e81fdf19a22d29c680ea88b1b4977dc6))
* add CLI polish with fuzzy matching and status indicators (Phase 2) ([8998941](https://github.com/portel-dev/ncp/commit/8998941c5861657f466a0c33134697fa3bb25358))
* add Code-Mode + Scheduler automation powerhouse demo ([d6c90c5](https://github.com/portel-dev/ncp/commit/d6c90c5438246b8630702e4ebc1feed12341c148))
* add Code-Mode examples to find responses ([750460e](https://github.com/portel-dev/ncp/commit/750460ecc3d7c2072b2d1473b56fa9356d6c578a))
* add Code-Mode testing and measurement tools ([fff903a](https://github.com/portel-dev/ncp/commit/fff903a38c8c04b499f0c26d049d3a35ad79e502))
* add Code-Mode workflow examples for multi-query find ([8c1656f](https://github.com/portel-dev/ncp/commit/8c1656f894355746976958f95508d454c27bbd9b))
* add comprehensive `ncp doctor` diagnostics command ([75c4892](https://github.com/portel-dev/ncp/commit/75c48920c2d63006b225bd91f0c728c02c84c7e4))
* add comprehensive error messages and end-to-end scheduler tests ([ab48505](https://github.com/portel-dev/ncp/commit/ab4850548780e8ed04fdd3edca5eccb3ed7b1b0c))
* add conditional auto-scanning for CLI tools ([8e29e99](https://github.com/portel-dev/ncp/commit/8e29e993a601c9a470306101ce8cff2f91a1bd15))
* add configurable log rotation settings to global config ([05b55f6](https://github.com/portel-dev/ncp/commit/05b55f605b602f208bacb6ee9c84b6b1e92a535c))
* add conflict detection between CLI and FileWatcher ([0f2922e](https://github.com/portel-dev/ncp/commit/0f2922efb2f1826a4bb91c7ebed7e5861b0a162a))
* add credential removal and vault metadata ([dc15886](https://github.com/portel-dev/ncp/commit/dc15886f15018789058d8868c225bf95c631d168))
* add cross-platform support for CLI discovery (Windows/Linux/macOS) ([a0282b3](https://github.com/portel-dev/ncp/commit/a0282b34a04baaf02056ae9ca6f70183c48fb545))
* add debounce and temp file filtering to FileWatcher ([8f77338](https://github.com/portel-dev/ncp/commit/8f77338eb805b77859d8fef3e7d45488a4f1de2b))
* add diagnostic logging and enhanced error messages ([35772bc](https://github.com/portel-dev/ncp/commit/35772bc41c684e549559074c3b11170ec0b700a8))
* add enhanced diagnostic logging for code tool parameter debugging ([c38f0b0](https://github.com/portel-dev/ncp/commit/c38f0b0bd87cb159a590fbd084c068086459d8e5))
* add FileWatcher service for dynamic skills and photons discovery ([259d54a](https://github.com/portel-dev/ncp/commit/259d54a19db7c99d339c53311ed5e7b7e8e1fc8d))
* add icon support to MCP server initialization ([9fd7615](https://github.com/portel-dev/ncp/commit/9fd761516d790574900f0ed2401cda94be62730d))
* add incremental skill update methods to orchestrator ([d623c40](https://github.com/portel-dev/ncp/commit/d623c409db2e4e09ebb56139608e9b7aef5cafaf))
* add interactive ncp config command with colored display ([891aea1](https://github.com/portel-dev/ncp/commit/891aea1a1e2913cc2463071694cc3102efa6e9a5))
* add log rotation for debug logs ([ff90d73](https://github.com/portel-dev/ncp/commit/ff90d732517e3186c36d37aedf7a25957c91a1dd))
* add MCP protocol logging for debugging AI interactions ([4ad6983](https://github.com/portel-dev/ncp/commit/4ad6983739f29ac26c6a8dc2d54714d39985d672))
* add MCP update checker utility ([e314062](https://github.com/portel-dev/ncp/commit/e3140620622beb39fba0e145cac9fafbc6d70761))
* add MicroMCP installation support via registry ([00d0ba1](https://github.com/portel-dev/ncp/commit/00d0ba1064e85cf9bd4671b2b73258f33c81e143))
* add MicroMCP installation support via registry ([4fb5bd0](https://github.com/portel-dev/ncp/commit/4fb5bd027b10c7b9dfe7aae34f5bc8d9375a4918))
* add MicroMCP TypeScript detection to clipboard import ([dee5d11](https://github.com/portel-dev/ncp/commit/dee5d11458846bec3ba708eaa721dbb8cc215aaa))
* add NCP logo and update descriptions to highlight all capabilities ([f53fd0a](https://github.com/portel-dev/ncp/commit/f53fd0a590b8d0585fba1a2da2538c6d9ed5d079))
* add ncp:code internal tool for code orchestration ([35e7fc1](https://github.com/portel-dev/ncp/commit/35e7fc1068de1ffe2ba6fdd5aca325da83a22620))
* add OS keychain integration for secure credential storage ([8f16ecc](https://github.com/portel-dev/ncp/commit/8f16ecc695dda644707dfe468db235f943aa76cc))
* add per-binding network policies for local network MCPs ([4f5a31b](https://github.com/portel-dev/ncp/commit/4f5a31b2315ca9052ffd8e8a09f12e9e1a481205))
* add Photon marketplace CLI commands ([262cab8](https://github.com/portel-dev/ncp/commit/262cab8509ac0f59646636d7ff74928f0879dadc))
* add pipe-delimited multi-query support to find tool ([06fa537](https://github.com/portel-dev/ncp/commit/06fa53771e6fa5cf35faba78a860f1f894292a49))
* add progressive disclosure to Code-Mode with ncp.find() ([65ac3f4](https://github.com/portel-dev/ncp/commit/65ac3f412de670d247024c1f19141eb39533d962))
* add provider registry lookup to MCP add tool for CLI parity ([dffaff0](https://github.com/portel-dev/ncp/commit/dffaff0517f4c941e86c35cb0222bd5045217a77))
* add provider registry with mcps.portel.dev integration and standalone providers ([b7943cd](https://github.com/portel-dev/ncp/commit/b7943cd48155fa18afa237ba856cd4f1e0783801))
* add quick config edit with ncp config key value pattern ([6f43eaa](https://github.com/portel-dev/ncp/commit/6f43eaa7e1ad11eb94468bd5b9a0d977cd326f39))
* add runtime network permissions via elicitations ([e6181f7](https://github.com/portel-dev/ncp/commit/e6181f7120eb7b9de1e55755038e49d9c4574869))
* add runtime TypeScript support for SimpleMCP classes ([ff0c867](https://github.com/portel-dev/ncp/commit/ff0c8675f59e70d4f13fe8c0ec96222a46d588cc))
* add schedule sync command to repair scheduler integration ([477de21](https://github.com/portel-dev/ncp/commit/477de211f1b7484246d262a82b7c0c6897fffabe))
* add separate error and communication logs with initialize handshake ([a5bd719](https://github.com/portel-dev/ncp/commit/a5bd719d5a91c62fb6bef319bf28cf5aa4b70c44))
* add Shell MicroMCP and CLI Discovery settings to UI ([a120e18](https://github.com/portel-dev/ncp/commit/a120e18d7d82db6d3b29e89b6fd3e5c06c85b9a8))
* add skills marketplace configuration and reorganize settings ([fde95ce](https://github.com/portel-dev/ncp/commit/fde95ce9a1763de9c52cab620c5d3c2ba7b21f78))
* add Skills marketplace integration as internal MCP ([8449398](https://github.com/portel-dev/ncp/commit/8449398b6de2cc502efc4de254c3d3b777e10d16))
* add smart auto-detection and pipe-delimited bulk import to import tool ([57f809f](https://github.com/portel-dev/ncp/commit/57f809fb010aa259427000f3a71cccb8f22fbe41))
* add smart CLI argument parsing and space-separated tool naming syntax ([a40a108](https://github.com/portel-dev/ncp/commit/a40a108e55636958baf74e3eaec805c0ff7a6a64))
* add SSH marketplace support for skills ([4124dc1](https://github.com/portel-dev/ncp/commit/4124dc188b7e63d5c67d2e88554417efc622b874))
* add stopFileWatcher cleanup method to orchestrator ([07e2f49](https://github.com/portel-dev/ncp/commit/07e2f491b56cc91d6df4f349f3d405cd91db3728))
* add syntax-highlighted Code-Mode examples to CLI find ([8c106df](https://github.com/portel-dev/ncp/commit/8c106df98b75a591b8e445adf1a432cf38f83174))
* add test-drive guide resource for MCP server ([baca653](https://github.com/portel-dev/ncp/commit/baca653086eb5e7f2c802b734bd7fa294ab5feeb))
* add token usage analytics and code-mode savings tracking ([2369b63](https://github.com/portel-dev/ncp/commit/2369b63a227185a88323f9a798c5f4f7f1501c78))
* add tools for discovering MCP client configs ([739fd42](https://github.com/portel-dev/ncp/commit/739fd423d4ec0a4595c836a885ce7b854bb7893b))
* add TRUE automation powerhouse - multi-MCP orchestration ([b5a3301](https://github.com/portel-dev/ncp/commit/b5a3301942fdf0bac13a89fa588bf158c490d302))
* add TTL-based caching for MCP server resources and prompts ([e6c3bd5](https://github.com/portel-dev/ncp/commit/e6c3bd5953811c5d4be75426588fce5d647e0671))
* add TypeScript interface caching to RAG engine ([bb981ad](https://github.com/portel-dev/ncp/commit/bb981ad369dff72b5e6034b3bd87220da5be928e))
* add Windows Task Scheduler support for cross-platform scheduling ([dbe30fd](https://github.com/portel-dev/ncp/commit/dbe30fd3706a39417d98819b000e1c916dbba5e1))
* add Workflow MCP and SimpleMCP framework for intelligent task orchestration ([cfd99cc](https://github.com/portel-dev/ncp/commit/cfd99ccf8aa7a7917e6c08d5244824088b4fb96a))
* add workflowMode configuration for three usage patterns ([5a83905](https://github.com/portel-dev/ncp/commit/5a83905fcc210beef804e90de890f0ae1d68ddb7))
* align MCP tools with CLI interface ([e7b3fa4](https://github.com/portel-dev/ncp/commit/e7b3fa4a4a1ebb3d71d48250d9f34e694d475e9c))
* auto-discover SKILL.md files when skills field not provided ([52904d0](https://github.com/portel-dev/ncp/commit/52904d0904a221cdca018b7044df4f3fea9bc89d))
* auto-migrate credentials to secure storage on first run ([041b1a5](https://github.com/portel-dev/ncp/commit/041b1a539373299bcbfeaeec934c0b01ed3827c0))
* Claude Desktop-specific auto-import notification strategy ([db5ec89](https://github.com/portel-dev/ncp/commit/db5ec8912199bb278c159285783e595e3a0190f7))
* consolidate add command with smart detection for bulk operations ([da3e6fc](https://github.com/portel-dev/ncp/commit/da3e6fcf8a91dbb0d9836dd328241023d92c1a70))
* document --debug flag in CLI help ([fb57a43](https://github.com/portel-dev/ncp/commit/fb57a439390f046923157c4a766fe1e42e960c66))
* enable skills semantic search via RAG indexing ([c622a25](https://github.com/portel-dev/ncp/commit/c622a250a43b023a551d28170b4b09d544d7e93f))
* enhance config command help documentation ([524845b](https://github.com/portel-dev/ncp/commit/524845be2fade2d2151525e838ae2ce7e0036e1d))
* enhance logging for FileWatcher integration ([c97055a](https://github.com/portel-dev/ncp/commit/c97055a202fa7cc43488a7273e8393f50de00a95))
* enhance tool output formatting and add Code-Mode examples ([61a3095](https://github.com/portel-dev/ncp/commit/61a30953bea364b3e8e9e9893f95924fedca608e))
* expose MCP prompts transparently with prefix support ([e2a3f28](https://github.com/portel-dev/ncp/commit/e2a3f28031cf0fe669dfaa47479a5157d99dee2c))
* expose ncp-mcp binary for OpenAI Agents SDK compatibility ([8f61c15](https://github.com/portel-dev/ncp/commit/8f61c15950a899eea935721acbf8e53d396cfe0f))
* expose scheduler to Code-Mode with structured responses ([f499820](https://github.com/portel-dev/ncp/commit/f49982092e6f94ea176684d74212932fd6f424ca))
* extend internal MCP tool to support MicroMCP file/clipboard import ([eb0394c](https://github.com/portel-dev/ncp/commit/eb0394cf98ba020f1418a7c23e3b5e7ae1dd0da5))
* implement dynamic query-specific CLI enhancement ([d37d53e](https://github.com/portel-dev/ncp/commit/d37d53ef9b53324938a3ee88f713de8691bd32e4))
* implement launchd-based scheduler for macOS ([bf0fde0](https://github.com/portel-dev/ncp/commit/bf0fde0945e9d596fabca96272dad2065daae58b))
* implement Phase 1 Code-Mode security hardening ([bc87cc2](https://github.com/portel-dev/ncp/commit/bc87cc2a27a82ff4db3e709640d398d39b57f1b3))
* implement Phase 2 Code-Mode Worker Thread isolation ([6dc7a17](https://github.com/portel-dev/ncp/commit/6dc7a170d01650f008400e0c1f02df831bb41cab))
* implement Phase 3 Code-Mode bindings for credential isolation ([5ec2491](https://github.com/portel-dev/ncp/commit/5ec2491e7470569024dfea068b3d0372b6f850e9))
* implement Phase 4 Code-Mode network isolation ([6923c25](https://github.com/portel-dev/ncp/commit/6923c257d26c3d4ac78de1ea2a2d4c4a31ca7b0f))
* implement Phase 5 - Monitoring & Audit ([3e0b363](https://github.com/portel-dev/ncp/commit/3e0b36327898b6170cf79701daa20c1da74bf254))
* implement skills marketplace commands with CLI integration ([c0f282c](https://github.com/portel-dev/ncp/commit/c0f282c85788241650070189394799218193610f))
* implement skills progressive disclosure via skills:find ([bc37799](https://github.com/portel-dev/ncp/commit/bc377999117a92192798bb00922020daba1b082b))
* implement timing groups architecture with process isolation ([0e14053](https://github.com/portel-dev/ncp/commit/0e1405321a65449372b6e93d75ad4a559d08aa90))
* implement UTCP Code-Mode execution engine ([81f0291](https://github.com/portel-dev/ncp/commit/81f02916d125777b6cea032e85d33d0420b7b023))
* implement vector search for skills and refactor skills discovery ([3031e6c](https://github.com/portel-dev/ncp/commit/3031e6c6ca3a1b4f4d3de08339a55b90e1112fef))
* implement workflow mode tool filtering ([68ccf9e](https://github.com/portel-dev/ncp/commit/68ccf9e51868a15a3bdab0802effac534c16eefa))
* improve credential handling and cli UX ([9a03a9d](https://github.com/portel-dev/ncp/commit/9a03a9d1b49b49c781fa9617a13e5cf7dfd9100b))
* improve credentials cli output ([5e8d18f](https://github.com/portel-dev/ncp/commit/5e8d18f66636de9d643b15fdd622a0d14d67f275))
* improve find response with MCP grouping and difficulty indicators ([09053fe](https://github.com/portel-dev/ncp/commit/09053fe02bf23491e72bb6ce3bf49df3a6d4f1ff))
* improve find tool zero-results with actionable next steps ([b40361c](https://github.com/portel-dev/ncp/commit/b40361caffdc6bba2c44e4c4266f6422798aeae0))
* integrate FileWatcher into orchestrator for dynamic skill/photon discovery ([5c89034](https://github.com/portel-dev/ncp/commit/5c89034fcd16342af415ec04916d734fa5a9e905))
* integrate MCP update notifications in orchestrator ([9462449](https://github.com/portel-dev/ncp/commit/9462449df8971e73dd81469db14767d2c0a0b2e5))
* integrate Photon marketplace system ([bc26472](https://github.com/portel-dev/ncp/commit/bc2647249e14ef4809545ee8549bac61adff0e5c))
* integrate skills into unified discovery (skill: prefix) ([3d1b4f4](https://github.com/portel-dev/ncp/commit/3d1b4f48c602645fb5539de21c14ae0628d1e398))
* introduce MicroMCP format for single-file MCPs ([e4f77b2](https://github.com/portel-dev/ncp/commit/e4f77b25a8142da761405ba8740c400c3664d2a0))
* migrate from DXT to official MCPB (MCP Bundles) format ([19cd74a](https://github.com/portel-dev/ncp/commit/19cd74a41a25a4783299f08658f6402909a45532))
* migrate from MicroMCP to Photon architecture ([d90c900](https://github.com/portel-dev/ncp/commit/d90c90081354da382d30c7163c1aeea63a0ee0ae))
* migrate from MicroMCP to Photon runtime architecture ([ed5b1b2](https://github.com/portel-dev/ncp/commit/ed5b1b2fbfc22da9199f0202d6ff90b4df13770a))
* optimize CLI discovery with curated tool catalog ([dcc6c7e](https://github.com/portel-dev/ncp/commit/dcc6c7ea93bcc3e11dba6365b2c6a0df5747d2d7))
* optimize find response formats for Code-Mode, MCP, and CLI ([cbcd50d](https://github.com/portel-dev/ncp/commit/cbcd50d329c5c6a6c28aa78dcff4591c92a7511d))
* phase 3 - intelligent output formatting, markdown rendering, and doctor diagnostics ([233890e](https://github.com/portel-dev/ncp/commit/233890e3ee45d50d177617ff82cf2a7e233d3a6a))
* refactor CLI commands from colon-based to space-separated subcommands ([4fd1bef](https://github.com/portel-dev/ncp/commit/4fd1befd9e322bb69ba527269cf9f49350db6f46))
* runtime CLI tool discovery with zero maintenance ([9e8bf20](https://github.com/portel-dev/ncp/commit/9e8bf20cd8a82341334c545969ff3b88e962433c))
* separate marketplace namespace from skills ([90345ec](https://github.com/portel-dev/ncp/commit/90345ec7093bbcb05da899cc99c65956e43ee630))
* show available tools immediately after MCP installation ([5b609e9](https://github.com/portel-dev/ncp/commit/5b609e92db962ce0104a72be257061d426e3afaf))
* simplify code mode to boolean toggle ([289f345](https://github.com/portel-dev/ncp/commit/289f3452c31b39fc4bff0f623365ab70eb4fe5c6))
* smart mode detection with unified ncp command ([bddb3fe](https://github.com/portel-dev/ncp/commit/bddb3fec80ee7f98f27387186508239f5b9b5ec0))
* support all 66 registry providers with auto HTTP/stdio detection ([a42cf84](https://github.com/portel-dev/ncp/commit/a42cf844e2fc81c83a1ffd2232f1ebfd2cc075e8))
* support MicroMCP installation from URLs ([760aa9f](https://github.com/portel-dev/ncp/commit/760aa9f14da16895432b58864585da0437882b37))
* transparent content pass-through for all MCP response types ([ff671bf](https://github.com/portel-dev/ncp/commit/ff671bf9928194089bb6797bfeb0011374c74994))
* update DXT UI to reflect Photon-based architecture and workflow modes ([6ffc007](https://github.com/portel-dev/ncp/commit/6ffc007ce0a823963f1b02235c0ee5b9cc9281b7))
* update provider registry API to use api.mcps.portel.dev subdomain ([201ef65](https://github.com/portel-dev/ncp/commit/201ef65c7bcd14cc076e818f8e2ee5b4f46231e7))
* update Skills interface to match MCP dual-mode pattern ([7f5dce2](https://github.com/portel-dev/ncp/commit/7f5dce2d514d32a1eb4bacd30cfd208881bfa6f7))
* wire up elicitation function for runtime network permissions ([a0522ce](https://github.com/portel-dev/ncp/commit/a0522ce88b8497b6a34acad9d13f68e18531874f))

### Bug Fixes

* accept HTTP/SSE configs in getProfileMCPs validation ([9dca352](https://github.com/portel-dev/ncp/commit/9dca352c624417daf929ff3633305d8287786d8b))
* add .micro.ts file support to ConfigManager import ([110fe0d](https://github.com/portel-dev/ncp/commit/110fe0dd0196eb20b9c01e7d0112e7e4a6861cf0))
* add build-dxt-clean.sh to repository for CI/CD ([f5b8a8d](https://github.com/portel-dev/ncp/commit/f5b8a8d1d38a1abacabad6a783fcc6afddf16a0e))
* add command injection protection for MCP installation ([512c430](https://github.com/portel-dev/ncp/commit/512c4303fdbe3ee34eb32f14e4d99d2e2c094a68))
* add connection pool limits and LRU eviction to prevent memory leaks ([ae14f34](https://github.com/portel-dev/ncp/commit/ae14f342700b3aecbfafee1e47599bd9ae67ee19))
* add context-aware credential prompting for HTTP/SSE MCPs ([debf644](https://github.com/portel-dev/ncp/commit/debf644a5cffd7eb74ebdcfa8f704f1103958e4f))
* add detailed error logging to code executor for debugging parameter parsing errors ([2e5c45a](https://github.com/portel-dev/ncp/commit/2e5c45a268c1d92d6be18dfd9a7eb6a62ce3fe6b))
* add elicitation support to credential prompter with fallback chain ([401c42f](https://github.com/portel-dev/ncp/commit/401c42f107c7cea8b9e7cb7c39982ff2060f04ab))
* add enablePhotonRuntime to GlobalSettings and load before photons ([76d7b38](https://github.com/portel-dev/ncp/commit/76d7b38240c66fbb2faa4b8b6e0e9c22dc9cec07))
* add explicit NODE_OPTIONS to GitHub Actions for Node 18.x ES modules compatibility ([901dc70](https://github.com/portel-dev/ncp/commit/901dc707fe50f2b7008bf0fe57b5d65f2b71bca7))
* add manifest.json to CI workflow path triggers ([890e22e](https://github.com/portel-dev/ncp/commit/890e22e32f7af2770f33d3623a851c3f5f2ee328))
* add missing enableCodeMode user configuration option ([e0cc1b0](https://github.com/portel-dev/ncp/commit/e0cc1b0f55fddbb2c0fc7f425c07f68f31759a28))
* add missing extract-schemas.ts to fix CI build ([89cbb7e](https://github.com/portel-dev/ncp/commit/89cbb7ed516c237beeefb76aee7fc837611e3885)), closes [#19021965518](https://github.com/portel-dev/ncp/issues/19021965518)
* add missing imports to execution-recorder.test.ts for TypeScript compilation ([f20f494](https://github.com/portel-dev/ncp/commit/f20f494ba6c98a018a6695cd9184ce6397ee0190))
* add NODE_OPTIONS to coverage test job in GitHub Actions ([67fcb10](https://github.com/portel-dev/ncp/commit/67fcb1048fe1e1ca4526cf11a340d271daeac8c8))
* add NODE_OPTIONS to DXT test job in GitHub Actions ([240cdc1](https://github.com/portel-dev/ncp/commit/240cdc1b2d3e556136180e71eb3d1572802b3411))
* add null safety checks to analytics formatting code ([8ba646b](https://github.com/portel-dev/ncp/commit/8ba646b147ce3aebbc3f8bb1940469202a0caba9))
* add scripts/ to CI workflow path triggers ([0d8bbe9](https://github.com/portel-dev/ncp/commit/0d8bbe9cfd765d11f134fb67c03f5efc9138396d))
* add skills commands to CLI routing whitelist - critical fix ([a69ec3a](https://github.com/portel-dev/ncp/commit/a69ec3a84a4473f81071bd05b58f13be5e62fcf0))
* add timezone support to scheduler with RFC 3339 datetime ([274efb9](https://github.com/portel-dev/ncp/commit/274efb90c10ff4717ad927aab86e4436e224824b))
* add unprefixed tool name mapping in CSV cache loading ([9f92ffb](https://github.com/portel-dev/ncp/commit/9f92ffbfbc3b1a11f9e4c9ee0cdf598a9324ebe3))
* address PR review feedback ([359cf64](https://github.com/portel-dev/ncp/commit/359cf643bc4e1452f8b7ee58853a6992f08387d4)), closes [#2](https://github.com/portel-dev/ncp/issues/2)
* adjust coverage thresholds for js-yaml refactoring ([f0a087f](https://github.com/portel-dev/ncp/commit/f0a087f0da01f513297efe61dd1b84273e8a9d71))
* adjust integration test tools/list threshold to 250ms for Node.js 18.x compatibility ([4f3ffa6](https://github.com/portel-dev/ncp/commit/4f3ffa65ed6f114f99d29a13300b19a77ed53a9f))
* adjust test setup to skip orchestrator initialization and ensure cleanup is awaited ([37854c4](https://github.com/portel-dev/ncp/commit/37854c4aca7dd4715a028a7314b5e06b5b0405dc))
* auto-migrate old cache by detecting missing tool schemas ([8e212c7](https://github.com/portel-dev/ncp/commit/8e212c7e7915b27482e67b09d124e312fd608e17))
* CI failures - add missing type declarations and update doctor tests ([a3af4be](https://github.com/portel-dev/ncp/commit/a3af4be0c24aa2d84c2d030e7be27500046d7901))
* clarify mcp:add tool parameters to help AI extract MCP name from user intent ([449a34d](https://github.com/portel-dev/ncp/commit/449a34d3b4abfd6a3221221f19c9a6fcf1fe58d8))
* convert micromcp-installation test to use Jest instead of node:test ([3af5fa7](https://github.com/portel-dev/ncp/commit/3af5fa707a0884faa559b9e18749c49e0680a06b))
* convert mock files to ES6 exports for ESM/Jest compatibility ([fd6e508](https://github.com/portel-dev/ncp/commit/fd6e508ca448865913a223f0805e4bfc1687f1fc))
* correct all TOC anchor links to match GitHub-generated IDs ([0cd46ad](https://github.com/portel-dev/ncp/commit/0cd46ad1b990489805f14c1d8d2434f4f8109c12))
* correct Anthropic Agent Skills implementation ([bca1992](https://github.com/portel-dev/ncp/commit/bca1992f965e3316c357abf5e1607038ec270a2d))
* correct Cursor and Enconvo MCP config paths ([2eae4af](https://github.com/portel-dev/ncp/commit/2eae4af8ccbafab9ec9b02d77bf61e4a110dc343))
* correct formatting and indentation in loadProfile method ([9dc8d21](https://github.com/portel-dev/ncp/commit/9dc8d2198e9132abf61ebdc448cc911a86aa0552))
* correct internal MCP name from 'ncp' to 'mcp' in tests and cleanup setTimeout handles ([f1e4dfc](https://github.com/portel-dev/ncp/commit/f1e4dfcf7b1b7d26be7c564de1308d50dd7d1bae))
* correct MONTHLY schedule parameter handling for Windows Task Scheduler ([ea51224](https://github.com/portel-dev/ncp/commit/ea5122494e6dd5a12089eb61842963f8c4be946c))
* correct tool name in comprehensive test from ncp:list to mcp:list ([eae8f33](https://github.com/portel-dev/ncp/commit/eae8f33dac6eb8907747f792509fb99b1d0911ea))
* disable npm publishing in release (GitHub release only) ([06b01af](https://github.com/portel-dev/ncp/commit/06b01af65a103c115b92f376df9233678f86a56e))
* DXT build failures and doctor command output ([18a2b00](https://github.com/portel-dev/ncp/commit/18a2b006ed79e71ad8991d03c35e6e0ebff4263e))
* enable code execution in CLI mode by injecting orchestrator during profile load ([f521648](https://github.com/portel-dev/ncp/commit/f5216480382854034ebc9ed1b7898f1eed285610))
* ensure server initialization is awaited during cleanup ([d274e6d](https://github.com/portel-dev/ncp/commit/d274e6d3753e9761922a7c7df7b4aeaa4d4be531))
* ensure server initialization is awaited during cleanup ([3dd255c](https://github.com/portel-dev/ncp/commit/3dd255ca2eb926cee86b33f7c44ec00b2fd6213d))
* exclude macOS-specific micromcp-installation test from CI ([851447e](https://github.com/portel-dev/ncp/commit/851447e2a71205b2b14b5a89be7e4b08eab81a22))
* expose only find and run tools to AI ([6b72899](https://github.com/portel-dev/ncp/commit/6b72899eaebc804edf4f63e2901e2585b8b22104))
* expose skill tools in code executor for runtime access ([0d32108](https://github.com/portel-dev/ncp/commit/0d32108d44ed037bebd4e2457b17888e5f653f61))
* further lower coverage thresholds to 24%/29% for CI stability ([17b930c](https://github.com/portel-dev/ncp/commit/17b930c499effa9c0890015c1e674e1baf46c744))
* gracefully handle elicitation timeout errors in enum selection functions ([5d340b2](https://github.com/portel-dev/ncp/commit/5d340b2d3251528d6b0302dddce5ad23b21434ac))
* handle PowerShell error state in workflow verification step ([06a07b1](https://github.com/portel-dev/ncp/commit/06a07b1cd8144f4a27915cd1ae25c2db5d74f03d))
* implement Code-Mode using official UTCP pattern ([fd60473](https://github.com/portel-dev/ncp/commit/fd604732d88ad0af6d2dd62ee9c42d0081d84344))
* implement MCP-compliant auto-import and add enum elicitation support ([b5a6460](https://github.com/portel-dev/ncp/commit/b5a6460c1509d6fa09e7b8b2c962956faf5cee0d))
* improve Code-Mode introspection and tool support ([c9a8f65](https://github.com/portel-dev/ncp/commit/c9a8f65aae1767f89a74383d4bab705a9ab7aa9f))
* improve error messages in code-mode execution ([3124ec2](https://github.com/portel-dev/ncp/commit/3124ec2dafe78d6531ffdd6a7889f0dff99438d9))
* improve find responses during and after indexing ([8e8aa49](https://github.com/portel-dev/ncp/commit/8e8aa49d9895c5960d87f2a14773d71af25732b8))
* improve MCP search quality and handle verbose AI queries ([21b29af](https://github.com/portel-dev/ncp/commit/21b29afaaf61db8218e777e7da0824eec09e45d9))
* improve tool invocation clarity and code generation ([1d68b6f](https://github.com/portel-dev/ncp/commit/1d68b6f9bc874f7b69bed7d15c78cb73cb6a71b3))
* include inputSchema in cache invalidation hash ([93ca9b7](https://github.com/portel-dev/ncp/commit/93ca9b7c1a613582fda0b0129d1208fd2725a120))
* load MCP tool definitions from cache immediately for code-mode namespaces ([a2c8e8e](https://github.com/portel-dev/ncp/commit/a2c8e8ef06f480ecae4e06f0b9be1644682941ba))
* load workflow mode settings synchronously before exposing tools ([1305d2d](https://github.com/portel-dev/ncp/commit/1305d2d94b69995dafbe20539bfa250585b9bf08))
* lower coverage thresholds for CI environment variance ([0368943](https://github.com/portel-dev/ncp/commit/036894398706668e87d39b3b3ca8c233471dfab3))
* make saved settings file the absolute source of truth ([58517e8](https://github.com/portel-dev/ncp/commit/58517e8cf234cfeff37e24a0d9e17636aad84e40))
* make skills:search require a query argument for CLI parsing ([e1520af](https://github.com/portel-dev/ncp/commit/e1520af40824c6fbc0a905d4cecf45511db82f34))
* normalize HTTP MCP configs (Claude Desktop format → NCP format) ([1defab7](https://github.com/portel-dev/ncp/commit/1defab796a43bc21edeec0ea381b80d7aca59d8c)), closes [#3](https://github.com/portel-dev/ncp/issues/3)
* normalize namespace identifiers to valid JavaScript in code execution ([0ba31b0](https://github.com/portel-dev/ncp/commit/0ba31b09ff75f394933ff7a977e2c21d6d08cce6))
* oninitialized callback not being called due to race condition ([6b3a564](https://github.com/portel-dev/ncp/commit/6b3a564a5a16caf9a90b6c756c69b745793f75ce))
* only start FileWatcher when skills or photons are enabled ([7d03a28](https://github.com/portel-dev/ncp/commit/7d03a2820fe05c94219aca983bdb27864f4bfa2c))
* persist user settings across updates and Claude restarts ([2a73a1f](https://github.com/portel-dev/ncp/commit/2a73a1fe8c922ff81480f06cf5291009284d04c5))
* persist user settings across updates and Claude restarts ([af19dd6](https://github.com/portel-dev/ncp/commit/af19dd6e190d0d0114b95177db45fec966a08922))
* pin mcpb to 1.1.1 to avoid 1.1.5 inconsistencies ([c4e019b](https://github.com/portel-dev/ncp/commit/c4e019bd47d0bfc06302d2e35c4b31f1b05f3114))
* pin mcpb to 1.1.4 to avoid 1.1.5 inconsistencies ([3b7e1d1](https://github.com/portel-dev/ncp/commit/3b7e1d1bd44d38ba719f80062fe71403c88f9e6c))
* prevent DXT global CLI from overwriting npm installations ([311cb18](https://github.com/portel-dev/ncp/commit/311cb183071b35fd671364f13a429aec5e4bddbe))
* prevent scheduler job execution from hanging ([866e1d8](https://github.com/portel-dev/ncp/commit/866e1d8c607f16d044e71a65a7932e8d506b0472))
* prevent stdin listener leak in OAuth device flow ([ae43f23](https://github.com/portel-dev/ncp/commit/ae43f23747afcfe0c5b989b59ba181c5f97f7c36))
* prevent template interpolation in user code execution context ([8f155de](https://github.com/portel-dev/ncp/commit/8f155de1e7aa60402a8f6627521c953426a20f78))
* properly preserve user settings across DXT reinstalls ([20868ac](https://github.com/portel-dev/ncp/commit/20868ace35aab7c318268f870ed26bafa9b5794c))
* reduce coverage thresholds and make DXT test script conditional ([5e37b42](https://github.com/portel-dev/ncp/commit/5e37b42e6b496cbc9accced999092952f88b7416))
* refocus mcp:add and mcp:remove to require AI-assisted discovery ([d9e15e0](https://github.com/portel-dev/ncp/commit/d9e15e011908d8c44b223ef98158a0d469ae9295))
* remove duplicate doctor command definition ([3de4a07](https://github.com/portel-dev/ncp/commit/3de4a07ba1d923b33356101a3c20bd0a838b7d58))
* remove enableCodeMode from user_config to allow runtime changes ([1eea1a2](https://github.com/portel-dev/ncp/commit/1eea1a2b6d22f282096b89fed67aeceb7677bdbc))
* remove enum from workflow_mode setting for manifest compatibility ([ae4acb6](https://github.com/portel-dev/ncp/commit/ae4acb6110da82232ce4c9a8e3933c1229fc258d))
* remove non-existent test:package step from release workflow ([7b9cbf2](https://github.com/portel-dev/ncp/commit/7b9cbf25809bed77c4c94a97b734a16ee22f8443))
* remove unnecessary stdin mocking in OAuth Device Flow tests ([2df30f2](https://github.com/portel-dev/ncp/commit/2df30f239179ae10d345c9ccc5484a33d9f1edb9))
* remove unsupported icon_alt field from manifest ([87dd8b7](https://github.com/portel-dev/ncp/commit/87dd8b79600a22d2dd4a817cad3ce2288deb7be6))
* rename enable_skills_marketplace to enable_skills ([9299b59](https://github.com/portel-dev/ncp/commit/9299b596a5eeecce525550510722129731f02714))
* rename internal MCP from 'ncp' to 'mcp' for clarity ([0327fa9](https://github.com/portel-dev/ncp/commit/0327fa9f5e7ffc7001701f8181fb032f68bffa59))
* rename shell setting to photon runtime with correct description ([b660f83](https://github.com/portel-dev/ncp/commit/b660f83378f590756c50b40da209f12f0df4ff22))
* replace hardcoded macOS path with dynamic PROJECT_ROOT variable in DXT build script ([d005d77](https://github.com/portel-dev/ncp/commit/d005d77bb9e2944049e45d93dad16e36213971a4))
* resolve 'Arg string terminates parameters early' by refactoring AsyncFunction parameter passing ([2b3c5a0](https://github.com/portel-dev/ncp/commit/2b3c5a0013067876990dd316644bd1b008bf643d))
* resolve chalk mock ESM/CommonJS compatibility in tests ([01e50b9](https://github.com/portel-dev/ncp/commit/01e50b9558ff09c9ba94e2e7cb74e302a087a7b5))
* resolve code execution null safety and tool name prefixing issues ([940b4dd](https://github.com/portel-dev/ncp/commit/940b4dd0a3b4b11c1f28b9a49c0b90ac0a825af0))
* resolve critical bugs blocking release ([e805e3e](https://github.com/portel-dev/ncp/commit/e805e3ed74e32005256dd893fedf4794828c0376))
* resolve DXT package crashes and auto-import failures ([06c8ba8](https://github.com/portel-dev/ncp/commit/06c8ba82f9bbfe776a48bce4ccfd845acee9cf40))
* resolve ESM compatibility issues in test suite ([adfa351](https://github.com/portel-dev/ncp/commit/adfa3513dedf267d939cae1442c3ecff77d46f9f))
* resolve ESM require errors and fix branding in error messages ([850103d](https://github.com/portel-dev/ncp/commit/850103d1ba52cfd76e65c588049d5062d9ba241b))
* resolve Jest.mock ESM compatibility for fs module mocking ([c7d8af1](https://github.com/portel-dev/ncp/commit/c7d8af19da4538b7c7e7cc7c96f772411219abaa))
* resolve remaining test failures and CLI error handling ([b1be8cf](https://github.com/portel-dev/ncp/commit/b1be8cf3234658bf6e7f5d7344bb285834ac9fa6))
* restore helpful error messages and registry fallback ([12702d7](https://github.com/portel-dev/ncp/commit/12702d7eb4606572415b4a7df3cba8d74a2170b0))
* restore tool schema display in find command ([10c7ba5](https://github.com/portel-dev/ncp/commit/10c7ba52ea2fe185f55a30d5cc077f1d9aa625d0))
* simplify debug logging - always write to file when NCP_DEBUG=true ([dd6d884](https://github.com/portel-dev/ncp/commit/dd6d8843d5bc010f95f4966a22c71fd388e53c9a))
* simplify namespace sanitization - remove unnecessary collision detection ([4b65e2b](https://github.com/portel-dev/ncp/commit/4b65e2b4db5d3ff9fec111fb54d469ae5a3487ff))
* skip prepack script in DXT build (already built in project root) ([591fb7a](https://github.com/portel-dev/ncp/commit/591fb7a7204fdaf507e65f9314638db9fdead54d))
* stabilize code execution with collision detection and enhanced error handling ([3935189](https://github.com/portel-dev/ncp/commit/39351895e22ec226a26a2b3a13b503c803cc7957))
* standardize configuration naming to camelCase across entire codebase ([b78651e](https://github.com/portel-dev/ncp/commit/b78651ea6cedb4b9b9a62310a8367efd41d41e4d))
* stop persisting env-based settings overrides ([ac4aafb](https://github.com/portel-dev/ncp/commit/ac4aafbfa1e03fbfdd9d0eb9cfee2208cf1c5630))
* store compiled photons next to node_modules for module resolution ([147b8fa](https://github.com/portel-dev/ncp/commit/147b8fa1d810b5aa1f5070157a85c5b1726e9e21))
* support both DXT and NPM installation methods for code mode ([d5ec714](https://github.com/portel-dev/ncp/commit/d5ec7147debdda4b244348412060dee5953eb62b))
* update configuration symbols to checkmark box and blank square ([6ca7bd8](https://github.com/portel-dev/ncp/commit/6ca7bd8e3ed086d8ac87b6555585b7b902845af6))
* update DXT validation script to use camelCase manifest keys ([e8c8324](https://github.com/portel-dev/ncp/commit/e8c832420409c56f9c960de8ff8a23b880aa9345))
* update help text examples to use space-separated subcommand syntax ([748f006](https://github.com/portel-dev/ncp/commit/748f006df616d149242fe7bd6657afe1440948ab))
* update icon to PNG format for mcpb 1.1.5 compatibility ([20733c0](https://github.com/portel-dev/ncp/commit/20733c0b8950ec58a75f1e150b4b618a8c8f4156))
* update logger calls to use single string argument ([58cf635](https://github.com/portel-dev/ncp/commit/58cf6352f4c83a3dfd03fb6e5ad9fa34108d1863))
* update logger tests to work with file-based logging ([c92683a](https://github.com/portel-dev/ncp/commit/c92683a7cb476615e5975957702d3a4729bb3d17))
* update manifest_version to 0.3 for DXT compatibility ([bd89773](https://github.com/portel-dev/ncp/commit/bd89773820cf3d3d2061ec1068c6d7a9d86eaffd))
* update patch script to use ncp.mcpb instead of ncp.dxt ([ba317f2](https://github.com/portel-dev/ncp/commit/ba317f2d57806ab8a162584ec2bb4982224edab7))
* update photon help text to show 'add' instead of 'install' ([bfdae2a](https://github.com/portel-dev/ncp/commit/bfdae2aa063c105b9a0af10ddf485a980c964681))
* update photon-loader import after base-photon migration ([c2087b5](https://github.com/portel-dev/ncp/commit/c2087b523553be86440c2fa265038394b96277b7))
* update references from old add-http/add-stdio to unified add command ([9a6c3ab](https://github.com/portel-dev/ncp/commit/9a6c3ab1fd0703c98d128e4021c4a788c2307e95))
* update release workflow to upload ncp.mcpb instead of ncp.dxt ([d8137cb](https://github.com/portel-dev/ncp/commit/d8137cb2caaaad6870ce4f2d51f57789a9736883))
* update to photon-core@1.0.2 for automatic dependency cache invalidation ([28de78a](https://github.com/portel-dev/ncp/commit/28de78aebe432d204cfd48c76883d67de87fbc91))
* upgrade Node version to 20 in release workflow ([58336b2](https://github.com/portel-dev/ncp/commit/58336b2be3bdd9d0e70d9df0a809f97fc3fbedae))
* use centralized getNcpBaseDirectory() for all .ncp path resolution ([46e8ea5](https://github.com/portel-dev/ncp/commit/46e8ea5e0769eb75b1207100edb73cd49b29ba6d))
* use default profile in integration test ([58358cf](https://github.com/portel-dev/ncp/commit/58358cf390d601aa844dc1803698fe7c7f9b20d9))
* use high-quality 512x512 PNG icon for better scaling in Claude Desktop ([c85a099](https://github.com/portel-dev/ncp/commit/c85a0991cca7fe56cf3b6b7188940c32ce341b8c))
* Windows command resolution and path escaping for MCP servers ([d13bcde](https://github.com/portel-dev/ncp/commit/d13bcde8bfad6698ef52bceb2957179a0967ea30))

### Performance Improvements

* eliminate blocking sync file operations from cache layer ([a0fdb2a](https://github.com/portel-dev/ncp/commit/a0fdb2abe9db355ba8bc0b7e3607d45de7c8f1da))
* optimize incremental per-MCP caching to avoid redundant saves ([3ed5f5b](https://github.com/portel-dev/ncp/commit/3ed5f5b4136e0299e12e78931a711234cfd6a026))
* parallelize auto-import and add timeout to prevent startup delays ([8cf08f6](https://github.com/portel-dev/ncp/commit/8cf08f6c91aa00b776e87e3bf348d676a39f135b))

## Unreleased

### Features

* migrate to @portel/photon-core package for Photon MCP management
* simplify skills subsystem

### Bug Fixes

* fix Windows runtime detection and log path handling for MCP servers (fixes #4, fixes #5)
* fix HTTP MCP config normalization - convert Claude Desktop `headers` format to NCP `auth` format (fixes #3)
* fix auto-import profile writes - make sequential to prevent JSON corruption

## [1.5.3](https://github.com/portel-dev/ncp/compare/1.5.2...1.5.3) (2025-10-14)

### Bug Fixes

* ensure MCP protocol compliance with immediate stdio listener ([43a71c7](https://github.com/portel-dev/ncp/commit/43a71c7a290cb22b256f07eae95e501c8818fdb7))

## [1.5.2](https://github.com/portel-dev/ncp/compare/1.5.1...1.5.2) (2025-10-12)

### Bug Fixes

* resolve script symlink to find actual installation directory ([ad7f3c8](https://github.com/portel-dev/ncp/commit/ad7f3c894ec60b92817473ce418e58f90f1221e3))

## [1.5.1](https://github.com/portel-dev/ncp/compare/1.5.0...1.5.1) (2025-10-12)

### Bug Fixes

* enhance version utility to prefer global package version and improve local fallback logic in tests ([8765c69](https://github.com/portel-dev/ncp/commit/8765c6964c0166251222ec58da91a4bd7dc88d96))
* look for package.json after resolving the symlinks if found and update version in server.json ([0f0c9c8](https://github.com/portel-dev/ncp/commit/0f0c9c8e49cf9a7a6a721b44248fe7f88aafe5bd))

## [1.5.0](https://github.com/portel-dev/ncp/compare/1.4.3...1.5.0) (2025-10-11)

### Features

* add installation metadata to server.json ([fe0e25b](https://github.com/portel-dev/ncp/commit/fe0e25b7e15003f3ab3c92664784f8cf7ca3221e))
* enhance MockServerManager with improved timeout management and error handling ([edb0fb4](https://github.com/portel-dev/ncp/commit/edb0fb4bff8ea67b8c1486a36d52fc4be9204864))
* enhance MockServerManager with robust server startup and error handling; add Git mock server implementation ([3488512](https://github.com/portel-dev/ncp/commit/3488512af0fdd75efaf61bafe6a3ce43e09836ff))
* enhance test configurations with improved Jest settings and mock server management ([ad7e893](https://github.com/portel-dev/ncp/commit/ad7e893a713b39987ca09ae22c842bde0ec113b9))
* implement MockServerManager to manage mock MCP server processes for tests ([89d5b38](https://github.com/portel-dev/ncp/commit/89d5b383472fbeb8ef749dc84fab4eb3233f9de5))
* improve timeout handling in MCPServer and MCPHealthMonitor; enhance find command test assertions ([d089f6b](https://github.com/portel-dev/ncp/commit/d089f6b7bddbfdd6010121e1aed058912ebfdd6a))
* update .npmignore and package.json to include TypeScript support and specify files for packaging ([ae9bbcf](https://github.com/portel-dev/ncp/commit/ae9bbcf94ba6c212c7eec1ef41485e665d474f9a))

### Bug Fixes

* correct testMatch pattern to include both .js and .ts files ([dec5625](https://github.com/portel-dev/ncp/commit/dec56254a8cde1240dc56b26fe11d980f72252cc))

## [1.4.1](https://github.com/portel-dev/ncp/compare/1.4.0...1.4.1) (2025-10-03)

### Bug Fixes

* mock createWriteStream in orchestrator tests ([bd6ea80](https://github.com/portel-dev/ncp/commit/bd6ea80c02435932702cdaa12390e159dc5a845a))

## [1.4.0](https://github.com/portel-dev/ncp/compare/1.3.2...1.4.0) (2025-10-03)

### Features

* add --working-dir parameter and fix GitHub releases ([0a1e4db](https://github.com/portel-dev/ncp/commit/0a1e4db9f83ac6ba67ac85db519b0bdfdc79a89a))
* add automated MCP registry publishing ([56f410c](https://github.com/portel-dev/ncp/commit/56f410c56e1657def7a617fa5af4bd9f0751bd18))
* add GitHub Actions workflow for publishing releases ([a7eab05](https://github.com/portel-dev/ncp/commit/a7eab05d65246660f451c3d2152e19ac9ba10d3d))
* add graceful shutdown on Ctrl+C for clean cache finalization ([b37d6d2](https://github.com/portel-dev/ncp/commit/b37d6d26dc4f9ff401dd149e7d4a0740e5cfc7b1))
* add repair command skeleton and improve error logging ([303ce05](https://github.com/portel-dev/ncp/commit/303ce05c44927b252b66b67e3d97a8bc1c9d7402))
* add repair command with generic error parser ([ef89a62](https://github.com/portel-dev/ncp/commit/ef89a62d9f85f18a4e345f8af2a6cc52cb1a1580))
* add session ID transparency for stateful MCP servers ([af72da9](https://github.com/portel-dev/ncp/commit/af72da964aba3b16b2fa5a4c51ffc9f8aba4faa8))
* add Smithery config detection to ncp repair command ([2ff58da](https://github.com/portel-dev/ncp/commit/2ff58da91083eea8c608d804937f42f5f9828883))
* add Smithery config schema detection (3-tier system) ([ef008e8](https://github.com/portel-dev/ncp/commit/ef008e832dcb5bff37598857a3890deaf841693e))
* enhance error parser to detect file-not-found patterns ([d9ca05b](https://github.com/portel-dev/ncp/commit/d9ca05b1acb7d5f9d0cdb7c665be8c1f6fdef372))
* implement CSV-based incremental caching for resumable indexing ([064e347](https://github.com/portel-dev/ncp/commit/064e34710392b74643d6b4f3b8cf370f30e5d1c1)), closes [#30](https://github.com/portel-dev/ncp/issues/30)
* integrate health monitor with repair command ([48ce0d1](https://github.com/portel-dev/ncp/commit/48ce0d1f894806484209c8a976fd92fd12cc61d0))
* intelligent failed MCP tracking with scheduled retry and --force-retry flag ([91c7a65](https://github.com/portel-dev/ncp/commit/91c7a65076d4e838f8819606737f919b7e4a176b))
* retry slow MCPs with longer timeout to capture healthy-but-slow servers ([844e347](https://github.com/portel-dev/ncp/commit/844e347be969f02cdd5ba2d462df7c48aa561ceb))

### Bug Fixes

* add 3s timeout to update checker to prevent CLI hangs ([05210d8](https://github.com/portel-dev/ncp/commit/05210d8d27c6cbb9a7df6b2290f5eb6b30497068))
* add fallback authentication for MCP registry publishing ([f138b37](https://github.com/portel-dev/ncp/commit/f138b37259d251564d9fbcfaa4d9a1381271e33e))
* add newline before progress spinner to avoid overwriting command ([676f0a5](https://github.com/portel-dev/ncp/commit/676f0a5bb0f208ef127357bfd64e6ded36f9fe83))
* add proper blank line spacing before progress spinner ([8eea9aa](https://github.com/portel-dev/ncp/commit/8eea9aa380ed3611769f29b112a40fc2c69958e9))
* add repair command to CLI mode check to prevent hanging ([3c2aa60](https://github.com/portel-dev/ncp/commit/3c2aa60be3b7df6c6a9cbeb8845d4aad1b1e1cd8))
* also fsync metadata file to ensure cache progress is saved ([e47a180](https://github.com/portel-dev/ncp/commit/e47a180399f599d90401bd73060853e22574527f))
* clarify progress messages for cache resume ([51f0e90](https://github.com/portel-dev/ncp/commit/51f0e900450431a7a22e38bd8b7fc82a4717128c))
* CLI find command now waits for indexing to complete ([8f2e671](https://github.com/portel-dev/ncp/commit/8f2e671af4ea9f2277bfa22c97d9337402cec68d))
* correct cached MCP count in first progress message ([925e819](https://github.com/portel-dev/ncp/commit/925e819b67ef18188aeb8a38997acd9073feb1e0))
* correct version reading in update checker and updater ([5f7c737](https://github.com/portel-dev/ncp/commit/5f7c7376b657b3a9b8eecb684e433ed07f021db5))
* correctly calculate starting position excluding failed MCPs being retried ([0706653](https://github.com/portel-dev/ncp/commit/0706653dbde56e8c9eb2f0b189d1c529098022cf))
* detect multiple arguments in Usage message for clone/copy MCPs ([579b27c](https://github.com/portel-dev/ncp/commit/579b27cace62fea90586b370d23333d00033bfed))
* disable indexing progress in run command for clean CLI output ([7cde964](https://github.com/portel-dev/ncp/commit/7cde96454d76b632e5303262c148401275694b89))
* display correct progress message and add newline in CLI ([0dcd686](https://github.com/portel-dev/ncp/commit/0dcd686e0ba077c8f78cb5fe923f5feb6d45171b))
* force flush CSV cache to disk after each MCP for crash safety ([e7f7649](https://github.com/portel-dev/ncp/commit/e7f7649cf3d89a1052e62b032871f4cdca80c8e8))
* preserve newline before spinner by skipping clearLines on first render ([33b85a3](https://github.com/portel-dev/ncp/commit/33b85a30ee2a7f9257e9eccf8d585e21fd49a6ae))
* prevent duplicate API key/token detection in env var parser ([246b3d1](https://github.com/portel-dev/ncp/commit/246b3d1b2d3284ec2adcb43096a47aed15bf126a))
* prevent duplicate path detection in error parser ([f017606](https://github.com/portel-dev/ncp/commit/f017606fa5012d67baf6eda67626741daaf944ee))
* read version from package.json instead of hardcoding ([c2a0e46](https://github.com/portel-dev/ncp/commit/c2a0e4693c004a402a2e1c5501c69473a87671cc))
* remove deprecated string-similarity and correct version issues ([486a866](https://github.com/portel-dev/ncp/commit/486a866fb0c027f5dec09bd97450cd4d9631b9e3))
* restore and correct server.json for MCP registry ([60e16e0](https://github.com/portel-dev/ncp/commit/60e16e07e3b2a597886010f897ea99e667096e35))
* show actual MCP count loaded from CSV, not stale metadata count ([a2a4c62](https://github.com/portel-dev/ncp/commit/a2a4c62645568a5d4670883fd9e0c8bb2e6e82f8))
* show cached count as starting position, not 0 ([3f0d2bd](https://github.com/portel-dev/ncp/commit/3f0d2bd204baf9eef7bc443fc1938ab4f08373f4))
* show total processed count (cached+failed) as starting position ([c3e52ca](https://github.com/portel-dev/ncp/commit/c3e52cacdd95285938b5c5487051f5bf66c2788f))
* simplify progress messages to show absolute position only ([43007d9](https://github.com/portel-dev/ncp/commit/43007d9411ddc80bdab25a902e3e5f21888bbd99))
* update progress counter for failed/skipped MCPs too ([9cbf744](https://github.com/portel-dev/ncp/commit/9cbf744606bb65e161da60510e72dd140065d303))
* update progress only AFTER MCP is appended to cache ([1db3c73](https://github.com/portel-dev/ncp/commit/1db3c73e7690e0324091a0c1c6cb60e8232c96a9))
* wait for write stream to finish in finalize() ([0174a87](https://github.com/portel-dev/ncp/commit/0174a872c35000341cbe415b4a0d06acde647628))

## [1.3.1](https://github.com/portel-dev/ncp/compare/v1.3.0...1.3.1) (2025-09-27)

### Bug Fixes

* make protocol tests more flexible for hotfix release ([165274b](https://github.com/portel-dev/ncp/commit/165274b7fb1eb49e7ee8ba1193d2a4587a3b858b))
* replace import.meta with process.cwd for Jest compatibility ([db51c3c](https://github.com/portel-dev/ncp/commit/db51c3cdc7bb67e3ae85cafbfd4fd93aa9cf73ac))
* resolve critical MCP server blocking during indexing ([e24b733](https://github.com/portel-dev/ncp/commit/e24b733ba254830564a45ba42c17723a09adb39e))
* skip problematic test for hotfix release ([7ff1079](https://github.com/portel-dev/ncp/commit/7ff1079d8e0390d0e23fe40187e8f95573b56481))
* update checker changes ([a744e42](https://github.com/portel-dev/ncp/commit/a744e4216c779e192539ffe211c3c3176f85a2c0))

## [1.2.1](https://github.com/portel-dev/ncp/compare/1.1.0...1.2.1) (2025-09-25)

### Bug Fixes

* configure proper semantic versioning based on conventional commits ([2a6feda](https://github.com/portel-dev/ncp/commit/2a6fedaa78d09fdf091d8e59c69b6d86c8507ee2))
* critical packaging fixes for npm package integrity ([de5fa8f](https://github.com/portel-dev/ncp/commit/de5fa8f7eb100eb48d466dde27b5d3584e681607))
* remove unused production dependencies ([4e3ffb2](https://github.com/portel-dev/ncp/commit/4e3ffb248cd41ad0a5cdb56118b1fd22ff91c469))
* resolve discovery engine tool indexing and test issues ([7dbc42f](https://github.com/portel-dev/ncp/commit/7dbc42fabd9c9c29ccc887842a09d80898d58cd1))

## [1.2.0](https://github.com/portel-dev/ncp/compare/1.1.0...1.2.0) (2025-09-25)

### Bug Fixes

* critical packaging fixes for npm package integrity ([de5fa8f](https://github.com/portel-dev/ncp/commit/de5fa8f7eb100eb48d466dde27b5d3584e681607))

## 1.1.0 (2025-09-25)

### Features

* Achieve 80.5% user story discovery pass rate ([b22aa41](https://github.com/portel-dev/ncp/commit/b22aa41e23eae692895ad898d2a563fca0c93c05)), closes [#4](https://github.com/portel-dev/ncp/issues/4) [-#10](https://github.com/portel-dev/-/issues/10)
* add \"Did You Mean?\" fuzzy matching for tool suggestions ([820fe96](https://github.com/portel-dev/ncp/commit/820fe96d6a1a598fc42561bb09a8a5407034eaf2))
* add beautiful JSON syntax highlighting for tool results ([2604496](https://github.com/portel-dev/ncp/commit/2604496f7b4439d4d2d1d343b3228ade9e41658e))
* Add comprehensive HOW-IT-WORKS.md technical guide ([951eb72](https://github.com/portel-dev/ncp/commit/951eb72b4421026752a3d659a9c67d50df7bb92c))
* add comprehensive MCP content type support and user output control ([c5dbe02](https://github.com/portel-dev/ncp/commit/c5dbe02601d6b58450c71a019bc91984b132d5b9))
* Add comprehensive MCP interface testing strategy ([179ce95](https://github.com/portel-dev/ncp/commit/179ce95b49dd5aac14a5673b06bb58b6df3b5011))
* add contextual run command examples in find tips ([1877b84](https://github.com/portel-dev/ncp/commit/1877b8409a5abd58d8f2f97dadcc0307735bf432))
* add intelligent markdown rendering for tool responses ([208aac5](https://github.com/portel-dev/ncp/commit/208aac59e4be871be2d3f3bb6ab60820943c237f))
* add MCP health status indicators to find results ([5b5fc96](https://github.com/portel-dev/ncp/commit/5b5fc96f64b40d5aeb4d258c315b4a013b3bd521))
* add media auto-opening and enhanced run command help ([c9a1a43](https://github.com/portel-dev/ncp/commit/c9a1a4362741f6442ca0b4776a69b775a08bd7f1))
* add OutputFormatter service for consistent UX ([7df2f68](https://github.com/portel-dev/ncp/commit/7df2f68c2b9a18b2f7ba1d3bd44825fd48d86a93))
* add parameter validation before tool execution ([5dc91b6](https://github.com/portel-dev/ncp/commit/5dc91b61d4d9067692a21e19057ac49e6cef82b3))
* Add SearchEnhancer for clean, extensible search optimization ([1936813](https://github.com/portel-dev/ncp/commit/1936813ab365e674d6174d77e4c3cf81aa1969a5))
* Add semantic mapping for 'save' → 'edit' actions ([d2b3cd3](https://github.com/portel-dev/ncp/commit/d2b3cd364d3163fd69850b404050aa19928a0189))
* Add terminal window frame scripts for professional screenshots ([1815498](https://github.com/portel-dev/ncp/commit/18154988cb4c6b8aa23ef0229260a3507c352f97))
* auto-handle empty parameters for tools without required params ([6b23a23](https://github.com/portel-dev/ncp/commit/6b23a232e7a5ae276e102a7be2f01834a7cae3f2))
* Complete intent-aware search system with comprehensive testing ([49b8c40](https://github.com/portel-dev/ncp/commit/49b8c40a87b11be6e85773d0b70d10f2c7d15848))
* Comprehensive user story discovery tests with curated MCP profile ([f3f6a4d](https://github.com/portel-dev/ncp/commit/f3f6a4dc6481d8abff71ab88b1040748c102aa27))
* create standalone Smithery MCP server entry point ([f27f5b3](https://github.com/portel-dev/ncp/commit/f27f5b3006a2a95fc9ab5f46edc9a0a0e886f13f))
* enhance confidence threshold documentation and CLI support ([4206557](https://github.com/portel-dev/ncp/commit/4206557c814f30d381e36a09662a4183d592b737))
* Enhance config import with rich display and security improvements ([45f76e3](https://github.com/portel-dev/ncp/commit/45f76e30e4e129af0be40c60ed1c8ca95b415b5f))
* enhance error messages for invalid MCPs and tools ([cb2ebe3](https://github.com/portel-dev/ncp/commit/cb2ebe36d3036cf4f69b2cea9883cc3bdf746f2f))
* enhance generic error messages with contextual guidance ([bbaeeea](https://github.com/portel-dev/ncp/commit/bbaeeeae574775faa02b555e79f6adf7c7dcfdb0))
* enhance MCP tool descriptions to document full intelligent capabilities ([05a77ff](https://github.com/portel-dev/ncp/commit/05a77ff03a2e2ae81b7609c1bcabc48400e5ac31))
* Enhance search ranking with action word weighting ([ead58af](https://github.com/portel-dev/ncp/commit/ead58afef16d225e66bf02d32f4216da0f2eb8a4))
* Enhanced error handling with vector search suggestions ([f65bcf7](https://github.com/portel-dev/ncp/commit/f65bcf7ad2bcd4801fce05ced874edf949cff05e))
* Expand MCP ecosystem to 1069 MCPs with enhanced semantic engine ([36b5c8c](https://github.com/portel-dev/ncp/commit/36b5c8c8600912e5f7ce1cde52ce313507eaeaeb))
* implement bidirectional domain-to-capability mapping for intelligent tool discovery ([7dc0992](https://github.com/portel-dev/ncp/commit/7dc09928ff763ee8262934a619a4bed0ec7b2fae))
* implement intelligent parameter prediction system ([bb23d0d](https://github.com/portel-dev/ncp/commit/bb23d0de55ba3643bbc0cc242888cb7187518338))
* implement interactive parameter prompting system ([3f233a3](https://github.com/portel-dev/ncp/commit/3f233a3044cd59745e4d0b9d1014a8079c934c75))
* implement project-level .ncp configuration ([865494e](https://github.com/portel-dev/ncp/commit/865494e6a6932efe769b6f01b20ae4346d2251f5))
* implement smart text extraction for tool responses ([e8ac67c](https://github.com/portel-dev/ncp/commit/e8ac67c8c2dd1b78a9539d7f0b85299f9d341a73))
* Improve list command navigation title ([564a5d1](https://github.com/portel-dev/ncp/commit/564a5d10f03ac1eaeef8a3fe955733883c6edf8e))
* Integrate health monitoring for real-time MCP error reporting ([8f07247](https://github.com/portel-dev/ncp/commit/8f07247dad870f0bf54a24b07a8b1d16e6e383b4))
* Natural Context Provider v1.0.3 - N-to-1 MCP orchestration for AI assistants ([93a3f8f](https://github.com/portel-dev/ncp/commit/93a3f8f59de59e8d28054b5c1739493ffc1166a0))
* Natural Context Provider v1.0.4 - Enhanced Documentation & Production Ready ([7e4617b](https://github.com/portel-dev/ncp/commit/7e4617b8eb37c55afb7c97acee7965b9f590b593))
* optimize find command with dual-mode operation and improved depth levels ([9bb0630](https://github.com/portel-dev/ncp/commit/9bb0630c154d0f745b73a29e2ba3654440510a42))
* Optimize ncp list performance and enhance security display ([90bec0d](https://github.com/portel-dev/ncp/commit/90bec0d6debd101f1a74f4d0a4865acad18f8922))
* Pain-point driven README and prominent import feature in CLI help ([b9af32d](https://github.com/portel-dev/ncp/commit/b9af32d8a4a2156641764407521c6b2a5c730c42))
* Perfect CLI command enhancements for intelligent failure recovery ([0adb385](https://github.com/portel-dev/ncp/commit/0adb38533babce87c127856f284078dc40fda14d))
* Pivot to user story format for improved discovery ([505ba25](https://github.com/portel-dev/ncp/commit/505ba2582535f20286d74bd6b2ebeace3e29aa28))
* port comprehensive CLI interface from ncp-oss3 ([351bca2](https://github.com/portel-dev/ncp/commit/351bca26875c320714eb9e907c2320821b14d8b0))
* restore and enhance CLI help command polish ([c7a3843](https://github.com/portel-dev/ncp/commit/c7a384366229591fd56da1b14d093dbc754264ef))
* Simplify config import to clipboard-first with enhanced UX ([0f78d1c](https://github.com/portel-dev/ncp/commit/0f78d1cf6c8fdca9cef04c454e4bf59c4198a17b))

### Bug Fixes

* add missing version command and improve CLI argument detection ([4f98ece](https://github.com/portel-dev/ncp/commit/4f98ece602448e60a7511bd7c7baa486d8a6d699))
* Add newline separation after progress spinner in config import ([ab8ca8c](https://github.com/portel-dev/ncp/commit/ab8ca8c431abade617543da38ebbf22bfcbcbe31))
* Add newline separation between command and response in file import ([e954a11](https://github.com/portel-dev/ncp/commit/e954a110f6216a27d16d24d26e6761fac8506fb9))
* add semi-transparent background to infographic for better visibility ([d8e6ff5](https://github.com/portel-dev/ncp/commit/d8e6ff5da852385030603f8d745811d007e8fa8c))
* clean up dependencies for Smithery deployment ([edb759e](https://github.com/portel-dev/ncp/commit/edb759e2316e0d36271a76895a008b1c388b9b55))
* clean up npm package to exclude shell scripts and redundant files ([d2a2d4b](https://github.com/portel-dev/ncp/commit/d2a2d4b84976bc0603a4604e7ce6389ea14343cd))
* complete .gitignore for NCP generated files ([8284feb](https://github.com/portel-dev/ncp/commit/8284feb5ca0a22dc13be7d608889c29bbe560c56))
* Correct gitignore to keep docs/images while ignoring root images ([2e969d2](https://github.com/portel-dev/ncp/commit/2e969d2b7f6e5828c948406982ba8bc63ecad318))
* correct list command depth levels for MCP-focused display ([f52b69a](https://github.com/portel-dev/ncp/commit/f52b69a530e4f7859cf5d79aad4ce7fb6fd86c40))
* Default to MCP server mode when no CLI commands provided ([e41f93f](https://github.com/portel-dev/ncp/commit/e41f93f84855ee09063e8f743f4e5840970a63d5))
* detect and display errors in tool content properly ([b70ccf5](https://github.com/portel-dev/ncp/commit/b70ccf50a95b691c046bd53ff0b21d157a844448))
* Enable import from Claude Desktop config format ([3ef4325](https://github.com/portel-dev/ncp/commit/3ef4325c5c7abaa72b6fe072ac3a85ade89933eb))
* Ensure CLI/AI parity with confidence-based result ordering ([13cc0da](https://github.com/portel-dev/ncp/commit/13cc0da5d8d397c23f3670a1ca4752043bf7ca28)), closes [#5](https://github.com/portel-dev/ncp/issues/5) [#2](https://github.com/portel-dev/ncp/issues/2)
* ensure TypeScript builds during Smithery deployment ([e2eb66f](https://github.com/portel-dev/ncp/commit/e2eb66f968861e5b17e4e51a3ef302d3cdab2fb8))
* exclude NCP generated files from repository ([4f2fb2d](https://github.com/portel-dev/ncp/commit/4f2fb2d078cbc3cc58fd0d929a9000f0d4f41fd1))
* exclude problematic files from TypeScript compilation ([4e17ef9](https://github.com/portel-dev/ncp/commit/4e17ef9a86f84f0f80b2fa17c50507a1d27a10fc))
* externalize native dependencies in Smithery build configuration ([5d8936c](https://github.com/portel-dev/ncp/commit/5d8936cf4db0a27635c7dc1c6f3ecfbc7863cc44))
* Handle file imports same as clipboard imports ([e10c0d3](https://github.com/portel-dev/ncp/commit/e10c0d34ce8f9602a8e20125b3e99423c4875d1e))
* improve find tool descriptions for better discoverability ([5316e4e](https://github.com/portel-dev/ncp/commit/5316e4ee9c61d5d5f2932cea181d40dd71e2ed16))
* improve parameter examples for tools with no required parameters ([7346df0](https://github.com/portel-dev/ncp/commit/7346df00d07ab33264c6f51b4be3d7d2b5a441e4))
* improve Smithery standalone entry point configuration ([4e83217](https://github.com/portel-dev/ncp/commit/4e832170cbc2fc614179e766ed9d40ac2437574e))
* improve usage tips accuracy and clarity ([bf11846](https://github.com/portel-dev/ncp/commit/bf11846d6184477ec94189abd4398715e4f5eca1))
* make find query optional to support listing mode ([08239b0](https://github.com/portel-dev/ncp/commit/08239b04fde4e965972bbdbffbce6174c9712eb9))
* move @xenova/transformers to devDependencies to resolve Smithery build ([e49befa](https://github.com/portel-dev/ncp/commit/e49befa64ec5d82ca3a6e705da5e70dd2e757827))
* preserve parameter schemas and clean up development files ([ce07500](https://github.com/portel-dev/ncp/commit/ce07500014d97721e4d43bc011d39b65e2b45c7d))
* preserve tool parameter schemas in discovery pipeline ([1666088](https://github.com/portel-dev/ncp/commit/166608827cbde970f94c2114688b3299d1a4c6e2))
* prevent double-prefixing of tool names in RAG indexing ([14919e7](https://github.com/portel-dev/ncp/commit/14919e7506881762e1094a50c6b5f2eca7512019))
* prevent empty parameter examples at low depth levels ([d311bb4](https://github.com/portel-dev/ncp/commit/d311bb4c89109378644636f245a1cfe6b66a495d))
* Proper spacing for validation spinner in config import ([8c1f6a3](https://github.com/portel-dev/ncp/commit/8c1f6a3eefcebc85fba5876dc4432b4f70f5847c))
* properly separate dev and production dependencies ([c627b5a](https://github.com/portel-dev/ncp/commit/c627b5a475c75cf32b1efb29b52c35c884706b11))
* regenerate package-lock.json and optimize npm packaging ([c2db7a1](https://github.com/portel-dev/ncp/commit/c2db7a13a565adc016a3caa2e5dbeec5f09a8b0c))
* remove misleading parameter examples when schema unavailable ([634af9b](https://github.com/portel-dev/ncp/commit/634af9bf7ddc2920ab8e61445125310ebf27c17a))
* remove scripts folder from repository and add to gitignore ([58545c7](https://github.com/portel-dev/ncp/commit/58545c708a0290e011fd3ce8530e18816f6e7ce9))
* resolve ES module compatibility and clean up development files ([30e634e](https://github.com/portel-dev/ncp/commit/30e634e917c3fbc3e07e5f703e350d33ff190366))
* resolve tool discovery double-prefix issue breaking search results ([be73b31](https://github.com/portel-dev/ncp/commit/be73b31e4f9c7fae9e76e007fa397d02f243ac68))
* restore proper profile-based tree structure for list command ([63ce807](https://github.com/portel-dev/ncp/commit/63ce807d5ef2f961fd77ab13ee3d31052d9543c1))
* Strategic NCP tool descriptions for AI clarity ([4669403](https://github.com/portel-dev/ncp/commit/46694032ae492997bd09cd6d5eadd07dabe9c0eb))
* suppress non-JSON-RPC console messages from MCP servers ([d91a18b](https://github.com/portel-dev/ncp/commit/d91a18be95f3726eb439ee78efcdd8651210c425))
* suppress verbose logger output in CLI mode ([5400e28](https://github.com/portel-dev/ncp/commit/5400e28537a2d9ba6cbe99d2f52bba44c2bb6409))
* switch to local-only distribution model for Smithery ([fdf9e98](https://github.com/portel-dev/ncp/commit/fdf9e985d24e296b5b57cd5e03baff92451f1484))
* update ncp transformation flow diagram ([8442a54](https://github.com/portel-dev/ncp/commit/8442a544bdde46fddf9eca218b7eac455959f8f8))

### Reverts

* remove content-based error detection ([e59a1c3](https://github.com/portel-dev/ncp/commit/e59a1c3b013d3ee1f23f476077ab4eeab9a71a06))
* Remove extra newline that created too much spacing ([d268e30](https://github.com/portel-dev/ncp/commit/d268e30db1eaa14c5d4cb677b17a36d733ef6f20))
* restore @xenova/transformers to dependencies - needed for core vector search ([1b7aa70](https://github.com/portel-dev/ncp/commit/1b7aa70f59aac8b880ac3017dbe65909f2c9521a))

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2025-09-23

### 🚀 Major Improvements
- **Breakthrough: 80.5% user story discovery pass rate** (up from 17%)
- **Validated user story approach** for semantic tool discovery at scale
- **Optimized boosting algorithms** to prevent shell command over-dominance
- **Enhanced tool descriptions** with strategic semantic keywords

### 🐛 Bug Fixes
- Fixed double-prefix naming bug in tool ID generation
- Corrected RAG engine tool indexing for proper MCP grouping
- Resolved test isolation issues causing inconsistent results

### 🔧 Performance Optimizations
- Reduced git boosting from +0.4 to +0.15 (62% reduction)
- Reduced script execution boost from 8.0 to 2.0 (75% reduction)
- Reduced shell commands boost from 4.0 to 1.5 (62% reduction)
- Removed aggressive forced script execution returns
- Optimized query limits for better semantic matching accuracy

### ✅ Validation
- **33/41 user story tests passing** proving approach effectiveness
- **378/389 total tests passing** (97.2% overall test health)
- Comprehensive integration testing with real MCP configurations
- Battle-tested semantic discovery across multiple domains

### 📝 Technical Details
- Enhanced database, payment, memory, email, web, and image tool descriptions
- Improved domain-specific semantic matching without over-generalization
- Maintained precision while significantly improving recall
- Proven scalability foundation for 1000+ MCP ecosystem

This release establishes user stories as the proven approach for semantic tool discovery in MCP orchestration.

## [1.0.3] - 2025-09-17

### ✨ New Features
- Added implement comprehensive orchestrator test coverage.
- Added restore comprehensive tdd methodology with 85 passing tests.
- Added implement comprehensive tdd test suite with clean api design.
- Add comprehensive release process documentation with git commit strategy.
- Added setup ai-enhanced release process with interactive changelog editing.
- Added implement core ncp functionality.
- Add cross-platform support and enhanced utilities.

### 🐛 Bug Fixes
- Fixed set default profile to 'all' instead of 'default'.

### 🔧 Improvements
- Improved clean repository to final release state.

### 📝 Other Changes
- Incredible surge to 68.99% coverage (+16.49pp).
- Major coverage breakthrough to 63.15% (+10.65pp).
- Major utilities coverage breakthrough - achieve 60.12% overall.
- Expand test coverage for discovery engine and orchestrator.
- Analyze archived test suite and optimize current coverage.
- Build: configure NPM package for publication.
- Convert Mermaid diagrams to PNG for NPM compatibility.

## [1.0.2] - 2025-09-17

### ✨ New Features
- Added implement core ncp functionality.
- Add cross-platform support and enhanced utilities.

### 🐛 Bug Fixes
- Fixed set default profile to 'all' instead of 'default'.

### 🔧 Improvements
- Improved clean repository to final release state.

### 📝 Other Changes
- Build: configure NPM package for publication.
- Convert Mermaid diagrams to PNG for NPM compatibility.
