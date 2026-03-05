import prettier from "prettier";

export async function formatJson(content: string, useTabs = false): Promise<string> {
  return prettier.format(content, {
    parser: "json",
    useTabs,
    tabWidth: useTabs ? 1 : 2,
    trailingComma: "none" as const,
    printWidth: 1,
  });
}

export async function formatMarkdown(content: string): Promise<string> {
  return prettier.format(content, {
    parser: "markdown",
    proseWrap: "preserve",
  });
}
