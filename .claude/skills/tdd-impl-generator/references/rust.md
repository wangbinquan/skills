# Rust 实现规范参考

## 1. 方法级注释格式（Rustdoc 实现版）

```rust
/// 创建新用户账户并异步发送欢迎邮件。
///
/// # 实现策略
///
/// 采用"先检查后执行"模式完成邮箱唯一性校验。密码哈希在持久化前完成，
/// `raw_password` 在哈希后立即从内存中清零（安全要求 SEC-001）。
/// 欢迎邮件通过 `tokio::spawn` 异步发送，失败只记录警告，不影响主流程。
///
/// # 业务规则落地
///
/// - **C-001 邮箱唯一性**：`exists_by_email` 前置检查（FR-003），
///   而非依赖数据库唯一索引，以提供友好业务错误
/// - **C-002 密码哈希**：Argon2id，来自配置项 `SecurityConfig::argon2_params`（SEC-001）
/// - **C-003 欢迎邮件**：`tokio::spawn` fire-and-forget，失败降级（设计文档 4.2.3）
///
/// # 错误处理策略
///
/// - [`CreateUserError::EmailAlreadyExists`]：邮箱已注册，调用方转 HTTP 409
/// - [`CreateUserError::ValidationFailed`]：参数格式不合规，转 HTTP 422
/// - [`CreateUserError::Repository`]：数据库写入失败，转 HTTP 500
///
/// # 示例
///
/// ```rust
/// let user_id = service.create_user("Alice", "alice@example.com", "P@ssw0rd!").await?;
/// ```
pub async fn create_user(
    &self,
    name: &str,
    email: &str,
    raw_password: &str,
) -> Result<UserId, CreateUserError> {
```

## 2. error 类型设计（thiserror）

```rust
use thiserror::Error;

/// UserService 操作失败的业务错误类型。
///
/// 每个变体对应一种独立的失败原因，调用方可通过 `match` 精确处理。
#[derive(Debug, Error)]
pub enum CreateUserError {
    /// 邮箱已被注册（唯一性约束，FR-003）
    #[error("Email already registered: {email}")]
    EmailAlreadyExists { email: String },

    /// 输入参数格式校验失败（FR-001 到 FR-003）
    #[error("Validation failed: {message}")]
    ValidationFailed { message: String },

    /// 数据库操作失败（基础设施错误，上抛给框架层处理）
    #[error("Repository error: {0}")]
    Repository(#[from] RepositoryError),

    /// 密码哈希失败（通常是配置问题，极少发生）
    #[error("Password hashing failed: {0}")]
    HashingFailed(#[from] argon2::password_hash::Error),
}
```

## 3. Result/Option 链式处理

```rust
// 使用 ? 运算符传播错误，配合 map_err 转换错误类型
let exists = self.repo
    .exists_by_email(&normalized_email)
    .await
    .map_err(CreateUserError::Repository)?; // 将 RepositoryError 转换为 CreateUserError

// Option 链式处理：避免嵌套 match
let user = self.repo
    .find_by_id(id)
    .await
    .map_err(GetUserError::Repository)?   // 传播数据库错误
    .ok_or(GetUserError::NotFound { id })?; // None 转换为 NotFound 错误

// 用 and_then 避免嵌套 map + flatten
let dto = self.repo
    .find_by_id(id)
    .await
    .map_err(GetUserError::Repository)?
    .map(|user| UserDto::from(user))      // 存在时转换
    .ok_or(GetUserError::NotFound { id }); // None 时返回错误
```

## 4. 所有权与生命周期

```rust
// 参数接受 &str 而非 String：调用方不需要为了传参 clone 一个 String
// 若需要持有 owned 版本，在函数体内用 .to_owned() 或 .to_string()
pub async fn create_user(
    &self,
    name: &str,       // 借用，调用方保留所有权
    email: &str,      // 借用，函数内会 .to_lowercase() 得到 owned String
    raw_password: &str,
) -> Result<UserId, CreateUserError> {

// 返回 owned 类型（UserId），而非引用：
// 函数返回后，内部 User 可能被释放，引用会悬空
```

## 5. 安全编程（密码处理）

```rust
use zeroize::Zeroize;

// 密码哈希后立即清零明文，防止内存泄漏（安全要求 SEC-001）
let mut raw_password_owned = raw_password.to_owned();
let hashed = self.hasher.hash(&raw_password_owned)?;
raw_password_owned.zeroize();  // 内存清零，而非仅 drop（GC 语言无法保证）

// 或使用 zeroize::Zeroizing 包装器，离开作用域时自动清零
let raw_password_buf = Zeroizing::new(raw_password.to_owned());
let hashed = self.hasher.hash(&*raw_password_buf)?;
// raw_password_buf 离开作用域时自动清零
```

## 6. 异步与 tokio

```rust
// tokio::spawn fire-and-forget：任务独立于当前 async task 生命周期
// 必须 clone 所有需要的值（spawn 要求 'static 生命周期）
let email_clone = normalized_email.clone();
let name_clone = name.to_owned();
let email_svc = Arc::clone(&self.email_service);
let logger = self.logger.clone();

tokio::spawn(async move {
    // 使用独立超时，不受父 task 取消影响
    match tokio::time::timeout(
        Duration::from_secs(30),
        email_svc.send_welcome_email(&email_clone, &name_clone),
    )
    .await
    {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            // 邮件失败只记录警告，不传播（设计文档 4.2.3 降级策略）
            warn!(logger, "welcome email failed"; "email" => %email_clone, "error" => %e);
        }
        Err(_timeout) => {
            warn!(logger, "welcome email timed out"; "email" => %email_clone);
        }
    }
});
```

## 7. trait 实现

```rust
// 通过 trait 对象（dyn）注入依赖，便于 mock 测试
// Box<dyn Trait> 适合单例依赖；Arc<dyn Trait> 适合跨 task 共享
pub struct UserService {
    repo: Arc<dyn UserRepository + Send + Sync>,
    hasher: Arc<dyn PasswordHasher + Send + Sync>,
    email_svc: Arc<dyn EmailService + Send + Sync>,
}

// Send + Sync 约束：确保可在 tokio 多线程运行时跨 task 共享
// 在构造函数中验证，而非在使用处重复 where 子句

// 编译时验证实现：
// 若 UserServiceImpl 不满足 UserService，此行会报编译错误
fn _assert_impl() {
    fn _check<T: UserServiceTrait>() {}
    _check::<UserServiceImpl>();
}
```

## 8. 日志规范（tracing）

```rust
use tracing::{info, warn, error, instrument};

// #[instrument] 自动记录函数进入/退出和参数（跳过敏感字段）
#[instrument(skip(self, raw_password), fields(email = %email))]
pub async fn create_user(&self, name: &str, email: &str, raw_password: &str) -> Result<...> {
    ...
    info!(user_id = %user_id, "user registered successfully");
    ...
}

// 手动记录结构化日志
warn!(
    email = %email,
    error = %e,
    "welcome email failed (non-critical)"
);

// skip 敏感字段，确保不进入日志
// ↑ #[instrument(skip(raw_password))] 已在函数级跳过
```

## 9. 内联注释惯用法

```rust
// === Step 1: 参数校验 ===
// 在进入业务逻辑前统一校验，业务规则来自需求文档 FR-001 到 FR-003
validate_create_user_input(name, email, raw_password)?;

// === Step 2: 邮箱规范化与唯一性检查 ===
// 邮箱统一转小写：唯一性不区分大小写（FR-003 明确要求 case-insensitive）
let normalized_email = email.to_lowercase();
// 前置 COUNT 检查，避免依赖数据库唯一索引异常（错误消息不可控）
if self.repo.exists_by_email(&normalized_email).await.map_err(CreateUserError::Repository)? {
    return Err(CreateUserError::EmailAlreadyExists { email: normalized_email });
}

// === Step 3: 密码哈希 ===
// raw_password 哈希后清零，防止在内存中残留（SEC-001 内存安全要求）
let hashed_password = {
    let buf = Zeroizing::new(raw_password.to_owned());
    self.hasher.hash(&*buf).map_err(CreateUserError::HashingFailed)?
};

// === Step 4: 持久化 ===
let user = User::register(name.to_owned(), normalized_email.clone(), hashed_password);
let saved_user = self.repo.save(user).await.map_err(CreateUserError::Repository)?;

// === Step 5: 异步发送欢迎邮件（非关键路径）===
// fire-and-forget goroutine，失败降级（设计文档 4.2.3）
// clone 必要值，满足 tokio::spawn 的 'static 生命周期要求
self.spawn_welcome_email(saved_user.id.clone(), normalized_email);

info!(user_id = %saved_user.id, "user registered");
Ok(saved_user.id)
```
