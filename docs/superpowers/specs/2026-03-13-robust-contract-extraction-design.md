# Robust Contract Extraction

Replace fragile anchor-based Zod parsing with a hybrid string census + d.ts parsing approach that survives bundle restructuring.

## Problem

The extractor (`scripts/extract-contracts.ts`) uses hardcoded AST patterns and `.describe()` string anchors to find contract values in Claude Code's minified `cli.js`. When Claude Code updates their bundle structure, these patterns silently break — returning empty arrays. The `mergeWithPrevious` safety net prevents data loss but accumulates stale values and hides degradation.

Affected: `pluginJsonFields`, `agentFrontmatter`, `agentModels`, `commandFrontmatter`, `mcpServerFields`, `hookTypes`, `promptEvents`, `settingsFields`, `skillFrontmatter`.

## Design

### Layer 1: String Census (primary extraction)

Extend the existing `collectStringSets()` approach to also collect object-key sets from the AST.

**Current**: collects string arrays/Sets, classifies by anchor overlap for tools, hook events, and colors.

**New**: also walk the AST for `ObjectExpression` nodes and collect top-level property key names as sets. This captures Zod `I.object({ name: ..., version: ... })` patterns by their keys, regardless of code structure.

**Classification**: for each contract category, score every collected set by overlap with previously known values. The set with the highest overlap wins.

Rules:
- Minimum overlap threshold: 3 known values OR 50% of known values (whichever is smaller)
- If multiple sets tie, prefer the one closest in size to the previous known set
- New keys in the winning set are included as new contract values

**What this survives**:
- `.describe()` text changes
- Bundler restructuring
- Schema library changes (Zod to anything else)
- Code reordering

**Risk**: two unrelated schemas sharing many key names. Mitigated by size constraints (settings schemas are large, plugin schemas are small) and the overlap threshold.

### Layer 2: d.ts Parsing (cross-validation for tools)

Parse `sdk-tools.d.ts` from the npm package:

```
/export interface (\w+)Input\b/  →  tool names
```

Apply static name mapping for known mismatches:

| d.ts name | Contract name |
|-----------|---------------|
| FileRead | Read |
| FileEdit | Edit |
| FileWrite | Write |

Usage:
- Tools in census but not d.ts: expected (internal tools like `LSP`, `Skill`, `SendMessage`)
- Tools in d.ts but not census: warning — possibly new tool the census missed, add to contracts
- d.ts parsing fails entirely: log warning, fall back to census-only

### Layer 3: CI Contract Gate

After extraction, compare new values vs previous for each of the 13 contract categories:

| Drop | Action |
|------|--------|
| >30% | Fail build, list lost values |
| 1-30% | Warn, proceed |
| 0% or growth | Pass silently |

Override: `FORCE_CONTRACTS=1` env var skips the gate for manual runs when extraction legitimately changed.

`mergeWithPrevious` stays as a soft merge (union values) but the gate makes degradation visible and blocks releases.

## Changes to Existing Code

### `scripts/extract-contracts.ts`

**Keep**:
- `fetchCliSource()` — download and unpack
- `collectStringSets()` — string array/Set collection
- `classifyStringSets()` — tool/event/color classification
- `mergeWithPrevious()` — soft merge safety net
- `computeDrift()` — drift reporting
- Changelog generation

**Replace**:
- `extractZodObjectKeys()` and `extractTopLevelKeys()` — replaced by object-key census
- All individual `extract*` functions that use backward anchor search:
  - `extractPluginJsonFields` → census classification
  - `extractAgentFrontmatterFields` → census classification
  - `extractAgentModelEnum` → census classification (small enum set)
  - `extractCommandFrontmatterFields` → census classification
  - `extractMcpServerFields` → census classification
  - `extractHookTypes` → census classification (small enum set)
  - `extractPromptEvents` → census classification
  - `extractSettingsFields` → census classification
  - `extractSkillFrontmatter` → census classification

**Add**:
- `collectObjectKeySets(ast)` — walk AST, collect object expression key sets
- `classifyByOverlap(sets, knownValues, options)` — score and pick best match
- `parseToolsDts(dtsContent)` — extract tool names from sdk-tools.d.ts
- `validateContracts(newContracts, previousContracts)` — CI gate logic

### CI Workflows

**`.github/workflows/release.yml`**: add contract validation step between extraction and build. Respect `FORCE_CONTRACTS` env var on `workflow_dispatch`.

**`.woodpecker/release.yml`**: same gate logic in the build step.

## Testing

- Unit tests for `collectObjectKeySets()` with synthetic AST fragments
- Unit tests for `classifyByOverlap()` with known-value sets and decoy sets
- Unit tests for `parseToolsDts()` with real sdk-tools.d.ts content
- Unit tests for `validateContracts()` threshold logic
- Integration test: run full extraction against current Claude Code version, verify all 13 categories produce non-empty results matching current contracts

## Out of Scope

- Changing the contracts JSON format or the generate-contracts codegen
- Changing how linters consume contracts
- Requesting upstream contract file from Anthropic (aspirational, not actionable)
