# Robust Contract Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile anchor-based Zod schema extraction with a hybrid string census + d.ts parsing approach that survives Claude Code bundle restructuring.

**Architecture:** Add `collectObjectKeySets()` to walk the AST and collect object property key sets. Add `classifyByOverlap()` to score these sets against known contract values using a Jaccard-like formula. Parse `sdk-tools.d.ts` for tool cross-validation. Add a CI contract gate that fails the build when extraction degrades >30%.

**Tech Stack:** TypeScript, acorn AST parser, acorn-walk, vitest

**Spec:** `docs/superpowers/specs/2026-03-13-robust-contract-extraction-design.md`

---

## Chunk 1: Object-Key Census and Classification

### Task 1: Add `collectObjectKeySets()` function

**Files:**
- Modify: `scripts/extract-contracts.ts` (add after `collectStringSets` at ~line 103)
- Test: `tests/scripts/extract-contracts.test.ts`

- [ ] **Step 1: Write failing tests for `collectObjectKeySets`**

Add to `tests/scripts/extract-contracts.test.ts`:

```typescript
import { collectObjectKeySets } from "../../scripts/extract-contracts.js";
import * as acorn from "acorn";

function parseExpr(code: string) {
	return acorn.parse(code, { sourceType: "module", ecmaVersion: "latest" }) as acorn.Program;
}

describe("collectObjectKeySets", () => {
	it("collects keys from object expressions with 3+ keys", () => {
		const ast = parseExpr("const x = { name: 1, version: 2, description: 3 }");
		const sets = collectObjectKeySets(ast);
		expect(sets.length).toBeGreaterThanOrEqual(1);
		expect(sets.some(s =>
			s.keys.includes("name") && s.keys.includes("version") && s.keys.includes("description")
		)).toBe(true);
	});

	it("skips objects with fewer than 3 keys", () => {
		const ast = parseExpr("const x = { a: 1, b: 2 }");
		const sets = collectObjectKeySets(ast);
		expect(sets.every(s => s.keys.length >= 3)).toBe(true);
	});

	it("skips objects with more than 150 keys", () => {
		const keys = Array.from({ length: 160 }, (_, i) => `k${i}: ${i}`).join(", ");
		const ast = parseExpr(`const x = { ${keys} }`);
		const sets = collectObjectKeySets(ast);
		expect(sets.every(s => s.keys.length <= 150)).toBe(true);
	});

	it("deduplicates identical key sets", () => {
		const ast = parseExpr("const x = { a: 1, b: 2, c: 3 }; const y = { a: 4, b: 5, c: 6 }");
		const sets = collectObjectKeySets(ast);
		const matching = sets.filter(s =>
			s.keys.length === 3 && s.keys.includes("a") && s.keys.includes("b") && s.keys.includes("c")
		);
		expect(matching.length).toBe(1);
	});

	it("handles computed property keys by skipping them", () => {
		const ast = parseExpr("const x = { name: 1, [expr]: 2, version: 3, desc: 4 }");
		const sets = collectObjectKeySets(ast);
		expect(sets.some(s => s.keys.includes("name") && s.keys.includes("version"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: FAIL — `collectObjectKeySets` is not exported

- [ ] **Step 3: Implement `collectObjectKeySets`**

Add to `scripts/extract-contracts.ts` after `collectStringSets` (~line 103). Also export it.

```typescript
type ObjectKeySet = { keys: string[]; pos: number };

export function collectObjectKeySets(ast: acorn.Program): ObjectKeySet[] {
	const results: ObjectKeySet[] = [];
	const seen = new Set<string>();

	walk.simple(ast, {
		ObjectExpression(node: any) {
			const keys: string[] = [];
			for (const prop of node.properties) {
				if (prop.type === "SpreadElement") continue;
				if (prop.computed) continue;
				if (prop.key.type === "Identifier") {
					keys.push(prop.key.name);
				} else if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
					keys.push(prop.key.value);
				}
			}
			if (keys.length < 3 || keys.length > 150) return;

			const signature = [...keys].sort().join(",");
			if (seen.has(signature)) return;
			seen.add(signature);

			results.push({ keys, pos: node.start });
		},
	});

	return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-contracts.ts tests/scripts/extract-contracts.test.ts
