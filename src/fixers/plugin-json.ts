import type { Fixer, LinterConfig } from "../types.js";
import { formatJson } from "../utils/prettier.js";

const CANONICAL_KEY_ORDER = [
  "name", "version", "description", "author",
  "repository", "homepage", "license", "keywords",
];

export const pluginJsonFixer: Fixer = {
  artifactType: "plugin-json",

  async fix(_filePath: string, content: string, _config: LinterConfig): Promise<string> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      return content; // can't fix invalid JSON
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return content;
    }

    // Sort keys in canonical order, then remaining keys alphabetically
    const ordered: Record<string, unknown> = {};
    for (const key of CANONICAL_KEY_ORDER) {
      if (key in parsed) {
        ordered[key] = parsed[key];
      }
    }
    for (const key of Object.keys(parsed).sort()) {
      if (!(key in ordered)) {
        ordered[key] = parsed[key];
      }
    }

    return formatJson(JSON.stringify(ordered), true);
  },
};
