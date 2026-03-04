import semver from "semver";
import type { Linter, LintDiagnostic, LinterConfig, Severity } from "../types.js";
import { isRuleEnabled, getRuleSeverity } from "../types.js";
import { isKebabCase } from "../utils/kebab-case.js";

const KNOWN_FIELDS = new Set([
  "name", "version", "description", "author",
  "repository", "homepage", "license", "keywords",
]);

const SPDX_COMMON = new Set([
  "MIT", "Apache-2.0", "GPL-2.0-only", "GPL-3.0-only",
  "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0",
  "LGPL-2.1-only", "LGPL-3.0-only", "UNLICENSED",
]);

interface RuleDef {
  id: string;
  defaultSeverity: Severity;
}

const RULES: RuleDef[] = [
  { id: "plugin-json/valid-json", defaultSeverity: "error" },
  { id: "plugin-json/name-required", defaultSeverity: "error" },
  { id: "plugin-json/name-kebab-case", defaultSeverity: "error" },
  { id: "plugin-json/name-length", defaultSeverity: "error" },
  { id: "plugin-json/description-required", defaultSeverity: "warning" },
  { id: "plugin-json/version-semver", defaultSeverity: "warning" },
  { id: "plugin-json/author-object", defaultSeverity: "info" },
  { id: "plugin-json/repository-url", defaultSeverity: "warning" },
  { id: "plugin-json/keywords-array", defaultSeverity: "warning" },
  { id: "plugin-json/keywords-no-duplicates", defaultSeverity: "warning" },
  { id: "plugin-json/no-unknown-fields", defaultSeverity: "info" },
  { id: "plugin-json/license-spdx", defaultSeverity: "info" },
];

function diag(
  config: LinterConfig,
  filePath: string,
  ruleId: string,
  defaultSeverity: Severity,
  message: string,
  line?: number,
): LintDiagnostic | null {
  if (!isRuleEnabled(config, ruleId)) return null;
  return {
    rule: ruleId,
    severity: getRuleSeverity(config, ruleId, defaultSeverity),
    message,
    file: filePath,
    line,
  };
}

export const pluginJsonLinter: Linter = {
  artifactType: "plugin-json",

  lint(filePath: string, content: string, config: LinterConfig): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];
    const push = (d: LintDiagnostic | null) => { if (d) diagnostics.push(d); };

    // Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      push(diag(config, filePath, "plugin-json/valid-json", "error",
        `Invalid JSON: ${(e as Error).message}`));
      return diagnostics;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      push(diag(config, filePath, "plugin-json/valid-json", "error",
        "plugin.json must be a JSON object"));
      return diagnostics;
    }

    // name
    if (!("name" in parsed) || typeof parsed.name !== "string" || parsed.name === "") {
      push(diag(config, filePath, "plugin-json/name-required", "error",
        "\"name\" field is required and must be a non-empty string"));
    } else {
      const name = parsed.name as string;
      if (!isKebabCase(name)) {
        push(diag(config, filePath, "plugin-json/name-kebab-case", "error",
          `"name" must be kebab-case (got "${name}")`));
      }
      if (name.length > 64) {
        push(diag(config, filePath, "plugin-json/name-length", "error",
          `"name" must be at most 64 characters (got ${name.length})`));
      }
    }

    // description
    if (!("description" in parsed) || typeof parsed.description !== "string") {
      push(diag(config, filePath, "plugin-json/description-required", "warning",
        "\"description\" field is recommended"));
    }

    // version
    if ("version" in parsed) {
      if (typeof parsed.version !== "string" || !semver.valid(parsed.version)) {
        push(diag(config, filePath, "plugin-json/version-semver", "warning",
          `"version" should be valid semver (got "${parsed.version}")`));
      }
    }

    // author
    if ("author" in parsed) {
      const author = parsed.author;
      if (typeof author !== "object" || author === null || Array.isArray(author)) {
        push(diag(config, filePath, "plugin-json/author-object", "info",
          "\"author\" should be an object with \"name\" and optionally \"email\" fields"));
      } else {
        const a = author as Record<string, unknown>;
        if (!("name" in a) || typeof a.name !== "string") {
          push(diag(config, filePath, "plugin-json/author-object", "info",
            "\"author.name\" should be a string"));
        }
      }
    }

    // repository
    if ("repository" in parsed) {
      if (typeof parsed.repository !== "string") {
        push(diag(config, filePath, "plugin-json/repository-url", "warning",
          "\"repository\" should be a URL string"));
      } else {
        try {
          new URL(parsed.repository as string);
        } catch {
          push(diag(config, filePath, "plugin-json/repository-url", "warning",
            `"repository" is not a valid URL: "${parsed.repository}"`));
        }
      }
    }

    // keywords
    if ("keywords" in parsed) {
      if (!Array.isArray(parsed.keywords)) {
        push(diag(config, filePath, "plugin-json/keywords-array", "warning",
          "\"keywords\" must be an array"));
      } else {
        const kw = parsed.keywords as unknown[];
        for (let i = 0; i < kw.length; i++) {
          if (typeof kw[i] !== "string") {
            push(diag(config, filePath, "plugin-json/keywords-array", "warning",
              `"keywords[${i}]" must be a string`));
          }
        }
        const seen = new Set<string>();
        for (const k of kw) {
          if (typeof k === "string") {
            if (seen.has(k)) {
              push(diag(config, filePath, "plugin-json/keywords-no-duplicates", "warning",
                `Duplicate keyword: "${k}"`));
            }
            seen.add(k);
          }
        }
      }
    }

    // unknown fields
    for (const key of Object.keys(parsed)) {
      if (!KNOWN_FIELDS.has(key)) {
        push(diag(config, filePath, "plugin-json/no-unknown-fields", "info",
          `Unknown field "${key}" (known: ${[...KNOWN_FIELDS].join(", ")})`));
      }
    }

    // license
    if ("license" in parsed && typeof parsed.license === "string") {
      if (!SPDX_COMMON.has(parsed.license as string)) {
        push(diag(config, filePath, "plugin-json/license-spdx", "info",
          `"license" "${parsed.license}" is not a common SPDX identifier`));
      }
    }

    return diagnostics;
  },
};

export { RULES as PLUGIN_JSON_RULES };
