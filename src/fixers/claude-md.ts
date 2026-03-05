import type { Fixer, LinterConfig } from "../types.js";
import { formatMarkdown } from "../utils/prettier.js";

export const claudeMdFixer: Fixer = {
  artifactType: "claude-md",

  async fix(_filePath: string, content: string, _config: LinterConfig): Promise<string> {
    if (content === "") return content;

    // Run prettier markdown formatting
    let result = await formatMarkdown(content);

    // Ensure blank line before headings unless it's the first line
    const lines = result.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined && line.startsWith("#") && i > 0 && out[out.length - 1] !== "") {
        out.push("");
      }
      if (line !== undefined) {
        out.push(line);
      }
    }
    return out.join("\n");
  },
};
