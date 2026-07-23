const ALIAS_PATTERN = /^[$A-Z_a-z\u4e00-\u9fff][$\w\u4e00-\u9fff-]*$/;

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

/** Assigns deterministic aliases. Existing safe IDs remain directly visible. */
export function stableAliases(entities: Record<string, any>[], prefix: string): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (let index = 0; index < entities.length; index++) {
    const id = String(entities[index]?.id ?? `${prefix}-${index + 1}`);
    let alias = ALIAS_PATTERN.test(id) ? id : `${prefix}${hash(id)}`;
    let suffix = 2;
    const base = alias;
    while (used.has(alias)) alias = `${base}-${suffix++}`;
    used.add(alias);
    result.set(id, alias);
  }
  return result;
}

export function entityId(endpoint: unknown): string {
  if (endpoint && typeof endpoint === 'object' && 'id' in endpoint) return String((endpoint as { id: unknown }).id);
  return String(endpoint ?? '');
}
