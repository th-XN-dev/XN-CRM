const MAX_TERMS = 5;

/**
 * Builds an AND-of-ORs filter: every word of `search` must match at least one field.
 * "ali karimov" → (name~ali OR phone~ali) AND (name~karimov OR phone~karimov).
 */
export function searchWhere<W>(
  search: string | undefined,
  fieldsFor: (term: string) => W[],
): { AND: { OR: W[] }[] } | undefined {
  const terms = search?.split(/\s+/).filter(Boolean).slice(0, MAX_TERMS) ?? [];
  if (terms.length === 0) return undefined;
  return { AND: terms.map((term) => ({ OR: fieldsFor(term) })) };
}

/** Case-insensitive `contains` for Prisma string fields. */
export const icontains = (term: string) => ({ contains: term, mode: 'insensitive' as const });

/** Phone search: ignores spaces/dashes/parentheses the user may type. */
export const phoneContains = (term: string) => ({ contains: term.replace(/[\s\-()]/g, '') });
