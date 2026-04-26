# JavaScript 单元测试参考指南

## 推荐技术栈

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 测试框架 | Jest / Vitest | Jest 生态最广；Vitest 与 Vite 项目天然契合、API 与 Jest 兼容 |
| Mock 库 | Jest / Vitest 内置 | `jest.fn()` / `vi.fn()` / `jest.mock()` / `vi.mock()` |
| 断言 | 内置 `expect` | 链式断言，支持自定义 matcher |
| 覆盖率 | Jest / Vitest 内置（底层 c8 / istanbul） | `--coverage` |
| 性能测试 | `benchmark.js` / `vitest bench` | 微基准 |
| 参数化 | `it.each` / `test.each` | 原生支持数据驱动 |
| 测试运行工具 | `npm test` / `pnpm test` / `yarn test` | 跟随项目包管理器 |
| 浏览器组件测试 | `@testing-library/react`（或 vue / svelte 对应版本） | 面向用户行为的断言 |

> **选型原则**：不自行引入新测试框架。优先读取 `package.json` 中 `devDependencies` 和 `scripts.test` 确认项目既定的测试工具，在此之上生成用例。

## 安装配置

```json
// package.json（Jest 示例）
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/__tests__/**/*.test.js", "**/*.test.js"],
    "collectCoverageFrom": ["src/**/*.js", "!src/**/*.config.js"],
    "coverageThreshold": {
      "global": { "branches": 85, "lines": 90, "functions": 90 }
    }
  }
}
```

```js
// vitest.config.js（Vitest 示例）
import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.js", "tests/**/*.test.js"],
        coverage: { provider: "v8", thresholds: { lines: 90, branches: 85 } },
    },
});
```

## 测试命名规范

```
文件命名：<被测模块>.test.js 或置于 __tests__/<被测模块>.test.js
describe：描述被测类/模块
it / test：describe 下的场景，命名 "should <预期> when <条件>" 或"当 X 时应 Y"
```

## 标准测试结构（Jest / Vitest 通用）

```js
// user-service.test.js
import { UserService } from "../src/user-service.js";
// Vitest：import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 被测类：UserService（src/user-service.js）
 * 测试策略：Mock UserRepository 与 EmailService；密码哈希使用真实实现（bcrypt 逻辑稳定且纯函数）
 * 覆盖场景汇总：
 *   - UserServiceTest-TC-01 ~ TC-04  正常场景：注册成功、查询成功、更新成功、软删除成功
 *   - UserServiceTest-TC-05 ~ TC-08  异常场景：邮箱重复、用户不存在、密码弱、依赖失败
 *   - UserServiceTest-TC-09 ~ TC-11  边界场景：用户名长度上下限、空输入、极大 ID
 *   - UserServiceTest-TC-12          性能场景：批量查询 1000 条
 * 覆盖率目标：行 ≥ 90% / 分支 ≥ 85%
 * 对应设计文档章节：UT 总体设计 > UserServiceTest
 */
describe("UserService", () => {
    let mockRepo;
    let mockEmail;
    let service;

    beforeEach(() => {
        // 构造 Mock 依赖并注入被测对象，保证每个用例相互隔离
        mockRepo = {
            findById: jest.fn(),
            save: jest.fn(),
            existsByEmail: jest.fn(),
        };
        mockEmail = { sendWelcomeAsync: jest.fn().mockResolvedValue(undefined) };
        service = new UserService(mockRepo, mockEmail);
    });

    /**
     * 场景编号：UserServiceTest-TC-01
     * 场景类型：正常
     * 场景描述：邮箱未被占用时 createUser 成功并返回新用户 ID
     * 前置条件：existsByEmail 返回 false；save 返回带 id 的 User
     * 测试步骤：Arrange Mock -> 调用 createUser -> 断言返回值与交互
     * 预期结果：返回 userId；save 被调用一次；欢迎邮件被异步触发
     * 关注点/风险：防止注册流程遗漏邮件触发或在邮件失败时回滚注册
     */
    it("creates user and triggers welcome email when email is unique", async () => {
        // ===== 准备（Arrange）=====
        mockRepo.existsByEmail.mockResolvedValue(false);
        mockRepo.save.mockResolvedValue({ id: "u-1", email: "a@b.com" });

        // ===== 执行（Act）=====
        const userId = await service.createUser("Alice", "a@b.com", "Passw0rd");

        // ===== 验证（Assert）=====
        expect(userId).toBe("u-1");
        expect(mockRepo.existsByEmail).toHaveBeenCalledWith("a@b.com");
        expect(mockRepo.save).toHaveBeenCalledTimes(1);
        expect(mockEmail.sendWelcomeAsync).toHaveBeenCalledWith("a@b.com", "Alice");
    });

    /**
     * 场景编号：UserServiceTest-TC-05
     * 场景类型：异常
     * 场景描述：邮箱已存在时 createUser 抛 EmailAlreadyExistsError
     * 前置条件：existsByEmail 返回 true
     * 预期结果：抛出 EmailAlreadyExistsError；save 不应被调用
     */
    it("throws EmailAlreadyExistsError when email is taken", async () => {
        mockRepo.existsByEmail.mockResolvedValue(true);

        await expect(service.createUser("Alice", "a@b.com", "Passw0rd"))
            .rejects.toThrow("EmailAlreadyExistsError");
        expect(mockRepo.save).not.toHaveBeenCalled();
    });

    /**
     * 场景编号：UserServiceTest-TC-09
     * 场景类型：边界
     * 场景描述：用户名长度恰好为上限 50 时应允许创建
     */
    it.each([
        { name: "a".repeat(2), label: "min length" },
        { name: "a".repeat(50), label: "max length" },
    ])("allows username with $label", async ({ name }) => {
        mockRepo.existsByEmail.mockResolvedValue(false);
        mockRepo.save.mockResolvedValue({ id: "u-x" });
        await expect(service.createUser(name, "a@b.com", "Passw0rd")).resolves.toBe("u-x");
    });

    /**
     * 场景编号：UserServiceTest-TC-10
     * 场景类型：边界
     * 场景描述：用户名长度超过 50 时应抛 ValidationError
     */
    it("rejects username exceeding 50 chars", async () => {
        await expect(service.createUser("a".repeat(51), "a@b.com", "Passw0rd"))
            .rejects.toThrow(/ValidationError|length/);
    });
});
```

