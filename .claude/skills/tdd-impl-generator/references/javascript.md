# JavaScript 业务实现参考规范

> 本文件面向 TDD 实现阶段：读取骨架（含 TODO）、需求与设计文档，将 TODO 替换为完整业务逻辑，保留方法签名与 JSDoc 结构，补充 "实现决策记录" 注释。

## 目录
1. [注释格式（实现版 JSDoc）](#comments)
2. [错误类层次与 `cause` 链](#errors)
3. [异步代码与 Promise 规范](#async)
4. [依赖注入与不可变性](#di)
5. [日志/可观测性最佳实践](#logging)
6. [常见惯用法](#idioms)

---

## 注释格式（实现版 JSDoc） {#comments}

骨架阶段的 JSDoc 只写"实现思路"和"实现步骤"。实现阶段在其基础上**补充**以下字段：

```js
/**
 * 注册新用户，校验唯一性并触发欢迎邮件。
 *
 * 实现策略：
 *   "先检查后执行"：调用 existsByEmail 前置判重，避免依赖数据库
 *   唯一索引异常；密码使用 bcrypt 哈希（强度因子 12）。
 *
 * 业务规则落地：
 *   - C-001 邮箱唯一（FR-003）：existsByEmail 前置检查；失败抛业务错误而非 DB 错误
 *   - C-002 密码 bcrypt ≥ 12（SEC-001）：通过 passwordHasher.hash 封装，强度因子由配置注入
 *   - C-003 欢迎邮件非关键路径（设计 4.2.3）：await 的 promise 独立 catch，失败仅记录日志
 *
 * 异常处理策略：
 *   - 邮箱已注册 → EmailAlreadyExistsError（业务异常 → HTTP 409）
 *   - 入参不合法 → ValidationError（业务异常 → HTTP 400）
 *   - 仓库/哈希失败 → 原样上抛（基础设施异常 → HTTP 500）
 *
 * @param {string} name - 用户名，长度 2-50
 * @param {string} email - 邮箱，RFC 5322 格式
 * @param {string} password - 明文密码；不会被持久化
 * @returns {Promise<string>} 新用户 id
 * @throws {ValidationError}
 * @throws {EmailAlreadyExistsError}
 */
async createUser(name, email, password) { /* ... */ }
```

### 内联注释（解释 WHY）

```js
// 邮箱唯一性在写入前用轻量 COUNT 查询检查，而非读取完整实体，
// 避免持有游离对象引发后续 ORM 层竞态（设计文档 4.3.1）
if (await this.#userRepository.existsByEmail(email)) {
    throw new EmailAlreadyExistsError(email);
}

// 密码哈希必须在事务内完成；rawPassword 不得出现在任何日志中
const passwordHash = await this.#passwordHasher.hash(password);

// 欢迎邮件 fire-and-forget：失败仅记录 warn，不回滚注册事务
// 邮件服务 SLA 独立于用户注册 SLA（设计文档 4.2.3）
void this.#emailService.sendWelcomeAsync(email, name).catch((err) => {
    this.#logger.warn({ email, err }, "Failed to send welcome email");
});
```

### 分步骤注释块

步骤 ≥ 3 的方法使用 `=== Step N: 标题 ===` 分隔：

```js
async createUser(name, email, password) {
    // === Step 1: 入参校验 ===
    // 在进入业务前统一校验，保证后续步骤前置条件
    // 校验规则：需求 FR-001 ~ FR-003
    this.#validateInput(name, email, password);

    // === Step 2: 邮箱唯一性 ===
    if (await this.#userRepository.existsByEmail(email)) {
        throw new EmailAlreadyExistsError(email);
    }

    // === Step 3: 密码哈希 + 构建 + 持久化 ===
    const user = {
        name,
        email,
        passwordHash: await this.#passwordHasher.hash(password),
        status: "PENDING_VERIFY",
        createdAt: new Date(),
    };
    const saved = await this.#userRepository.save(user);

    // === Step 4: 欢迎邮件（非关键路径）===
    void this.#emailService.sendWelcomeAsync(email, name)
        .catch((err) => this.#logger.warn({ email, err }, "welcome email failed"));

    return saved.id;
}
```

---

## 错误类层次与 `cause` 链 {#errors}

### 错误类的定义

```js
// src/errors/index.js
export class DomainError extends Error {
    constructor(message, options) {
        super(message, options); // options.cause 由 ES2022 原生支持
        this.name = this.constructor.name;
    }
}

export class ValidationError extends DomainError {}
export class EmailAlreadyExistsError extends DomainError {
    constructor(email, options) {
        super(`Email already registered: ${email}`, options);
        this.email = email;
    }
}
export class InfrastructureError extends Error {
    constructor(message, options) { super(message, options); this.name = this.constructor.name; }
}
```

### 异常包装（保留 cause）

```js
try {
    await this.#userRepository.save(user);
} catch (err) {
    // 基础设施异常原样上抛；业务层语义错误包装时务必保留 cause
    throw new InfrastructureError("Failed to persist user", { cause: err });
}
```

**禁止**：
- `catch { /* ignored */ }` 吞异常
- 只打 `err.message`、丢掉 stack
- `throw new Error(String(err))`，会丢 cause chain

---

## 异步代码与 Promise 规范 {#async}

1. **一律 `async/await`**，不混用 `.then().catch()` 链（除非要并行合流）
2. **必须 `await` 或显式 `void`**：没接的 Promise 会触发 unhandledRejection
3. **并行加速**：彼此无依赖的 IO 使用 `Promise.all`；仅当一个失败时需要整体回退时使用
4. **限流并发**：大批量 IO 使用 `p-limit` / 项目既有并发控制，不要 `Promise.all` 万条请求

```js
// BAD：Promise 未 await，rejection 静默丢失
this.#emailService.sendWelcomeAsync(email, name);

// GOOD：显式 fire-and-forget 并处理错误
void this.#emailService.sendWelcomeAsync(email, name).catch((err) => {
    this.#logger.warn({ email, err }, "welcome email failed");
});

// 并行 IO 合流
const [user, prefs] = await Promise.all([
    this.#userRepository.findById(id),
    this.#prefsRepository.findByUserId(id),
]);

// 批量带并发上限
import pLimit from "p-limit";
const limit = pLimit(10);
const results = await Promise.all(ids.map((id) => limit(() => this.process(id))));
```

### 异常与 Promise 的交互

```js
// 不要 try/await/throw 搅乱逻辑。保留原始异常。
try {
    return await this.#gateway.charge(amount);
} catch (err) {
    if (err instanceof NetworkError) {
        // 网络错误可重试；业务错误不可
        throw new PaymentRetryableError("charge failed", { cause: err });
    }
    throw err;
}
```

---

## 依赖注入与不可变性 {#di}

- 构造函数注入所有外部依赖，实例化交由 composition root
- 字段使用 `#` 原生私有；避免 `_name` 约定（私有靠自觉易被破坏）
- 实体尽量使用 `Object.freeze` 或始终构造新对象代替就地修改

```js
export class UserService {
    #userRepository;
    #emailService;
    #passwordHasher;
    #logger;

    constructor({ userRepository, emailService, passwordHasher, logger }) {
        // 显式解构便于看到必需依赖；缺失时抛 TypeError
        if (!userRepository || !emailService || !passwordHasher || !logger) {
            throw new TypeError("UserService: missing required dependency");
        }
        this.#userRepository = userRepository;
        this.#emailService = emailService;
        this.#passwordHasher = passwordHasher;
        this.#logger = logger;
    }
}
```

---

## 日志/可观测性最佳实践 {#logging}

- **不使用 `console.*`**：调用项目既有 logger（pino / winston / 自建），详见 business-logging 技能
- **结构化字段**：`logger.info({ user_id, action }, "msg")`
- **敏感字段脱敏**：密码、token、完整卡号、完整邮箱不得写入日志
- **错误日志必须携带 error 对象**：`logger.error({ err }, "...")`

```js
this.#logger.info({ user_id: saved.id, email_masked: maskEmail(email) },
    "User registered successfully");
```

---

## 常见惯用法 {#idioms}

### 条件链式与 `??`、`?.`

```js
// 可选链与空值合并替代冗长的 && ?: 链
const country = user?.address?.country ?? "UNKNOWN";

// 不要用 `||` 做默认值（会把 0 / "" / false 误当成空）
const retries = options.retries ?? 3;
```

### 解构 + 默认值

```js
function createOrder({ userId, items, currency = "USD", coupon = null } = {}) {
    // 默认值放参数解构，业务核心函数不重复写 undefined 判断
}
```

### 不可变更新

```js
// BAD：就地修改入参
function updateStatus(user, status) { user.status = status; return user; }

// GOOD：返回新对象（让调用方掌控生命周期）
function withStatus(user, status) { return { ...user, status, updatedAt: new Date() }; }
```

### 日期与时间

```js
// 业务代码不直接 new Date() 散落各处，集中到 Clock 依赖便于测试注入
class UserService {
    constructor({ clock, ... }) { this.#clock = clock; }
    async createUser(...) {
        const user = { ..., createdAt: this.#clock.now() };
    }
}
```

### 循环与集合

```js
// 多次链式 map/filter 会产生中间数组；大数据集考虑一次遍历
const summary = items.reduce((acc, it) => {
    if (it.active) acc.total += it.amount;
    return acc;
}, { total: 0 });

// for...of 比 forEach 更适合包含 await 的循环
for (const item of items) {
    await this.process(item); // 有序执行；并行见上节
}
```

---

## 实现阶段 Checklist

- [ ] 所有 TODO 均已落实，未遗留 `throw new Error("TODO: ...")`
- [ ] 方法签名与骨架完全一致（形参、返回值、默认参数、async 标记）
- [ ] 每个方法都有实现版 JSDoc（实现策略 / 业务规则落地 / 异常处理策略）
- [ ] 每个关键代码块前有解释 WHY 的内联注释
- [ ] 错误处理保留 `cause`，无 `catch {}` 吞异常
- [ ] 没有使用 `console.*`，全部走项目 logger
- [ ] 敏感字段已脱敏
- [ ] 并发/异步场景经过审视（unhandledRejection、race、并发上限）
