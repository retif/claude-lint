# CLAUDE.md

## Project Overview

`claude-lint` is a standalone TypeScript CLI that lints and auto-fixes Claude Code plugin artifacts and configuration files. It validates 8 artifact types with scope-aware rules, configurable severity, and human/JSON output.

## Build & Test

```bash
npm run build    # tsc → dist/
npm test         # vitest run (93 tests)
npm run dev      # tsc --watch
```

## Usage

```bash
claude-lint [paths...]              # lint current dir or specified paths
claude-lint --scope user ~/.claude  # filter by scope
claude-lint -f .                    # auto-fix fixable issues
claude-lint --output json .         # JSON output
claude-lint --quiet .               # errors only
```

## Architecture

```
src/
  index.ts          CLI entry (commander)
  types.ts          Core types: LintDiagnostic, Severity, ArtifactType, Linter, Fixer, ConfigScope
  config.ts         Load .claude-lint.yaml, merge with CLI flags
  discovery.ts      Find artifacts by convention, detect scope (user/project/subdirectory)
  linters/          One file per artifact type, each exports a Linter
  fixers/           Auto-fix implementations (plugin-json key sorting, frontmatter normalization)
  formatters/       Output formatting (human with chalk, JSON)
  utils/            Shared helpers (YAML frontmatter parser, kebab-case validation)
tests/
  linters/          Test files matching src/linters/ 1:1
  fixtures/         valid-plugin/ (complete valid plugin) + invalid/ (per-artifact bad files)
```

## Linter Pattern

Every linter implements the `Linter` interface from `types.ts`:

```typescript
interface Linter {
  artifactType: ArtifactType;
  lint(filePath: string, content: string, config: LinterConfig, scope?: ConfigScope): LintDiagnostic[];
}
```

Rules are named `<artifact>/<rule>` (e.g., `plugin-json/name-kebab-case`). Use `isRuleEnabled()` and `getRuleSeverity()` from `types.ts` to respect config.

## Artifact Types & Scopes

| Artifact | Files | Scopes |
|----------|-------|--------|
| `plugin-json` | `.claude-plugin/plugin.json` | — |
| `skill-md` | `skills/*/SKILL.md` | — |
| `agent-md` | `agents/*.md`, `.claude/agents/*.md` | — |
| `command-md` | `commands/*.md` | — |
| `hooks-json` | `hooks/hooks.json` | — |
| `settings-json` | `settings.json`, `settings.local.json` | user, project |
| `mcp-json` | `.mcp.json`, `mcp.json` | user, project |
| `claude-md` | `CLAUDE.md` | user, project |

Scope detection (`discovery.ts`): files in `~/.claude/` or `~/` → user, files in project `.claude/` → project.

## Configuration

`.claude-lint.yaml` at project root:

```yaml
rules:
  plugin-json/name-kebab-case: false          # disable rule
  claude-md/file-length: { severity: error }  # override severity
```

## Conventions

- ESM (`"type": "module"`) — all imports use `.js` extensions
- Strict TypeScript, target ES2022, module Node16
- Tests use vitest with fixture files (not inline snapshots)
- Exit code: 0 = clean, 1 = errors found
