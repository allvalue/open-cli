# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

- 构建：`npm run build`（运行 `tsc`，输出到 `dist/`）
- 测试：`npm test`（先编译，再执行 `node --test dist/test/*.test.js`）
- 运行单个测试文件：`npx tsc && node --test dist/test/names.test.js`
- 本地运行 CLI：`node dist/cli.js admin <命令名>`

要求 Node >= 22 与系统级 `curl`。项目使用纯 ESM、NodeNext 模块解析，**无任何运行时 npm 依赖**（仅使用 Node 内建模块 + `curl` 子进程）。

## 开放能力域概览

> 仅为高层业务地图，帮助快速判断某能力是否已开放；**不是命令清单**。具体命令、参数随线上 schema 演进，**权威来源**始终是 `node dist/cli.js admin --list`（及 `admin <命令名>` 的帮助），由缓存 schema 动态派生。新增 API 能力无需改代码，重新拉取 schema 即生效（删除 `~/.allvalue-open/admin-schema.json` 后重跑任意命令）。

当前 Admin 侧覆盖的业务域：

- **商品**：商品/变体的查询、批量上下架、增删改，分组（collection），商品分析。
- **订单**：订单与草稿单、联盟订单（affiliate）的查询，取消/完成/退款，标签管理。
- **履约**：履约单查询/创建/取消、物流跟踪更新、履约服务商、运费模板（delivery-profile）。
- **客户**：列表/详情/积分、增删改与邀请邮件，客户分组（customer-filters，作折扣写侧 `customerFilterIds`）。
- **折扣**：自动折扣（automatic-discount）、折扣码活动（discount-activity）的查询与增删改、启停、批量操作。
- **营销活动**：拼团（group-activity 及团单 group-order）、一卡一码（card-code-activity）的查询与管理。
- **数据报表**：数据概况看板（data-overview）、销售报告（sales-report）、渠道分析（channel-report）、商品分析（product-analysis）。
- **店铺与域名**：店铺信息/Logo、域名管理、主域名设置。
- **门店/地点**：地点（location）查询。
- **主题**：Web/移动端主题的查询、增删改与发布。
- **Webhook**：监听器注册/删除、事件列表与重发。
- **前端访问**：storefront-access-token 的创建/删除。
- **文件上传**：预签名上传链接（staged-upload-create）、文件上传（file-uploads-create）。

## 整体架构

CLI 名为 `allvalue-open`，封装 AllValue Admin GraphQL API。**仓库内不打包静态 schema**——首次使用时对线上端点做 introspection、本地缓存，命令帮助、参数校验、GraphQL 文档生成全部由该缓存 schema 派生。

### 端到端流程（`src/cli.ts:main`）

1. `parseArgs` 解析 positionals 与 flags。第一段必须是 `admin`（`store` 已预留但未开放）。
2. Token 解析：`--token` > `~/.allvalue-open.json`（由 `admin auth` 写入的 `authData.accessToken`）。详见 `src/config.ts`。
3. Schema 加载：`loadAdminSchema`（`src/schema.ts`）优先读取缓存 `~/.allvalue-open/admin-schema.json`；缓存缺失则对 `ADMIN_ENDPOINT`（`https://api.allvalue.com/admin/graphql-explorer`，鉴权头 `Custom-AllValue-Access-Token`）发起完整 introspection 查询并写缓存。
4. 操作解析（`src/resolve-operation.ts`）：用户传入的 kebab-case token 依次尝试 alias → camelCase → 原值，先查 Query root，再查 Mutation root；命中失败则基于 kebab 命名返回近似建议。
5. Mutation 保护：解析到 mutation 但未传 `--allow-mutations` 时直接退出。`admin query` 原始模式下用正则探测 `mutation` 关键字，同样适用此保护。
6. 未传 `--variables` / `--variable-file` 时仅打印格式化帮助（`src/format-help.ts`）后退出。传了变量时走 `parseJsonSafe` + `validateFieldArguments`（`src/validate.ts`），基于字段的 `args` 与 type map 递归校验；失败时打印问题清单 + 帮助。
7. `buildGraphqlDocument`（`src/build-query.ts`）按返回类型递归展开 selection set 生成完整文档：仅选取标量/枚举字段，深度受限，并通过 `visited` 防环。最终由 `execGraphql` POST 出去，原样输出响应 JSON。

### 跨文件关键契约

- **Type map**：`buildTypeMap(schema)` 产出的 `Map<string, IntrospectionType>` 是 schema 加载后所有类型查找的唯一来源，validate / 帮助格式化 / 查询构建都依赖它。
- **命名约定**：GraphQL 字段使用 camelCase，CLI 命令使用 kebab-case；转换逻辑集中在 `src/names.ts`，所有面向用户的输出都应是 kebab。
- **Alias**：`src/aliases.ts` 维护 profile 维度的 kebab → GraphQL 字段名映射（例如 `search-order` → `orders`）。新增别名只改这个文件，不要污染 resolve 逻辑。
- **Introspection 类型**：`src/introspection-types.ts` 是手写的类型定义（**不依赖 `graphql-js`**）。新增 schema 遍历代码时扩展此文件，而不是引入外部类型。

### 在通用分发前单独处理的子命令

`admin auth`、`admin --list` / `-l`、`admin schema`（仅打印缓存路径）、`admin query`（原始 GraphQL，绕过校验但仍受 mutation 保护）。

## 编码约定

- 纯 ESM —— 即使是 `.ts` 源文件，相互 import 也必须写 `.js` 后缀（NodeNext 解析规则）。
- 所有 HTTP 请求统一走 `src/http.ts:httpPostJson`，内部用 `child_process.spawn("curl", ...)` 发送，自然继承系统代理（`HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`）和系统 CA 体系；不要在调用点重新引入 `fetch` 或重复处理代理。选择 curl 子进程而非内置 fetch 是为了兼容沙箱环境——Node 22 内置 fetch 不读代理环境变量。
- 不引入运行时依赖。测试使用 `node:test`，**不要**使用 `vitest`（即便 devDependencies 里存在）。
- 提示信息（询问、`正在拉取 schema...`、错误等）一律走 stderr；只有 GraphQL JSON 响应走 stdout。保持这一分流以确保 CLI 可被管道使用。
