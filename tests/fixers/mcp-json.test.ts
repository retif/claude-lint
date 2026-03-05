import { describe, it, expect } from "vitest";
import { mcpJsonFixer } from "../../src/fixers/mcp-json.js";

const CONFIG = { rules: {} };

function fix(content: string) {
  return mcpJsonFixer.fix("mcp.json", content, CONFIG);
}

describe("mcp-json fixer", () => {
  it("sorts server names alphabetically", async () => {
    const input = JSON.stringify({
      mcpServers: {
        "z-server": { command: "z" },
        "a-server": { command: "a" },
      },
    });
    const result = JSON.parse(await fix(input));
    const keys = Object.keys(result.mcpServers);
    expect(keys).toEqual(["a-server", "z-server"]);
  });

  it("sorts server fields in canonical order", async () => {
    const input = JSON.stringify({
      mcpServers: {
        test: { args: ["--port"], env: { FOO: "bar" }, command: "cmd", type: "stdio" },
      },
    });
    const result = JSON.parse(await fix(input));
    const keys = Object.keys(result.mcpServers.test);
    expect(keys[0]).toBe("type");
    expect(keys[1]).toBe("command");
    expect(keys[2]).toBe("args");
    expect(keys[3]).toBe("env");
  });

  it("adds trailing newline", async () => {
    const input = JSON.stringify({ mcpServers: {} });
    expect((await fix(input)).endsWith("\n")).toBe(true);
  });

  it("returns invalid JSON unchanged", async () => {
    expect(await fix("not json")).toBe("not json");
  });
});
