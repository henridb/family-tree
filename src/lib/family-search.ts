import type { human, person, TextMatch, NameHighlights } from "../types/family";

/**
 * Fold French names for searching by ignoring case, accents, ligatures and
 * repeated whitespace.
 */
export function normalizeName(value: string): string {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae")
    .trim()
    .replace(/\s+/g, " ");
}

/** Return sorted, merged copies of overlapping or adjacent half-open text ranges. */
function mergeMatches(ranges: readonly TextMatch[]): TextMatch[] {
  const merged: TextMatch[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/**
 * Find all occurrences of already-normalized queries and return merged ranges
 * in the original text.
 *
 * Ranges use half-open UTF-16 offsets suitable for String.slice. Map folded
 * characters back to their original spelling so ligatures, combining accents
 * and collapsed whitespace remain correctly highlighted. Empty queries are
 * ignored.
 */
export function findNameMatches(
  text: string,
  normalizedQueries: readonly string[],
): TextMatch[] {
  const normalized = normalizeName(text);
  const matches: TextMatch[] = [];
  for (const query of normalizedQueries) {
    if (!query) continue;
    for (
      let start = normalized.indexOf(query);
      start !== -1;
      start = normalized.indexOf(query, start + 1)
    )
      matches.push({ start, end: start + query.length });
  }
  if (!matches.length) return [];

  // Map folded characters back to the original spelling. Keep combining accents
  // with their letter, expand ligatures, and map collapsed spaces as one unit.
  const offsets: TextMatch[] = [];
  let gapStart: number | undefined;
  for (const part of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const folded = normalizeName(part[0]);
    if (!folded) {
      if (offsets.length && /^\s/u.test(part[0])) gapStart ??= part.index;
      continue;
    }
    if (gapStart !== undefined) {
      offsets.push({ start: gapStart, end: part.index });
      gapStart = undefined;
    }
    // String.slice and match positions use UTF-16 offsets, including surrogate pairs.
    for (let remaining = folded.length; remaining > 0; remaining--)
      offsets.push({ start: part.index, end: part.index + part[0].length });
  }
  return mergeMatches(
    matches.map(({ start, end }) => ({
      start: offsets[start]!.start,
      end: offsets[end - 1]!.end,
    })),
  );
}

/** Clip full-name matches to one field and translate them to that field's offsets. */
function partMatches(
  ranges: readonly TextMatch[],
  start: number,
  end: number,
): TextMatch[] {
  return ranges.flatMap((range) => {
    const from = Math.max(start, range.start);
    const to = Math.min(end, range.end);
    return from < to ? [{ start: from - start, end: to - start }] : [];
  });
}

/**
 * Collect matching ranges for given, birth and optional married names, or
 * return undefined when none match.
 */
function nameHighlights(
  value: human,
  queries: readonly string[],
  marriedSurname?: string,
): NameHighlights | undefined {
  const birthMatches = findNameMatches(
    `${value.name} ${value.surname}`,
    queries,
  );
  const marriedMatches =
    marriedSurname === undefined
      ? []
      : findNameMatches(`${value.name} ${marriedSurname}`, queries);
  if (!birthMatches.length && !marriedMatches.length) return;
  const surnameStart = value.name.length + 1;
  return {
    name: mergeMatches([
      ...partMatches(birthMatches, 0, value.name.length),
      ...partMatches(marriedMatches, 0, value.name.length),
    ]),
    surname: partMatches(
      birthMatches,
      surnameStart,
      surnameStart + value.surname.length,
    ),
    marriedSurname: partMatches(
      marriedMatches,
      surnameStart,
      surnameStart + (marriedSurname?.length ?? 0),
    ),
  };
}

/**
 * Return a copied tree annotated and pruned for semicolon-separated name
 * searches.
 *
 * Queries use OR matching over normalized birth names and supported current
 * married names. Count each matching person once and retain descendant paths
 * leading to matches. Empty input restores the full structure with stale search
 * annotations cleared. The source tree and its records are not modified.
 */
export function searchFamily(source: person, input: string) {
  const queries = [
    ...new Set(input.split(";").map(normalizeName).filter(Boolean)),
  ];
  const hasQuery = queries.length > 0;

  /** Replace search annotations on an already-copied person and report whether they match. */
  function annotateMatch(copy: human, marriedSurname?: string): boolean {
    delete copy.searchHighlights;
    if (!hasQuery) {
      delete copy.match;
      return false;
    }
    const highlights = nameHighlights(copy, queries, marriedSurname);
    copy.match = highlights !== undefined;
    if (highlights) copy.searchHighlights = highlights;
    return copy.match;
  }

  /** Copy a branch and retain only child subtrees containing matches when a query is active. */
  function prune(value: person): { tree: person; matchCount: number } {
    const tree = { ...value };
    let matchCount = annotateMatch(
      tree,
      tree.sex === "female"
        ? tree.partners?.find((partner) => !partner.divorced)?.surname
        : undefined,
    )
      ? 1
      : 0;
    if (value.partners)
      tree.partners = value.partners.map((sourcePartner) => {
        const partner = { ...sourcePartner };
        if (
          annotateMatch(
            partner,
            partner.sex === "female" && !partner.divorced
              ? tree.surname
              : undefined,
          )
        )
          matchCount++;
        if (sourcePartner.children) {
          const children: person[] = [];
          for (const child of sourcePartner.children) {
            const result = prune(child);
            matchCount += result.matchCount;
            if (!hasQuery || result.matchCount) children.push(result.tree);
          }
          if (children.length || !hasQuery) partner.children = children;
          else delete partner.children;
        }
        return partner;
      });
    return { tree, matchCount };
  }

  return { ...prune(source), hasQuery };
}
