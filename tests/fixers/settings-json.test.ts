import { describe, it, expect } from "vitest";
import { settingsJsonFixer } from "../../src/fixers/settings-json.js";

const CONFIG = { rules: {} };

function fix(content: string) {
  return settingsJsonFixer.fix("settings.json", content, CONFIG);
}

describe("settings-json fixer", () => {
  it("sorts top-level keys in canonical order", async () => {
    const input = JSON.stringify({
      skipDangerousModePermissionPrompt: false,
      env: {},
      permissions: {},
    });
    const result = JSON.parse(await fix(input));
    const keys = Object.keys(result);
    expect(keys[0]).toBe("permissions");
    expect(keys[1]).toBe("env");
    expect(keys[2]).toBe("skipDangerousModePermissionPrompt");
  });

  it("sorts permissions.allow alphabetically", async () => {
    const input = JSON.stringify({
      permissions: { allow: ["Write", "Bash", "Edit"] },
    });
    const result = JSON.parse(await fix(input));
    expect(result.permissions.allow).toEqual(["Bash", "Edit", "Write"]);
  });

  it("sorts permissions.deny alphabetically", async () => {
    const input = JSON.stringify({
      permissions: { deny: ["Write", "Bash"] },
    });
    const result = JSON.parse(await fix(input));
    expect(result.permissions.deny).toEqual(["Bash", "Write"]);
  });

  it("adds trailing newline", async () => {
    const input = JSON.stringify({ permissions: {} });
    expect((await fix(input)).endsWith("\n")).toBe(true);
  });

  it("returns invalid JSON unchanged", async () => {
    expect(await fix("{bad")).toBe("{bad");
  });
});
