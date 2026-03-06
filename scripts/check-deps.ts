#!/usr/bin/env tsx
/**
 * Check dependencies against the module-replacements list.
 * Exits with code 1 if any production replaceable modules are found.
 * Dev dependency matches are reported as warnings but don't fail.
 *
 * Usage: npx tsx scripts/check-deps.ts
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
	readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);
const prodDeps = Object.keys(pkg.dependencies ?? {});
const devDeps = Object.keys(pkg.devDependencies ?? {});

const BASE =
	"https://raw.githubusercontent.com/es-tooling/module-replacements/main/manifests";
const manifests = ["native.json", "micro-utilities.json", "preferred.json"];

interface Mapping {
	moduleName: string;
	replacements?: string[];
}

let prodFound = 0;
let devFound = 0;

for (const name of manifests) {
	const res = await fetch(`${BASE}/${name}`);
	if (!res.ok) {
		console.error(`Failed to fetch ${name}: ${res.status}`);
		continue;
	}
	const data = (await res.json()) as { mappings: Record<string, Mapping> };
	const mappings = data.mappings ?? {};

	for (const dep of prodDeps) {
		if (dep in mappings) {
			prodFound++;
			const entry = mappings[dep];
			const hint = entry.replacements?.length
				? `→ replace with: ${entry.replacements.join(", ")}`
				: "→ can be removed";
			console.log(`  ERROR ${dep} (${name}): ${hint}`);
		}
	}

	for (const dep of devDeps) {
		if (dep in mappings) {
			devFound++;
			const entry = mappings[dep];
			const hint = entry.replacements?.length
				? `→ replace with: ${entry.replacements.join(", ")}`
				: "→ can be removed";
			console.log(`  warn  ${dep} [dev] (${name}): ${hint}`);
		}
	}
}

if (prodFound > 0 || devFound > 0) {
	const parts: string[] = [];
	if (prodFound > 0) parts.push(`${prodFound} production`);
	if (devFound > 0) parts.push(`${devFound} dev`);
	console.log(`\n${parts.join(", ")} replaceable dependency(s) found.`);
}

if (prodFound > 0) {
	process.exit(1);
} else if (devFound > 0) {
	console.log("Dev dependency warnings only — not blocking CI.");
} else {
	console.log("No replaceable dependencies found.");
}
