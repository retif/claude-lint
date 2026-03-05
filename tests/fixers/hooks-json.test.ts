import { describe, it, expect } from "vitest";
import { hooksJsonFixer } from "../../src/fixers/hooks-json.js";

const CONFIG = { rules: {} };

function fix(content: string) {
  return hooksJsonFixer.fix("hooks.json", content, CONFIG);
}

describe("hooks-json fixer", () => {
  it("sorts top-level keys alphabetically", async () => {
    const input = JSON.stringify({ PreToolUse: [], PostToolUse: [], Notification: [] });
    const result = JSON.parse(await fix(input));
    const keys = Object.keys(result);
    expect(keys).toEqual(["Notification", "PostToolUse", "PreToolUse"]);
  });

  it("adds trailing newline", async () => {
    const input = JSON.stringify({ hooks: {} });
    expect((await fix(input)).endsWith("\n")).toBe(true);
  });

  it("uses 2-space indent", async () => {
    const input = JSON.stringify({ PreToolUse: [{ type: "command", command: "echo test" }], PostToolUse: [] });
    const result = await fix(input);
    expect(result).toContain("  ");
    expect(result).not.toContain("\t");
  });

  it("returns invalid JSON unchanged", async () => {
    expect(await fix("{bad")).toBe("{bad");
  });
});
