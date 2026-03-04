const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isKebabCase(s: string): boolean {
  return KEBAB_CASE_RE.test(s);
}

export function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
