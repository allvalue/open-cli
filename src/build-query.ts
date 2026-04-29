import type { IntrospectionField, IntrospectionType, TypeRef } from "./introspection-types.js";

/** 从 TypeRef 剥到最内层命名类型 */
function innerType(ref: TypeRef): TypeRef {
  let r = ref;
  while (r.kind === "NON_NULL" || r.kind === "LIST") r = r.ofType!;
  return r;
}

/** 递归生成 selection set，最多 depth 层，只选标量/枚举字段 */
function buildSelection(
  typeName: string,
  typeMap: Map<string, IntrospectionType>,
  depth: number,
  visited: Set<string>,
): string {
  if (depth <= 0 || visited.has(typeName)) return "__typename";
  const t = typeMap.get(typeName);
  if (!t?.fields?.length) return "__typename";

  visited.add(typeName);
  const parts: string[] = [];

  for (const f of t.fields) {
    const inner = innerType(f.type);
    const ft = inner.name ? typeMap.get(inner.name) : undefined;
    if (!ft || ft.kind === "SCALAR" || ft.kind === "ENUM") {
      parts.push(f.name);
    } else if (ft.kind === "OBJECT" && inner.name && depth > 1) {
      const sub = buildSelection(inner.name, typeMap, depth - 1, new Set(visited));
      parts.push(`${f.name} { ${sub} }`);
    }
  }

  visited.delete(typeName);
  return parts.length ? parts.join(" ") : "__typename";
}

/** 构建完整 GraphQL query/mutation 字符串 */
export function buildGraphqlDocument(
  field: IntrospectionField,
  kind: "query" | "mutation",
  typeMap: Map<string, IntrospectionType>,
): string {
  const args = field.args;
  const varDecls = args.map((a) => `$${a.name}: ${argTypeStr(a.type)}`).join(", ");
  const argPairs = args.map((a) => `${a.name}: $${a.name}`).join(", ");

  const returnInner = innerType(field.type);
  const returnType = returnInner.name ? typeMap.get(returnInner.name) : undefined;

  let selection = "";
  if (returnType && (returnType.kind === "OBJECT" || returnType.kind === "INTERFACE")) {
    selection = ` { ${buildSelection(returnInner.name!, typeMap, 3, new Set())} }`;
  }

  const opName = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  const varPart = varDecls ? `(${varDecls})` : "";
  const argPart = argPairs ? `(${argPairs})` : "";

  return `${kind} ${opName}${varPart} {\n  ${field.name}${argPart}${selection}\n}`;
}

function argTypeStr(ref: TypeRef): string {
  if (ref.kind === "NON_NULL") return `${argTypeStr(ref.ofType!)}!`;
  if (ref.kind === "LIST") return `[${argTypeStr(ref.ofType!)}]`;
  return ref.name ?? "String";
}