git commit -m "feat: add collectObjectKeySets for AST object-key census"
```

---

### Task 2: Add `classifyByOverlap()` function

**Files:**
- Modify: `scripts/extract-contracts.ts` (add after `collectObjectKeySets`)
- Test: `tests/scripts/extract-contracts.test.ts`

- [ ] **Step 1: Write failing tests for `classifyByOverlap`**

Add to `tests/scripts/extract-contracts.test.ts`:

```typescript
import { classifyByOverlap } from "../../scripts/extract-contracts.js";

describe("classifyByOverlap", () => {
	const knownPluginFields = ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"];

	it("picks the set with highest overlap score", () => {
		const sets = [
			{ keys: ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"], pos: 0 },
			{ keys: ["name", "value", "type", "label"], pos: 100 },
			{ keys: ["x", "y", "z", "w"], pos: 200 },
		];
		const result = classifyByOverlap(sets, knownPluginFields);
		expect(result).toEqual(["name", "version", "description", "author", "homepage", "repository", "license", "keywords"]);
	});

	it("returns empty array when no set meets minimum overlap floor of 3", () => {
		const sets = [
			{ keys: ["name", "version", "other1", "other2", "other3"], pos: 0 },
		];
		const result = classifyByOverlap(sets, knownPluginFields);
		// overlap is 2 (name, version) — below floor of 3
		expect(result).toEqual([]);
	});

	it("returns empty array when no set meets minimum score of 0.3", () => {
		const sets = [
			// 3 matches out of 50 keys = 3/50 = 0.06 score
			{ keys: ["name", "version", "description", ...Array.from({ length: 47 }, (_, i) => `other${i}`)], pos: 0 },
		];
		const result = classifyByOverlap(sets, knownPluginFields);
		expect(result).toEqual([]);
	});

	it("includes new keys from winning set", () => {
		const sets = [
			{ keys: ["name", "version", "description", "author", "homepage", "repository", "license", "keywords", "newField"], pos: 0 },
		];
		const result = classifyByOverlap(sets, knownPluginFields);
		expect(result).toContain("newField");
	});

	it("breaks ties by size proximity to known set", () => {
		const sets = [
			{ keys: ["name", "version", "description", "author", "extra1", "extra2", "extra3", "extra4"], pos: 0 },
			{ keys: ["name", "version", "description", "author"], pos: 100 },
		];
		// Both have 4 matches. First: 4/max(8,8)=0.5. Second: 4/max(4,8)=0.5.
		// Tie — prefer closer size to known (8). First is size 8, second is size 4. First wins.
		const result = classifyByOverlap(sets, knownPluginFields);
		expect(result?.length).toBe(8);
	});

	it("returns empty array for empty input", () => {
		expect(classifyByOverlap([], knownPluginFields)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: FAIL — `classifyByOverlap` not exported

- [ ] **Step 3: Implement `classifyByOverlap`**

Add to `scripts/extract-contracts.ts`:

```typescript
export function classifyByOverlap(
	sets: ObjectKeySet[],
	knownValues: string[],
): string[] {
	if (sets.length === 0 || knownValues.length === 0) return [];

	const knownSet = new Set(knownValues);
	const MIN_OVERLAP_FLOOR = 3;
	const MIN_SCORE = 0.3;

	let bestKeys: string[] = [];
	let bestScore = 0;
	let bestSizeDiff = Infinity;

	for (const s of sets) {
		const intersectionCount = s.keys.filter(k => knownSet.has(k)).length;
		if (intersectionCount < MIN_OVERLAP_FLOOR) continue;

		const score = intersectionCount / Math.max(s.keys.length, knownValues.length);
		if (score < MIN_SCORE) continue;

		const sizeDiff = Math.abs(s.keys.length - knownValues.length);

		if (score > bestScore || (score === bestScore && sizeDiff < bestSizeDiff)) {
			bestScore = score;
			bestKeys = s.keys;
			bestSizeDiff = sizeDiff;
		}
	}

	return bestKeys;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-contracts.ts tests/scripts/extract-contracts.test.ts
git commit -m "feat: add classifyByOverlap with Jaccard-like scoring"
```

---

## Chunk 2: d.ts Parsing and Contract Validation

### Task 3: Add `parseToolsDts()` function

**Files:**
- Modify: `scripts/extract-contracts.ts`
- Test: `tests/scripts/extract-contracts.test.ts`

- [ ] **Step 1: Write failing tests for `parseToolsDts`**

Add to `tests/scripts/extract-contracts.test.ts`:

```typescript
import { parseToolsDts } from "../../scripts/extract-contracts.js";

describe("parseToolsDts", () => {
	it("extracts tool names from interface declarations", () => {
		const dts = `
export interface BashInput { command: string; }
export interface BashOutput { stdout: string; }
export interface FileReadInput { path: string; }
export interface GrepInput { pattern: string; }
`;
		const tools = parseToolsDts(dts);
		expect(tools).toContain("Bash");
		expect(tools).toContain("Read");   // FileRead → Read
		expect(tools).toContain("Grep");
	});

	it("applies name mappings for FileRead/FileEdit/FileWrite", () => {
		const dts = `
export interface FileReadInput { path: string; }
export interface FileEditInput { path: string; }
export interface FileWriteInput { path: string; }
`;
		const tools = parseToolsDts(dts);
		expect(tools).toContain("Read");
		expect(tools).toContain("Edit");
		expect(tools).toContain("Write");
		expect(tools).not.toContain("FileRead");
		expect(tools).not.toContain("FileEdit");
		expect(tools).not.toContain("FileWrite");
	});

	it("returns empty array for empty/invalid input", () => {
		expect(parseToolsDts("")).toEqual([]);
		expect(parseToolsDts("no interfaces here")).toEqual([]);
	});

	it("does not include Output-only interfaces", () => {
		const dts = `export interface AgentOutput { result: string; }`;
		const tools = parseToolsDts(dts);
		expect(tools).not.toContain("Agent");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: FAIL — `parseToolsDts` not exported

- [ ] **Step 3: Implement `parseToolsDts`**

Add to `scripts/extract-contracts.ts`:

```typescript
const DTS_NAME_MAP: Record<string, string> = {
	FileRead: "Read",
	FileEdit: "Edit",
	FileWrite: "Write",
};

export function parseToolsDts(content: string): string[] {
	if (!content) return [];

	const tools = new Set<string>();
	const pattern = /export interface (\w+)Input\b/g;
	for (const m of content.matchAll(pattern)) {
		const raw = m[1];
		const mapped = DTS_NAME_MAP[raw] ?? raw;
		tools.add(mapped);
	}
	return [...tools].sort();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-contracts.ts tests/scripts/extract-contracts.test.ts
git commit -m "feat: add parseToolsDts for sdk-tools.d.ts cross-validation"
```

---

### Task 4: Add `validateContracts()` CI gate function

**Files:**
- Modify: `scripts/extract-contracts.ts`
- Test: `tests/scripts/extract-contracts.test.ts`

- [ ] **Step 1: Write failing tests for `validateContracts`**

Add to `tests/scripts/extract-contracts.test.ts`:

```typescript
import { validateContracts } from "../../scripts/extract-contracts.js";

describe("validateContracts", () => {
	const previous = {
		tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "Agent", "AskUserQuestion"],
		hookEvents: ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"],
		pluginJsonFields: ["name", "version", "description", "author"],
	};

	it("passes when no values are lost", () => {
		const raw = { ...previous };
		const result = validateContracts(raw, previous);
		expect(result.failed).toBe(false);
		expect(result.errors).toEqual([]);
	});

	it("passes with warnings when 1-30% values lost", () => {
		const raw = {
			...previous,
			tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch"], // lost 2/10 = 20%
		};
		const result = validateContracts(raw, previous);
		expect(result.failed).toBe(false);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	it("fails when >30% values lost in a category", () => {
		const raw = {
			...previous,
			tools: ["Read", "Write", "Edit"], // lost 7/10 = 70%
		};
		const result = validateContracts(raw, previous);
		expect(result.failed).toBe(true);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toContain("tools");
	});

	it("skips categories not in previous (new categories)", () => {
		const raw = {
			...previous,
			newCategory: ["a", "b", "c"],
		};
		const result = validateContracts(raw, previous);
		expect(result.failed).toBe(false);
	});

	it("skips categories with empty previous (nothing to compare)", () => {
		const prev = { ...previous, hookTypes: [] as string[] };
		const raw = { ...previous, hookTypes: [] as string[] };
		const result = validateContracts(raw, prev);
		expect(result.failed).toBe(false);
	});

	it("passes when extraction grows", () => {
		const raw = {
			...previous,
			tools: [...previous.tools, "NewTool1", "NewTool2"],
		};
		const result = validateContracts(raw, previous);
		expect(result.failed).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: FAIL — `validateContracts` not exported

- [ ] **Step 3: Implement `validateContracts`**

Add to `scripts/extract-contracts.ts`:

```typescript
interface ValidationResult {
	failed: boolean;
	errors: string[];
	warnings: string[];
}

export function validateContracts(
	rawExtracted: Record<string, string[] | undefined>,
	previousContracts: Record<string, string[]>,
): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const [field, prevValues] of Object.entries(previousContracts)) {
		if (!prevValues || prevValues.length === 0) continue;

		const extractedSet = new Set(rawExtracted[field] ?? []);
		const lost = prevValues.filter(v => !extractedSet.has(v));
		const dropRate = lost.length / prevValues.length;

		if (dropRate > 0.3) {
			errors.push(
				`${field}: lost ${lost.length}/${prevValues.length} values (${(dropRate * 100).toFixed(0)}%): ${lost.join(", ")}`,
			);
		} else if (lost.length > 0) {
			warnings.push(
				`${field}: lost ${lost.length}/${prevValues.length} values (${(dropRate * 100).toFixed(0)}%): ${lost.join(", ")}`,
			);
		}
	}

	return { failed: errors.length > 0, errors, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scripts/extract-contracts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-contracts.ts tests/scripts/extract-contracts.test.ts
git commit -m "feat: add validateContracts CI gate for extraction degradation"
```

---

## Chunk 3: Wire Up New Extraction in main() and Update fetchCliSource

### Task 5: Extend `fetchCliSource` to read `sdk-tools.d.ts`

**Files:**
- Modify: `scripts/extract-contracts.ts` (function `fetchCliSource` at ~line 31)

- [ ] **Step 1: Update `fetchCliSource` return type and read d.ts**

Modify `fetchCliSource` in `scripts/extract-contracts.ts`:

```typescript
function fetchCliSource(requestedVersion?: string): {
	source: string;
	version: string;
	sdkToolsDts: string | null;
} {
	const npmPkg = requestedVersion
		? `@anthropic-ai/claude-code@${requestedVersion}`
		: "@anthropic-ai/claude-code";
	const tmp = mkdtempSync(join(tmpdir(), "claude-code-"));
	try {
		execSync(`npm pack ${npmPkg} --pack-destination .`, {
			cwd: tmp,
			stdio: "pipe",
		});
		const tgz = execSync("ls *.tgz", { cwd: tmp, encoding: "utf8" }).trim();
		execSync(`tar xzf "${tgz}"`, { cwd: tmp, stdio: "pipe" });

		const pkg = JSON.parse(
			readFileSync(join(tmp, "package", "package.json"), "utf8"),
		);
		const source = readFileSync(join(tmp, "package", "cli.js"), "utf8");

		let sdkToolsDts: string | null = null;
		try {
			sdkToolsDts = readFileSync(join(tmp, "package", "sdk-tools.d.ts"), "utf8");
		} catch {
			// File may not exist in all versions
		}

		return { source, version: pkg.version, sdkToolsDts };
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}
```

- [ ] **Step 2: Build to check for type errors**

Run: `npm run build`
Expected: Build may fail with type errors where `fetchCliSource` result is destructured — that's expected, will be fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add scripts/extract-contracts.ts
git commit -m "feat: extend fetchCliSource to read sdk-tools.d.ts"
```

---

### Task 6: Rewire `main()` to use census + d.ts + gate

**Files:**
- Modify: `scripts/extract-contracts.ts` (function `main` at ~line 478)

This is the integration step. Replace the individual `extract*` calls with census-based classification, add d.ts cross-validation, and add the contract gate.

- [ ] **Step 1: Rewrite `main()` to use new extraction approach**

Replace the `main()` function in `scripts/extract-contracts.ts`. Key changes:
1. Destructure `sdkToolsDts` from `fetchCliSource`
2. Call `collectObjectKeySets(ast)` after `collectStringSets`
3. Replace individual `extract*` calls with `classifyByOverlap` for each field category
4. Keep `classifySets` for tools/hookEvents/agentColors (those work fine)
5. Keep `extractAllToolNames` for tools (not fragile)
6. Add d.ts cross-validation for tools
7. For small enum sets (`agentModels`, `hookTypes`, `promptEvents`): try census first, fall back to anchor extraction if census returns empty
8. Use `extractSettingsProjectFields` (renamed/simplified) for single-value project settings
9. Run `validateContracts` on raw extracted values BEFORE `mergeWithPrevious`
10. Respect `FORCE_CONTRACTS` env var

```typescript
function main() {
	const versionIdx = process.argv.indexOf("--version");
	const requestedVersion =
		versionIdx !== -1 ? process.argv[versionIdx + 1] : undefined;

	const label = requestedVersion ? `v${requestedVersion}` : "latest";
	console.log(pc.cyan(`▸ Fetching @anthropic-ai/claude-code (${label})...`));
	const { source, version, sdkToolsDts } = fetchCliSource(requestedVersion);
	console.log(
		pc.cyan("▸ Parsing AST"),
		pc.dim(`(v${version}, ${(source.length / 1e6).toFixed(1)}MB)`),
	);

	const ast = acorn.parse(source, {
		sourceType: "module",
		ecmaVersion: "latest",
	}) as acorn.Program;

	const stringSets = collectStringSets(ast);
	const objectKeySets = collectObjectKeySets(ast);
	console.log(
		pc.cyan("▸ Extracting contracts..."),
		pc.dim(`(${stringSets.length} string sets, ${objectKeySets.length} object-key sets)`),
	);

	// --- String-set classification (tools, events, colors — already robust) ---
	const classified = classifySets(stringSets);
	const allTools = extractAllToolNames(source);

	// --- d.ts cross-validation for tools ---
	if (sdkToolsDts) {
		const dtsTools = parseToolsDts(sdkToolsDts);
		const censusTools = new Set(allTools);
		const missingFromCensus = dtsTools.filter(t => !censusTools.has(t));
		if (missingFromCensus.length > 0) {
			console.log(pc.yellow(`  ⚠ Tools in sdk-tools.d.ts but not in bundle: ${missingFromCensus.join(", ")}`));
			// Add them — d.ts is authoritative for SDK tools
			for (const t of missingFromCensus) allTools.push(t);
			allTools.sort();
		}
	} else {
		console.log(pc.yellow("  ⚠ sdk-tools.d.ts not found in package — skipping d.ts cross-validation"));
	}

	// --- Object-key census classification (replaces fragile anchor extractors) ---
	const rootDir = join(import.meta.dirname!, "..");
	const outPath = join(rootDir, "contracts", "claude-code-contracts.json");

	// Load previous contracts for census classification + merge
	let prev: Record<string, string[]> = {};
	try {
		const existing = JSON.parse(readFileSync(outPath, "utf8"));
		prev = existing.contracts ?? {};
	} catch {
		// First run — no previous file
	}

	const pluginFields = classifyByOverlap(objectKeySets, prev["pluginJsonFields"] ?? []);
	const agentFields = classifyByOverlap(objectKeySets, prev["agentFrontmatter"] ?? []);
	const commandFields = classifyByOverlap(objectKeySets, prev["commandFrontmatter"] ?? []);
	const mcpFields = classifyByOverlap(objectKeySets, prev["mcpServerFields"] ?? []);
	const settingsUserFields = classifyByOverlap(objectKeySets, prev["settingsUserFields"] ?? []);
	const skillFields = classifyByOverlap(objectKeySets, prev["skillFrontmatter"] ?? []);

	// Small enum sets: also try census via string-set classification, with anchor fallback
	const agentModelsCensus = classifyByOverlap(objectKeySets, prev["agentModels"] ?? []);
	const agentModelEnum = agentModelsCensus.length > 0 ? agentModelsCensus : extractAgentModelEnum(source);
	const hookTypesCensus = classifyByOverlap(objectKeySets, prev["hookTypes"] ?? []);
	const hookTypes = hookTypesCensus.length > 0 ? hookTypesCensus : extractHookTypes(source);
	const promptEventsCensus = classifyByOverlap(objectKeySets, prev["promptEvents"] ?? []);
	const promptEvents = promptEventsCensus.length > 0 ? promptEventsCensus : extractPromptEvents(source);

	// settingsProjectFields: single-value category, keep anchor fallback
	const settingsProjectFields = extractSettingsProjectFields(source);

	// --- Raw extracted contracts (before merge) ---
	const rawContracts: Record<string, string[] | undefined> = {
		tools:
			allTools.length > mergeArrays(classified.tools).length
				? allTools
				: mergeArrays(classified.tools),
		hookEvents: longestArray(classified.hookEvents).sort(),
		hookTypes: hookTypes.length > 0 ? hookTypes.sort() : undefined,
		promptEvents: promptEvents.length > 0 ? promptEvents.sort() : undefined,
		agentColors: (() => {
			const colors = longestArray(classified.agentColors);
			if (colors.includes("purple") && !colors.includes("magenta"))
				colors.push("magenta");
			if (colors.includes("magenta") && !colors.includes("purple"))
				colors.push("purple");
			return colors.sort();
		})(),
		agentModels: agentModelEnum.length > 0 ? agentModelEnum.sort() : undefined,
		pluginJsonFields: pluginFields.length > 0 ? pluginFields : undefined,
		agentFrontmatter: agentFields.length > 0 ? agentFields : undefined,
		commandFrontmatter: commandFields.length > 0 ? commandFields : undefined,
		mcpServerFields: mcpFields.length > 0 ? mcpFields : undefined,
		skillFrontmatter: skillFields.length > 0 ? skillFields : undefined,
		settingsUserFields: settingsUserFields.length > 0 ? settingsUserFields.sort() : undefined,
		settingsProjectFields: settingsProjectFields.length > 0 ? settingsProjectFields.sort() : undefined,
	};

	// --- CI Contract Gate (pre-merge) ---
	const validation = validateContracts(rawContracts as Record<string, string[] | undefined>, prev);
	if (validation.warnings.length > 0) {
		console.log(pc.yellow("\n  Contract warnings:"));
		for (const w of validation.warnings) console.log(pc.yellow(`    ⚠ ${w}`));
	}
	if (validation.failed) {
		if (process.env.FORCE_CONTRACTS === "1") {
			console.log(pc.yellow("\n  ⚠ FORCE_CONTRACTS=1 — bypassing contract gate"));
			for (const e of validation.errors) console.log(pc.yellow(`    ${e}`));
		} else {
			console.log(pc.red("\n  ✗ Contract gate FAILED — extraction degraded >30%:"));
			for (const e of validation.errors) console.log(pc.red(`    ${e}`));
			console.log(pc.red("\n  Set FORCE_CONTRACTS=1 to override."));
			process.exit(1);
		}
	}

	// --- Merge with previous (soft merge, post-gate) ---
	const mergeWithPrevious = (
		extracted: string[] | undefined,
		field: string,
	): string[] | undefined => {
		const previous = prev[field] ?? [];
		const current = extracted ?? [];
		const merged = new Set([...previous, ...current]);
		return merged.size > 0 ? [...merged].sort() : undefined;
	};

	const contracts: Record<string, string[] | undefined> = {};
	for (const field of FIELDS) {
		contracts[field] = mergeWithPrevious(rawContracts[field] as string[] | undefined, field);
	}

	const output = {
		version,
		extractedAt: new Date().toISOString(),
		contracts,
	};

	// Compute drift BEFORE writing (compares against previous file)
	const { entries } = computeDrift(contracts, outPath);
	printDrift(entries);

	// Write new contracts
	writeFileSync(outPath, JSON.stringify(output, null, "\t") + "\n");

	// Write changelog entry if --changelog flag is passed
	if (process.argv.includes("--changelog")) {
		const md = generateChangelog(version, entries, contracts);
		const changelogPath = join(rootDir, "CHANGELOG_ENTRY.md");
		writeFileSync(changelogPath, md);
		console.log(pc.cyan(`  Changelog entry written to ${changelogPath}`));
	}

	// Summary table
	console.log(pc.bold(`  Claude Code v${version} — Extracted Contracts`));
	console.log();

	const maxKeyLen = Math.max(...Object.keys(contracts).map((k) => k.length));
	for (const [key, val] of Object.entries(contracts)) {
		if (!val) continue;
		const arr = Array.isArray(val) ? val : [];
		const padded = key.padEnd(maxKeyLen);
		console.log(
			`  ${pc.white(padded)}  ${pc.bold(pc.white(String(arr.length).padStart(3)))} values  ${pc.dim(arr.join(", "))}`,
		);
	}

	console.log();
	console.log(pc.dim(`  Written to ${outPath}`));
}
```

- [ ] **Step 2: Build and run full test suite**

Run: `npm run build && npm test`
Expected: All 165+ tests pass, build succeeds

- [ ] **Step 3: Run extraction against current Claude Code version**

Run: `npx tsx scripts/extract-contracts.ts`
Expected: All 13 categories produce values. Drift report shows no changes (or only additions if census finds new keys). No gate failures.

- [ ] **Step 4: Verify contracts JSON is unchanged or has only additions**

Run: `git diff contracts/claude-code-contracts.json`
Expected: Either no diff, or only new values added. No values lost.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-contracts.ts contracts/claude-code-contracts.json
git commit -m "feat: rewire main() to use census extraction + d.ts validation + contract gate"
```

---

## Chunk 4: CI Workflow Updates

### Task 7: Add FORCE_CONTRACTS to GitHub Actions release workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add workflow_dispatch input for FORCE_CONTRACTS**

In `.github/workflows/release.yml`, add an input to `workflow_dispatch` and pass it as env var:

```yaml
on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:
    inputs:
      force_contracts:
        description: "Bypass contract gate (set to true when extraction legitimately changed)"
        required: false
        default: "false"
        type: boolean
```

Add to the "Extract contracts" step:

```yaml
      - name: Extract contracts
        if: steps.check.outputs.skip == 'false'
        env:
          FORCE_CONTRACTS: ${{ inputs.force_contracts && '1' || '0' }}
        run: |
          npx tsx scripts/extract-contracts.ts --changelog
          npx tsx scripts/generate-contracts.ts
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add FORCE_CONTRACTS input to GitHub release workflow"
```

---

### Task 8: Add FORCE_CONTRACTS to Woodpecker release workflow

**Files:**
- Modify: `.woodpecker/release.yml`

- [ ] **Step 1: Add FORCE_CONTRACTS env var to build step**

In `.woodpecker/release.yml`, the build step runs extraction. Add `FORCE_CONTRACTS` as a pipeline parameter with a default of empty string (disabled). Woodpecker supports per-run parameter overrides in the manual trigger UI:

```yaml
  build:
    image: node:20
    environment:
      - FORCE_CONTRACTS=${CI_PIPELINE_PARAM_FORCE_CONTRACTS:-0}
    commands:
      - |
        set -e
        VERSION=$(cat .claude-code-version)
        echo "Extracting contracts for Claude Code v$VERSION..."
        npx tsx scripts/extract-contracts.ts --changelog
        npx tsx scripts/generate-contracts.ts
        npm run build
        npm test
```

To override per-run: when triggering manually in the Woodpecker UI, add pipeline parameter `FORCE_CONTRACTS=1`.

- [ ] **Step 2: Commit**

```bash
git add .woodpecker/release.yml
git commit -m "ci: add FORCE_CONTRACTS support to Woodpecker release workflow"
```

---

## Chunk 5: Integration Test and Cleanup

### Task 9: Add integration test for full extraction

**Files:**
- Create: `tests/scripts/extract-contracts.integration.test.ts`

- [ ] **Step 1: Write integration test**

This test runs the actual extraction against the current contracts JSON to verify the census approach produces equivalent results.

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as acorn from "acorn";
import {
	collectObjectKeySets,
	classifyByOverlap,
	parseToolsDts,
	validateContracts,
} from "../../scripts/extract-contracts.js";

describe("integration: census extraction vs current contracts", () => {
	const contractsPath = join(import.meta.dirname!, "../../contracts/claude-code-contracts.json");
	const contracts = JSON.parse(readFileSync(contractsPath, "utf8")).contracts;

	// Categories that use census classification
	const censusCategories = [
		"pluginJsonFields",
		"agentFrontmatter",
		"commandFrontmatter",
		"mcpServerFields",
		"settingsUserFields",
	] as const;

	it("all census categories have known values in contracts", () => {
		for (const cat of censusCategories) {
			const values = contracts[cat];
			expect(values, `${cat} should exist and have values`).toBeDefined();
			expect(values.length, `${cat} should have at least 3 values`).toBeGreaterThanOrEqual(3);
		}
	});

	it("validateContracts passes for identical contracts", () => {
		const result = validateContracts(contracts, contracts);
		expect(result.failed).toBe(false);
		expect(result.errors).toEqual([]);
	});
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run tests/scripts/extract-contracts.integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/scripts/extract-contracts.integration.test.ts
git commit -m "test: add integration tests for census extraction"
```

---

### Task 10: Remove dead code from old extractors

**Files:**
- Modify: `scripts/extract-contracts.ts`

- [ ] **Step 1: Remove unused functions**

After wiring up `main()` in Task 6, these functions are no longer called and can be removed:
- `extractPluginJsonFields`
- `extractAgentFrontmatterFields`
- `extractCommandFrontmatterFields`
- `extractMcpServerFields`
- `extractSkillFrontmatter`
- `extractBalancedBlock`
- `extractZodObjectKeys`
- `extractTopLevelKeys` (but check — it's exported and tested. If tests reference it, remove the tests too since the function is replaced by `collectObjectKeySets`.)

Keep (still used as fallbacks when census returns empty):
- `extractAgentModelEnum` (small enum, census tried first)
- `extractHookTypes` (small enum, census tried first)
- `extractPromptEvents` (census tried first)

Rename and simplify `extractSettingsFields` → `extractSettingsProjectFields` (only returns project fields, user fields come from census):

```typescript
function extractSettingsProjectFields(source: string): string[] {
	const fields = extractZodObjectKeys(
		source,
		'.describe("List of tools the project is allowed to use")',
	);
	return fields.length > 0 ? fields : ["permissions"];
}
```

Note: `extractSettingsProjectFields` still needs `extractZodObjectKeys`, `extractBalancedBlock`, and `extractTopLevelKeys`. Keep those helper functions. Only remove the specific high-level `extract*` functions fully replaced by census:
- `extractPluginJsonFields`
- `extractAgentFrontmatterFields`
- `extractCommandFrontmatterFields`
- `extractMcpServerFields`
- `extractSkillFrontmatter`
- `extractSettingsFields` (replaced by the simplified `extractSettingsProjectFields`)

**Spec deviation note:** The spec says to replace `extractZodObjectKeys` and `extractTopLevelKeys`, but `extractSettingsProjectFields` (single-value category fallback) still needs them. This is a pragmatic choice — single-value categories can't use census classification.

- [ ] **Step 2: Update tests — remove `extractTopLevelKeys` tests if function is no longer exported**

If `extractTopLevelKeys` is still used internally (by `extractSettingsProjectFields`), keep it exported and keep its tests. Otherwise remove tests.

Since it's still used, keep the tests. Just remove the import/test for any removed function.

- [ ] **Step 3: Build and run full test suite**

Run: `npm run build && npm test`
Expected: All tests pass

- [ ] **Step 4: Run extraction to verify nothing broke**

Run: `npx tsx scripts/extract-contracts.ts`
Expected: Same output as before Task 10

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-contracts.ts tests/scripts/
git commit -m "refactor: remove old anchor-based extractors replaced by census"
```

---

### Task 11: Final end-to-end verification

- [ ] **Step 1: Full build + test**

Run: `npm run build && npm test`
Expected: All tests pass

- [ ] **Step 2: Run extraction with --changelog**

Run: `npx tsx scripts/extract-contracts.ts --changelog`
Expected: Clean extraction, no gate failures, changelog generated

- [ ] **Step 3: Verify contract gate works by simulating degradation**

Run: `node -e "const fs = require('fs'); const c = JSON.parse(fs.readFileSync('contracts/claude-code-contracts.json','utf8')); c.contracts.tools = c.contracts.tools.slice(0, 3); fs.writeFileSync('/tmp/test-contracts.json', JSON.stringify(c, null, '\t'))"`

Then temporarily point extraction at modified contracts and verify gate fails. (Manual check, no code change needed.)

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final adjustments from end-to-end verification"
```
