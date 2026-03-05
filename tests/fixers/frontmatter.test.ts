import { describe, it, expect } from "vitest";
import { frontmatterFixer } from "../../src/fixers/frontmatter.js";

const CONFIG = { rules: {} };

function fix(content: string) {
  return frontmatterFixer.fix("SKILL.md", content, CONFIG);
}

describe("frontmatter fixer", () => {
  it("normalizes name to kebab-case", () => {
    const input = "---\nname: My Skill Name\ndescription: A skill\n---\n\nBody text\n";
    const result = fix(input);
    expect(result).toContain("name: my-skill-name");
  });

  it("strips trailing whitespace", () => {
    const input = "---\nname: test  \n---\n\nBody   \n";
    const result = fix(input);
    expect(result).not.toMatch(/[ \t]+$/m);
  });

  it("ensures trailing newline", () => {
    const input = "---\nname: test\n---\n\nBody";
    const result = fix(input);
    expect(result.endsWith("\n")).toBe(true);
  });

  it("leaves already kebab-case names unchanged", () => {
    const input = "---\nname: my-skill\ndescription: desc\n---\n\nBody\n";
    const result = fix(input);
    expect(result).toContain("name: my-skill");
  });

  it("returns content without frontmatter unchanged (except whitespace fixes)", () => {
    const input = "No frontmatter here\n";
    const result = fix(input);
    expect(result).toBe("No frontmatter here\n");
  });

  it("pre-parse fixes unquoted values with colons", () => {
    const input = '---\nname: my-skill\ndescription: Use when the user asks to "do X", "do Y": handles both cases.\n---\n\nBody\n';
    const result = fix(input);
    // Should not throw, and should produce valid output with the description preserved
    expect(result).toContain("name: my-skill");
    expect(result).toContain("do X");
    expect(result).toContain("do Y");
  });

  it("pre-parse fixes values containing hash characters", () => {
    const input = "---\nname: my-skill\ndescription: Use C# and F# languages\n---\n\nBody\n";
    const result = fix(input);
    expect(result).toContain("C#");
    expect(result).toContain("F#");
  });

  it("does not double-quote already quoted values", () => {
    const input = '---\nname: my-skill\ndescription: "Already quoted: value"\n---\n\nBody\n';
    const result = fix(input);
    // Should not produce nested quotes
    expect(result).not.toContain('""');
  });
});
