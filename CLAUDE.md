# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

frontend-guardian is a frontend governance tool that aggregates i18n governance, component standards, hooks best practices, and multi-platform adaptation checks. It operates as both an AI Skill (slash command `/frontend-guardian`) and an npm CLI package (`frontend-guardian-core`).

The repository has two distinct layers:

- **`lib/`** — TypeScript core engine (npm package). This is where all development happens.
- **`scripts/`** — Bash scanner scripts that complement the AST engine. `full-scan.sh` is the unified entry point that merges AST + Bash + Knip results into a single `UnifiedOutput` JSON.
- **`rules/`** — Markdown rule documents per tech stack (React, Vue, UniApp, etc.)

## Common Commands

All development commands run from `lib/`:

```bash
cd lib/

# Build (TypeScript → dist/)
npm run build

# Run all tests (vitest)
npm test

# Run a single test file
npx vitest run tests/i18n-scanner.test.ts

# Watch mode for tests
npm run test:watch

# Type-check only (no emit)
npm run typecheck

# Lint
npm run lint

# Format with Biome
npm run format

# Full check (format + lint + organize imports)
npm run check
```

Running the CLI locally (must `npm run build` first since bins import from `../dist/index.js`):

```bash
# AST engine
node bin/fg-core.js ./my-project --module all --json

# LSP server (IDE integration)
node bin/fg-lsp.js --stdio

# Dashboard server (governance dashboard)
node bin/fg-server.js --port 3456

# Unified entry (AST + Bash + Knip merged)
bash scripts/full-scan.sh --scan --json
```

## Architecture

### Core Engine (`lib/src/engine/`)

- **`rule-engine.ts`** — `RuleEngine` is the central orchestrator. It initializes a `RuleRegistry`, loads project config, detects project metadata, and runs scans. Key method: `scan(files?) → ScanResult[]`.
- **`cache.ts`** — `SmartCache` provides file-level AST caching with TTL and LRU eviction.

### Rule System

- **`types.ts`** — Core types: `Rule`, `Issue`, `Fix`, `ScanResult`, `Severity` (`critical` | `warning` | `suggestion`).
- **`scanners/*.ts`** — Each module (i18n, component, hooks, platform, etc.) exports a `Rule[]` array. A `Rule` has `id`, `name`, `severity`, `category`, and `execute(context) → Issue[]`.
- **`rules/registry.ts`** — `RuleRegistry` manages built-in rules, custom rules (loaded from JS files), and config overrides (enable/disable/adjust severity). Call `registry.getEffectiveRules(category?)` to get the final rule set after applying overrides.

### Project Detection & Config

- **`utils/project-detector.ts`** — Auto-detects framework (React, Vue, UniApp, etc.), platform (PC, H5, WeChat MP, HarmonyOS), and component library (Ant Design, Element Plus, etc.) by inspecting `package.json` and file structure.
- **`utils/config-loader.ts`** — Loads `.frontend-guardian.yml` from the project root. Supports `extends: npm:package-name` for plugin configs.

### Output & Formatting

- **`formatters/sarif.ts`** — SARIF output for GitHub Security tab integration.
- **`formatters/github-annotation.ts`** — GitHub Actions check-run annotations.
- **`formatters/pr-comment.ts`** — PR/MR comment generation with deduplication markers.

### IDE Integration (`lib/src/ide/`)

- **`lsp-server.ts`** — LSP server implementation (launched via `fg-lsp --stdio`). Uses `vscode-languageserver`.
- **`incremental-diagnostic.ts`** — Single-file diagnostic engine for IDE real-time feedback. Targets <100ms per file.

### Governance Dashboard Server (`lib/src/server/`)

