import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { CACHE_DIR, getAdminSchemaCachePath } from "./config.js";
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(ADMIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Custom-AllValue-Access-Token": token,
      },
      body: INTROSPECTION_BODY,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Schema fetch failed: HTTP ${res.status}`);
    const json = await res.json() as Record<string, unknown>;
    if (!json?.data || !(json.data as Record<string, unknown>)?.__schema) {
      throw new Error(`Schema fetch returned unexpected structure: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return json as unknown as IntrospectionSchema;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadAdminSchema(token: string): Promise<IntrospectionSchema> {
  const cachePath = getAdminSchemaCachePath();
  const cached = readCachedSchema(cachePath);
  if (cached) return cached;
  console.error("正在拉取 schema...");
  const schema = await fetchAdminSchema(token);
  writeCachedSchema(cachePath, schema);
  return schema;
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
