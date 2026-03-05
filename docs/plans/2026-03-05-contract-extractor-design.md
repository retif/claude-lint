# Contract Extractor Design

## Purpose

An npm script (`npm run extract-contracts`) that downloads the latest `@anthropic-ai/claude-code` npm package, parses its bundled `cli.js` using an AST parser, extracts all contract-relevant values, and writes them to `contracts/claude-code-contracts.json`. A developer reviews the diff against current linter constants to decide what to update.

## Architecture

Single script: `scripts/extract-contracts.ts` (run with `tsx`)

### Flow

1. `npm pack @anthropic-ai/claude-code` to a temp dir
2. Extract tarball, read `package/cli.js`
3. Parse with `acorn` (lightweight ESM parser)
4. Walk AST looking for:
   - `new Set([...])` patterns containing string literals
   - String literals matching known patterns (tool names, event names)
   - Object property patterns in plugin loading code
5. Cluster extracted values by category using heuristics
6. Write structured JSON to `contracts/claude-code-contracts.json`

### Output format

```json
{
  "version": "2.1.69",
  "extractedAt": "2026-03-05T...",
  "contracts": {
    "tools": ["Read", "Write", ...],
    "hookEvents": ["PreToolUse", "PostToolUse", ...],
    "promptEvents": ["Stop", "SubagentStop", ...],
    "agentModels": ["inherit", "sonnet", ...],
    "agentColors": ["blue", "cyan", ...],
    "pluginJsonFields": ["name", "version", ...],
    "skillFrontmatter": ["name", "description", ...],
    "mcpServerFields": ["type", "url", ...],
    "settingsUserFields": ["env", "permissions", ...],
    "settingsProjectFields": ["permissions", ...]
  }
}
```

### Dependencies

- `acorn` (dev only, ~150KB, zero transitive deps)
- `tsx` (dev only, for running TypeScript scripts)

### What it does NOT do

- Does not modify linter source code automatically
- Does not run at build/lint time — strictly a developer maintenance tool
- Does not guarantee completeness (minified code may obscure some patterns)

## Decisions

- **Scope:** All artifact types with hardcoded known-field sets
- **Strategy:** AST-based extraction via acorn
- **Output:** JSON contract file
- **Integration:** Maintenance tool only (developer reviews and updates linter constants manually)
