# Rust 单元测试参考指南

## 推荐技术栈

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 测试框架 | cargo test（标准） | Rust 内置，无需安装 |
| Mock 框架 | mockall | Rust 最流行的 Mock 库 |
| 断言增强 | pretty_assertions | 提供差异化断言输出 |
| 属性测试 | proptest | 基于属性的自动化测试 |
| 覆盖率 | cargo-tarpaulin | Rust 覆盖率工具 |
| 性能测试 | criterion | Rust 标准微基准测试框架 |
| HTTP Mock | wiremock / httpmock | 外部 HTTP 接口 Mock |

## Cargo.toml 配置

```toml
[package]
name = "my-project"
version = "0.1.0"
edition = "2021"

[dependencies]
thiserror = "1.0"
anyhow = "1.0"

[dev-dependencies]
# Mock 框架
mockall = "0.12"
# 增强断言输出（差异对比）
pretty_assertions = "1.4"
# 基于属性的测试
proptest = "1.4"
# 异步测试支持
tokio = { version = "1", features = ["full", "test-util"] }

# 覆盖率工具安装
# cargo install cargo-tarpaulin
# 运行覆盖率：cargo tarpaulin --out Html

[[bench]]
name = "user_service_bench"
harness = false
```

## 测试命名规范

```rust
// Rust 测试命名：snake_case，清晰描述场景
// 格式：<动作>_<条件>_<预期结果>

#[test]
fn get_user_returns_user_when_id_is_valid() {}

#[test]
fn get_user_returns_error_when_user_not_found() {}

// 或用描述性中文（Rust 支持 Unicode 标识符）
#[test]
fn 获取用户_有效id_返回用户对象() {}
```

## 标准测试结构

