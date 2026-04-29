import { aliasesForGraphqlField } from "./aliases.js";
import { camelToKebab } from "./names.js";
import type {
  IntrospectionField,
  IntrospectionInputValue,
  IntrospectionType,
  TypeRef,
} from "./introspection-types.js";
import { isArgRequired, typeRefToString } from "./validate.js";

function describeArgRecursive(
  arg: IntrospectionInputValue,
  typeMap: Map<string, IntrospectionType>,
  indent: string,
): string[] {
  const lines: string[] = [];
  const tStr = typeRefToString(arg.type);
  const req = isArgRequired(arg.type) ? "[必填]" : "[可选]";
  const desc = arg.description?.trim().replace(/\s+/g, " ") ?? "";
  const tail = desc ? ` — ${desc}` : "";
  lines.push(`${indent}${req} ${arg.name} (${tStr})${tail}`);

  let r: TypeRef = arg.type;
  while (r.kind === "NON_NULL" || r.kind === "LIST") r = r.ofType!;
  if (r.kind !== "INPUT_OBJECT" || !r.name) return lines;

  const inObj = typeMap.get(r.name);
  if (!inObj?.inputFields?.length) return lines;

  for (const f of inObj.inputFields) {
    lines.push(
      ...describeArgRecursive(
        { name: f.name, description: f.description, type: f.type },
        typeMap,
        indent + "    ",
      ),
    );
  }
  return lines;
}

function describeReturnFields(
  typeRef: TypeRef,
  typeMap: Map<string, IntrospectionType>,
  indent: string,
  depth: number,
): string[] {
  if (depth > 2) return [];
  let r: TypeRef = typeRef;
  while (r.kind === "NON_NULL" || r.kind === "LIST") r = r.ofType!;
  if (!r.name) return [];
  const t = typeMap.get(r.name);
  if (!t?.fields?.length) return [];
  const lines: string[] = [];
  for (const f of t.fields) {
    if (f.isDeprecated) continue;
    const desc = f.description?.trim().replace(/\s+/g, " ");
    lines.push(`${indent}${f.name}${desc ? ` — ${desc}` : ""}`);
    lines.push(...describeReturnFields(f.type, typeMap, indent + "  ", depth + 1));
  }
  return lines;
}

function buildVariablesTemplate(
  args: IntrospectionInputValue[],
  typeMap: Map<string, IntrospectionType>,
): string {
  if (!args.length) return "{}";
  const obj: Record<string, unknown> = {};
  for (const a of args) {
    const required = isArgRequired(a.type);
    let r: TypeRef = a.type;
    while (r.kind === "NON_NULL" || r.kind === "LIST") r = r.ofType!;
    const placeholder = r.kind === "SCALAR"
      ? (r.name === "Int" ? 10 : r.name === "Boolean" ? true : `<${r.name}>`)
      : `<${r.name ?? "value"}>`;
    if (required) obj[a.name] = placeholder;
  }
  // if no required args, include first optional as example
  if (!Object.keys(obj).length && args[0]) {
    let r: TypeRef = args[0].type;
    while (r.kind === "NON_NULL" || r.kind === "LIST") r = r.ofType!;
    obj[args[0].name] = r.kind === "SCALAR"
      ? (r.name === "Int" ? 10 : r.name === "Boolean" ? true : `<${r.name}>`)
      : `<${r.name ?? "value"}>`;
  }
  return JSON.stringify(obj);
}

export function formatOperationHelp(
  profile: string,
  kind: "query" | "mutation",
  field: IntrospectionField,
  typeMap: Map<string, IntrospectionType>,
): string {
  const lines: string[] = [];
  const graphqlName = field.name;
  const cliKebab = camelToKebab(graphqlName);
  const extra = aliasesForGraphqlField(profile, graphqlName);
  const cliNames = [cliKebab, ...extra.filter((n) => n !== cliKebab)].join(" | ");

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`API: ${profile}`);
  lines.push(`类型: ${kind}`);
  lines.push(`GraphQL 字段: ${graphqlName}`);
  lines.push(`CLI 命令名: ${cliNames}`);
  if (field.description?.trim()) {
    lines.push(`说明: ${field.description.trim().replace(/\s+/g, " ")}`);
  }
  lines.push("");
  lines.push("参数（通过 --variables 传入 JSON 对象）：");
  lines.push("  • 键名与下表一致，使用 camelCase。");
  lines.push("");

  if (!field.args.length) {
    lines.push("（此操作无参数）");
  } else {
    for (const a of field.args) {
      lines.push(...describeArgRecursive(a, typeMap, "  "));
      const def = a.defaultValue;
      if (def != null && def !== "") {
        lines.push(`      schema 默认值: ${def}`);
      }
    }
  }

  lines.push("");
  lines.push("可返回字段:");
  const returnLines = describeReturnFields(field.type, typeMap, "  ", 0);
  if (returnLines.length) {
    lines.push(...returnLines);
  } else {
    lines.push("  （无可展开字段）");
  }

  lines.push("");
  lines.push("示例:");
  const template = buildVariablesTemplate(field.args, typeMap);
  lines.push(
    `  allvalue-open admin ${cliNames.split(" | ")[0]} --variables '${template}'`,
  );
  lines.push("");
  return lines.join("\n");
}

export function formatOperationsList(
  profile: string,
  queryFields: IntrospectionField[],
  mutationFields: IntrospectionField[],
): string {
  const lines: string[] = [];
  lines.push(`${profile} 可用命令:\n`);

  if (queryFields.length) {
    lines.push("Query:");
    for (const f of queryFields.sort((a, b) => a.name.localeCompare(b.name))) {
      const kebab = camelToKebab(f.name);
      const desc = f.description?.trim().replace(/\s+/g, " ") || "无说明";
      lines.push(`  * allvalue-open admin ${kebab}`);
      lines.push(`    说明: ${desc}`);
    }
    lines.push("");
  }

  if (mutationFields.length) {
    lines.push("Mutation:");
    for (const f of mutationFields.sort((a, b) => a.name.localeCompare(b.name))) {
      const kebab = camelToKebab(f.name);
      const desc = f.description?.trim().replace(/\s+/g, " ") || "无说明";
      lines.push(`  * allvalue-open admin ${kebab}`);
      lines.push(`    说明: ${desc}`);
    }
  }

  return lines.join("\n");
}

