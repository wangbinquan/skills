# Rust 专属盲点

Rust 通过类型系统排除了大量传统稳定性问题（UAF、data race），但仍有"逃逸口"——`unwrap` panic、`unsafe`、async 阻塞、`Arc<Mutex>` 死锁等。审视 Rust 代码时聚焦在这些"绕过编译器保证"的地方。

---

## 维度 1 · null_safety（panic via unwrap/expect）

Rust 没有 null，但有 `Option<T>` / `Result<T, E>`，强解包会 panic：

```rust
// BAD
let user = repo.find_by_id(id).unwrap();   // None → panic

// GOOD
let user = repo.find_by_id(id)
    .ok_or_else(|| MyError::UserNotFound(id))?;
```

**审视要点**：
- 找所有 `.unwrap()` / `.expect(...)`，区分两种情况：
  1. **生产代码** → 默认 critical（除非有"逻辑上一定 Some"的明确不变式 + 注释说明）
  2. **测试 / 一次性脚本** → 可接受
- `.unwrap_or(default)` / `.unwrap_or_else(|_| ...)` / `?` 是好的
- 索引访问 `vec[i]` 越界 panic；用 `vec.get(i)` 返回 `Option`
- `slice::first()` / `last()` 返回 `Option`
- `String::from_utf8(bytes).unwrap()` 在非 UTF-8 输入时 panic

```rust
// BAD
let s = std::str::from_utf8(&bytes).unwrap();

// GOOD
let s = std::str::from_utf8(&bytes)
    .map_err(|e| MyError::Encoding(e))?;
```

---

## 维度 2 · resource_leak

Rust 的 RAII（Drop trait）默认管理资源；**逃逸场景**：

- `std::mem::forget(x)` 显式跳过 Drop
- `Box::leak(b)` 永不释放（`'static` 生命周期）
- `Rc<RefCell<...>>` 循环引用 → 永不 drop（用 `Weak`）
- `tokio::spawn` 启动 task 不持有 handle 也不带 cancellation → goroutine 类泄漏
- `tokio::sync::mpsc::channel` 一端 drop 而另一端不感知

```rust
// BAD
tokio::spawn(async move {
    loop { ... }   // 永不退出
});
```

修：用 `tokio::select!` 配合 `CancellationToken` 或 `tokio_util::sync::CancellationToken`。

---

## 维度 3 · concurrency

```rust
// BAD — Arc<Mutex<HashMap>> 持锁过长
let map = state.map.lock().unwrap();
let value = expensive_io().await;   // ❌ 持锁跨 await（async）；同步代码持锁跨 IO
map.insert(key, value);
```

修：先释锁再 IO，或 IO 后再短持锁写入；async 中用 `tokio::sync::Mutex`（可跨 await，但是不可重入且开销大于 std）。

- `std::sync::Mutex` 在 async 中跨 `.await` 持有 → 编译可能允许但语义错（其他 task 阻塞）
- `RwLock` 写者饥饿：大量读 + 少量写时写者迟迟拿不到
- `Mutex` poisoning：持锁时 panic 后再 `lock()` 返回 `Err`，需处理
- 死锁：两个 `Arc<Mutex>` 顺序不一致；用 `parking_lot` 的 deadlock detection（debug 模式）
- `Send` / `Sync` 边界：`Rc` / `RefCell` 不 Send，跨 thread 编译失败（这反而是好的）
- `unsafe impl Send for ...` 必须有充分理由

---

## 维度 4 · performance

- 不必要的 `clone()` 在热路径
- `String` / `Vec` 在循环内反复分配（`.clear()` 复用已分配空间）
- `Box<dyn Trait>` vs 静态分发：动态分发开销
- `std::collections::HashMap` 默认 hasher（DoS-resistant SipHash）较慢；信任输入时用 `ahash` / `fxhash`
- async：在 async 函数中调阻塞函数（`std::thread::sleep`、`std::fs::read`）→ 阻塞 executor 线程
- `tokio::task::spawn_blocking` 用于阻塞调用
- 不必要的 box / heap 分配（trait object 不必要）

---

## 维度 5 · memory

- 单线程 `Rc<RefCell<...>>` 循环引用 → 永不释放
- `Vec::with_capacity` 未估对 → 反复扩容
- `format!` 在热路径 → 用 `write!` 复用 buffer
- `String::from_utf8_lossy` 大量替换 → 临时分配
- 自实现的 Arena / Pool 不 reset
- channel buffer 过大 → 反压失效

---

## 维度 6 · error_handling

