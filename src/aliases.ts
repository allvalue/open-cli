/** CLI 名（kebab-case）→ 实际 GraphQL 字段名（camelCase） */
export const OPERATION_ALIASES: Record<string, Record<string, string>> = {
  admin: {
    /** Admin 侧「订单搜索」对应 QueryRoot.orders */
    "search-order": "orders",
  },
  store: {},
};

export function resolveAlias(
  profile: string,
  kebabToken: string,
): string | null {
  const m = OPERATION_ALIASES[profile];
  if (!m) return null;
  return m[kebabToken] ?? null;
}

/** 某 GraphQL 字段名对应的 CLI 别名（kebab） */
export function aliasesForGraphqlField(
  profile: string,
  graphqlFieldName: string,
): string[] {
  const m = OPERATION_ALIASES[profile];
  if (!m) return [];
  return Object.entries(m)
    .filter(([, target]) => target === graphqlFieldName)
    .map(([k]) => k);
}