## Mock 进阶

```js
// 1. 模块级 Mock（Jest）：替换整个模块的导出
jest.mock("../src/email-service.js", () => ({
    sendWelcomeAsync: jest.fn().mockResolvedValue(undefined),
}));

// 2. 部分 Mock：保留其他导出，只替换目标函数
import * as svc from "../src/email-service.js";
jest.spyOn(svc, "sendWelcomeAsync").mockResolvedValue();

// 3. 时间与随机性
jest.useFakeTimers();
jest.setSystemTime(new Date("2024-01-01T00:00:00Z"));
jest.spyOn(Math, "random").mockReturnValue(0.42);

// 4. HTTP 调用：优先使用 nock / msw / undici.MockAgent 之类的项目既有方案
// 不要直接 mock 全局 fetch，除非项目本来就没有 HTTP 抽象

// 5. 验证调用顺序
expect(mock).toHaveBeenNthCalledWith(1, "a");
expect(mock).toHaveBeenNthCalledWith(2, "b");
```

### Vitest 差异点

```js
import { vi } from "vitest";
vi.mock("../src/email-service.js"); // 自动 Mock
vi.useFakeTimers();
vi.setSystemTime(new Date("2024-01-01"));
vi.spyOn(obj, "method");
```

多数 Jest 用法将 `jest.*` 替换为 `vi.*` 即可在 Vitest 中运行。

## Fixture 与 setup

```js
// 共用构造逻辑：通过 beforeEach 重置，禁止跨测试共享 Mock 状态
let repo, service;
beforeEach(() => {
    repo = { save: jest.fn() };
    service = new UserService(repo);
});

// 复杂 fixture：导出工厂函数
// test-utils.js
export function buildUser(overrides = {}) {
    return { id: "u-1", name: "Alice", email: "a@b.com", ...overrides };
}
```

## 异步代码测试要点

```js
// 1. 必须 await 或 return Promise；否则断言失败会被吞掉
it("works", async () => {
    await expect(service.createUser("a", "b@c", "Passw0rd")).resolves.toBe("u-1");
});

// 2. 拒绝断言使用 .rejects，不要把 await 放进 try/catch 还靠期待"走到 catch"
await expect(service.fail()).rejects.toThrow(TypeError);

// 3. 微任务队列刷新（配合 fake timers）
await jest.runAllTimersAsync();
```

## 测试覆盖率补充

- `collectCoverageFrom`（Jest）或 `coverage.include`（Vitest）配置要排除类型定义、配置脚本、入口 shim
- 覆盖率阈值写在 config，CI 上强制校验，不在 PR 里靠人看
- 对于分支覆盖未达标的分支，先读具体 uncovered branch，再补"异常/边界"类场景，不要为了数字硬编造无意义用例

## 常见反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| 用 `console.log` 打印中间值替代断言 | 不会失败，CI 不会拦 | 用 `expect` 断言 |
| 单测里读真实文件 / 发真实 HTTP | 脆弱、慢、环境耦合 | Mock / fixture |
| 多个测试共享可变 `let` 状态 | 执行顺序相关性 | `beforeEach` 重置 |
| `toBeTruthy()` 断非空 | 放过 `1` / 非空字符串 | `toBe(...)` 或 `toEqual(...)` |
| 忽略 Promise rejection | 误报通过 | `await expect(...).rejects` |
| 用随机数据（无种子） | 间歇性失败 | 固定 seed / 枚举参数化 |
| 每个 describe 里重新 import 模块 | Mock 作用域混乱 | `jest.resetModules()` 按需 |