```rust
// BAD
let _ = doit();   // 错误丢弃
let r = doit().expect("doit failed");   // 模糊上下文

// GOOD
let r = doit()
    .with_context(|| format!("doit failed for id={}", id))?;   // anyhow / eyre
// or
let r = doit().map_err(|e| MyError::Doit { id, source: e })?;
```

- `?` 操作符是好习惯
- `panic` 在 lib 代码 → 一般是 bug；libs 应返回 `Result`
- `unwrap_or_default` 静默吞错
- 自定义 Error 类型用 `thiserror` / `snafu` 简化
- async：错误传播一致用 `Result<T, E>` 返回；`#[tokio::main]` 内 panic 终止整个程序

---

## 维度 7 · external_call

```rust
// BAD
let resp = reqwest::get(url).await?;   // 默认无 timeout

// GOOD
let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(5))
    .build()?;
let resp = client.get(url).send().await?;
```

- `reqwest::Client` 默认无总超时
- `tokio::time::timeout` 包装 future 设硬超时
- 重试用 `backoff` / `tokio-retry` crate
- gRPC（tonic）：`Request::set_timeout` 或 `Channel` 配
- 数据库连接池（sqlx / sea-orm）max_connections 配置
- 缺断路器 → `failsafe-rs`

---

## 维度 8 · boundary

- 整数溢出：debug 模式 panic；release 模式 wrap（!）—— 用 `checked_add` / `saturating_add` / `wrapping_add` 显式
- `as` 转型不检查边界（`i64 as i32` 截断）
- `slice[a..b]` 越界 panic；用 `slice.get(a..b)` → Option
- 浮点 NaN / Infinity（`f64::NAN != f64::NAN`）
- `String::pop` 返回 `Option<char>`
- `Vec::resize` 大小为 0 时仍可调用

---

## 维度 9 · observability

- `println!` / `eprintln!` 在生产代码 → 用 `tracing` / `log` crate
- `tracing` 的 `instrument` 宏自动记录函数级 span
- 错误路径不带 context：`?` 链丢失中间错误信息（用 `anyhow!` / `with_context`）
- async 中 `tracing::Span::current()` 跨 await 自动延续（设了 instrument 才行）

---

## 维度 10 · config_env

- `std::env::var("X")?` 缺失返回 Err（OK）；`std::env::var("X").unwrap_or_default()` 静默
- `config` / `figment` crate：schema 校验
- 编译期常量（`const` / `static`）vs 运行时配置

---

## 维度 11 · data_consistency

- sqlx：`Transaction::commit().await?` 必须显式调；drop 不 commit 而是 rollback
- 跨多个 await 持有 connection（避免）
- `RwLock` 读 → 写之间状态可能变化（典型 TOCTOU）
- async cancellation：future 被 drop 时，已发出的写不可撤销 → 半完成状态

---

## 维度 12 · time_encoding

- `std::time::SystemTime` 是 wall clock（可跳变）
- `std::time::Instant` 是单调（不能跨进程）
- `chrono::Utc::now()` / `chrono::Local::now()` 区分清楚
- `chrono` 0.4 时区 API 改动；新项目可用 `time` crate
- string 默认是 UTF-8（强制），byte 操作需 `&[u8]`
- `str::to_lowercase()` 是 Unicode-aware

---

## 维度 13 · api_compat

- 公共 struct 加字段（非 `#[non_exhaustive]`）→ pattern match 上游破坏
- `pub fn` 签名变更 → SemVer major
- enum 加 variant（非 `#[non_exhaustive]`）→ exhaustive match 破坏
- trait 加方法（无 default impl）→ 实现者破坏
- async fn / impl Trait 返回类型在 trait 中（RPITIT, async-trait）有兼容性陷阱

---

## 工具与生态信号

- `Cargo.toml` 含 `tokio` → async 生态；关注 await 边界
- 含 `tracing` / `tracing-subscriber` → logger 已有
- 含 `anyhow` + `thiserror` → 错误处理风格成熟
- 含 `sqlx` / `sea-orm` / `diesel` → DB 客户端
- 含 `clippy` 在 CI（`cargo clippy -- -D warnings`）→ 大量模式已被覆盖
- 项目跑 `miri` → UB / unsafe 已被严格检测
- `unsafe` 块 grep 命中数：每一处都应有"为什么必要"的注释；无注释 → critical

**审视严重度调整**：
- 项目 `#[deny(unsafe_code)]` → unsafe 维度直接清零
- 项目 `#![deny(warnings)]` + clippy strict → 整体降级
