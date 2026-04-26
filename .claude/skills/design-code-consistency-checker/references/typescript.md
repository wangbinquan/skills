# TypeScript 一致性核对盲点

## 1. 结构维度

- **`tsconfig.json` strict 是否启用**：`strict: false` 时类型注解大量失效；设计要求强类型 → 必须 strict。
- **`type` vs `interface`**：合并语义不同；设计要求"不可扩展" → 用 `type`。
- **`readonly` 与 `as const`**：设计要求"不可变" → 漏 readonly 致运行时被改。
- **`?` 可选属性 vs `| undefined`**：语义近似但不等同（exactOptionalPropertyTypes）。
- **泛型约束 `extends`**：放宽约束直接破坏调用方契约。
- **declaration merging**：`interface X` 多处声明会自动合并，意外扩展接口面。
- **`namespace` vs ES module**：内部命名空间被滥用阻碍 tree-shaking。
- **`enum` vs union literal**：`enum` 编译产物大；设计若为类型而非运行时 → 用 union。

## 2. 行为维度

- **Promise 链断裂**：未 await / 未 catch；设计要求"必须等待" → 漂浮 promise 被 ESLint `no-floating-promises` 检出。
- **`any` 渗入**：第三方库 `any` 通过 generic 传染至业务层。
- **`==` vs `===`**：设计要求严格相等。
- **数组方法的 in-place vs 返回新值**：`sort` / `reverse` 改原数组，与"不可变"承诺冲突。
- **null vs undefined**：JSON 反序列化只能产 null；模型字段类型如 `T | undefined` 则反序列化失败。
- **Date 时区**：JS Date 默认本地时区；设计要求 UTC → 必须显式 `toISOString()`。
- **错误丢弃**：`.catch(e => console.log(e))` 不等于处理；设计要求传播。

## 3. 接口契约维度

- **Express / Fastify / Nest**：路由定义、`@Body()` `@Query()` 装饰器与设计字段对齐。
- **zod / class-validator**：validation schema 与 DTO 定义双重维护，易漂移；优先单一来源（zod 推断）。
- **OpenAPI 生成**：tsoa / nestjs-swagger 装饰器与设计文档一致；运行时与编译时元数据。
- **JSON 字段命名**：`camelCase` vs `snake_case`；自动转换 middleware 是否生效。
- **响应体形态**：成功包装 `{ data, code, message }` 与设计统一。

## 4. 数据模型维度

- **TypeORM / Prisma / Drizzle**：实体字段与 DDL 一致；Prisma `@db.VarChar(256)`、`@unique`、`@@index`。
- **migration 状态**：`prisma migrate status` 是否 in sync。
- **decimal 精度**：金额字段必须 `Decimal` / 字符串，不能 number。
- **JSON 字段反序列化**：`JSON.parse` 失败处理。

## 5. 配置维度

- **环境变量类型**：`process.env.X` 总是 `string | undefined`，设计为数字时需显式 parse + 校验。
- **dotenv 顺序**：`.env` / `.env.local` / `.env.production` 优先级与设计一致。
- **NestJS ConfigModule**：`isGlobal` 与作用域。

## 6. 依赖维度

- **package.json dependencies vs devDependencies**：build-time vs runtime。
- **lock 文件**：`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` 必须提交。
- **Node 版本**：`engines.node` 与 CI / Dockerfile 一致。
- **types 包**：`@types/X` 与运行时 X 版本是否同主线。

## 7. 非功能维度

- **日志**：`console.log` 绕过 winston/pino。
- **trace_id 透传**：异步上下文 `AsyncLocalStorage` 是否使用。
- **CORS**：`origin: '*'` 与设计白名单冲突。
- **rate limiting**：express-rate-limit 配置与设计 QPS。
- **helmet / 安全头**：是否启用。
- **PII 脱敏**：日志 logger.info({ user }) 输出整个对象。

## 8. 测试维度

- **jest config**：`testMatch`、`coverageThreshold`、`transformIgnorePatterns`。
- **mock**：`jest.mock(...)` 顶层提升与 ESM 差异。
- **async test**：必须 await 或返回 promise，否则异步断言不生效。
- **flaky timer**：`setTimeout` 测试需 `jest.useFakeTimers()`。

## 9. 文档维度

- **TSDoc** 注释与签名同步；`@deprecated` 标注与设计声明一致。
- **README 启动命令**：`npm run dev` 等是否仍可用。
- **API 文档**：`@nestjs/swagger` / `tsoa` 元数据与设计接口一致。

## 推荐 grep 模式

| 用途 | 模式 |
|------|------|
| 绕过日志 | `console\.(log\|info\|warn\|error\|debug)` |
| 漂浮 promise | `\.\.\.\)$` 配合 promise 调用（更可靠用 ESLint） |
| any 渗入 | `:\s*any\b\|<any>` |
| 路由 | `(app\|router)\.(get\|post\|put\|delete\|patch)\(` |
| 装饰器 | `^@(Get\|Post\|Put\|Delete\|Patch\|Controller\|Body\|Query\|Param)\(` |
| 配置读取 | `process\.env\.\|ConfigService\.` |
| 弱比较 | `==[^=]\|!=[^=]` |
