# JavaScript / TypeScript 业务日志参考

> 本文件是语言特定补充，**SKILL.md 中的十条核心原则优先**。本文件**不推荐新框架**——你的第一件事永远是从项目里找到既有 logger。Node.js 服务端常见：`pino`（高性能、主流）、`winston`（功能多、常见）、`bunyan`、项目自建；浏览器端通常是项目自建 wrapper + 上报，不应直接用 `console.*` 做业务日志。

---

## 1. 如何定位项目已有的 logger

### 1.1 生产代码里的使用方式

```ts
// pino
import pino from "pino";
const logger = pino();
logger.info({ orderId, userId }, "Order created");

// winston
import { createLogger, transports, format } from "winston";
const logger = createLogger({...});
logger.info("Order created", { orderId, userId });

// bunyan
import bunyan from "bunyan";
const logger = bunyan.createLogger({ name: "order-svc" });
logger.info({ order_id: orderId }, "Order created");

// 项目自建
import { logger } from "@/lib/logger";
import { getLogger } from "./logging";
const log = getLogger("OrderService");
```

### 1.2 检索正则

```
from\s+['"]pino['"]|require\(['"]pino['"]\)|
from\s+['"]winston['"]|require\(['"]winston['"]\)|
from\s+['"]bunyan['"]|
createLogger\(|getLogger\(|
from\s+['"](\.\./)*(lib/)?logger['"]
```

### 1.3 配置位置

- `src/lib/logger.ts` / `src/config/logger.ts` / `src/logging/index.ts`
- `package.json` 的 `dependencies` 确认用的是 `pino` / `winston` / `bunyan` / 其他
- 框架默认（NestJS：`@nestjs/common` Logger；Next.js：通常用 pino 或自建）

### 1.4 识别旁路

```
console\.(log|info|warn|error|debug|trace|dir|table)\(
```

**业务代码里 `console.*` 基本都是 P0**（测试、脚本、CLI 入口除外）。典型借口：
- "只是暂时调试的"—提交前必须清
- "仓库没配 logger"—先配（或询问用户哪个库），不要长期用 console

---

## 2. 良好 / 不良示例对照

### 2.1 结构化字段（**对象在前，消息在后**是 pino / bunyan 的惯例）

```ts
// BAD：模板字符串拼接，字段无法过滤
logger.info(`processing order ${orderId} for user ${userId}`);

// BAD：把字段拼进 message 串
logger.info("processing order " + orderId);

// GOOD：pino / bunyan 风格
logger.info({ order_id: orderId, user_id: userId }, "Processing order");

// GOOD：winston 风格（meta 在后）
logger.info("Processing order", { order_id: orderId, user_id: userId });
```

字段命名与项目对齐（snake_case 或 camelCase 二选一）。

### 2.2 异步错误处理

Node 的错误既可能是抛出的 Error，也可能是 reject 的 Promise。任何异步边界都要**捕获并记录**。

```ts
// BAD：async 函数里的错误被默默吞
async function pay(orderId: string) {
    await charge(orderId);
}
pay("O-1"); // 未 await + 未 catch，Promise rejection 悄无声息

// GOOD：捕获 + 带上下文
async function pay(orderId: string, amount: number): Promise<void> {
    try {
        await charge(orderId, amount);
    } catch (err) {
        logger.error(
            { order_id: orderId, amount, err },
            "Failed to pay",
        );
        throw new ServiceError("pay failed", { cause: err });  // ES2022 cause
    }
}

// 全局兜底（顶层已做但业务也应 try/catch）
process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaught exception");
});
```

### 2.3 Error 序列化

`Error` 对象如果直接 `JSON.stringify` 会变成 `{}`（不枚举 stack/message）。使用 logger 的 error serializer：

```ts
// pino 内置 err serializer：只要 key 为 "err"，自动展开 message / stack / code
logger.error({ err }, "Failed to pay");

// 若是自定义 struct logger，手工展开
logger.error({
    order_id: orderId,
    error: { message: err.message, stack: err.stack, name: err.name, cause: err.cause },
}, "Failed to pay");
```

ES2022 的 `new Error("msg", { cause: original })` 会保留 cause chain——pino 0.8+ / winston 3 都能序列化。

### 2.4 trace_id / 请求上下文（AsyncLocalStorage）

Node 的 async 边界无法自动传 context，但 `AsyncLocalStorage` 就是 MDC 的等价物。

```ts
import { AsyncLocalStorage } from "node:async_hooks";
const store = new AsyncLocalStorage<{ traceId: string }>();

// middleware
app.use((req, res, next) => {
    const traceId = (req.headers["x-trace-id"] as string) || randomUUID();
    store.run({ traceId }, () => next());
});

// logger wrapper 在 serializer 层读取 store，把 traceId 注入每条日志
const base = pino({
    mixin() {
        return { trace_id: store.getStore()?.traceId ?? "-" };
    },
});
```

若项目已经有 `pino-http` / `@fastify/request-context` / `cls-hooked` / 自己的 context 组件，**直接复用**。

### 2.5 敏感数据脱敏

