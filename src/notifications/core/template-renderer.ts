/**
 * Minimal, safe `{{variable}}` substitution. No expressions, no helpers, no
 * code execution: a placeholder is either an allow-listed variable name
 * (replaced by its plain-text value) or rendered empty.
 */
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]{0,63})\s*\}\}/g;

export type TemplateValues = Record<string, string | number | null | undefined>;

export function renderTemplate(
  template: string,
  values: TemplateValues,
  allowed: readonly string[],
): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    if (!allowed.includes(name)) return '';
    const value = values[name];
    return value === null || value === undefined ? '' : String(value);
  });
}

/** Placeholder names used by a template (for validation). */
export function templateVariables(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

/** Variables used by the templates that are not allowed for the type. */
export function unknownVariables(templates: string[], allowed: readonly string[]): string[] {
  const used = templates.flatMap(templateVariables);
  return [...new Set(used.filter((name) => !allowed.includes(name)))];
}

/** Keeps only allow-listed keys (what gets stored on the notification). */
export function pickAllowed(values: TemplateValues, allowed: readonly string[]): TemplateValues {
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => allowed.includes(key) && value != null),
  );
}
