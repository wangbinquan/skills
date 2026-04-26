# TypeScript 单元测试参考指南

> 本文件是 TypeScript **特有**部分；JavaScript 的通用测试规范（命名、AAA 结构、Jest / Vitest 基础 API、Mock、反模式）参见 `javascript.md`，不再重复。阅读顺序：先读 `javascript.md` 了解通用规范，再读本文件了解 TS 特化。

## 推荐技术栈（与 JS 的差异）

| 用途 | 推荐组合 | 说明 |
|------|---------|------|
| 运行测试 | `ts-jest`（Jest）/ `vitest`（Vite 原生支持 TS） | Vitest 对 TS 零配置；Jest 需 ts-jest 或 @swc/jest |
| 类型断言 | `expectTypeOf`（Vitest）/ `tsd` / `@ts-expect-error` | 断言类型而不是运行值 |
| Mock 类型安全 | `jest-mock-extended` / `vitest-mock-extended` / 自定义泛型工具 | 避免 `as any` 打破类型 |
| 配置 | `tsconfig.json` 中 `strict: true`，测试文件包含进 `include` | 保持与生产代码同等严格度 |

> **选型原则**：沿用项目既有工具链，不因"更现代"就替换。检查 `package.json`、`jest.config.*`、`vitest.config.ts` 中已有的 TS 处理管道。

## 安装配置

```json
// package.json（ts-jest）
{
  "scripts": { "test": "jest" },
  "devDependencies": {
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/__tests__/**/*.test.ts", "**/*.test.ts"]
  }
}
```

```json
// tsconfig.json 片段（测试相关）
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "types": ["jest", "node"]   // 或 ["vitest/globals", "node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

## 测试命名规范

- 文件：`<被测模块>.test.ts` 或 `__tests__/<被测模块>.test.ts`
- 与 JS 相同，但利用类型别名和泛型可以更精确地约束 Mock
- 测试代码文件内禁止使用 `any`（项目若启用 `noImplicitAny`，这一点由编译器强制）

## 标准测试结构（Jest 示例，Vitest 仅 import 差异）

```ts
import { UserService, type IUserRepository, type IEmailService, type UserId } from "../src/user-service";

/**
 * 被测类：UserService（src/user-service.ts）
 * 测试策略：以最小接口 Mock 注入，保持类型安全；不使用 `as any` 绕过类型
 * 覆盖场景汇总：
 *   - UserServiceTest-TC-01 ~ TC-04  正常
 *   - UserServiceTest-TC-05 ~ TC-08  异常
 *   - UserServiceTest-TC-09 ~ TC-11  边界
 *   - UserServiceTest-TC-12          类型契约（编译期断言）
 * 覆盖率目标：行 ≥ 90% / 分支 ≥ 85%
 */
describe("UserService", () => {
    let repo: jest.Mocked<IUserRepository>;
    let email: jest.Mocked<IEmailService>;
    let service: UserService;

    beforeEach(() => {
        // jest.Mocked<T>：保留原类型签名，同时把所有方法变成 jest.Mock
        repo = {
            findById: jest.fn(),
            save: jest.fn(),
            existsByEmail: jest.fn(),
        } as jest.Mocked<IUserRepository>;
        email = {
            sendWelcomeAsync: jest.fn().mockResolvedValue(undefined),
        } as jest.Mocked<IEmailService>;
        service = new UserService(repo, email);
    });

    /**
     * 场景编号：UserServiceTest-TC-01
     * 场景类型：正常
     */
    it("creates user and returns id when email is unique", async () => {
        repo.existsByEmail.mockResolvedValue(false);
        repo.save.mockResolvedValue({ id: "u-1" as UserId, email: "a@b.com" });

        const id: UserId = await service.createUser("Alice", "a@b.com", "Passw0rd");

        expect(id).toBe("u-1");
        expect(repo.save).toHaveBeenCalledTimes(1);
    });

    /**
     * 场景编号：UserServiceTest-TC-12
     * 场景类型：类型契约（不产生运行时代码，编译器校验）
     * 场景描述：createUser 的返回类型必须是 Promise<UserId>，不能被悄悄放宽
     */
    it("preserves return type contract", () => {
        // 依赖 Vitest expectTypeOf 或 ts-expect / @ts-expect-error
        // @ts-expect-error：若未来返回值被改为 string 以外的联合类型，此行会报错提醒
        const _assert: Promise<UserId> = service.createUser("Alice", "a@b.com", "Passw0rd");
        void _assert;
    });
});
```

## Mock 的类型安全写法

```ts
// 1. 优先使用 jest.Mocked<T> / vi.Mocked<T>
import type { Mocked } from "vitest";
const repo = { save: vi.fn(), findById: vi.fn() } as Mocked<IUserRepository>;

