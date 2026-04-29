import type {
  IntrospectionInputValue,
  IntrospectionType,
  TypeRef,
} from "./introspection-types.js";

export type ValidationIssue = {
  path: string;
  message: string;
};

function peel(
  typeRef: TypeRef,
): { wrappers: Array<"NON_NULL" | "LIST">; inner: TypeRef } {
  const wrappers: Array<"NON_NULL" | "LIST"> = [];
  let cur: TypeRef = typeRef;
  while (cur.kind === "NON_NULL" || cur.kind === "LIST") {
    wrappers.push(cur.kind as "NON_NULL" | "LIST");
    cur = cur.ofType!;
  }
  return { wrappers, inner: cur };
}

export function isArgRequired(typeRef: TypeRef): boolean {
  return typeRef.kind === "NON_NULL";
}

export function typeRefToString(typeRef: TypeRef): string {
  const { wrappers, inner } = peel(typeRef);
  let s =
    inner.name ??
    (inner.kind === "LIST" || inner.kind === "NON_NULL" ? "?" : inner.kind);
  for (const w of wrappers) {
    if (w === "LIST") s = `[${s}]`;
    if (w === "NON_NULL") s = `${s}!`;
  }
  return s;
}

function validateAgainstTypeRef(
  value: unknown,
  typeRef: TypeRef,
  path: string,
  typeMap: Map<string, IntrospectionType>,
  issues: ValidationIssue[],
): void {
  let baseRef = typeRef;

  while (baseRef.kind === "NON_NULL" || baseRef.kind === "LIST") {
    if (baseRef.kind === "NON_NULL") {
      if (value === undefined || value === null) {
        issues.push({
          path,
          message: `缺少必填值（期望 ${typeRefToString(typeRef)}）`,
        });
        return;
      }
      baseRef = baseRef.ofType!;
      continue;
    }
    if (baseRef.kind === "LIST") {
      if (value === undefined || value === null) return;
      if (!Array.isArray(value)) {
        issues.push({
          path,
          message: `应为数组（期望 ${typeRefToString(typeRef)}），实际为 ${describeVal(
            value,
          )}`,
        });
        return;
      }
      const innerList = baseRef.ofType!;
      value.forEach((v, i) => {
        validateAgainstTypeRef(v, innerList, `${path}[${i}]`, typeMap, issues);
      });
      return;
    }
  }

  if (value === undefined || value === null) return;

  const name = baseRef.name;
  if (!name) {
    issues.push({ path, message: "无法解析类型" });
    return;
  }

  const t = typeMap.get(name);
  if (!t) {
    issues.push({ path, message: `未知类型 ${name}` });
    return;
  }

  if (t.kind === "SCALAR") {
    validateScalar(value, name, path, issues);
    return;
  }
  if (t.kind === "ENUM") {
    if (typeof value !== "string") {
      issues.push({
        path,
        message: `枚举 ${name} 期望字符串，实际为 ${describeVal(value)}`,
      });
      return;
    }
    const ok = (t.enumValues ?? []).some((ev) => ev.name === value);
    if (!ok) {
      const allowed = (t.enumValues ?? []).map((e) => e.name).slice(0, 20);
      issues.push({
        path,
        message: `枚举 ${name} 的值 "${value}" 不在允许范围内（示例: ${allowed.join(
          ", ",
        )}…）`,
      });
    }
    return;
  }
  if (t.kind === "INPUT_OBJECT") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      issues.push({
        path,
        message: `Input 对象 ${name} 期望 JSON 对象，实际为 ${describeVal(value)}`,
      });
      return;
    }
    const obj = value as Record<string, unknown>;
    const fields = t.inputFields ?? [];
    for (const f of fields) {
      const req = isArgRequired(f.type);
      if (req && !(f.name in obj)) {
        issues.push({
          path: path ? `${path}.${f.name}` : f.name,
          message: `缺少必填字段 ${f.name}（类型 ${typeRefToString(f.type)}）`,
        });
        continue;
      }
      if (!(f.name in obj)) continue;
      validateAgainstTypeRef(
        obj[f.name],
        f.type,
        path ? `${path}.${f.name}` : f.name,
        typeMap,
        issues,
      );
    }
    for (const k of Object.keys(obj)) {
      if (!fields.some((f) => f.name === k)) {
        issues.push({
          path: path ? `${path}.${k}` : k,
          message: `未知字段（未在 Input ${name} 中定义）`,
        });
      }
    }
    return;
  }

  issues.push({ path, message: `不支持的类型种类 ${t.kind}` });
}

function describeVal(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "数组";
  return typeof v;
}

function validateScalar(
  value: unknown,
  name: string,
  path: string,
  issues: ValidationIssue[],
): void {
  switch (name) {
    case "Int":
      if (
        typeof value !== "number" ||
        !Number.isInteger(value)
      ) {
        issues.push({
          path,
          message: `Int 期望整数，实际为 ${describeVal(value)}`,
        });
      }
      break;
    case "Float":
      if (typeof value !== "number" || Number.isNaN(value)) {
        issues.push({
          path,
          message: `Float 期望数字，实际为 ${describeVal(value)}`,
        });
      }
      break;
    case "Boolean":
      if (typeof value !== "boolean") {
        issues.push({
          path,
          message: `Boolean 期望 true/false，实际为 ${describeVal(value)}`,
        });
      }
      break;
    case "String":
    case "ID":
    case "NodeID":
    case "DateTime":
    case "HTML":
    case "BigDecimal":
    case "Long":
    default:
      if (typeof value !== "string") {
        issues.push({
          path,
          message: `标量 ${name} 期望字符串，实际为 ${describeVal(value)}`,
        });
      }
  }
}

/** 校验 GraphQL variables 对象与顶层 field 的 args 是否匹配 */
export function validateFieldArguments(
  variables: Record<string, unknown>,
  args: IntrospectionInputValue[],
  typeMap: Map<string, IntrospectionType>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const argNames = new Set(args.map((a) => a.name));

  for (const a of args) {
    const req = isArgRequired(a.type);
    if (req && !(a.name in variables)) {
      issues.push({
        path: a.name,
        message: `缺少必填参数 ${a.name}（类型 ${typeRefToString(a.type)}）`,
      });
    }
  }

  for (const key of Object.keys(variables)) {
    if (!argNames.has(key)) {
      issues.push({
        path: key,
        message: `未知参数（schema 中不存在该字段名）`,
      });
    }
  }

  for (const a of args) {
    if (!(a.name in variables)) continue;
    validateAgainstTypeRef(
      variables[a.name],
      a.type,
      a.name,
      typeMap,
      issues,
    );
  }

  return issues;
}

export function parseJsonSafe(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `JSON 解析失败: ${msg}` };
  }
}
