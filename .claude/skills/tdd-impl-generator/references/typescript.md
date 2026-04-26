# TypeScript 业务实现参考规范

> 本文件是 TypeScript **特有**部分；JS 的实现规范（实现版 JSDoc、错误 cause、Promise、DI、日志、惯用法）见 `javascript.md`。先读 JS 再读本文件。

## 目录
1. [注释格式（TSDoc 实现版）](#comments)
2. [类型约束下的实现要点](#type-impl)
3. [错误层次与判别联合的使用](#errors)
4. [异步 / 并发（TS 类型视角）](#async)
5. [tsconfig 严格度要求](#tsconfig)

---

## 注释格式（TSDoc 实现版） {#comments}

实现阶段在骨架的 TSDoc 上补充"实现策略 / 业务规则落地 / 异常处理策略"三段。由于方法签名已携带类型，**不重复** `@param {Type}`。

```ts
/**
 * 注册新用户，校验唯一性并触发欢迎邮件。
 *
 * 实现策略：
 *   "先检查后执行"：existsByEmail 前置判重，避免 DB 唯一索引异常。
 *   密码通过 passwordHasher.hash（bcrypt 封装）生成；强度因子由配置注入。
 *
 * 业务规则落地：
 *   - C-001 邮箱唯一（FR-003）：existsByEmail 前置检查
 *   - C-002 密码 bcrypt ≥ 12（SEC-001）：由 passwordHasher 保证
 *   - C-003 欢迎邮件非关键路径：独立 catch，失败仅 warn
 *
 * 异常处理策略：
 *   - 邮箱已注册 → EmailAlreadyExistsError
 *   - 入参不合法 → ValidationError
 *   - 仓库失败 → 原样上抛
 *
 * @param name 用户名（2-50）
 * @param email 邮箱，RFC 5322
 * @param password 明文密码；不会被持久化
 * @returns 新用户 UserId
 * @throws {@link ValidationError}
 * @throws {@link EmailAlreadyExistsError}
 */
async createUser(name: string, email: string, password: string): Promise<UserId> { /* ... */ }
```

### 内联注释

和 JS 一致：解释 WHY，不重复 WHAT。类型收窄处可以简要注明（帮助未来 reviewer 快速理解控制流）：

```ts
if (order == null) throw new OrderNotFoundError(orderId);
// 类型收窄：此后 order 非 nullable（TS 控制流分析）

if (order.status !== "PENDING_PAYMENT") {
    // 非 PENDING_PAYMENT：判别联合保证其他分支已被调用方覆盖；此处直接抛错即可
    throw new InvalidOrderStatusError(order.status);
}
```

---

## 类型约束下的实现要点 {#type-impl}

1. **不使用 `any` / `as any` / `@ts-ignore`** 消除错误。实在无法避免须 `@ts-expect-error` + 解释，并在 deviations 中登记
2. 使用 `readonly` 修饰字段，让实现自然倾向不可变；修改状态返回新对象
3. 使用**品牌类型**（branded type）避免 ID 混淆：
   ```ts
   export type UserId = string & { readonly __brand: "UserId" };
   export const toUserId = (s: string): UserId => s as UserId;
   ```
4. **判别联合**替代枚举 + switch，借助 TS 的穷尽检查避免漏分支：
   ```ts
   type PaymentResult =
       | { kind: "ok"; paymentId: string }
       | { kind: "declined"; reason: string }
       | { kind: "network_error"; retryable: boolean };

   function summarize(r: PaymentResult): string {
       switch (r.kind) {
           case "ok":             return `paid ${r.paymentId}`;
           case "declined":       return `declined: ${r.reason}`;
           case "network_error":  return r.retryable ? "retrying" : "giving up";
           default: {
               const _exhaustive: never = r;
               throw new Error(`unhandled: ${String(_exhaustive)}`);
           }
       }
   }
   ```
5. **接口契约**：实现类用 `implements`，骨架若使用 `satisfies` 请保留语义

---

## 错误层次与判别联合的使用 {#errors}

```ts
// src/errors/index.ts
export class DomainError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = this.constructor.name;
    }
}
export class ValidationError extends DomainError {}
export class EmailAlreadyExistsError extends DomainError {
    readonly email: string;
    constructor(email: string, options?: ErrorOptions) {
        super(`Email already registered: ${email}`, options);
        this.email = email;
    }
}
```

### 业务结果的两种表达

- **抛异常**：适合"调用方必须处理"的失败路径
- **判别联合返回**：适合调用方要基于结果枚举分支（避免 try/catch 控制流）

```ts
async function registerUser(cmd: RegisterCommand): Promise<
    | { kind: "ok"; userId: UserId }
    | { kind: "email_taken"; email: string }
    | { kind: "validation_failed"; reason: string }
> {
    if (!isValidEmail(cmd.email)) return { kind: "validation_failed", reason: "email" };
    if (await repo.existsByEmail(cmd.email)) return { kind: "email_taken", email: cmd.email };
    const saved = await repo.save(/* ... */);
    return { kind: "ok", userId: saved.id };
}
```

---

## 异步 / 并发（TS 类型视角） {#async}

- 返回 `Promise<T>` 时，实现必须保持返回同构；不要 `Promise<T | undefined>` 悄悄放宽类型
- `await` 的结果类型自动展开，不要把 `Promise<T>` 放进 `any` 上下文
- `Promise.all` 保持元组类型推断，读取时解构即可；`Promise.allSettled` 适合"允许部分失败"的场景
- 并发上限库（`p-limit` / `p-queue`）配合泛型保留元素类型

```ts
const [user, prefs]: [User, Preferences] = await Promise.all([
    repo.findById(id),
    prefs.findByUser(id),
]);
```

### 异步迭代

```ts
// for...of 与 AsyncIterable<T> 配合，保留 T
for await (const event of stream) { await handle(event); }
```

---

## tsconfig 严格度要求 {#tsconfig}

实现代码必须能在以下选项下编译通过：

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "exactOptionalPropertyTypes": true,
  "useUnknownInCatchVariables": true
}
```

`useUnknownInCatchVariables` 开启后 `catch` 变量类型为 `unknown`，必须先收窄：

```ts
try {
    await dangerous();
} catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    if (err instanceof Error) {
        throw new InfrastructureError("unexpected", { cause: err });
    }
    throw new InfrastructureError(`non-error thrown: ${String(err)}`);
}
```

---

## 实现阶段 Checklist（TS 补充）

- [ ] 无 `any` / `as any` / `@ts-ignore`；必要的 `@ts-expect-error` 有解释并登记 deviations
- [ ] `readonly` / 不可变更新风格保持一致
- [ ] 判别联合使用穷尽检查（`never` 兜底或 `satisfies never`）
- [ ] 品牌类型正确使用；不在边界外用裸 `string` 替代 UserId 等
- [ ] `catch` 变量作为 `unknown` 处理，显式 instanceof 收窄
- [ ] 无 `export const enum` 跨包共享（兼容性陷阱）
- [ ] tsc --noEmit 通过，无类型错误
- [ ] 通用实现规范（见 `javascript.md`）已满足：实现版注释、cause 链、Promise 正确处理、日志、DI
