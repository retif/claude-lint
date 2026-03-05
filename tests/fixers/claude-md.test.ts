import { describe, it, expect } from "vitest";
import { claudeMdFixer } from "../../src/fixers/claude-md.js";

const CONFIG = { rules: {} };

function fix(content: string) {
  return claudeMdFixer.fix("CLAUDE.md", content, CONFIG);
}

describe("claude-md fixer", () => {
  it("strips trailing whitespace", async () => {
    const input = "# Project  \n\n## Section   \n\nSome text  \n";
    const result = await fix(input);
    expect(result).not.toMatch(/[ \t]+$/m);
  });

  it("ensures exactly one trailing newline", async () => {
    expect((await fix("# Project")).endsWith("\n")).toBe(true);
    expect((await fix("# Project\n\n\n")).endsWith("\n")).toBe(true);
    expect(await fix("# Project\n\n\n")).not.toContain("\n\n\n");
  });

  it("inserts blank line before headings", async () => {
    const input = "# Title\nSome text\n## Section\nMore text\n";
    const result = await fix(input);
    expect(result).toContain("Some text\n\n## Section");
  });

  it("does not insert blank line before first-line heading", async () => {
    const input = "# Title\n\n## Section\n";
    const result = await fix(input);
    expect(result.startsWith("\n")).toBe(false);
  });

  it("returns empty content unchanged", async () => {
    expect(await fix("")).toBe("");
  });

  it("does not double blank lines before headings", async () => {
    const input = "# Title\n\n## Section\n";
    const result = await fix(input);
    expect(result).not.toContain("\n\n\n");
  });
});
