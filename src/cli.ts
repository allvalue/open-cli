#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";
import {
  buildTypeMap,
  getMutationRoot,
  getQueryRoot,
  listFieldsByName,
  loadAdminSchema,
  ADMIN_ENDPOINT,
  type Profile,
} from "./schema.js";
import { resolveOperationEither } from "./resolve-operation.js";
import { formatOperationHelp, formatOperationsList } from "./format-help.js";
import { parseJsonSafe, validateFieldArguments } from "./validate.js";
import { buildGraphqlDocument } from "./build-query.js";
import { loadConfig, getAuthToken, saveAuthData, CONFIG_PATH, getAdminSchemaCachePath } from "./config.js";

function readFileArg(path: string, label: string): string {
  try { return readFileSync(path, "utf8").trim(); }
  catch { console.error(`无法读取 ${label} 文件: ${path}`); process.exit(1); }
}

function resolveQueryStr(values: Record<string, unknown>): string | undefined {
  if (typeof values["query-file"] === "string") return readFileArg(values["query-file"], "--query-file");
  if (typeof values.query === "string") return values.query;
  return undefined;
}

function resolveVariablesStr(values: Record<string, unknown>): string {
  if (typeof values["variable-file"] === "string") return readFileArg(values["variable-file"], "--variable-file");
  if (typeof values.variables === "string") return values.variables;
  return "{}";
}

async function execGraphql(
  token: string,
  query: string,
  variables: unknown,
  endpoint: string = ADMIN_ENDPOINT,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Custom-AllValue-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) { console.error(`HTTP ${res.status}:`, text); process.exit(1); }
    console.log(JSON.stringify(json, null, 2));
  } finally {
    clearTimeout(timer);
  }
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function askPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stderr.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stderr.write("\n");
        resolve(input);
      } else if (ch === "") {
        process.exit(1);
      } else if (ch === "" || ch === "\b") {
        input = input.slice(0, -1);
      } else {
        input += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const AUTH_ENDPOINT = "https://api.allvalue.com/gateway/api/soa/com.youzan.i18n.shop.api.DataManagementAppOpenService/authorizeApp";

async function handleAuth(): Promise<void> {
  const domain = await ask("? 请输入 domain: ");
  const accountNo = await ask("? 请输入 accountNo: ");
  const password = await askPassword("? 请输入 password (不显示): ");
  if (!domain || !accountNo || !password) {
    console.error("domain、accountNo、password 均不能为空");
    process.exit(1);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, accountNo, password }),
      signal: controller.signal,
    });
    const json = await res.json() as { code: number; success: boolean; data?: { accessToken: string; appId: number; clientId: string; clientSecret: string; kdtId: number; primaryDomain: string }; message?: string };
    if (!json.success || !json.data) {
      console.error(`认证失败: ${json.message ?? "未知错误"}`);
      process.exit(1);
    }
    saveAuthData(json.data);
    console.log(`✔ 认证成功，AccessToken 已保存到 ${CONFIG_PATH}`);
    console.log(`  primaryDomain: ${json.data.primaryDomain}`);
    console.log(`  kdtId: ${json.data.kdtId}`);
  } finally {
    clearTimeout(timer);
  }
}

function printGlobalHelp(): void {
  console.log(`allvalue-open — AllValue GraphQL CLI

用法:
  allvalue-open admin auth
      执行认证，输入 domain、accountNo、password 后获取并保存 AccessToken。

  allvalue-open admin -h | --help
      显示用法说明。

  allvalue-open admin --list | -l
      列出所有可用命令（简洁模式）。

  allvalue-open admin schema
      显示 schema 缓存文件路径。

  allvalue-open admin <命令名>
      显示该命令的详细参数说明。

  allvalue-open admin <命令名> --variables '<json>'
      执行查询，传入 variables JSON。

  allvalue-open admin query --query '<graphql>' [--variables '<json>']
  allvalue-open admin query --query-file <path> [--variable-file <path>]
      直接传入 GraphQL 语句执行（原始模式，不校验）。
      Mutation 默认禁止，需加 --allow-mutations 开启。

说明:
  • admin 为必填参数。
  • store 暂不支持。
  • token 优先级: --token > auth 认证的 accessToken。
  • 首次使用请先执行 allvalue-open admin auth 进行认证。
  • schema 首次使用时自动拉取并缓存到 ~/.allvalue-open/admin-schema.json。
  • --query-file / --variable-file 支持从文件读取 query 和 variables。
  • Mutation 操作需显式传入 --allow-mutations。

环境要求: Node.js >= 22
`);
}

async function resolveToken(values: Record<string, unknown>): Promise<string> {
  const token =
    typeof values.token === "string"
      ? values.token
      : getAuthToken(loadConfig());
  if (!token) {
    console.error("⚠ 未找到 Access Token，请先执行认证：");
    console.error("  allvalue-open admin auth");
    process.exit(1);
  }
  return token;
}

async function handleAdminHelp(token: string): Promise<void> {
  const schema = await loadAdminSchema(token);
  const typeMap = buildTypeMap(schema);
  const qFields = [...(getQueryRoot(schema)?.fields ?? [])];
  const mFields = [...(getMutationRoot(schema)?.fields ?? [])];
  console.log(formatOperationsList("admin", qFields, mFields));
}