```rust
// src/service/user_service.rs 对应的测试文件
// Rust 惯例：将单元测试写在同一文件的 #[cfg(test)] 模块中

use mockall::automock;
use mockall::predicate::*;
use std::sync::Arc;

// ===== 接口定义（支持 Mock）=====

/// 用户仓库接口
/// #[automock] 宏自动生成 MockUserRepository 实现
#[automock]
pub trait UserRepository: Send + Sync {
    fn find_by_id(&self, id: i64) -> Result<Option<User>, RepositoryError>;
    fn save(&self, user: &User) -> Result<User, RepositoryError>;
}

// ===== 单元测试模块 =====

#[cfg(test)]  // 仅在测试编译时包含此模块
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    // ===== 辅助函数：避免测试代码重复 =====

    /// 创建测试用的用户对象
    fn create_test_user(id: i64) -> User {
        User {
            id,
            name: format!("测试用户{}", id),
            email: format!("user{}@example.com", id),
        }
    }

    /// 创建已配置好 Mock 的 UserService
    fn create_service_with_mock() -> (UserService, MockUserRepository) {
        let mock_repo = MockUserRepository::new();
        // 注意：mockall 需要在配置 expectations 后才能使用
        (UserService::new(Arc::new(mock_repo)), MockUserRepository::new())
    }

    // ===== 正常场景测试 =====

    /// 测试场景：正常场景 - 通过有效ID查询用户
    ///
    /// 测试思路：
    /// 1. Mock 仓库层返回预期用户
    /// 2. 验证 Service 层正确解包并返回
    /// 3. 验证仓库层被调用且参数正确
    #[test]
    fn get_user_returns_user_when_valid_id_provided() {
        // ===== 准备（Arrange）=====
        let mut mock_repo = MockUserRepository::new();
        let expected_user = create_test_user(1);
        let expected_user_clone = expected_user.clone();

        // 配置 Mock：当 id == 1 时，返回预期用户
        mock_repo
            .expect_find_by_id()
            .with(eq(1i64))           // 验证参数必须是 1
            .times(1)                  // 验证恰好被调用一次
            .returning(move |_| Ok(Some(expected_user_clone.clone())));

        // 创建被测 Service，注入 Mock
        let service = UserService::new(Arc::new(mock_repo));

        // ===== 执行（Act）=====
        let result = service.get_user(1);

        // ===== 验证（Assert）=====
        // unwrap() 前先确认是 Ok，失败时给出清晰的错误信息
        assert!(result.is_ok(), "有效ID查询不应返回错误：{:?}", result.err());
        let user = result.unwrap();
        assert!(user.is_some(), "有效ID应返回用户对象而非 None");
        // 使用 pretty_assertions 的 assert_eq，失败时显示详细差异
        assert_eq!(user.unwrap(), expected_user, "返回的用户应与预期一致");
    }

    // ===== 异常场景测试 =====

    /// 测试场景：异常场景 - 查询不存在的用户
    ///
    /// 测试思路：
    /// Mock 仓库返回 Ok(None)，验证 Service 将其转换为
    /// UserNotFoundError（而非直接透传 None）
    #[test]
    fn get_user_returns_not_found_error_when_user_does_not_exist() {
        // ===== 准备（Arrange）=====
        let mut mock_repo = MockUserRepository::new();

        // 配置 Mock：用户不存在，仓库返回 Ok(None)
        mock_repo
            .expect_find_by_id()
            .returning(|_| Ok(None));

        let service = UserService::new(Arc::new(mock_repo));

        // ===== 执行（Act）=====
        let result = service.get_user(999);

        // ===== 验证（Assert）=====
        // 验证返回错误（而非 Ok）
        assert!(result.is_err(), "用户不存在时应返回错误");
        let error = result.unwrap_err();
        // 验证是正确的错误类型（使用 matches! 宏简洁匹配枚举变体）
        assert!(
            matches!(error, ServiceError::UserNotFound { id: 999 }),
            "应返回 UserNotFound 错误，实际：{:?}",
            error
        );
    }

    /// 测试场景：异常场景 - 仓库层返回数据库错误
    ///
    /// 测试思路：
    /// 验证 Service 层将底层 RepositoryError 包装为 ServiceError，
    /// 同时保留原始错误信息用于调试
    #[test]
    fn get_user_wraps_repository_error_as_service_error() {
        // ===== 准备（Arrange）=====
        let mut mock_repo = MockUserRepository::new();

        // 配置 Mock：模拟数据库连接失败
        mock_repo
            .expect_find_by_id()
            .returning(|_| Err(RepositoryError::ConnectionFailed("超时".to_string())));

        let service = UserService::new(Arc::new(mock_repo));

        // ===== 执行（Act）=====
        let result = service.get_user(1);

        // ===== 验证（Assert）=====
        assert!(result.is_err(), "数据库错误时应返回 Err");
        // 验证错误类型是 InfrastructureError（而非 UserNotFound）
        assert!(
            matches!(result.unwrap_err(), ServiceError::InfrastructureError(_)),
            "应将数据库错误包装为基础设施错误"
        );
    }

    // ===== 边界场景测试 =====

    /// 测试场景：边界场景 - 多个无效 ID 值
    ///
    /// 测试思路：
    /// Rust 测试框架不内置参数化，手动遍历边界值数组
    /// 未来可用 rstest crate 简化
    #[test]
    fn get_user_returns_invalid_id_error_for_all_boundary_ids() {
        // 边界值列表：0、负数、i64 最小值
        let invalid_ids: Vec<i64> = vec![0, -1, -100, i64::MIN];

        for invalid_id in invalid_ids {
            // ===== 准备（Arrange）=====
            // 注意：这里不配置任何 Mock，因为参数校验应在调用仓库前发生
            let mut mock_repo = MockUserRepository::new();
            // 验证仓库层在参数非法时从不被调用
            mock_repo.expect_find_by_id().times(0);

            let service = UserService::new(Arc::new(mock_repo));

            // ===== 执行（Act）=====
            let result = service.get_user(invalid_id);

            // ===== 验证（Assert）=====
            assert!(
                result.is_err(),
                "无效ID {} 应返回错误，但返回了 Ok",
                invalid_id
            );
            assert!(
                matches!(result.unwrap_err(), ServiceError::InvalidId(_)),
                "应返回 InvalidId 错误"
            );
        }
    }
}
```

## 异步测试（Tokio）

