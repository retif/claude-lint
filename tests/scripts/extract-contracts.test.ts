import { describe, it, expect } from "vitest";
import { extractTopLevelKeys, collectObjectKeySets } from "../../scripts/extract-contracts.js";
import * as acorn from "acorn";

function parseCode(code: string) {
	return acorn.parse(code, { sourceType: "module", ecmaVersion: "latest" }) as acorn.Program;
}

describe("extractTopLevelKeys", () => {
	it("extracts basic keys", () => {
		const keys = extractTopLevelKeys('{name:"",version:""}');
		expect(keys).toEqual(["name", "version"]);
	});

	it("extracts keys with nested objects", () => {
		const keys = extractTopLevelKeys('{config:{nested:true},other:""}');
		expect(keys).toEqual(["config", "other"]);
	});

	it("extracts keys from spread objects", () => {
		const keys = extractTopLevelKeys('{...{a:I.boolean()},b:""}');
		expect(keys).toEqual(["a", "b"]);
	});

	it("extracts keys with chained methods", () => {
		const keys = extractTopLevelKeys(
			"{name:I.string().optional(),age:I.number()}",
		);
		expect(keys).toEqual(["name", "age"]);
	});

	it("does not match quoted string keys with dashes (unsupported)", () => {
		// The regex uses \w+ which does not match hyphens inside quoted keys
		const keys = extractTopLevelKeys('{"key-with-dashes":"value"}');
		expect(keys).toEqual([]);
	});

	it("extracts keys prefixed with $", () => {
		const keys = extractTopLevelKeys("{$schema:I.string(),name:I.string()}");
		expect(keys).toEqual(["$schema", "name"]);
	});

	it("handles deeply nested braces", () => {
		const keys = extractTopLevelKeys("{a:{b:{c:{d:true}}},e:I.string()}");
		expect(keys).toEqual(["a", "e"]);
	});

	it("returns empty array for empty object", () => {
		const keys = extractTopLevelKeys("{}");
		expect(keys).toEqual([]);
	});
});

describe("collectObjectKeySets", () => {
	it("collects keys from object expressions with 3+ keys", () => {
		const ast = parseCode("const x = { name: 1, version: 2, description: 3 }");
		const sets = collectObjectKeySets(ast);
		expect(sets.length).toBeGreaterThanOrEqual(1);
		expect(sets.some(s =>
			s.keys.includes("name") && s.keys.includes("version") && s.keys.includes("description")
		)).toBe(true);
	});

	it("skips objects with fewer than 3 keys", () => {
		const ast = parseCode("const x = { a: 1, b: 2 }");
		const sets = collectObjectKeySets(ast);
		expect(sets.every(s => s.keys.length >= 3)).toBe(true);
	});

	it("skips objects with more than 150 keys", () => {
		const keys = Array.from({ length: 160 }, (_, i) => `k${i}: ${i}`).join(", ");
		const ast = parseCode(`const x = { ${keys} }`);
		const sets = collectObjectKeySets(ast);
		expect(sets.every(s => s.keys.length <= 150)).toBe(true);
	});

	it("deduplicates identical key sets", () => {
		const ast = parseCode("const x = { a: 1, b: 2, c: 3 }; const y = { a: 4, b: 5, c: 6 }");
		const sets = collectObjectKeySets(ast);
		const matching = sets.filter(s =>
			s.keys.length === 3 && s.keys.includes("a") && s.keys.includes("b") && s.keys.includes("c")
		);
		expect(matching.length).toBe(1);
	});

	it("handles computed property keys by skipping them", () => {
		const ast = parseCode("const x = { name: 1, [expr]: 2, version: 3, desc: 4 }");
		const sets = collectObjectKeySets(ast);
		expect(sets.some(s => s.keys.includes("name") && s.keys.includes("version"))).toBe(true);
	});
});