- **`dashboard-server.ts`** — Zero-dependency HTTP server (`node:http` only) that collects multi-project scan results. REST API endpoints: `POST /api/reports`, `GET /api/projects`, `GET /api/projects/:id/trends`, `GET /api/projects/:id/latest`. Data stored in `~/.frontend-guardian-server/` as JSON files (`projects.json` index + `reports/{projectId}/{timestamp}.json`).
- **`dashboard-html.ts`** — Generates the web dashboard SPA (pure JS + Canvas charts, AJAX loading from API endpoints, 30s auto-refresh).
- **`dashboard-client.ts`** — CLI client that uploads scan results to the dashboard server. Auto-detects `FG_DASHBOARD_SERVER` and `FG_DASHBOARD_TOKEN` env vars.

### Unified Output (v3.4.0)

`full-scan.sh` parses Bash scanner text output into structured JSON and merges it with AST engine JSON and Knip JSON into a single `UnifiedOutput`:

```json
{
  "summary": { "timestamp", "project", "stack", "totalFiles", "issuesBySeverity", "duration" },
  "modules": { "i18n": { "engine": "ast", "total", "issues": { "critical": [...] } } },
  "external": { "knip": { "unusedDeps", "unusedExports" } }
}
```

## TypeScript Configuration

- `lib/tsconfig.json` — `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`.
- Path mapping: `@/*` → `src/*`, `@engine/*` → `src/engine/*`, `@scanners/*` → `src/scanners/*`, `@fixers/*` → `src/fixers/*`, `@reporters/*` → `src/reporters/*`, `@utils/*` → `src/utils/*`.
- `noUnusedLocals: true` — unused variables cause build failure.
- `declaration: true` — builds `.d.ts` files into `dist/`.

## Important Notes

- **Three version strings to keep in sync**: `lib/package.json`, `lib/bin/fg-core.js` (help text), `lib/bin/fg-server.js` (help text), and `lib/bin/fg-lsp.js` (help text).
- **Tests live in `lib/tests/`** and use vitest with `globals: true`.
- **Bash scanners output text** in the format `  [emoji] [file:line] message`. `full-scan.sh` parses this with regex `/^\s+([❌🔴⚠️🟡💡])\s+\[(.+?):(\d+)\]\s+(.+)$/`. Emoji maps to severity: ❌/🔴 → `critical`, ⚠️/🟡 → `warning`, 💡 → `suggestion`.
- **`--scan` is an alias for `--module all`** in `fg-core.js`.
- The npm package `prepublishOnly` runs `npm run build && npm test`.
- **`bin/*.js` imports from `../dist/index.js`**, not `src/`. You must `npm run build` before CLI changes take effect. Tests import from `src/` directly via path aliases, so test-driven development does not require rebuilding.
- **Dashboard server data dir**: default `~/.frontend-guardian-server/`, configurable via `--data-dir`.

## Adding a New Scanner Module

To add a new scanning module (e.g., a new governance dimension):

1. Create `lib/src/scanners/<name>-scanner.ts` exporting a `Rule[]` array.
2. Register in `lib/bin/fg-core.js`: add to `MODULES` array and `MODULE_RULES` object.
3. If there is a corresponding Bash scanner, add it to `scripts/full-scan.sh` in the `BASH_SCANNERS` array.
4. Add tests in `lib/tests/<name>-scanner.test.ts`.
5. Export the rules from `lib/src/index.ts` if they should be part of the public API.

## Skill Structure

This repository is also an AI Skill. The Skill contract is defined in:

- **`SKILL.md`** — Slash command routing, trigger conditions, and output format. This is the primary interface document for AI agents. Keep it in sync with actual CLI parameters.
- **`README.md`** — Human-facing documentation with install instructions and version changelog.

When adding CLI parameters, update **both** `SKILL.md` and `README.md`.

## Version Release Checklist

When preparing a new minor release (e.g., v3.5.0):

1. Bump version in `lib/package.json`.
2. Update version in `lib/bin/fg-core.js`, `lib/bin/fg-lsp.js`, and `lib/bin/fg-server.js` help text.
3. Ensure all tests pass (`npm test`).
4. Update `README.md` version evolution section.
5. Update `ROADMAP-v3.md` to tick completed tasks.
6. Create a memory file in `~/.claude/projects/.../memory/` and update `MEMORY.md` index.
