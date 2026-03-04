import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { LinterConfig, RuleConfig } from "./types.js";

const DEFAULT_CONFIG: LinterConfig = {
  rules: {},
};

export function loadConfig(configPath?: string): LinterConfig {
  const path = configPath ?? findConfigFile();
  if (!path) return DEFAULT_CONFIG;

  try {
    const content = readFileSync(path, "utf-8");
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== "object") return DEFAULT_CONFIG;

    const config: LinterConfig = { rules: {} };

    if (parsed.rules && typeof parsed.rules === "object") {
      for (const [key, value] of Object.entries(parsed.rules)) {
        if (typeof value === "boolean") {
          config.rules[key] = value;
        } else if (typeof value === "object" && value !== null) {
          config.rules[key] = value as RuleConfig;
        }
      }
    }

    return config;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function findConfigFile(): string | undefined {
  const candidates = [".claude-lint.yaml", ".claude-lint.yml"];
  for (const name of candidates) {
    if (existsSync(name)) return name;
  }
  return undefined;
}

export function mergeCliRules(
  config: LinterConfig,
  enable: string[],
  disable: string[],
): LinterConfig {
  const merged = { rules: { ...config.rules } };
  for (const rule of enable) {
    merged.rules[rule] = true;
  }
  for (const rule of disable) {
    merged.rules[rule] = false;
  }
  return merged;
}
