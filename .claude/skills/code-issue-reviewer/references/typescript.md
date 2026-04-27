# TypeScript 专属补充

> 与 `javascript.md` 叠加使用：先读 JS 通用规范，再读本文件 TS 特有补充。

TypeScript 给了类型系统但**类型只在编译期成立**——运行时仍是 JS。审视 TS 代码的核心是查"类型保证 vs 运行时实际"的裂缝。

---

## 维度 1 · null_safety

### 类型逃逸的几种方式

```ts
// 1. any 关闭检查
function f(x: any) { x.foo.bar; }   // 类型层无 NPE，运行时 throw

// 2. 类型断言（assertion）
const u = data as User;   // 强制相信，运行时未必符合

// 3. 非空断言（!）
const name = user!.name;  // 编译期消除 undefined，运行时若是 undefined 即崩

// 4. 反序列化未校验
const u: User = JSON.parse(req.body);   // 类型谎言，字段缺失静默
```

**审视要点**：
- 找 `as `（类型断言）的所有使用，特别是来自外部输入（fetch / form / req）后立即断言为业务类型
- 找 `!`（非空断言）—— 大多数情况下是埋雷；只有"逻辑上一定非空但 TS 推不出"才合理
- 找 `any` / `unknown` 后链式 `.field`
- 找 `// @ts-ignore` / `// @ts-expect-error`，每条都应配理由注释；无理由的视为缺陷

### tsconfig 信号

`strict: true`（含 `strictNullChecks`、`noImplicitAny`、`strictPropertyInitialization` 等）必须开启。若关闭，整体 NPE 维度严重度上调。

---

## 维度 2 · resource_leak

类型层无资源生命周期约束 → 完全靠 JS 模式。无 TS 特异点。

但 React + TS 有**类型化但实际无关闭**的 hooks：

```ts
useEffect(() => {
  const sub = obs.subscribe(...);
  // 类型上 obs 被 typed，但忘 return cleanup 编译过
});
```

`@typescript-eslint/no-floating-promises` 能捕获 fire-and-forget Promise（关联维度 6）。

---

## 维度 3 · concurrency

无 TS 特异点；同 javascript.md。

---

## 维度 4 · performance

- 复杂泛型类型推导在编译期慢（不影响运行期，但影响开发体验）
- 运行期 `instanceof` 检查 vs 类型守卫：`isUser(x): x is User` 仅类型层，运行期仍要写实际判定
- `class-validator` / `zod` 在每请求 parse 是 CPU 开销（合理但要意识到）

---

## 维度 5 · memory

无 TS 特异点。

---

## 维度 6 · error_handling

```ts
// BAD — catch 块的 e 在 TS 4.4+ 默认 unknown
try { ... } catch (e) {
  e.message;  // TS error: 'e' is of type 'unknown'
}

// GOOD
try { ... } catch (e) {
  if (e instanceof Error) logger.error("failed", { msg: e.message });
  else logger.error("failed", { e: String(e) });
  throw e;
}
```

- `useUnknownInCatchVariables: true`（TS 4.4 默认）→ catch e 是 unknown，必须类型守卫
- `Promise<T>` 的 `.catch` 回调参数也是 unknown
- 自定义 Error 类型继承 `Error`：必须 `Object.setPrototypeOf(this, MyError.prototype)` 否则 `instanceof` 不工作（TS target ES5）

---

## 维度 7 · external_call

无 TS 特异点；但 `fetch` 返回的 `Response.json()` 是 `Promise<any>`（TS 5.x）→ 必须用 zod / io-ts 校验

```ts
// BAD
const data = await res.json() as User;   // 类型谎言

// GOOD
const data = UserSchema.parse(await res.json());
```

---

## 维度 8 · boundary

- `number` 不区分 int/float；超 2^53 用 `bigint`（注意 JSON 序列化丢失，需自定义 reviver）
- 索引签名 `Record<string, T>` 取值类型是 `T`，但运行时可能 undefined（开 `noUncheckedIndexedAccess` 修正）
- 元组越界访问类型是 union 中的成员，运行时是 undefined

---

## 维度 9 · observability

- 项目通常有类型化 logger contract（`interface Logger { info(msg: string, meta?: object): void; ... }`）
- `console.*` 旁路检测同 JS

---

## 维度 10 · config_env

- `process.env` 类型是 `Record<string, string | undefined>` → 必须校验存在
- 推荐 `zod` schema 包装 env：

```ts
const env = z.object({
  DB_HOST: z.string().min(1),
  PORT: z.string().transform(Number).pipe(z.number().int().positive()),
}).parse(process.env);
```

---

## 维度 11 · data_consistency

无 TS 特异点。

---

## 维度 12 · time_encoding

- `Date` 类型在 TS 中只是别名；时区问题同 JS
- `BigInt` 序列化：`JSON.stringify(BigInt(1))` 抛 TypeError → 需 toJSON

---

## 维度 13 · api_compat

TS 项目对外 API 的破坏面更广：

- 公开类型导出（`export type`）变更 → 上游 ts 编译失败
- `interface` 加必填字段 → 实现方破坏（加可选 `?` 为兼容）
- enum 重排（数字 enum）→ 序列化值变化（用 string enum 更安全）
- 函数重载顺序变更（TS 重载解析依赖顺序）
- 包发布缺 `.d.ts` 或 `.d.ts` 滞后 → 上游 type 错乱

```ts
// BAD — 数字 enum
enum Status { Active, Inactive }   // 0, 1
// 重排为 enum Status { Inactive, Active } 序列化值翻转

// GOOD
enum Status { Active = "active", Inactive = "inactive" }
```

---

## tsconfig 关键开关（影响审视严重度判断）

| 开关 | 推荐值 | 不开启时的影响 |
|------|------|--------------|
| `strict` | true | 整体类型保证降级，多维度严重度 +1 |
| `noUncheckedIndexedAccess` | true | 数组 / 索引访问遗漏 undefined 判定 |
| `exactOptionalPropertyTypes` | true | `x: T \| undefined` vs `x?: T` 区别消失 |
| `useUnknownInCatchVariables` | true (4.4 默认) | catch 变量是 any，e.message 不报错但运行期可能崩 |
| `noImplicitOverride` | true | 子类方法签名漂移不感知 |
| `verbatimModuleSyntax` | true | 类型 import / value import 混淆 |

---

## 工具与生态信号

- 项目有 `zod` / `io-ts` / `class-validator` → 输入校验已强制；boundary 维度好
- 含 `@typescript-eslint/strict-boolean-expressions` → null/undefined 检查严格
- 含 `tsx` / `ts-node` 开发时跑 → 注意类型与运行时不同步
- monorepo + `references` → 跨包 API 兼容尤为关键
- 用 `tRPC` / `GraphQL Code Generator` → 类型契约生成；改后客户端编译失败 = 早发现破坏