// 2. 用 jest-mock-extended / vitest-mock-extended 自动生成深度 Mock
import { mock, type DeepMockProxy } from "jest-mock-extended";
const repo: DeepMockProxy<IUserRepository> = mock<IUserRepository>();
repo.findById.mockResolvedValue({ id: "u-1" as UserId });

// 3. 自定义 Partial Mock：允许测试只实现关心的方法
function fake<T>(impl: Partial<T>): T { return impl as T; }
const repo = fake<IUserRepository>({ save: jest.fn() });
// 只测到 save 路径的场景适用；若用到未定义的方法会在运行时抛 undefined is not a function，提醒补齐

// 4. 重要：不要用 `as any`。它会掩盖签名漂移引发的测试失效
```

## 类型驱动的测试策略

### 分支枚举 via 判别联合

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
// 确保所有分支都被测：
function handle(r: Result<number>): string {
    switch (r.ok) {
        case true:  return String(r.value);
        case false: return r.error;
    }
}

it.each<[Result<number>, string]>([
    [{ ok: true, value: 7 }, "7"],
    [{ ok: false, error: "bad" }, "bad"],
])("maps result %j to %s", (input, expected) => {
    expect(handle(input)).toBe(expected);
});
```

### 枚举 / Const 数组驱动参数化

```ts
const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
type Status = typeof STATUSES[number];

it.each(STATUSES)("isLoginAllowed returns correct value for %s", (status: Status) => {
    expect(isLoginAllowed(status)).toBe(status === "ACTIVE");
});
```

如果 STATUS 新增成员而 `isLoginAllowed` 的 switch 未更新，TS 的 exhaustive check 会在编译期报错，避免被漏测。

### 泛型函数测试

```ts
function first<T>(arr: readonly T[]): T | undefined { return arr[0]; }

it("keeps element type", () => {
    const s: string | undefined = first(["a", "b"]);
    const n: number | undefined = first([1, 2]);
    expect(s).toBe("a"); expect(n).toBe(1);
    // 类型层面的契约由显式类型标注保障（上两行若类型不匹配会编译失败）
});
```

## 类型断言工具

```ts
// Vitest 内置
import { expectTypeOf } from "vitest";
expectTypeOf(service.createUser).returns.toMatchTypeOf<Promise<UserId>>();
expectTypeOf<Parameters<typeof service.createUser>>().toEqualTypeOf<[string, string, string]>();

// Jest 无内置，使用 tsd / dtslint 或 @ts-expect-error
// @ts-expect-error: createUser 的第三个参数必须是 string，传 number 时应编译错误
service.createUser("Alice", "a@b.com", 123);
```

类型测试**不可**只靠运行时断言，必须由编译器在 CI 中失败保护。

## 异步代码的类型关注点

```ts
// 1. 返回 Promise 的函数必须 await；TS 下漏 await 会产出 Promise<T> 而非 T，
//    但若赋给 `any` 或用于 void 上下文，可能被静默接受 —— 测试代码杜绝 void
await expect(service.createUser("a", "b@c", "Passw0rd")).resolves.toBe("u-1");

// 2. 异常类型收窄
await expect(service.failSomehow())
    .rejects.toBeInstanceOf(ValidationError);
```

## 常见反模式（TS 特有）

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `as any` / `// @ts-ignore` 消除错误 | 测试失去类型契约保护 | 改用 `jest.Mocked<T>` / `Partial<T>` + 工厂 |
| 直接 `new` 业务类并传 `{}` 当依赖 | 构造失败或行为异常 | 构造完整的 Mock 对象满足接口 |
| `@ts-expect-error` 无注释 | 不知道在期待什么错误 | 必须加 `// @ts-expect-error: <期望原因>` |
| 在测试里自定义 DTO 与生产代码不同步 | 类型漂移不可见 | `import type` 生产代码中的类型 |
| 用 enum 跨服务共享 | tree-shaking / 跨包兼容问题 | `as const` 对象 + `typeof X[keyof typeof X]` |
| 宽松的 `any` 返回值断言 | 回归无保护 | `expectTypeOf` / 显式类型别名 |

## 与 JS 文件的协作说明

- 公共 fixture 写在 `.ts` 中，利用类型约束 `buildUser(overrides?: Partial<User>): User`
- 同一测试文件里若必须 mock 一个未导出类型的模块，借助 `type { FooInternal }` 的条件导出或 `typeof import("module")` 派生类型，不要伪造新接口
- 测试文件的严格度应与生产代码一致（同一 `tsconfig` 或 `tsconfig.test.json` 扩展主 tsconfig），确保不会"测试通过但生产编译失败"
