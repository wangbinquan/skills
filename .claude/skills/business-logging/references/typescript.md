# TypeScript 业务日志参考

> 本文件是 TypeScript **特有**部分；通用规范（如何定位项目已有 logger、结构化字段、`AsyncLocalStorage` 注入 trace_id、敏感数据脱敏、CRLF 防注入、前端上报）见 `javascript.md`。**先读 `javascript.md`，再读本文件。**

TypeScript 的日志库与 JS 完全相同（pino / winston / bunyan / 自建 wrapper），差异主要在**类型约束**与**编译期能捕获的坑**。

---

## 1. 类型化 logger 契约

项目若有自建封装，优先声明**统一接口**，避免各处 `any`：

```ts
// src/lib/logger.ts
export interface BizLogger {
    trace(obj: Record<string, unknown>, msg: string): void;
    debug(obj: Record<string, unknown>, msg: string): void;
    info(obj: Record<string, unknown>, msg: string): void;
    warn(obj: Record<string, unknown>, msg: string): void;
    error(obj: Record<string, unknown> & { err?: unknown }, msg: string): void;
    fatal(obj: Record<string, unknown> & { err?: unknown }, msg: string): void;
    child(bindings: Record<string, unknown>): BizLogger;
}

// pino 可直接 satisfies BizLogger；winston 需写 adapter
```

**不要** `const log: any = require("pino")()` — 丢掉类型意味着所有字段拼写错误都在运行期才暴露。

---

## 2. `unknown` catch 与 Error 序列化

`tsconfig` 启用 `useUnknownInCatchVariables: true`（strict 默认启用）后，`catch (err)` 的类型是 `unknown`，直接 `logger.error({ err }, ...)` 是安全的（logger 的 err serializer 自行处理）；但**访问字段前必须收窄**：

```ts
try {
    await charge(orderId, amount);
} catch (err: unknown) {
    logger.error({ order_id: orderId, amount, err }, "Failed to charge");

    if (err instanceof NetworkError) {
        // 显式区分可重试 / 不可重试
        throw new RetryableError("charge failed", { cause: err });
    }
    throw err instanceof Error
        ? new ServiceError("charge failed", { cause: err })
        : new ServiceError(`charge failed: ${String(err)}`);
}
```

**不要** `catch (err: any)` 绕过收窄，这等于放弃了 `useUnknownInCatchVariables` 的保护。

---

## 3. 判别联合驱动的级别选择

返回判别联合（而非抛异常）的领域操作，按 `kind` 分支选择日志级别，让级别与结果类型一一对应：

```ts
type ChargeResult =
    | { kind: "ok"; paymentId: string }
    | { kind: "declined"; reason: string }      // 用户侧/业务错误
    | { kind: "network_error"; retryable: boolean }; // 系统侧错误

const r = await gateway.charge(amount, token);
switch (r.kind) {
    case "ok":
        logger.info({ order_id, payment_id: r.paymentId }, "Payment succeeded");
        break;
    case "declined":
        // 用户输入/业务拒绝：INFO/WARN，不是 ERROR
        logger.warn({ order_id, reason: r.reason }, "Payment declined");
        break;
    case "network_error":
        logger.error({ order_id, retryable: r.retryable }, "Payment gateway network error");
        break;
    default: {
        const _exhaustive: never = r; // 编译期保证不漏分支
        throw new Error(`unhandled: ${String(_exhaustive)}`);
    }
}
```

编译器兜底 `never` 能在增加新分支时**强制**你决定它的日志级别。

---

## 4. 字段类型与脱敏工具的类型标注

结构化字段的 key 用 `as const` 或类型常量集中管理，避免拼写漂移：

```ts
const LogField = {
    ORDER_ID: "order_id",
    USER_ID: "user_id",
    TRACE_ID: "trace_id",
    DURATION_MS: "duration_ms",
} as const;

logger.info(
    { [LogField.ORDER_ID]: orderId, [LogField.USER_ID]: userId },
    "Order created",
);
```

脱敏函数用**品牌类型（branded type）**标注已脱敏的值，防止未脱敏字符串误入日志：

```ts
type Masked<T extends string> = T & { readonly __masked: true };

export function maskEmail(s: string): Masked<string> {
    const [local, domain] = s.split("@");
    return `${local.slice(0, 1)}***@${domain}` as Masked<string>;
}

// logger wrapper 要求敏感位必须是 Masked<string>
interface UserLogFields {
    user_id: string;
    email_masked?: Masked<string>; // 未脱敏的 string 传入会编译失败
}
```

---

## 5. Promise 与类型一致的错误传播

返回 `Promise<T>` 的业务函数**不要**悄悄放宽为 `Promise<T | undefined>` 或 `Promise<T | null>` 来兼容失败——失败应通过异常或判别联合表达；日志在调用点记录：

```ts
// BAD：类型上无法区分"真的没有"和"出错了"
async function findOrderSafe(id: string): Promise<Order | undefined> {
    try { return await repo.findById(id); }
    catch (err) { logger.warn({ id, err }, "findOrder failed"); return undefined; }
}

// GOOD：失败通过判别联合暴露，调用方按 kind 决定日志
async function findOrder(id: string): Promise<
    | { kind: "found"; order: Order }
    | { kind: "not_found" }
    | { kind: "error"; err: unknown }
> { /* ... */ }
```

---

## 6. `tsc --noEmit` 与 lint 协同

配合 ESLint 规则把常见日志旁路编译期卡住：

- `no-console`（业务目录启用，脚本/CLI 目录关闭）
- `@typescript-eslint/no-floating-promises`（未处理的 Promise rejection）
- `@typescript-eslint/no-misused-promises`（把 async 当 void 用）
- `no-restricted-syntax` 禁用 `console.log` 之外的变体（`console.dir/table/trace`）
- 自定义规则：禁止 `logger.info(\`...${x}...\`)` 这类模板字符串拼接，强制对象在前

---

## 7. 检视要点清单（TS 专属补充；JS 清单仍适用）

- [ ] `catch (err: unknown)` 默认，访问字段前显式收窄（`err instanceof Error` / 自定义守卫）
- [ ] 没有 `catch (err: any)` 绕过类型保护
- [ ] logger 调用点字段类型与 `BizLogger` / field schema 对齐，无 `as any`
- [ ] 敏感字段用品牌类型（`Masked<string>`）强制脱敏
- [ ] 判别联合 switch 使用 `never` 兜底，保证新分支必须决定日志级别
- [ ] `Promise<T>` 未被悄悄放宽为 `Promise<T | undefined>` 掩盖失败
- [ ] ESLint：`no-floating-promises` / `no-misused-promises` / `no-console`（业务目录）已开启
- [ ] `tsc --noEmit` 通过，无 `@ts-ignore` / `@ts-expect-error` 绕过日志处的类型检查
- [ ] 通用规范（见 `javascript.md`）已满足：结构化字段、`AsyncLocalStorage` 注入 trace_id、redact 配置、CRLF 防注入、前端上报
