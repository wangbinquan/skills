# Rust 业务日志参考

> 本文件是语言特定补充，**SKILL.md 中的十条核心原则优先**。本文件**不推荐新框架**——你的第一件事永远是从项目里找到既有 logger。Rust 生态主要两派：`log` facade（简单项目、库最多用）与 `tracing`（服务端、异步、更强的结构化 + span）。

---

## 1. 如何定位项目已有的 logger

### 1.1 生产代码里的使用方式

```rust
// tracing（服务端主流）
use tracing::{info, warn, error, debug, trace, instrument, Span};
info!(order_id = %oid, user_id = %uid, "Order created");

// log facade（库常用；应用层通常搭 env_logger / simplelog / log4rs 作为实现）
use log::{info, warn, error, debug, trace};
info!("Order created order_id={} user_id={}", oid, uid);

// 项目自建（常见在 pkg/logger 或 util/log）
use crate::logger::init_logger;
```

### 1.2 检索正则

```
use\s+tracing::|tracing::(info|warn|error|debug|trace|instrument)!|
use\s+log::|log::(info|warn|error|debug|trace)!|
env_logger::|tracing_subscriber::|slog::|simplelog::|log4rs::
```

### 1.3 配置位置

- `main.rs` / `lib.rs`：`tracing_subscriber::fmt().init()` / `env_logger::init()` / `tracing_subscriber::registry().with(...).init()`
- `Cargo.toml`：看 `[dependencies]` 里是 `log` + `env_logger` 还是 `tracing` + `tracing-subscriber`
- RUST_LOG 环境变量控制默认级别

### 1.4 识别旁路

```
println!\(|eprintln!\(|print!\(|eprint!\(|dbg!\(
```

业务代码中出现即 **P0**（`dbg!` 尤其：仅限本地调试，绝不能进生产提交）。

---

## 2. 良好 / 不良示例对照

### 2.1 `tracing` 的结构化字段（首选）

```rust
// BAD：字段拼进 message
info!("processing order {} for user {}", oid, uid);

// GOOD：K-V 字段（% 取 Display，? 取 Debug）
info!(order_id = %oid, user_id = %uid, "Processing order");

// 传入已有字段（tracing 的字段有类型）
info!(
    order_id = oid,
    user_id = uid,
    amount = %amount,                          // Display
    items = ?items,                             // Debug
    "Order created"
);
```

`%` 调用 `Display`，`?` 调用 `Debug`；对敏感类型确保 `Display` / `Debug` 不暴露机密（见 2.6）。

### 2.2 `log` facade 的 K-V（较弱）

```rust
// log >= 0.4.21 支持结构化 K-V（实现方需同步支持）
info!(target: "order", order_id = oid, user_id = uid; "Order created");

// 传统 log 只有 println 风格，退而求其次（message 内拼字段）
info!("Order created order_id={} user_id={}", oid, uid);
```

### 2.3 span 传递上下文（`tracing` 独占优势）

```rust
// 在入口开一个 span，里面的子日志自动带上 span 字段
use tracing::instrument;

#[instrument(skip(self, req), fields(user_id = req.user_id))]
pub async fn create_order(&self, req: CreateOrderRequest) -> Result<Order> {
    info!("order create received");
    // span 上 user_id 自动附着在这行日志
    let order = self.do_create(req).await?;
    info!(order_id = order.id, "order create succeeded");
    Ok(order)
}
```

异步任务（`tokio::spawn`）跨越 span 边界时：
```rust
let span = tracing::Span::current();
tokio::spawn(async move {
    let _guard = span.enter();   // 或 .in_scope(...) / instrument(span)
    do_work().await;
});
```

### 2.4 错误处理 + 日志

Rust 用 `Result<T, E>`。原则与 Go 相似：**中间层 wrap，最终处理点记录一次**。

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ServiceError {
    #[error("charge failed: {source}")]
    Charge { #[source] source: anyhow::Error },
}

// 中间层：不 log，wrap
fn pay(order_id: i64) -> Result<(), ServiceError> {
    charge(order_id).map_err(|e| ServiceError::Charge { source: e.into() })
}

// 最终处理点：log 一次，带完整 cause chain
match pay(order_id) {
    Ok(_) => info!(order_id, "Pay succeeded"),
    Err(e) => error!(order_id, error = ?e, "Failed to pay"),
}
```

`error = ?e` 以 `Debug` 输出，`thiserror` / `anyhow` 的 `Debug` 会展开整条 cause chain。若只想要 `Display`，用 `%e`；但通常想看栈/cause，用 `?`。

### 2.5 panic

```rust
// 顶层 catch + 上报
std::panic::set_hook(Box::new(|info| {
    error!(panic = %info, "panic captured");
}));

// tokio：spawn 的 task panic 不会终止 runtime，但会被丢弃；
// 项目通常在封装 spawn_blocking / JoinHandle 处统一 log
```

### 2.6 敏感数据脱敏

```rust
// BAD：默认 Debug 打印整个 struct
#[derive(Debug)]
struct User { id: i64, email: String, password_hash: String }
error!(?user, "login failed");   // password_hash 泄漏

// GOOD：手写 Debug / Display，排除敏感字段
use std::fmt;
impl fmt::Debug for User {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("User")
         .field("id", &self.id)
         .field("email_masked", &mask_email(&self.email))
         .finish()  // password_hash 完全不输出
    }
}

