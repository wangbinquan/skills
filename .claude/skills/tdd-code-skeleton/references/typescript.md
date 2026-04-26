# TypeScript 代码骨架参考规范

> 本文件是 TypeScript **特有**部分；JS 的通用骨架规范（JSDoc 结构、类/工厂模板、TODO 写法、空方法体、依赖注入）见 `javascript.md`。先读 JS 再读本文件，避免重复。

## 目录
1. [TSDoc 注释规范（与 JSDoc 的差异）](#tsdoc)
2. [类骨架模板（含接口、泛型、修饰符）](#class-template)
3. [接口 / 类型别名 / 判别联合骨架](#types)
4. [TODO 注释规范](#todo)
5. [空方法体占位](#placeholder)
6. [tsconfig 约定与严格度](#tsconfig)

---

## TSDoc 注释规范 {#tsdoc}

TypeScript 项目继续沿用 JSDoc 结构，但：
- **不重复类型**：方法签名已带类型，JSDoc 不再写 `@param {string}`，只写参数**语义**（`@param name 用户名，长度 2-50`）
- 推荐的标签：`@param`、`@returns`、`@throws`、`@remarks`、`@example`、`@see`
- 工具链若用 API Extractor / TypeDoc，遵循 TSDoc 的更严格书写（代码示例用 fenced code blocks）

### 类级 TSDoc

```ts
/**
 * 用户服务类，负责用户注册、查询、更新等核心业务操作。
 *
 * 设计思路：
 *   采用依赖注入模式（通过构造函数），所有依赖由外部提供。
 *   本类不直接持有任何状态，仅做业务编排。
 *
 * 实现思路：
 *   入参校验 → 业务规则检查 → 持久化 → 事件通知。
 *   写操作由调用侧的事务装饰器（如 @Transactional 或 UoW）保证；
 *   欢迎邮件通过 fire-and-forget 异步触发，不回滚主事务。
 *
 * 主要依赖：
 *   - userRepository: 用户持久化访问
 *   - emailService: 邮件发送服务
 *   - passwordHasher: 密码哈希策略（便于测试替换）
 *
 * 线程/异步安全性：
 *   Node.js 单线程；本类无实例状态，异步并发调用安全。
 *
 * 设计约束：
 *   - 邮箱在系统中全局唯一（设计文档 3.2 节）
 *   - 密码使用 bcrypt 哈希，强度因子 ≥ 12（安全需求 SEC-001）
 *
 * 来源：[设计文档 3.1 节]
 *
 * @example
 * const service = new UserService(repo, email, hasher);
 * const userId = await service.createUser("Alice", "a@b.com", "Passw0rd");
 */
export class UserService implements IUserService { /* ... */ }
```

### 方法级 TSDoc

```ts
/**
 * 注册新用户，校验唯一性并触发欢迎邮件。
 *
 * 实现思路：
 *   "先检查后执行"：先调用 existsByEmail 前置判重，避免依赖
 *   数据库唯一索引异常。密码使用 bcrypt 不可逆哈希存储。
 *
 * 实现步骤：
 *   1. 入参校验：name 长度 [2,50]、email 格式、password 强度
 *   2. 唯一性检查：this.userRepository.existsByEmail(email)
 *   3. 密码哈希：this.passwordHasher.hash(password)
 *   4. 构建 User
 *   5. 持久化：this.userRepository.save(user)
 *   6. 异步发送欢迎邮件
 *   7. 返回新用户 id
 *
 * @param name 用户名，长度 2-50
 * @param email 邮箱地址，RFC 5322 格式，全局唯一
 * @param password 明文密码，≥8 位且含大小写字母和数字；不会被持久化
 * @returns 新用户的 UserId
 * @throws {ValidationError} 入参格式不合规
 * @throws {EmailAlreadyExistsError} 邮箱已被注册
 */
async createUser(name: string, email: string, password: string): Promise<UserId> { /* ... */ }
```

---

## 类骨架模板（含接口、泛型、修饰符） {#class-template}

```ts
// src/services/user-service.ts
import type { IUserService, UserId, UserDTO } from "../types/user.js";
import type { UserRepository } from "../repositories/user-repository.js";
import type { EmailService } from "./email-service.js";
import type { PasswordHasher } from "./password-hasher.js";
import { ValidationError, EmailAlreadyExistsError } from "../errors/index.js";

/**
 * 用户服务类，负责用户注册、查询、更新等核心业务操作。
 * [完整类级 TSDoc 见上方规范]
 */
export class UserService implements IUserService {
    /**
     * 初始化用户服务。
     *
     * 实现步骤：
     *   1. 依赖对象存在性校验（TS 已限制为非 undefined，但对可选依赖仍需显式校验）
     *   2. 使用 constructor parameter properties 简化赋值
     *
     * @throws {TypeError} 任一依赖为 null
     */
    constructor(
        private readonly userRepository: UserRepository,
        private readonly emailService: EmailService,
        private readonly passwordHasher: PasswordHasher,
    ) {
        // TODO: Step 1 - 依赖校验（即便 TS 保证类型，仍应拦截 runtime null）
        //   - if (userRepository == null) throw new TypeError("userRepository is required");
        //   - if (emailService == null) throw new TypeError("emailService is required");
        //   - if (passwordHasher == null) throw new TypeError("passwordHasher is required");
    }

    /**
     * 注册新用户。
     * [完整方法级 TSDoc 见上方规范]
     */
    async createUser(name: string, email: string, password: string): Promise<UserId> {
        // TODO: Step 1 - 入参校验
        //   - if (name.trim().length < 2 || name.length > 50) throw new ValidationError(...)
        //   - 校验 email 格式（RFC 5322）
        //   - 校验 password 强度（≥8，含大小写字母和数字）

        // TODO: Step 2 - 邮箱唯一性检查
        //   - const exists = await this.userRepository.existsByEmail(email);
        //   - if (exists) throw new EmailAlreadyExistsError(email);

        // TODO: Step 3 - 密码哈希
        //   - const passwordHash = await this.passwordHasher.hash(password);

        // TODO: Step 4 - 构建 User
        //   - const user: User = { name, email, passwordHash, status: "PENDING_VERIFY",
        //                          createdAt: new Date() };

        // TODO: Step 5 - 持久化
        //   - const saved = await this.userRepository.save(user);

        // TODO: Step 6 - 异步发送欢迎邮件（失败不阻塞注册）
        //   - void this.emailService.sendWelcomeAsync(email, name).catch(() => { /* log */ });

        // TODO: Step 7 - 返回新用户 id
        //   - return saved.id;
        throw new Error("TODO: implement createUser");
    }

    /** 根据 id 查询用户 DTO；未找到返回 null。 */
    async getUserById(id: UserId): Promise<UserDTO | null> {
        // TODO: Step 1 - 参数校验
        // TODO: Step 2 - 仓库查询
        // TODO: Step 3 - 转 DTO 或返回 null
        throw new Error("TODO: implement getUserById");
    }
}
```

### 泛型示例

```ts
/**
 * 通用仓库基类。
 *
 * 泛型说明：
 *   - T：实体类型，必须是对象，且含 `id` 字段
 *   - ID：主键类型，默认 string，可替换为 UserId / OrderId 等品牌类型
 *
 * 来源：[设计文档 4.1 节，通用仓库模式]
 */
export abstract class Repository<T extends { id: ID }, ID = string> {
    /**
     * 按 id 查询实体。
     *
     * 实现步骤：
     *   1. 参数校验
     *   2. 委派到底层存储查询
     *   3. 未找到返回 null
     */
    abstract findById(id: ID): Promise<T | null>;

    /**
     * 保存实体（新增或更新，upsert 语义）。
     */
    abstract save(entity: T): Promise<T>;
}
```

---

## 接口 / 类型别名 / 判别联合骨架 {#types}

```ts
// src/types/user.ts
/** 用户 ID 的品牌类型，避免与其他字符串 ID 混淆。 */
export type UserId = string & { readonly __brand: "UserId" };

/** 用户状态，使用 `as const` 对象代替 enum（更友好 tree-shaking）。 */
export const UserStatus = {
    PENDING_VERIFY: "PENDING_VERIFY",
    ACTIVE: "ACTIVE",
    SUSPENDED: "SUSPENDED",
    DEACTIVATED: "DEACTIVATED",
} as const;
export type UserStatus = typeof UserStatus[keyof typeof UserStatus];

/** 用户领域实体（持久化形态）。 */
export interface User {
    readonly id: UserId;
    name: string;
    readonly email: string;       // 邮箱不可变
    passwordHash: string;
    status: UserStatus;
    createdAt: Date;
    updatedAt?: Date;
}

/** 用户展示用 DTO，不含敏感字段。 */
export interface UserDTO {
    readonly id: UserId;
    readonly name: string;
    readonly email: string;
    readonly status: UserStatus;
    readonly createdAt: Date;
}

/**
 * 用户服务接口。
 *
 * 设计约束：所有读方法返回 DTO；写方法返回必要的 id 或 void。
 */
export interface IUserService {
    createUser(name: string, email: string, password: string): Promise<UserId>;
    getUserById(id: UserId): Promise<UserDTO | null>;
    updateUser(id: UserId, req: UpdateUserRequest): Promise<void>;
    deleteUser(id: UserId): Promise<void>;
}

export interface UpdateUserRequest {
    readonly name?: string;
    // email 故意不列：设计约束要求邮箱不可变更
}

/**
 * 业务操作结果：使用判别联合区分成功/失败。
 * 骨架阶段仅定义类型，实现阶段填充具体调用。
 */
export type CreateUserResult =
    | { readonly kind: "ok"; readonly userId: UserId }
    | { readonly kind: "email_taken"; readonly email: string }
    | { readonly kind: "validation_failed"; readonly reason: string };
```

---

## TODO 注释规范 {#todo}

与 `javascript.md` 一致，但允许借助 TS 类型作为步骤的**前置条件**参考：

```ts
async processPayment(orderId: OrderId, payment: PaymentInfo): Promise<PaymentResult> {
    // TODO: Step 1 - 加载订单并校验状态
    //   - const order = await this.orderRepo.findByIdForUpdate(orderId);
    //   - if (order == null) throw new OrderNotFoundError(orderId);
    //   - if (order.status !== "PENDING_PAYMENT") throw new InvalidOrderStatusError(order.status);
    //   - 断言：TS 类型收窄后，order 在此块内不再是 nullable

    // TODO: Step 2 - 调用支付网关
    //   - 捕获 NetworkError：可重试；PaymentDeclinedError：不重试
    //   - const result: ChargeResult = await retry(() => this.gateway.charge(payment.amount, payment.token));

    // TODO: Step 3 - 更新订单状态并持久化
    //   - 使用判别联合确保分支穷尽处理
    //   - const next: OrderStatus = result.kind === "ok" ? "PAID" : "PAYMENT_FAILED";

    // TODO: Step 4 - 发布领域事件
    //   - 事件类型由 EventBus 的 publish 签名约束

    throw new Error("TODO: implement processPayment");
}
```

---

## 空方法体占位 {#placeholder}

- 同步方法：`throw new Error("TODO: implement <method>")`
- 异步方法：同上（Promise 会 reject）
- Getter / Setter：
  ```ts
  get isActive(): boolean { throw new Error("TODO: implement isActive getter"); }
  set name(value: string) { throw new Error("TODO: implement name setter"); }
  ```
- 抽象方法直接用 `abstract`，无需占位体：
  ```ts
  abstract findById(id: ID): Promise<T | null>;
  ```
- 接口方法**不写**占位（接口只有签名）：
  ```ts
  export interface IUserService {
      createUser(name: string, email: string, password: string): Promise<UserId>;
  }
  ```

> **禁止**：`// @ts-ignore` / `any` 用于绕过类型检查。骨架阶段必须保持编译通过，否则后续 UT 无法运行。

---

## tsconfig 约定与严格度 {#tsconfig}

骨架生成不修改 tsconfig，但需保证代码能在以下常见严格模式下编译：

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "useDefineForClassFields": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

若项目 tsconfig 显著宽松（例如关闭了 `strict`），在骨架说明中提示用户"骨架按严格模式生成，若要在宽松模式下落地请与团队对齐"。

### import 约定

- 类型导入使用 `import type`，避免打包体积膨胀：
  ```ts
  import type { UserRepository } from "../repositories/user-repository.js";
  ```
- 使用 `.js` 扩展名（Node.js ESM 规范要求，即便源文件是 `.ts`）
- 循环依赖：类型循环可通过 `import type` 化解，运行时循环必须拆分模块
