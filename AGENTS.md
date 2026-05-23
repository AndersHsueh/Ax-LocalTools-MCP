# AGENTS.md - AX Local Operations MCP Server

## Commands

```bash
npm start                        # Start MCP server
node test/runTests.js            # Full test suite (generates reports in test/reports/)
node test/integrationTest.js     # Integration tests (registry, platform, commandPolicy)
npm run release                  # semantic-release — requires Conventional Commits
```

> `node test/runTests.js --single` does **not** work — the flag is unimplemented. The full suite always runs.  
> There is no `npm test` script.

## Architecture

- **`index.js`** — CommonJS entry. Uses `await import(...)` (dynamic ESM) to load `@modelcontextprotocol/sdk`, which is ESM-only. Never `require()` the SDK. The async IIFE is intentional; do not refactor to top-level require.
- **`tools/registry.js`** — Single place for all tool instantiation and MCP descriptor definitions. One shared `SecurityValidator` singleton passed to every tool. `sudo_config` is instantiated and registered **only on Linux** (`platformUtils.isLinux`).
- **`workspace_manager`** is dual-use: registered as an MCP tool *and* used directly by `index.js` as a service. Its instance lives at `instances.workspace_manager`.

### `index.js` request interceptor (non-obvious)
Before every tool call, `index.js` scans **all string values** in args for a workspace command. If found, it short-circuits and returns without calling the tool. Also, if `working_directory` / `working_dir` is absent from args, `index.js` injects the current workspace automatically. Tools should expect `working_directory` to always be present.

## Adding a New Tool

1. Create `tools/newTool.js` — class with `constructor(securityValidator)` and `async handle(args)`.
2. In `tools/registry.js`: import, instantiate into `instances`, build descriptor with `createDescriptor(...)`, push to `descriptors`.
3. `module.exports = NewTool` from the tool file.

## Security

- Path operations: always use `securityValidator.resolveAndAssert(filePath, workingDirectory)` — throws `ERR.PATH_DENIED` if path escapes the working dir, or if any **directory component** of the path starts with `.` (hidden dirs are denied; dotfiles like `.env` are fine). No forced home-dir restriction — any absolute path is allowed.
- Command execution: use `commandPolicy.evaluate(command)` (not `isDangerousCommand()` which is a legacy shim). Only catastrophic/unrecoverable commands are denied; WARN tier is empty — no `confirm: true` friction for Agent use.
- Use `spawn` with array args — never shell string concatenation.
- Windows shell: `commandExecution` uses `pwsh` (PowerShell 7+) with `-NonInteractive -NoProfile`, falling back to `powershell` if `pwsh` is unavailable. Shell is detected once and cached in `_winShellCache`.

## Code Conventions

- **All user-facing messages in Chinese** — errors, logs, tool descriptions. Do not change to English.
- Use `buildOutput(format, textMsg, jsonObj)` from `lib/output.js` for tool return values. `responses.js` (`text()`/`json()`/`both()`) is a valid alternative but less consistent.
- Parameter aliases are expected: accept `path`, `file_path`, `dir_path` interchangeably — resolve with `const target = path || file_path || dir_path`.
- All tool input schemas have `additionalProperties: true` — unknown args are silently accepted.
- `lib/platformUtils.js` exports a singleton; do not instantiate `PlatformUtils` again.
- `environment_memory` tool is backed by `EnvironmentMemoryAdapter`, not `EnvironmentMemory` directly. Both files matter when changing behavior.

## Error Handling

```javascript
const { ERR } = require('../errors');
throw ERR.PATH_DENIED(filePath);   // E_PATH_DENIED
throw ERR.NOT_FOUND(path);         // E_NOT_FOUND
throw ERR.INVALID_ARGS('错误信息'); // E_INVALID_ARGS
throw ERR.DANGEROUS_CMD(command);  // E_DANGEROUS_CMD
throw ERR.LIMIT_REACHED('超过限制'); // E_LIMIT_REACHED

// In catch:
if (error.code === 'ENOENT') throw ERR.NOT_FOUND(path);
if (error.code === 'E_PATH_DENIED') throw error; // re-throw, don't wrap
```

## Gotchas

- **`file_archive`** requires `zip`/`unzip`/`tar`/`gzip` binaries in PATH on Windows (Git Bash, WSL, or manual install). No native fallback.
- **`postinstall`** (`bin/setup-workspace.js`) runs on every `npm install` and prompts interactively. In CI/non-interactive environments this may hang.
- **Release**: CI uses `semantic-release` on push to `main`/`develop`/`alpha`/`beta`. Commit messages must follow Conventional Commits. Add `skip ci` to commit message to skip release.
- **No build step**: pure CommonJS, no transpile, no bundling. `npm start` runs directly.
- Test reports are written to `test/reports/` with platform in filename (`win32`, `linux`, `darwin`). Not committed.
- **`taskManager`** stores data at `~/.local_file_operations/tasks/` — survives `npm update`. Old data in `temps/` is not migrated automatically.
- **`environmentMemory`** defaults are generated dynamically at first-run from `os.platform()` / `os.cpus()` / `os.totalmem()`. No macOS-specific hardcoding.
- **`fileWatch`** with `duration=0` runs indefinitely (no auto-stop timeout). The watcher must be stopped externally or the process killed.
- **`fileSearch`** regex flag: `g` is intentionally omitted — stateful `lastIndex` caused alternating false-negatives on repeated `.test()` calls.

## File Map

```
index.js                  # Server entry (CommonJS + dynamic ESM import)
errors.js                 # ERR.* factory
responses.js              # text()/json()/both() (thin wrapper)
tools/
  registry.js             # All instantiation + MCP descriptors (authoritative)
  securityValidator.js    # Path security + legacy command shim
  tools_dev_guide.md      # Authoritative tool dev spec (read before adding tools)
  *.js                    # One file per tool
lib/
  output.js               # buildOutput() — primary output helper
  commandPolicy.js        # evaluate() — per-platform deny/warn/allow tiers
  pathUtils.js            # resolveUserPath(), assertInHome()
  platformUtils.js        # Singleton: isWindows/isLinux/isMacOS
bin/
  setup-workspace.js      # Post-install interactive workspace setup
test/
  runTests.js             # Suite runner + report generator
  integrationTest.js      # Registry/platform integration checks
  crossPlatformTestSuite.js # CrossPlatformTestSuite class
  reports/                # Generated output, not committed
```
