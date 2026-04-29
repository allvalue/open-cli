# @allvalue/open-cli

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@allvalue/open-cli.svg)](https://www.npmjs.com/package/@allvalue/open-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

AllValue 官方 CLI 工具，让人类和 AI Agent 都能在终端中操作 AllValue 电商平台。覆盖商品、订单、库存、营销、履约等核心电商域，支持 25+ Query、40+ Mutation。

[安装](#安装与快速开始) · [认证](#认证) · [核心场景](#核心场景) · [命令参考](#命令参考) · [进阶用法](#进阶用法)

---

## 为什么选 allvalue-open-cli？

- **商家视角原生设计** — 围绕经营数据、库存预警、订单履约、竞对洞察等真实场景打磨
- **AI Agent 就绪** — 结构化输出、明确错误信息，Agent 调用成功率高
- **GraphQL 全覆盖** — 命名调用（参数校验）与原始模式双轨，覆盖全量 Admin API
- **安全门控** — Mutation 默认禁止，需显式 `--allow-mutations`，防止误操作
- **零依赖** — 纯 Node.js 内置模块，`npm install -g` 即用

---

## 功能覆盖

| 业务域 | 能力 |
|---|---|
| 🛒 商品 | 列表、详情、变体查询，批量上下架、创建、更新、删除 |
| 📦 订单 | 查询、状态筛选、取消、完成、退款、标签管理 |
| 🚚 履约 | 履约单查询、创建、取消，物流信息更新 |
| 👥 客户 | 列表、详情、积分查询，创建、更新、删除、邀请邮件 |
| 🏪 店铺 | 基本信息、Logo、域名管理、主域名设置 |
| 🎨 主题 | 主题查询、创建、更新、发布、删除（Web/移动端） |
| 🔗 Webhook | 监听器注册/删除，事件列表查询与重发 |
| 📋 草稿单 | 草稿订单创建、查询、完成 |

---

## 安装与快速开始

**环境要求：** Node.js >= 22

```bash
npm install -g @allvalue/open-cli
```

### 快速开始（人类用户）

```bash
# 1. 认证
allvalue-open admin auth

# 2. 查看所有命令
allvalue-open admin --list

# 3. 开始使用
allvalue-open admin orders --variables '{"first":10}'
```

### 快速开始（AI Agent）

```bash
# 安装并认证
npm install -g @allvalue/open-cli
allvalue-open admin auth

# 验证
allvalue-open admin shop
```

---

## 认证

```bash
allvalue-open admin auth
```

输入店铺域名、账号和密码（密码不显示明文），AccessToken 自动保存到 `~/.allvalue-open.json`，后续命令无需重复输入。

**Token 优先级：** `--token` 参数 > `admin auth` 保存的 accessToken

---

## 核心场景

### 📊 经营数据播报

让 AI Agent 成为你的"数字主播"——每日自动汇总销售额、订单量，一句话战报比盯着报表轻松十倍。

```bash
# 最新订单（按时间倒序）
allvalue-open admin orders \
  --variables '{"first":50,"sortKey":"CREATED_AT","reverse":true}'

# 店铺基本信息
allvalue-open admin shop

# 指定时间段订单
allvalue-open admin orders \
  --variables '{"first":100,"query":"created_at:>2024-01-01 created_at:<2024-02-01"}'
```

> 配合 AI Agent：「今天卖了多少钱？哪个 SKU 卖得最好？」

---

### 🔔 库存与售后智能提醒

库存告急自动预警补货，退款积压催促处理——让 Agent 替你盯着店铺，不错过任何关键事件。

```bash
# 未履约订单
allvalue-open admin orders \
  --variables '{"first":30,"query":"fulfillment_status:unfulfilled financial_status:paid"}'

# 草稿单列表
allvalue-open admin draft-orders --variables '{"first":20}'
```

---

### 📦 订单处理自动化

批量查询待发货订单、触发履约、更新物流——让 Agent 接管重复性工作。

```bash
# 创建履约单（需 --allow-mutations）
allvalue-open admin fulfillment-create \
  --variables '{"fulfillment":{"orderId":"gid://allvalue/Order/123"}}' \
  --allow-mutations

# 更新物流信息
allvalue-open admin fulfillment-tracking-info-update \
  --variables '{"fulfillmentId":"gid://allvalue/Fulfillment/456","trackingInfoInput":{"number":"SF1234567890","company":"顺丰"}}' \
  --allow-mutations

# 为订单打标签
allvalue-open admin order-tagging \
  --variables '{"orderId":"gid://allvalue/Order/123","tags":["已处理"]}' \
  --allow-mutations
```

---

### 🛒 商品批量管理

批量上下架、更新价格、同步库存——告别手动操作后台。

```bash
# 商品列表
allvalue-open admin products --variables '{"first":20,"query":"title:T恤"}'

# 批量上架（需 --allow-mutations）
allvalue-open admin product-bulk-on-shelves \
  --variables '{"ids":["gid://allvalue/Product/1","gid://allvalue/Product/2"]}' \
  --allow-mutations

# 更新商品变体
allvalue-open admin product-variant-update \
  --variables '{"input":{"id":"gid://allvalue/ProductVariant/789","price":"99.00"}}' \
  --allow-mutations
```

---

### 📱 移动端随时查

出差在外，手机问 AI Agent 一句话，秒出结果。

```bash
# 快速查询最新 5 条订单
allvalue-open admin orders \
  --variables '{"first":5,"sortKey":"CREATED_AT","reverse":true}'

# 查询客户积分
allvalue-open admin points \
  --variables '{"customerId":"gid://allvalue/Customer/123"}'
```

---

## 命令参考

### 核心命令速查

| 命令 | 说明 |
|---|---|
| `admin orders` | 列出订单列表 |
| `admin order` | 根据 ID 查询订单详情 |
| `admin products` | 列出商品列表 |
| `admin product` | 根据 ID 查询商品信息 |
| `admin customers` | 列出客户列表 |
| `admin shop` | 获取店铺信息 |
| `admin fulfillment-create` | 给订单创建履约单 |
| `admin order-refund` | 订单退款 |
| `admin product-bulk-on-shelves` | 批量上架商品 |
| `admin webhook-register` | 注册 Webhook 监听 |

<details>
<summary>查看全部 25+ Query 命令</summary>

| 命令 | 说明 |
|---|---|
| `admin affiliate-orders` | 联盟订单查询 |
| `admin collection` | 根据 ID 查询分组 |
| `admin collections` | 列出店铺分组 |
| `admin customer` | 根据 ID 查询客户 |
| `admin customers` | 列出客户列表 |
| `admin delivery-profile` | 查询具体运费模板 |
| `admin delivery-profiles` | 查询所有运费模板 |
| `admin domains` | 获取店铺域名信息 |
| `admin draft-order` | 根据 ID 查询草稿单 |
| `admin draft-orders` | 列出草稿单列表 |
| `admin fulfillment` | 根据 ID 查询履约信息 |
| `admin fulfillment-services` | 查询履约服务商列表 |
| `admin order` | 根据 ID 查询订单详情 |
| `admin orders` | 列出订单列表 |
| `admin points` | 根据客户 ID 查询积分 |
| `admin product` | 根据 ID 查询商品 |
| `admin product-by-handle` | 根据 handle 查询商品 |
| `admin products` | 列出商品列表 |
| `admin shop` | 获取店铺信息 |
| `admin shop-logo` | 获取店铺 Logo |
| `admin theme` | 根据 ID 查询主题 |
| `admin themes` | 搜索主题列表 |
| `admin webhook-events` | 分页查询 Webhook 事件 |
| `admin webhooks` | 分页查询 Webhook 监听器 |

</details>

<details>
<summary>查看全部 40+ Mutation 命令</summary>

| 命令 | 说明 |
|---|---|
| `admin customer-create` | 创建客户 |
| `admin customer-delete` | 删除客户 |
| `admin customer-send-invite-email` | 发送客户邀请邮件 |
| `admin customer-update` | 更新客户 |
| `admin delivery-profile-create` | 创建运费模板 |
| `admin delivery-profile-delete` | 删除运费模板 |
| `admin delivery-profile-update` | 更新运费模板 |
| `admin domain-create` | 创建域名 |
| `admin domain-delete` | 删除域名 |
| `admin draft-order-complete` | 完成草稿单 |
| `admin draft-order-create` | 创建草稿单 |
| `admin fulfillment-cancel` | 取消履约单 |
| `admin fulfillment-create` | 创建履约单 |
| `admin fulfillment-tracking-info-update` | 更新物流跟踪信息 |
| `admin mobile-theme-create` | 创建移动版主题 |
| `admin order-cancel` | 取消订单 |
| `admin order-complete` | 完成订单 |
| `admin order-refund` | 订单退款 |
| `admin order-tagging` | 为订单添加标签 |
| `admin order-untagging` | 从订单移除标签 |
| `admin points-adjust` | 调整客户积分 |
| `admin primary-domain-set` | 设置主域名 |
| `admin product-bulk-deletes` | 批量删除商品 |
| `admin product-bulk-off-shelves` | 批量下架商品 |
| `admin product-bulk-on-shelves` | 批量上架商品 |
| `admin product-create` | 创建商品 |
| `admin product-update` | 更新商品 |
| `admin product-variant-update` | 更新商品变体 |
| `admin storefront-access-token-create` | 创建前端访问 Token |
| `admin storefront-access-token-delete` | 删除前端访问 Token |
| `admin theme-delete` | 删除主题 |
| `admin theme-deploy` | 发布主题 |
| `admin theme-update` | 更新主题 |
| `admin update-shop-logo` | 更新店铺 Logo |
| `admin webhook-event-replay` | 重发 Webhook 事件 |
| `admin webhook-register` | 注册 Webhook 监听 |
| `admin webhook-remove` | 删除 Webhook 监听 |
| `admin web-theme-create` | 创建 Web 版主题 |

</details>

### 常用操作

```bash
allvalue-open admin --list                                    # 列出所有命令
allvalue-open admin <命令名>                                  # 查看参数说明
allvalue-open admin <命令名> --variables '<json>'            # 执行查询
allvalue-open admin query --query '<graphql>'                # 原始 GraphQL 模式
allvalue-open admin schema                                    # 查看 schema 缓存路径
```

---

## 进阶用法

### CI/CD 集成

```bash
allvalue-open admin orders --variables '{"first":10}' --token <your-token>
```

### 从文件读取

```bash
allvalue-open admin query \
  --query-file ./report.graphql \
  --variable-file ./vars.json
```

### 与 AI Agent 集成

将 `allvalue-open` 作为 AI Agent 工具，结合自然语言指令完成经营数据播报、库存预警、订单自动化、爆款趋势分析等任务。

---

## 许可证

MIT
