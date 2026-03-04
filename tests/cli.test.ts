import { describe, it, expect } from "vitest";
import { mergeCliRules, loadConfig } from "../src/config.js";

describe("CLI --enable / --disable via mergeCliRules", () => {
  it("enables a disabled rule", () => {
    const base = { rules: { "plugin-json/name-required": false } };
    const merged = mergeCliRules(base, ["plugin-json/name-required"], []);
    expect(merged.rules["plugin-json/name-required"]).toBe(true);
  });

  it("disables an enabled rule", () => {
    const base = { rules: { "plugin-json/name-required": true } };
    const merged = mergeCliRules(base, [], ["plugin-json/name-required"]);
    expect(merged.rules["plugin-json/name-required"]).toBe(false);
  });

  it("disable overrides enable when both specified", () => {
    const base = { rules: {} };
    const merged = mergeCliRules(base, ["plugin-json/name-required"], ["plugin-json/name-required"]);
    // disable runs after enable
    expect(merged.rules["plugin-json/name-required"]).toBe(false);
  });

  it("preserves unmentioned rules", () => {
    const base = { rules: { "skill-md/name-required": { enabled: true, severity: "warning" as const } } };
    const merged = mergeCliRules(base, ["plugin-json/valid-json"], []);
    expect(merged.rules["skill-md/name-required"]).toEqual({ enabled: true, severity: "warning" });
    expect(merged.rules["plugin-json/valid-json"]).toBe(true);
  });
});

describe("--rule filtering", () => {
  it("filters diagnostics to single rule", () => {
    // Simulate what index.ts does with --rule
    const diagnostics = [
      { rule: "plugin-json/name-required", severity: "error" as const, message: "missing", file: "a.json" },
      { rule: "plugin-json/valid-json", severity: "error" as const, message: "invalid", file: "a.json" },
      { rule: "plugin-json/name-kebab-case", severity: "warning" as const, message: "bad case", file: "a.json" },
    ];
    const ruleFilter = "plugin-json/valid-json";
    const filtered = diagnostics.filter((d) => d.rule === ruleFilter);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].rule).toBe("plugin-json/valid-json");
  });
});

describe("--list-rules", () => {
  it("all linters export RULES arrays", async () => {
    const { PLUGIN_JSON_RULES } = await import("../src/linters/plugin-json.js");
    const { SKILL_MD_RULES } = await import("../src/linters/skill-md.js");
    const { AGENT_MD_RULES } = await import("../src/linters/agent-md.js");
    const { COMMAND_MD_RULES } = await import("../src/linters/command-md.js");
    const { HOOKS_JSON_RULES } = await import("../src/linters/hooks-json.js");
    const { SETTINGS_JSON_RULES } = await import("../src/linters/settings-json.js");
    const { MCP_JSON_RULES } = await import("../src/linters/mcp-json.js");
    const { CLAUDE_MD_RULES } = await import("../src/linters/claude-md.js");

    const all = [
      ...PLUGIN_JSON_RULES,
      ...SKILL_MD_RULES,
      ...AGENT_MD_RULES,
      ...COMMAND_MD_RULES,
      ...HOOKS_JSON_RULES,
      ...SETTINGS_JSON_RULES,
      ...MCP_JSON_RULES,
      ...CLAUDE_MD_RULES,
    ];

    expect(all.length).toBeGreaterThan(50);
    for (const rule of all) {
      expect(rule).toHaveProperty("id");
      expect(rule).toHaveProperty("defaultSeverity");
      expect(["error", "warning", "info"]).toContain(rule.defaultSeverity);
    }
  });
});
