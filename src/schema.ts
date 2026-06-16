import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { CACHE_DIR, getAdminSchemaCachePath } from "./config.js";
import { httpPostJson } from "./http.js";
import type {
  IntrospectionSchema,
  IntrospectionType,
  IntrospectionField,
} from "./introspection-types.js";

export type Profile = "admin" | "store";

export const ADMIN_ENDPOINT = "https://api.allvalue.com/admin/graphql-explorer";

const INTROSPECTION_BODY = JSON.stringify({
  operationName: "IntrospectionQuery",
  query: `
    query IntrospectionQuery {
      __schema {
        queryType { name kind }
        mutationType { name kind }
        subscriptionType { name kind }
        types { ...FullType }
        directives {
          name description locations
          args { ...InputValue }
        }
      }
    }
    fragment FullType on __Type {
      kind name description
      fields(includeDeprecated: true) {
        name description
        args { ...InputValue }
        type { ...TypeRef }
        isDeprecated deprecationReason
      }
      inputFields { ...InputValue }
      interfaces { ...TypeRef }
      enumValues(includeDeprecated: true) {
        name description isDeprecated deprecationReason
      }
      possibleTypes { ...TypeRef }
    }
    fragment InputValue on __InputValue {
      name description
      type { ...TypeRef }
      defaultValue
    }
    fragment TypeRef on __Type {
      kind name
      ofType {
        kind name
        ofType {
          kind name
          ofType {
            kind name
            ofType {
              kind name
              ofType {
                kind name
                ofType {
                  kind name
                  ofType {
                    kind name
                    ofType { kind name }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
});

function readCachedSchema(cachePath: string): IntrospectionSchema | null {
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8"));
    if (!parsed?.data?.__schema?.types) return null;
    return parsed as IntrospectionSchema;
  } catch {
    return null;
  }
}

function writeCachedSchema(cachePath: string, schema: IntrospectionSchema): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(schema), "utf8");
}

async function fetchAdminSchema(token: string): Promise<IntrospectionSchema> {
  const res = await httpPostJson(
    ADMIN_ENDPOINT,
    {
      "Content-Type": "application/json",
      "Custom-AllValue-Access-Token": token,
    },
    INTROSPECTION_BODY,
    15000,
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Schema fetch failed: HTTP ${res.status}`);
  }
  const json = JSON.parse(res.body) as Record<string, unknown>;
  if (!json?.data || !(json.data as Record<string, unknown>)?.__schema) {
    throw new Error(`Schema fetch returned unexpected structure: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json as unknown as IntrospectionSchema;
}

/** 缓存有效期：超过则自动重新拉取（失败时降级使用旧缓存）。 */
const SCHEMA_TTL_MS = 24 * 60 * 60 * 1000;

/** 缓存文件年龄（毫秒）；文件不存在返回 null。 */
export function schemaCacheAgeMs(cachePath: string): number | null {
  try {
    return Date.now() - statSync(cachePath).mtimeMs;
  } catch {
    return null;
  }
}

export async function loadAdminSchema(
  token: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<IntrospectionSchema> {
  const cachePath = getAdminSchemaCachePath();
  const cached = readCachedSchema(cachePath);
  const age = schemaCacheAgeMs(cachePath);
  const stale = age === null || age > SCHEMA_TTL_MS;

  // 缓存有效、未过期、未强制刷新 → 直接用
  if (cached && !opts.forceRefresh && !stale) return cached;

  console.error(
    opts.forceRefresh
      ? "正在刷新 schema..."
      : cached
        ? "schema 缓存已过期，正在刷新..."
        : "正在拉取 schema...",
  );

  try {
    const schema = await fetchAdminSchema(token);
    writeCachedSchema(cachePath, schema); // 重写文件会刷新 mtime，TTL 计时重置
    return schema;
  } catch (err) {
    // 被动 TTL 过期刷新失败时降级用旧缓存（保证离线可用）；
    // 显式 forceRefresh（--refresh）则如实抛出，避免谎报“已刷新”。
    if (cached && !opts.forceRefresh) {
      console.error(`⚠ schema 刷新失败，暂用旧缓存：${(err as Error).message}`);
      return cached;
    }
    throw err;
  }
}

export function buildTypeMap(schema: IntrospectionSchema): Map<string, IntrospectionType> {
  const map = new Map<string, IntrospectionType>();
  for (const t of schema.data.__schema.types) {
    if (t.name) map.set(t.name, t);
  }
  return map;
}

export function getQueryRoot(schema: IntrospectionSchema): IntrospectionType | undefined {
  const n = schema.data.__schema.queryType.name;
  return schema.data.__schema.types.find((t) => t.name === n);
}

export function getMutationRoot(schema: IntrospectionSchema): IntrospectionType | undefined {
  const m = schema.data.__schema.mutationType;
  if (!m?.name) return undefined;
  return schema.data.__schema.types.find((t) => t.name === m.name);
}

export function listFieldsByName(root: IntrospectionType | undefined): Map<string, IntrospectionField> {
  const map = new Map<string, IntrospectionField>();
  if (!root?.fields) return map;
  for (const f of root.fields) map.set(f.name, f);
  return map;
}