```rust
#[cfg(test)]
mod async_tests {
    use super::*;
    use tokio::time::{timeout, Duration};

    /// 测试场景：正常场景（异步版本）- 异步查询用户
    ///
    /// 测试思路：
    /// 使用 #[tokio::test] 宏运行异步测试，逻辑与同步测试相同
    #[tokio::test]
    async fn get_user_async_returns_user_when_valid_id() {
        // ===== 准备（Arrange）=====
        let mut mock_repo = MockAsyncUserRepository::new();
        let expected_user = User { id: 1, name: "张三".to_string(), email: "z@e.com".to_string() };
        let expected_clone = expected_user.clone();

        mock_repo
            .expect_find_by_id()
            .with(eq(1i64))
            .returning(move |_| {
                let u = expected_clone.clone();
                Box::pin(async move { Ok(Some(u)) })
            });

        let service = AsyncUserService::new(Arc::new(mock_repo));

        // ===== 执行（Act）=====
        let result = service.get_user(1).await;

        // ===== 验证（Assert）=====
        assert!(result.is_ok());
        assert_eq!(result.unwrap().unwrap(), expected_user);
    }

    /// 测试场景：性能场景 - 异步操作超时控制
    ///
    /// 测试思路：
    /// 使用 tokio::time::timeout 确保操作在合理时间内完成
    #[tokio::test]
    async fn get_user_completes_within_timeout() {
        // ===== 准备（Arrange）=====
        let mut mock_repo = MockAsyncUserRepository::new();
        mock_repo
            .expect_find_by_id()
            .returning(|_| Box::pin(async { Ok(Some(User::default())) }));

        let service = AsyncUserService::new(Arc::new(mock_repo));

        // ===== 执行 & 验证（Act & Assert）=====
        // 验证操作在 100ms 内完成
        let result = timeout(Duration::from_millis(100), service.get_user(1)).await;
        assert!(result.is_ok(), "异步操作应在100ms内完成，不应超时");
    }
}
```

## 性能测试（Criterion）

```rust
// benches/user_service_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

/// 性能测试：GetUser 方法的执行时间基准
fn benchmark_get_user(c: &mut Criterion) {
    /*
     * 性能测试：单次查询的执行时间基准
     * 运行：cargo bench
     * 输出：每次迭代时间（ns/μs）、置信区间、与上次运行的变化
     */

    // ===== 准备（Arrange）=====
    let mut mock_repo = MockUserRepository::new();
    // 配置 Mock 无限次调用（Benchmark 会大量迭代）
    mock_repo
        .expect_find_by_id()
        .returning(|_| Ok(Some(User { id: 1, name: "张三".to_string(), email: "z@e.com".to_string() })));

    let service = UserService::new(Arc::new(mock_repo));

    // ===== 定义 Benchmark =====
    c.bench_function("get_user_by_id", |b| {
        b.iter(|| {
            // black_box 防止编译器优化掉被测代码
            black_box(service.get_user(black_box(1)))
        })
    });
}

criterion_group!(benches, benchmark_get_user);
criterion_main!(benches);
```

## 属性测试（Proptest）

```rust
#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    /// 属性测试：任意有效用户名都应被接受
    ///
    /// 测试思路：
    /// Proptest 自动生成大量随机输入，检验属性不变式
    /// 比手动枚举边界值更全面，能发现意想不到的边界情况
    proptest! {
        #[test]
        fn create_user_accepts_any_valid_username(
            // 生成1到50个字符的任意字符串
            name in "[\\u4e00-\\u9fa5a-zA-Z0-9]{1,50}"
        ) {
            // ===== 准备（Arrange）=====
            let mut mock_repo = MockUserRepository::new();
            let name_clone = name.clone();
            mock_repo
                .expect_save()
                .returning(move |u| Ok(u.clone()));

            let service = UserService::new(Arc::new(mock_repo));

            // ===== 执行 & 验证（Act & Assert）=====
            // 属性断言：所有1-50字符的有效名称都应成功创建
            let result = service.create_user(name);
            prop_assert!(result.is_ok(), "有效用户名应成功创建：{:?}", result.err());
        }
    }
}
```

## 常用断言速查

```rust
// 基本断言
assert!(condition, "失败消息: {}", value);
assert_eq!(left, right, "两者应相等");
assert_ne!(left, right, "两者应不同");

// 使用 pretty_assertions（更好的差异输出）
use pretty_assertions::assert_eq;
assert_eq!(complex_struct1, complex_struct2);

// 错误类型断言
assert!(result.is_err());
assert!(result.is_ok());
assert!(matches!(err, MyError::NotFound { .. }));

// 集合断言
assert_eq!(vec.len(), 3);
assert!(vec.contains(&element));
assert!(vec.is_empty());
```
