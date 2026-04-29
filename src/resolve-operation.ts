import { resolveAlias } from "./aliases.js";
import { camelToKebab, kebabToCamel } from "./names.js";
import type { IntrospectionField, ResolvedOperation } from "./introspection-types.js";
import type { OperationKind } from "./introspection-types.js";

export type ResolveResult =
  | { ok: true; op: ResolvedOperation }
  | {
      ok: false;
      reason: "not_found";
      suggestions: string[];
      triedNames: string[];
    };

function collectKebabNamesFromMap(
  fields: Map<string, IntrospectionField>,
): string[] {
  const names: string[] = [];
  for (const name of fields.keys()) {
    names.push(camelToKebab(name));
  }
  return names.sort();
}

function simpleSuggestions(
  token: string,
  allKebab: string[],
  limit = 8,
): string[] {
  const t = token.toLowerCase();
  const scored = allKebab
    .map((k) => {
      let score = 0;
      if (k === t) score = 100;
      else if (k.includes(t) || t.includes(k)) score = 50;
      else {
        const common = [...k].filter((c) => t.includes(c)).length;
        score = common / Math.max(k.length, t.length);
      }
      return { k, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.k);
  return scored.length ? scored : allKebab.slice(0, limit);
}

export function resolveOperation(
  kind: OperationKind,
  profile: string,
  userToken: string,
  queryFields: Map<string, IntrospectionField>,
  mutationFields: Map<string, IntrospectionField>,
): ResolveResult {
  const fields = kind === "query" ? queryFields : mutationFields;
  const allKebab = collectKebabNamesFromMap(fields);

  const aliasTarget = resolveAlias(profile, userToken);
  const candidates = [aliasTarget, kebabToCamel(userToken), userToken].filter(
    (x): x is string => Boolean(x),
  );

  const triedNames = [...new Set(candidates)];

  for (const name of triedNames) {
    const field = fields.get(name);
    if (field) {
      return {
        ok: true,
        op: {
          kind,
          field,
          userToken,
          graphqlName: field.name,
        },
      };
    }
  }

  return {
    ok: false,
    reason: "not_found",
    triedNames,
    suggestions: simpleSuggestions(userToken, allKebab),
  };
}

/** 在 query 与 mutation 中查找（先 query 再 mutation） */
export function resolveOperationEither(
  profile: string,
  userToken: string,
  queryFields: Map<string, IntrospectionField>,
  mutationFields: Map<string, IntrospectionField>,
): ResolveResult {
  const q = resolveOperation(
    "query",
    profile,
    userToken,
    queryFields,
    mutationFields,
  );
  if (q.ok) return q;
  const m = resolveOperation(
    "mutation",
    profile,
    userToken,
    queryFields,
    mutationFields,
  );
  if (m.ok) return m;
  const allKebab = [
    ...new Set([
      ...collectKebabNamesFromMap(queryFields),
      ...collectKebabNamesFromMap(mutationFields),
    ]),
  ].sort();
  return {
    ok: false,
    reason: "not_found",
    triedNames: m.triedNames,
    suggestions: simpleSuggestions(userToken, allKebab),
  };
}
