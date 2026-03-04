import type { LintResult } from "../types.js";

export function formatJson(results: LintResult[], quiet: boolean): string {
  const filtered = quiet
    ? results.map((r) => ({
        ...r,
        diagnostics: r.diagnostics.filter((d) => d.severity === "error"),
      }))
    : results;

  return JSON.stringify(filtered, null, 2);
}
