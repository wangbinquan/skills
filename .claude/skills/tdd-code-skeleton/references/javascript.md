# JavaScript 代码骨架参考规范

## 目录
1. [JSDoc 注释规范](#jsdoc)
2. [类骨架模板](#class-template)
3. [模块 / 工厂函数骨架模板](#module-template)
4. [TODO 注释规范](#todo)
5. [空方法体占位与编译期占位](#placeholder)
6. [ES 模块 / CommonJS 与依赖注入约定](#dep-inject)

---

## JSDoc 注释规范 {#jsdoc}

JavaScript 本身没有类型系统，统一用 **JSDoc** 作为正式的类级/方法级注释载体。保留完整字段，便于 IDE 类型提示和后续 TS 迁移。

### 类级 JSDoc（必须包含以下所有字段）

```js
/**
 * 用户服务类，负责用户注册、查询、更新等核心业务操作。
 *
 * 设计思路：
 *   采用依赖注入模式，通过构造函数接收仓库与邮件服务依赖；
 *   所有外部依赖均可在单测中被 Mock 替换。本类仅做业务编排，
 *   不直接操作数据库或发送邮件，符合单一职责原则。
 *
 * 实现思路：
 *   核心流程：入参校验 → 业务规则检查 → 持久化 → 事件通知。
 *   写操作通过外部事务管理器或工作单元（UoW）保证一致性；
 *   邮件通知为 fire-and-forget，不阻塞主业务。
 *
 * 主要依赖：
 *   - userRepository：用户持久化访问对象。
 *   - emailService：邮件发送服务。
 *
 * 线程/异步安全性：
 *   Node.js 单线程，但所有方法均为 async，需避免跨异步边界的共享可变状态；
 *   本类本身无内部状态，方法级无状态即可安全并发调用。
 *
 * 设计约束：
 *   - 邮箱在系统中全局唯一（设计文档 3.2）
 *   - 密码使用 bcrypt 哈希，强度因子 ≥ 12（安全需求 SEC-001）
 *
 * 来源：[设计文档 3.1 节]
 *
 * @example
 * const repo = new InMemoryUserRepository();
 * const email = new FakeEmailService();
 * const service = new UserService(repo, email);
 * const userId = await service.createUser("Alice", "a@b.com", "Passw0rd");
 */
export class UserService { /* ... */ }
```

### 方法级 JSDoc（必须包含以下所有字段）

```js
    /**
     * 注册新用户，校验唯一性并触发欢迎邮件。
     *
     * 实现思路：
     *   采用"先检查后执行"模式：写入前先验证邮箱唯一性，
     *   给出明确的业务错误。密码使用 bcrypt 不可逆哈希存储，
     *   原文密码不得落库、不得进入日志。欢迎邮件异步触发。
     *
     * 实现步骤：
     *   1. 入参校验：name 长度 [2,50]，email 合法格式，password 强度 ≥ 8 且含大小写数字
     *   2. 唯一性检查：调用 this.#userRepository.existsByEmail(email)
     *   3. 密码哈希：await bcrypt.hash(password, 12)
     *   4. 构建 User 领域对象：填充 name / email / passwordHash / createdAt / status
     *   5. 持久化：await this.#userRepository.save(user)
     *   6. 异步发送欢迎邮件：this.#emailService.sendWelcomeAsync(email, name).catch(logOnly)
     *   7. 返回新用户 id
     *
     * @param {string} name - 用户名，非空，长度 2-50
     * @param {string} email - 邮箱地址，非空，RFC 5322 格式，全局唯一
     * @param {string} password - 明文密码，非空，≥8 位且含大小写字母和数字
     * @returns {Promise<string>} 新创建用户的 id
     * @throws {TypeError} 入参缺失或类型不符
     * @throws {ValidationError} 入参格式不合规
     * @throws {EmailAlreadyExistsError} 邮箱已被注册
     *
     * 并发注意：
     *   "检查-写入"之间存在竞态，需由持久化层的唯一索引兜底。
     */
    async createUser(name, email, password) { /* ... */ }
```

---

## 类骨架模板 {#class-template}

```js
// src/services/user-service.js
import bcrypt from "bcrypt"; // 示例依赖，实际以项目为准
import { EmailAlreadyExistsError, ValidationError } from "../errors/index.js";

/**
 * 用户服务类，负责用户注册、查询、更新等核心业务操作。
 * [完整类级 JSDoc 见上方规范]
 */
export class UserService {
    /** @type {import("../repositories/user-repository.js").UserRepository} */
    #userRepository;
    /** @type {import("./email-service.js").EmailService} */
    #emailService;

    /**
     * 初始化用户服务，注入依赖。
     *
     * 实现步骤：
     *   1. 校验 userRepository 与 emailService 非空
     *   2. 赋值到私有字段（# 前缀，JS 原生私有）
     *
     * @param {import("../repositories/user-repository.js").UserRepository} userRepository
     * @param {import("./email-service.js").EmailService} emailService
     * @throws {TypeError} 任一参数为 null/undefined
     */
    constructor(userRepository, emailService) {
        // TODO: Step 1 - 参数非空校验
        //   - if (!userRepository) throw new TypeError("userRepository is required");
        //   - if (!emailService) throw new TypeError("emailService is required");

        // TODO: Step 2 - 赋值到私有字段
        //   - this.#userRepository = userRepository;
        //   - this.#emailService = emailService;
        this.#userRepository = userRepository;
        this.#emailService = emailService;
    }

    /**
     * 注册新用户，校验唯一性并触发欢迎邮件。
     * [完整方法级 JSDoc 见上方规范]
     */
    async createUser(name, email, password) {
        // TODO: Step 1 - 入参校验
        //   - if (typeof name !== "string" || name.trim().length < 2 || name.length > 50)
        //       throw new ValidationError(`Invalid name: ${name}`)
        //   - 校验 email 非空且符合 RFC 5322（正则或 validator 库）
        //   - 校验 password 长度 >= 8 且包含大小写字母与数字

        // TODO: Step 2 - 邮箱唯一性检查
        //   - const exists = await this.#userRepository.existsByEmail(email);
        //   - if (exists) throw new EmailAlreadyExistsError(email);

        // TODO: Step 3 - 密码哈希
        //   - const passwordHash = await bcrypt.hash(password, 12);

        // TODO: Step 4 - 构建 User 领域对象
        //   - const user = { name, email, passwordHash, createdAt: new Date(), status: "PENDING_VERIFY" };

        // TODO: Step 5 - 持久化
        //   - const saved = await this.#userRepository.save(user);

        // TODO: Step 6 - 异步发送欢迎邮件（失败不阻塞注册）
        //   - this.#emailService.sendWelcomeAsync(email, name)
        //       .catch((err) => { /* 仅记录日志，不影响返回 */ });

        // TODO: Step 7 - 返回新用户 id
        //   - return saved.id;
        throw new Error("TODO: implement createUser");
    }

    /**
     * 根据 id 查询用户。
     *
     * 实现步骤：
     *   1. 校验 id 非空
     *   2. 调用仓库层 findById
     *   3. 找到则转 DTO 返回，否则返回 null
     *
     * @param {string} id
     * @returns {Promise<object | null>}
     */
    async getUserById(id) {
        // TODO: Step 1 - 参数校验
        // TODO: Step 2 - 仓库查询
        // TODO: Step 3 - 转换并返回 DTO 或 null
        throw new Error("TODO: implement getUserById");
    }
}
```

---

## 模块 / 工厂函数骨架模板 {#module-template}

对函数式或面向对象混用的项目，骨架可能以**导出工厂函数**为主：

```js
// src/services/create-user-service.js

/**
 * 用户服务工厂：返回具备 createUser/getUserById 等方法的对象。
 * 设计思路：以闭包持有依赖，避免 class 与 this 绑定问题。
 * 实现思路：同类版本，仅载体不同。
 *
 * @param {{userRepository: object, emailService: object}} deps
 * @returns {{
 *   createUser: (name: string, email: string, password: string) => Promise<string>,
 *   getUserById: (id: string) => Promise<object | null>
 * }}
 */
export function createUserService({ userRepository, emailService }) {
    // TODO: 依赖非空校验
    //   - if (!userRepository || !emailService) throw new TypeError("deps required");

    return {
        /**
         * 注册新用户。
         * [完整方法级 JSDoc 同 class 版本]
         */
        async createUser(name, email, password) {
            // TODO: Step 1~7 同 class 版本
            throw new Error("TODO: implement createUser");
        },

        async getUserById(id) {
            // TODO: Step 1~3 同 class 版本
            throw new Error("TODO: implement getUserById");
        },
    };
}
```

---

## TODO 注释规范 {#todo}

**正确示例**（分步骤、具体到调用哪个方法、处理哪些条件）：

```js
async processPayment(orderId, payment) {
    // TODO: Step 1 - 加载订单（悲观锁防并发支付）
    //   - const order = await this.#orderRepo.findByIdForUpdate(orderId);
    //   - if (!order) throw new OrderNotFoundError(orderId);
    //   - if (order.status !== "PENDING_PAYMENT")
    //       throw new InvalidOrderStatusError(`expected PENDING_PAYMENT, got ${order.status}`);

    // TODO: Step 2 - 调用支付网关（最多重试 3 次，指数退避）
    //   - 使用 p-retry 或自写重试封装
    //   - 捕获 NetworkError 允许重试；PaymentDeclinedError 不重试
    //   - const result = await retry(() => this.#paymentGateway.charge(payment.amount, payment.token));

    // TODO: Step 3 - 更新订单状态（同一事务内）
    //   - order.status = result.success ? "PAID" : "PAYMENT_FAILED";
    //   - order.paymentId = result.paymentId;
    //   - await this.#orderRepo.save(order);

    // TODO: Step 4 - 发布领域事件
    //   - const event = result.success
    //       ? { type: "OrderPaid", orderId, paymentId: result.paymentId }
    //       : { type: "OrderPaymentFailed", orderId, reason: result.errorMsg };
    //   - await this.#eventBus.publish(event);

    throw new Error("TODO: implement processPayment");
}
```

**禁止的模糊写法**：

```js
// TODO: implement this
// TODO: add business logic
// FIXME: later
```

---

## 空方法体占位与编译期占位 {#placeholder}

JavaScript 没有编译期空实现，统一使用 `throw new Error("TODO: implement <method>")`：

```js
methodA() {
    // TODO: implement
    throw new Error("TODO: implement methodA");
}

async methodB() {
    // TODO: implement
    throw new Error("TODO: implement methodB");
}

// 对于返回布尔/数值/可选的纯函数，也建议直接抛错而不是返回假值
//   - 返回假值会让忘记实现的代码静默通过，污染上层逻辑
//   - 抛错则在测试首跑时立即暴露
```

Getter / setter 占位：

```js
get isActive() {
    // TODO: implement
    throw new Error("TODO: implement isActive getter");
}
```

---

## ES 模块 / CommonJS 与依赖注入约定 {#dep-inject}

- 优先使用 **ES Modules**（`export` / `import`），便于 tree-shaking 与静态分析；
- 若项目全局是 CommonJS，保持一致：`module.exports = { UserService };`
- **不要在模块顶层直接 `new`**（会在 import 时触发副作用）；实例化交给 composition root / DI 容器
- 依赖通过构造函数/工厂参数注入，**禁止**在方法内部 `import` 具体实现（会阻碍测试 Mock）

```js
// BAD
export class UserService {
    async createUser(...) {
        const { bcrypt } = await import("bcrypt"); // 依赖被硬编码，难 Mock
        // ...
    }
}

// GOOD
export class UserService {
    constructor({ userRepository, emailService, passwordHasher }) {
        // passwordHasher 作为依赖注入，测试时可替换为确定性实现
    }
}
```

### 错误类的定义约定

```js
// src/errors/index.js
export class ValidationError extends Error {
    constructor(message) { super(message); this.name = "ValidationError"; }
}
export class EmailAlreadyExistsError extends Error {
    constructor(email) {
        super(`Email already registered: ${email}`);
        this.name = "EmailAlreadyExistsError";
        this.email = email;
    }
}
```

骨架阶段**只定义自定义错误类的形状**（构造函数和字段），不要在 `throw new XxxError(...)` 之外引入复杂逻辑。
