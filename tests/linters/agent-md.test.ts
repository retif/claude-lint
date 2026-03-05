import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentMdLinter } from "../../src/linters/agent-md.js";
import type { LinterConfig } from "../../src/types.js";

const FIXTURES = resolve(import.meta.dirname, "../fixtures");
const CONFIG: LinterConfig = { rules: {} };

function lintFile(path: string) {
  return agentMdLinter.lint(path, readFileSync(path, "utf-8"), CONFIG);
}

describe("agent-md linter", () => {
  it("passes for valid agent", () => {
    const diags = lintFile(resolve(FIXTURES, "valid-plugin/agents/example-agent.md"));
    const errors = diags.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("reports missing required fields", () => {
    const diags = lintFile(resolve(FIXTURES, "invalid/agent-md/missing-fields.md"));
    const rules = diags.map((d) => d.rule);
    expect(rules).toContain("agent-md/description-required");
    expect(rules).toContain("agent-md/model-required");
    expect(rules).toContain("agent-md/color-required");
  });

  it("reports invalid model", () => {
    const diags = lintFile(resolve(FIXTURES, "invalid/agent-md/bad-model.md"));
    expect(diags.some((d) => d.rule === "agent-md/model-valid")).toBe(true);
  });

  it("reports missing examples in description", () => {
    const diags = lintFile(resolve(FIXTURES, "invalid/agent-md/no-examples.md"));
    expect(diags.some((d) => d.rule === "agent-md/description-examples")).toBe(true);
  });

  it("reports empty system prompt", () => {
    const diags = lintFile(resolve(FIXTURES, "invalid/agent-md/no-prompt.md"));
    expect(diags.some((d) => d.rule === "agent-md/system-prompt-present")).toBe(true);
  });

  it("reports short system prompt", () => {
    const content = "---\nname: short-prompt\ndescription: |\n  <example>\n  user: test\n  </example>\nmodel: sonnet\ncolor: blue\n---\n\nHi.";
    const diags = agentMdLinter.lint("test.md", content, CONFIG);
    expect(diags.some((d) => d.rule === "agent-md/system-prompt-length")).toBe(true);
  });

  it("reports missing second person in prompt", () => {
    const content = "---\nname: no-second-person\ndescription: |\n  <example>\n  user: test\n  </example>\nmodel: sonnet\ncolor: blue\n---\n\nThis agent does things. It handles tasks and processes input correctly.";
    const diags = agentMdLinter.lint("test.md", content, CONFIG);
    expect(diags.some((d) => d.rule === "agent-md/system-prompt-second-person")).toBe(true);
  });

  it("reports invalid color", () => {
    const content = "---\nname: bad-color\ndescription: |\n  <example>\n  user: test\n  </example>\nmodel: sonnet\ncolor: chartreuse\n---\n\nYou are a test agent.";
    const diags = agentMdLinter.lint("test.md", content, CONFIG);
    expect(diags.some((d) => d.rule === "agent-md/color-valid")).toBe(true);
  });
});