```ts
// BAD：整对象打印，password/token 泄漏
logger.info({ user }, "User login");

// GOOD：pino 自带 redact 配置（一次配置，全局生效）
const logger = pino({
    redact: {
        paths: [
            "password", "req.headers.authorization", "*.password",
            "card.number", "user.email",
        ],
        censor: "[REDACTED]",
    },
});

// GOOD：显式白名单字段
logger.info({
    user_id: user.id,
    email_masked: maskEmail(user.email),
}, "User login succeeded");
```

winston 没有内置 redact，但可以写 format：
```ts
const redact = format((info) => {
    if (info.password) info.password = "[REDACTED]";
    return info;
});
```

### 2.6 日志注入防护

```ts
const CRLF = /[\r\n\t]/g;
const safe = (s: string | undefined) => (s ? s.replace(CRLF, "_") : s);

// 结构化字段走 JSON 编码，字段值会自动转义；优先使用字段：
logger.info({ path: req.path, method: req.method }, "HTTP request received");

// 若必须放 message，先 sanitize
logger.info({ userAgent: safe(req.get("user-agent")) }, "HTTP request received");
```

### 2.7 循环 / 热点节流

```ts
// BAD
for (const msg of batch) {
    await process(msg);
    logger.info({ id: msg.id }, "processed");
}

// GOOD
let ok = 0, fail = 0;
for (const msg of batch) {
    try { await process(msg); ok++; }
    catch (err) {
        fail++;
        logger.warn({ id: msg.id, err }, "Failed to process message");
    }
}
logger.info({ total: batch.length, ok, fail, duration_ms: durMs },
    "Batch processed");
```

### 2.8 级别选择示例

```ts
logger.trace({ key }, "cache probe");                   // 默认关
logger.debug({ key }, "Cache miss");                    // 开发诊断
logger.info({ order_id, user_id }, "Order created");    // 业务事件
logger.warn({ attempt: n, cause }, "Retrying remote call"); // 可恢复
logger.error({ topic, order_id, err }, "Failed to publish event"); // 需关注失败
logger.fatal({ missing_key }, "Config missing");        // 无法继续
```

### 2.9 前端（浏览器）

前端业务日志通常不是写本地，而是**上报**（Sentry / 自建 /error log endpoint）。

```ts
// BAD：直接 console.log 做业务记录
console.log("user clicked buy");

// GOOD：统一 wrapper（项目通常已经有）
import { analytics, errorReporter } from "@/lib/telemetry";
analytics.track("buy_clicked", { sku_id, user_id });

// GOOD：异常上报
window.addEventListener("error", (e) => errorReporter.capture(e.error));
window.addEventListener("unhandledrejection", (e) => errorReporter.capture(e.reason));
```

前端日志尤其要注意**不要打用户输入原文**（XSS / PII 风险）——脱敏或只打事件名与必要 ID。

### 2.10 NestJS / Next.js / Fastify 特定

- **NestJS**：默认 Logger 可用，项目通常换成 pino（`nestjs-pino`）；使用 `@Logger(context)` 注入
- **Next.js**：server-side 用 pino/winston，client-side 用上报库；API routes 内从 req 取 logger
- **Fastify**：自带 pino，`request.log.info(...)` 直接用，自动带 reqId

---

## 3. 常见反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `console.log` / `console.error` 业务用 | 无等级、无采集、难过滤 | 项目 logger |
| 模板字符串 `logger.info(\`...${x}...\`)` | 非结构化、无法过滤字段 | K-V fields |
| `JSON.stringify(err)` | 变 `{}` 丢 stack | 直接把 err 交给 logger 自带 serializer |
| `await` 漏了 / 未 catch Promise | rejection 静默丢失 | try/catch / global handler |
| 打整段请求体 / 响应体 | 体积大 + 含敏感 | 白名单字段 |
| `JSON.stringify(user)` 含密码 | 泄漏 | pino redact / 白名单字段 |
| `require("winston")` 重复 createLogger | 多套配置 | 一个全局 logger 模块 |
| `console.error(e.message)` | 丢 stack | `logger.error({ err }, msg)` |
| 循环内 per-item info | 日志风暴 | 汇总 |
| `debugger` / `console.trace` 提交 | 调试残留 | 提交前清 |
| 使用 `new Date().toISOString()` 自己写时间戳 | 与 logger 时间格式重复 | logger 自带时间戳 |

---

## 4. 检视要点清单（JS / TS 专属）

- [ ] 业务代码里是否有 `console.*` / `debugger` / `process.stdout.write` 旁路
- [ ] 所有 async 函数的 catch 块是否把 `err` 传给 logger
- [ ] 是否配置了 `pino.redact` / winston format 做统一脱敏
- [ ] `AsyncLocalStorage` 在 Express/Koa/Fastify/Next 的 middleware 是否正确 `run` 住 context
- [ ] NestJS：是否统一用 `@nestjs/common` Logger 或 `nestjs-pino`，而非散落的 `console`
- [ ] 业务对象序列化是否用 `toJSON` / 白名单字段保护 PII
- [ ] `unhandledRejection` / `uncaughtException` 全局兜底是否已 log
- [ ] 循环 / 高并发批处理是否有未节流 INFO
- [ ] 前端业务代码是否用统一上报 wrapper 而非 `console.*`
- [ ] TS：Error 的 `cause` 是否用上（`new Error("...", { cause: e })`）而不是字符串拼接
