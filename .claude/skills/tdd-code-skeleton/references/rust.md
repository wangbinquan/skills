# Rust 代码骨架参考规范

## 目录
1. [Rustdoc注释规范](#rustdoc)
2. [Trait骨架模板](#trait-template)
3. [Struct + impl骨架模板](#struct-template)
4. [错误类型定义（thiserror）](#error-types)
5. [TODO注释规范](#todo)
6. [Rust惯用约定](#rust-idioms)

---

## Rustdoc注释规范 {#rustdoc}

Rust使用 `///` 作为文档注释（生成到rustdoc），`//` 作为普通注释。
`//!` 用于模块/crate级别文档（写在文件顶部）。

### 模块注释（文件顶部）

```rust
//! # user 模块
//!
//! 提供用户管理相关的核心业务服务。
//!
//! ## 设计思路
//!
//! 遵循DDD分层架构，本模块位于应用服务层（Application Layer）。
//! 所有外部依赖通过trait定义，便于测试中进行Mock替换。
//! 错误处理采用`Result<T, E>`，不使用panic（`unimplemented!`除外）。
//!
//! ## 使用示例
//!
//! ```rust
//! let repo = Arc::new(PostgresUserRepository::new(pool));
//! let email_svc = Arc::new(SmtpEmailService::new(config));
//! let svc = UserService::new(repo, email_svc);
//! let user_id = svc.create_user("Alice", "alice@example.com", "Pass123!").await?;
//! ```
```

### struct/trait注释

```rust
/// 用户服务，负责用户注册、查询、更新等核心业务操作。
///
/// 作为应用层服务，`UserService`协调领域对象（`User`）与基础设施层
/// （`UserRepository`、`EmailService`）之间的交互。
///
/// # 设计思路
///
/// 通过构造函数注入`Arc<dyn Trait>`形式的依赖，实现所有权共享的同时
/// 保持面向接口编程。这使得测试中可以替换为Mock实现。
///
/// # 实现思路
///
/// 核心操作使用`async/await`异步执行，所有IO操作均为非阻塞；
/// 错误处理使用`UserError`枚举，通过`?`操作符传播，保留完整调用链。
///
/// # 主要依赖
///
/// - `repo: Arc<dyn UserRepository>` — 用户数据持久化接口
/// - `email_svc: Arc<dyn EmailService>` — 邮件通知服务接口
///
/// # 线程安全性
///
/// `Send + Sync`。所有依赖均为`Arc<dyn Trait + Send + Sync>`，
/// 无内部可变状态（若需要，使用`Mutex`/`RwLock`保护）。
///
/// # 设计约束
///
/// - 邮箱在系统中全局唯一（来自设计文档第3.2节）
/// - 密码使用bcrypt哈希，强度因子不低于12（来自安全需求）
```

### 方法注释

```rust
/// 注册新用户，校验邮箱唯一性并发送欢迎邮件。
///
/// # 实现思路
///
/// 采用"先检查后执行"模式：写入前先验证邮箱唯一性，
/// 给出明确的业务错误（`UserError::EmailAlreadyExists`）。
/// 密码使用bcrypt不可逆哈希存储。邮件通过`tokio::spawn`异步发送。
///
/// # 实现步骤
///
/// 1. 参数校验：验证name非空(2-50字符)、email合法格式、password强度
/// 2. 唯一性检查：`self.repo.exists_by_email(&email).await?`
/// 3. 密码哈希：`bcrypt::hash(&password, 12)?`
/// 4. 构建User实体：填充name、email、password_hash、created_at
/// 5. 持久化：`self.repo.save(&user).await?`
/// 6. 异步发送欢迎邮件：`tokio::spawn(async move { ... })`
/// 7. 返回新用户ID：`Ok(user.id)`
///
/// # 参数
///
/// * `name` - 用户名，长度2-50字符
/// * `email` - 用户邮箱，必须合法格式，全局唯一
/// * `password` - 明文密码，至少8位含大小写字母和数字
///
/// # 返回值
///
/// 返回新用户的`UserId`，或包装为`UserError`的错误。
///
/// # 错误
///
/// * `UserError::InvalidInput` — 参数校验失败
/// * `UserError::EmailAlreadyExists` — 邮箱已被注册
/// * `UserError::Repository` — 数据库操作失败
///
/// # 示例
///
/// ```rust
/// let id = svc.create_user("Alice", "alice@example.com", "Pass123!").await?;
/// println!("Created user: {}", id);
/// ```
```

---

## Trait骨架模板 {#trait-template}

```rust
// src/user/traits.rs
use async_trait::async_trait;
use crate::user::{User, UserId, UserDTO, UpdateUserRequest};
use crate::user::errors::UserError;

/// 用户服务接口，定义用户管理相关操作的契约。
///
/// 使用`async_trait`宏支持异步方法。所有实现必须是`Send + Sync`，
/// 以便在多线程异步运行时（如tokio）中安全使用。
#[async_trait]
pub trait UserServiceTrait: Send + Sync {
    /// 注册新用户。[完整注释见上方规范]
    async fn create_user(
        &self,
        name: &str,
        email: &str,
        password: &str,
    ) -> Result<UserId, UserError>;

    /// 根据ID查询用户信息。
    ///
    /// 若用户不存在，返回`Ok(None)`而非`Err`（"找不到"不是错误）。
    async fn get_user_by_id(&self, id: &UserId) -> Result<Option<UserDTO>, UserError>;

    /// 更新用户信息（部分更新）。
    async fn update_user(&self, id: &UserId, req: UpdateUserRequest) -> Result<(), UserError>;

    /// 注销用户账户（软删除）。
    async fn delete_user(&self, id: &UserId) -> Result<(), UserError>;
}

/// 用户数据访问接口（Repository模式）。
///
/// Repository接口位于领域层，具体实现（如`PostgresUserRepository`）
/// 位于基础设施层，实现领域层与持久化技术的解耦。
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn save(&self, user: &User) -> Result<User, UserError>;
    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, UserError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, UserError>;
    async fn exists_by_email(&self, email: &str) -> Result<bool, UserError>;
    async fn delete(&self, id: &UserId) -> Result<(), UserError>;
}
```

---

## Struct + impl骨架模板 {#struct-template}

```rust
// src/user/service.rs
use std::sync::Arc;
use async_trait::async_trait;
// TODO: 根据实现步骤确定具体需要的use

use crate::user::{User, UserId, UserDTO, UpdateUserRequest};
use crate::user::errors::UserError;
use crate::user::traits::{UserRepository, UserServiceTrait, EmailServiceTrait};

/// 用户服务实现。[完整注释见上方规范]
pub struct UserService {
    /// 用户数据访问对象
    repo: Arc<dyn UserRepository>,
    /// 邮件通知服务
    email_svc: Arc<dyn EmailServiceTrait>,
}

impl UserService {
    /// 创建`UserService`实例，注入所需依赖。
    ///
    /// # 实现步骤
    ///
    /// 1. 验证依赖已正确初始化（Arc不为空指针，由类型系统保证）
    /// 2. 构建并返回UserService实例
    ///
    /// # 参数
    ///
    /// * `repo` - 用户数据访问对象，`Arc`共享所有权
    /// * `email_svc` - 邮件通知服务，`Arc`共享所有权
    pub fn new(
        repo: Arc<dyn UserRepository>,
        email_svc: Arc<dyn EmailServiceTrait>,
    ) -> Self {
        // TODO: Step 1 - 构建实例
        //   - UserService { repo, email_svc }
        unimplemented!("TODO: implement UserService::new")
    }
}

#[async_trait]
impl UserServiceTrait for UserService {
    /// [注释同Trait定义]
    async fn create_user(
        &self,
        name: &str,
        email: &str,
        password: &str,
    ) -> Result<UserId, UserError> {
        // TODO: Step 1 - 参数校验
        //   - validate_name(name).map_err(UserError::InvalidInput)?
        //   - validate_email(email).map_err(UserError::InvalidInput)?
        //   - validate_password(password).map_err(UserError::InvalidInput)?

        // TODO: Step 2 - 邮箱唯一性检查
        //   - if self.repo.exists_by_email(email).await? {
        //       return Err(UserError::EmailAlreadyExists(email.to_string()));
        //     }

        // TODO: Step 3 - 密码哈希
        //   - let hash = bcrypt::hash(password, 12)
        //       .map_err(|e| UserError::Internal(e.to_string()))?

        // TODO: Step 4 - 构建User实体
        //   - let user = User {
        //       id: UserId::new(),
        //       name: name.to_string(),
        //       email: email.to_string(),
        //       password_hash: hash,
        //       created_at: Utc::now(),
        //       status: UserStatus::Active,
        //     }

        // TODO: Step 5 - 持久化
        //   - let saved = self.repo.save(&user).await?

        // TODO: Step 6 - 异步发送欢迎邮件
        //   - let email_svc = Arc::clone(&self.email_svc)
        //   - let user_clone = saved.clone()
        //   - tokio::spawn(async move {
        //       if let Err(e) = email_svc.send_welcome_email(&user_clone).await {
        //           tracing::warn!("Failed to send welcome email: {}", e)
        //       }
        //     })

        // TODO: Step 7 - 返回用户ID
        //   - Ok(saved.id)
        unimplemented!("TODO: implement create_user")
    }

    async fn get_user_by_id(&self, id: &UserId) -> Result<Option<UserDTO>, UserError> {
        // TODO: Step 1 - 参数校验
        //   - 校验id非零值（依赖UserId的不变式保证）

        // TODO: Step 2 - 查询Repository
        //   - let user_opt = self.repo.find_by_id(id).await?

        // TODO: Step 3 - 转换为DTO并返回
        //   - Ok(user_opt.map(UserDTO::from))
        unimplemented!("TODO: implement get_user_by_id")
    }

    async fn update_user(&self, id: &UserId, req: UpdateUserRequest) -> Result<(), UserError> {
        // TODO: Step 1 - 加载现有用户（确认存在）
        //   - let user = self.repo.find_by_id(id).await?
        //       .ok_or_else(|| UserError::NotFound(id.to_string()))?

        // TODO: Step 2 - 应用更新（部分更新）
        //   - if let Some(name) = req.name { user.name = name }
        //   - if let Some(email) = req.email { /* 校验格式和唯一性 */ user.email = email }

        // TODO: Step 3 - 持久化
        //   - self.repo.save(&user).await?

        // TODO: Step 4 - 返回
        //   - Ok(())
        unimplemented!("TODO: implement update_user")
    }

    async fn delete_user(&self, id: &UserId) -> Result<(), UserError> {
        // TODO: Step 1 - 检查用户是否存在
        // TODO: Step 2 - 软删除（更新status为Deactivated）
        // TODO: Step 3 - 持久化
        unimplemented!("TODO: implement delete_user")
    }
}
```

---

## 错误类型定义（thiserror） {#error-types}

```rust
// src/user/errors.rs
use thiserror::Error;

/// 用户服务相关的错误枚举。
///
/// 使用`thiserror`宏自动实现`std::error::Error`，
/// 使调用方可通过`match`精确处理每种错误场景。
///
/// # 设计思路
///
/// 将业务错误（如`EmailAlreadyExists`）和技术错误（如`Repository`）
/// 分开定义，使HTTP层可以将业务错误映射为4xx，技术错误映射为5xx。
#[derive(Debug, Error)]
pub enum UserError {
    /// 输入参数校验失败
    #[error("invalid input: {0}")]
    InvalidInput(String),

    /// 邮箱已被注册
    #[error("email already exists: {0}")]
    EmailAlreadyExists(String),

    /// 用户不存在
    #[error("user not found: {0}")]
    NotFound(String),

    /// 数据库操作失败（包装底层错误）
    #[error("repository error: {0}")]
    Repository(#[from] sqlx::Error),

    /// 内部服务错误
    #[error("internal error: {0}")]
    Internal(String),
}
```

---

## TODO注释规范 {#todo}

```rust
async fn process_payment(
    &self,
    order_id: &OrderId,
    payment: PaymentInfo,
) -> Result<PaymentResult, OrderError> {
    // TODO: Step 1 - 加载订单（悲观锁，防止并发支付）
    //   - let order = self.order_repo.find_by_id_for_update(order_id).await?
    //       .ok_or_else(|| OrderError::NotFound(order_id.to_string()))?
    //   - if order.status != OrderStatus::PendingPayment {
    //       return Err(OrderError::InvalidStatus { got: order.status, want: OrderStatus::PendingPayment })
    //     }

    // TODO: Step 2 - 调用支付网关（含重试，指数退避）
    //   - let result = retry(ExponentialBackoff::default(), || async {
    //       self.payment_gw.charge(&payment).await.map_err(backoff::Error::transient)
    //     }).await?
    //   - 注意：PaymentDeclinedError是永久性错误，不应重试

    // TODO: Step 3 - 更新订单状态（事务内）
    //   - order.status = if result.success { OrderStatus::Paid } else { OrderStatus::PaymentFailed }
    //   - order.payment_id = Some(result.payment_id.clone())
    //   - order.updated_at = Utc::now()
    //   - self.order_repo.save(&order).await?

    // TODO: Step 4 - 发布领域事件
    //   - let event = if result.success { OrderEvent::Paid { order_id: order_id.clone() } }
    //                 else { OrderEvent::PaymentFailed { order_id: order_id.clone() } }
    //   - self.event_bus.publish(event).await?

    // TODO: Step 5 - 返回结果
    //   - Ok(result)
    unimplemented!("TODO: implement process_payment")
}
```

---

## Rust惯用约定 {#rust-idioms}

```rust
// 1. 所有权与借用
fn process(data: String) -> String { ... }     // 获取所有权
fn read(data: &str) -> usize { ... }           // 借用（只读）
fn modify(data: &mut Vec<i32>) { ... }         // 可变借用

// 2. 常用类型
Option<T>           // 可能为None（替代null）
Result<T, E>        // 可能失败的操作（替代异常）
Arc<T>              // 多线程共享所有权
Arc<Mutex<T>>       // 多线程共享可变状态
Arc<RwLock<T>>      // 多线程共享，读多写少

// 3. 错误传播
fn risky() -> Result<i32, MyError> {
    let value = other_fn()?;  // ? 自动传播error
    Ok(value + 1)
}

// 4. 异步函数（tokio运行时）
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> { ... }

// async函数签名
async fn fetch_user(id: UserId) -> Result<User, UserError> { ... }

// 5. 构建者模式（复杂对象构建）
#[derive(Default)]
pub struct UserBuilder {
    name: Option<String>,
    email: Option<String>,
}
impl UserBuilder {
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into()); self
    }
    pub fn build(self) -> Result<User, UserError> {
        // TODO: 校验必填字段，构建User
        unimplemented!()
    }
}

// 6. newtype模式（类型安全的ID）
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UserId(uuid::Uuid);
impl UserId {
    pub fn new() -> Self { Self(uuid::Uuid::new_v4()) }
    pub fn as_str(&self) -> &str { /* ... */ unimplemented!() }
}
impl std::fmt::Display for UserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

// 7. derive宏常用组合
#[derive(Debug, Clone, PartialEq, Eq, Hash)]            // 值语义
#[derive(serde::Serialize, serde::Deserialize)]          // 序列化
#[derive(sqlx::FromRow)]                                 // 数据库映射
```