async function handleAdminCommand(
  token: string,
  opToken: string,
  values: Record<string, unknown>,
): Promise<void> {
  const schema = await loadAdminSchema(token);
  const typeMap = buildTypeMap(schema);
  const queryFields = listFieldsByName(getQueryRoot(schema));
  const mutationFields = listFieldsByName(getMutationRoot(schema));

  const resolved = resolveOperationEither("admin", opToken, queryFields, mutationFields);
  if (!resolved.ok) {
    console.error(`命令不存在: "${opToken}"（已尝试: ${resolved.triedNames.join(", ")}）`);
    if (resolved.suggestions.length) console.error(`你可能想找: ${resolved.suggestions.join(", ")}`);
    console.error(`列出全部: allvalue-open admin schema`);
    process.exit(1);
  }

  const { op } = resolved;

  if (op.kind === "mutation" && !values["allow-mutations"]) {
    console.error(`⚠ "${opToken}" 是 mutation 操作，默认禁止执行。`);
    console.error("如需执行，请添加 --allow-mutations 标志。");
    process.exit(1);
  }

  const helpText = formatOperationHelp("admin", op.kind, op.field, typeMap);

  const varsRaw = values.variables !== undefined || values["variable-file"] !== undefined
    ? resolveVariablesStr(values)
    : undefined;
  if (varsRaw === undefined) {
    console.log(helpText);
    console.log("（未提供 --variables，仅展示说明。传入 --variables 可执行查询。）");
    process.exit(0);
  }

  const parsed = parseJsonSafe(varsRaw);
  if (!parsed.ok) { console.error(parsed.message); console.log(""); console.log(helpText); process.exit(1); }

  const v = parsed.value;
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    console.error("variables 必须是 JSON 对象（{}）。");
    console.log(""); console.log(helpText); process.exit(1);
  }

  const issues = validateFieldArguments(v as Record<string, unknown>, op.field.args, typeMap);
  if (issues.length) {
    console.error("校验未通过：");
    for (const is of issues) console.error(`  • [${is.path}] ${is.message}`);
    console.log(""); console.log(helpText); process.exit(1);
  }

  const endpoint = typeof values.endpoint === "string" ? values.endpoint : ADMIN_ENDPOINT;
  const document = buildGraphqlDocument(op.field, op.kind, typeMap);
  await execGraphql(token, document, v, endpoint);
}

async function handleRawQuery(token: string, values: Record<string, unknown>): Promise<void> {
  const queryStr = resolveQueryStr(values);
  if (!queryStr) {
    console.error("原始查询模式需要 --query 或 --query-file 参数。");
    console.error("用法: allvalue-open admin query --query '<graphql>' [--variables '<json>']");
    process.exit(1);
  }

  const isMutation = /^\s*mutation\b/i.test(queryStr);
  if (isMutation && !values["allow-mutations"]) {
    console.error("⚠ 检测到 mutation 操作，默认禁止执行。");
    console.error("如需执行，请添加 --allow-mutations 标志。");
    process.exit(1);
  }

  const varsRaw = resolveVariablesStr(values);
  const parsed = parseJsonSafe(varsRaw);
  if (!parsed.ok) { console.error(parsed.message); process.exit(1); }

  const endpoint = typeof values.endpoint === "string" ? values.endpoint : ADMIN_ENDPOINT;
  await execGraphql(token, queryStr, parsed.value, endpoint);
}


async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: raw,
    options: {
      query:            { type: "string",  short: "q" },
      variables:        { type: "string",  short: "v" },
      "query-file":     { type: "string" },
      "variable-file":  { type: "string" },
      "allow-mutations":{ type: "boolean" },
      help:             { type: "boolean", short: "h" },
      endpoint:         { type: "string",  short: "e" },
      token:            { type: "string",  short: "t" },
      list:             { type: "boolean", short: "l" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || raw.length === 0) { printGlobalHelp(); process.exit(0); }

  const cmd0 = positionals[0];
  if (!cmd0) { printGlobalHelp(); process.exit(0); }

  // Determine profile and operation token
  if (cmd0 === "store") {
    console.error("⚠ store（C端）API 暂未开放，敬请期待。");
    console.error("当前仅支持: allvalue-open admin <命令名>");
    process.exit(1);
  }

  if (cmd0 !== "admin") {
    console.error(`首段参数必须为 admin，当前: ${cmd0}`);
    printGlobalHelp();
    process.exit(1);
  }

  const profile: Profile = "admin";
  const opToken = positionals[1];

  // --help: show usage
  if (values.help) {
    printGlobalHelp();
    process.exit(0);
  }

  // --list: list all commands
  if (values.list) {
    const token = await resolveToken(values);
    await handleAdminHelp(token);
    process.exit(0);
  }

  if (!opToken) {
    console.error(`请提供操作名，例如: allvalue-open admin products`);
    console.error(`或查看全部命令: allvalue-open admin --help`);
    process.exit(1);
  }

  if (opToken === "auth") { await handleAuth(); process.exit(0); }

  const token = await resolveToken(values);

  if (opToken === "schema") {
    const cachePath = getAdminSchemaCachePath();
    if (!existsSync(cachePath)) {
      await loadAdminSchema(token);
    }
    console.log(`Schema 缓存文件路径: ${cachePath}`);
    console.log(`如需重新拉取，请删除该文件后重新执行此命令。`);
    process.exit(0);
  }

  if (opToken === "query") {
    await handleRawQuery(token, values);
    process.exit(0);
  }

  await handleAdminCommand(token, opToken, values);
  process.exit(0);
}

main();
