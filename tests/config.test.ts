import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, mergeCliRules } from "../src/config.js";

describe("config", () => {
  it("returns default config when no file exists", () => {
    const config = loadConfig("/nonexistent/path/.claudecode-lint.yaml");
    expect(config.rules).toEqual({});
  });

  it("loads config from yaml file", () => {
    const dir = mkdtempSync(join(tmpdir(), "claudecode-linter-test-"));
    const path = join(dir, ".claudecode-lint.yaml");
    writeFileSync(path, 'rules:\n  plugin-json/no-unknown-fields: false\n  skill-md/body-word-count:\n    enabled: true\n    severity: info\n');

    try {
      const config = loadConfig(path);
      expect(config.rules["plugin-json/no-unknown-fields"]).toBe(false);
      expect(config.rules["skill-md/body-word-count"]).toEqual({ enabled: true, severity: "info" });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("merges CLI rule overrides", () => {
    const base = { rules: { "plugin-json/name-required": true as const } };
    const merged = mergeCliRules(base, ["skill-md/name-required"], ["plugin-json/name-required"]);
    expect(merged.rules["skill-md/name-required"]).toBe(true);
    expect(merged.rules["plugin-json/name-required"]).toBe(false);
  });
});