// GOOD：用 secrecy crate（若项目已引入）
use secrecy::Secret;
struct User { id: i64, password: Secret<String> }  // password 的 Debug 只打 "[REDACTED]"
```

**坑**：`tracing` 的 `#[instrument]` 会自动把所有参数打到 span 字段上。参数含敏感数据时用 `skip(...)` 排除。

```rust
#[instrument(skip(password))]
async fn login(username: &str, password: &str) { ... }
```

### 2.7 日志注入防护

```rust
fn safe_for_log(s: &str) -> String {
    s.replace(['\n', '\r', '\t'], "_")
}

info!(path = %safe_for_log(req.path()), "HTTP request received");

// 若 subscriber 用 JSON formatter，字段值会被自动转义，风险更低——优先结构化字段
```

### 2.8 循环 / 热点节流

```rust
// BAD
for msg in &batch {
    process(msg);
    info!(id = msg.id, "processed");
}

// GOOD
let mut ok = 0usize; let mut fail = 0usize;
for msg in &batch {
    match process(msg) {
        Ok(_) => ok += 1,
        Err(e) => {
            fail += 1;
            warn!(id = msg.id, error = ?e, "Failed to process message");
        }
    }
}
info!(total = batch.len(), ok, fail, duration_ms, "Batch processed");
```

### 2.9 级别与 `Level::*`

```rust
trace!(key = %k, "cache probe");
debug!(key = %k, "Cache miss");
info!(order_id = oid, user_id = uid, "Order created");
warn!(attempt = n, cause = %reason, "Retrying remote call");
error!(topic = %t, order_id = oid, error = ?e, "Failed to publish event");
```

`log::log_enabled!(log::Level::Debug)` / `tracing::enabled!(Level::DEBUG)` 可做级别守卫（若有昂贵计算）。

### 2.10 `tracing` + OpenTelemetry

若项目启用了 `tracing-opentelemetry`，span 会导出为分布式 trace。日志应尽量通过 span 携带上下文，而不是手工拼 trace_id 字符串——保持 **一个** 源头真相。

---

## 3. 常见反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `println!` / `eprintln!` / `print!` 业务用 | 无等级、无采集 | 项目 logger |
| `dbg!(x)` 提交 | 临时调试 | 提交前清除 |
| `info!("{}", e)` 只打 Display 丢 cause | 调试困难 | `error = ?e` |
| `#[derive(Debug)]` + 整个打印 | 含敏感字段 | 手写 Debug |
| `#[instrument]` 不 skip 敏感参数 | 密码 / token 进 span | `skip(password)` |
| 嵌套异步 `spawn` 不传 span | 日志丢上下文 | `span.in_scope` 或 `instrument(span)` |
| 并发热路径 `info!` per-iteration | 日志风暴 | 汇总 |
| `unwrap()` / `expect(...)` 业务路径 | panic 丢上下文 | `?` + wrap + 顶层 log |
| 两套 logger（log 与 tracing 混用没桥接） | 日志格式不统一 | 用 `tracing-log` 桥接，或统一到一套 |
| `RUST_LOG=trace` 生产 | 日志爆炸 | 生产默认 info/warn |

---

## 4. 检视要点清单（Rust 专属）

- [ ] 业务代码是否有 `println!` / `eprintln!` / `dbg!` 旁路
- [ ] `#[instrument]` 是否 skip 了敏感参数
- [ ] 含敏感字段的 struct 是否手写 `Debug` / 使用 `secrecy::Secret`
- [ ] 错误路径是否在最终处理点用 `error = ?e` 打印完整 cause
- [ ] 异步 `spawn` 是否把 span 传入新任务
- [ ] `log` 与 `tracing` 是否在同一项目并存且未桥接（用 `tracing-log`）
- [ ] 级别过滤是否在 release 配置里正确（`RUST_LOG` / subscriber filter）
- [ ] 昂贵 `format!` 是否前置了 `enabled!` 级别守卫
- [ ] 业务 panic 是否被 `panic::set_hook` 捕获并记录
- [ ] 循环 / 批处理 / 流式消费里是否有未节流 INFO
