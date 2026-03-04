#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { Command } from "commander";
import { loadConfig, mergeCliRules } from "./config.js";
import { discoverArtifacts } from "./discovery.js";
import { formatHuman } from "./formatters/human.js";
import { formatJson } from "./formatters/json.js";
import { pluginJsonLinter } from "./linters/plugin-json.js";
import { skillMdLinter } from "./linters/skill-md.js";
import { agentMdLinter } from "./linters/agent-md.js";
import { commandMdLinter } from "./linters/command-md.js";
import { hooksJsonLinter } from "./linters/hooks-json.js";
import { settingsJsonLinter } from "./linters/settings-json.js";
import { mcpJsonLinter } from "./linters/mcp-json.js";
import { claudeMdLinter } from "./linters/claude-md.js";
import { pluginJsonFixer } from "./fixers/plugin-json.js";
import { frontmatterFixer } from "./fixers/frontmatter.js";
import type { ArtifactType, ConfigScope, Linter, Fixer, LintResult } from "./types.js";

const LINTERS: Record<ArtifactType, Linter> = {
  "plugin-json": pluginJsonLinter,
  "skill-md": skillMdLinter,
  "agent-md": agentMdLinter,
  "command-md": commandMdLinter,
  "hooks-json": hooksJsonLinter,
  "settings-json": settingsJsonLinter,
  "mcp-json": mcpJsonLinter,
  "claude-md": claudeMdLinter,
};

const FIXERS: Partial<Record<ArtifactType, Fixer>> = {
  "plugin-json": pluginJsonFixer,
  "skill-md": frontmatterFixer,
  "agent-md": { ...frontmatterFixer, artifactType: "agent-md" },
  "command-md": { ...frontmatterFixer, artifactType: "command-md" },
};

const program = new Command();

program
  .name("claude-lint")
  .description("Linter and formatter for Claude Code plugin artifacts")
  .version("0.1.0")
  .argument("[paths...]", "Plugin directories or individual files", ["."])
  .option("-f, --format", "Auto-fix fixable issues")
  .option("--output <type>", "Output format: human | json", "human")
  .option("--config <path>", "Config file path")
  .option("--scope <scope>", "Filter by scope: user | project | subdirectory")
  .option("--quiet", "Only show errors")
  .action((paths: string[], opts) => {
    const config = mergeCliRules(loadConfig(opts.config), [], []);
    const results: LintResult[] = [];
    const scopeFilter = opts.scope as ConfigScope | undefined;

    for (const targetPath of paths) {
      const artifacts = discoverArtifacts(targetPath, { scope: scopeFilter });

      if (artifacts.length === 0) {
        process.stderr.write(`No plugin artifacts found in ${targetPath}\n`);
        continue;
      }

      for (const artifact of artifacts) {
        const content = readFileSync(artifact.filePath, "utf-8");
        const linter = LINTERS[artifact.artifactType];
        const diagnostics = linter.lint(artifact.filePath, content, config, artifact.scope);

        let fixed = 0;
        if (opts.format) {
          const fixer = FIXERS[artifact.artifactType];
          if (fixer) {
            const fixedContent = fixer.fix(artifact.filePath, content, config);
            if (fixedContent !== content) {
              writeFileSync(artifact.filePath, fixedContent);
              fixed = 1;
            }
          }
        }

        results.push({
          file: relative(process.cwd(), artifact.filePath),
          artifact: artifact.artifactType,
          diagnostics,
          fixed: opts.format ? fixed : undefined,
        });
      }
    }

    const output = opts.output === "json"
      ? formatJson(results, !!opts.quiet)
      : formatHuman(results, !!opts.quiet);

    process.stdout.write(output + "\n");

    const hasErrors = results.some((r) =>
      r.diagnostics.some((d) => d.severity === "error"),
    );
    process.exit(hasErrors ? 1 : 0);
  });

program.parse();
