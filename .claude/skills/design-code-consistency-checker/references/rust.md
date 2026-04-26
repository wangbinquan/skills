# Rust 一致性核对盲点

## 1. 结构维度

- **可见性**：`pub` / `pub(crate)` / `pub(super)` —— 设计意图"crate 内部" → 多 pub 即出口面泄漏。
- **trait 实现**：设计声明实现 trait → 必须 `impl X for Y`；显式实现 vs blanket impl。
- **`#[derive(...)]` 列表**：与设计要求的能力（Clone/Copy/Debug/PartialEq/Eq/Hash/Serialize/Deserialize）一致。
- **`#[non_exhaustive]`**：设计要求"枚举将来扩展" → 必须标注，否则下游模式匹配紧耦合。
- **生命周期参数**：lifetime elision 后实际生命周期与设计意图（borrow 来源）一致。
- **`Send` / `Sync`** auto trait：设计要求跨线程 → 检查类型是否真的 Send + Sync；`Rc` / `RefCell` 即不行。
- **`unsafe` 块**：设计未授权使用 unsafe → 任何 unsafe 都是 critical 漂移。

## 2. 行为维度

- **错误处理**：`Result<T, E>` 必须传播；`unwrap()` / `expect()` 在生产代码中直接 panic，与设计的"无 panic"承诺冲突。
- **`?` 与错误类型转换**：`From<E1> for E2` 是否齐备；`anyhow` / `thiserror` 选择与设计一致。
- **`async` / `await`**：runtime 选择（tokio / async-std）；阻塞操作（`std::fs`）误用在 async 函数。
- **`tokio::spawn` 错误丢失**：子任务 panic 不传播。
- **`Mutex` / `RwLock` poisoning**：设计要求"持续可用" → 必须处理 poison 错误而非 unwrap。
- **`Drop` 实现**：设计要求"显式释放" → Drop trait 必须正确；不要 panic in Drop。
- **数值溢出**：debug 模式 panic、release 模式 wrap；设计若强一致需用 `checked_*` / `wrapping_*` / `saturating_*`。

## 3. 接口契约维度

- **axum / actix-web / rocket**：路由宏与设计一致；`#[derive(Deserialize)]` 字段重命名 `serde(rename = "...")`。
- **tonic (gRPC)**：proto 字段编号、`Option<T>` 字段（proto3 optional）。
- **serde 默认行为**：未知字段是否报错（`deny_unknown_fields`）；与设计的"严格契约"一致。
- **错误响应序列化**：`IntoResponse` 实现的状态码与设计一致。

## 4. 数据模型维度

- **diesel / sea-orm / sqlx**：schema 与实际表 DDL 一致；migrations 顺序。
- **`Decimal` 精度**：金额字段使用 `rust_decimal` 而非 `f64`。
- **`chrono` / `time`**：时区处理；序列化格式（RFC3339）。

## 5. 配置维度

- **`config-rs` / `figment`**：环境变量前缀、嵌套 key 分隔符。
- **`#[serde(default)]`**：缺省值与设计文档一致。
- **`cargo features`**：默认 feature 集与设计一致；`default-features = false` 是否被尊重。

## 6. 依赖维度

- **Cargo.toml 直接依赖 vs 间接依赖**：`cargo tree` 与设计期望对齐。
- **feature unification**：跨 crate 启用 feature 可能引入设计未声明的能力。
- **`patch` / `replace` 段**：是否仍指向本地或 fork。
- **MSRV (Minimum Supported Rust Version)** 与设计 / CI 一致。

## 7. 非功能维度

- **日志**：`tracing` / `log` 与设计一致；`println!` / `eprintln!` 是绕过日志的直接信号。
- **trace span 传播**：`tracing::instrument` 是否覆盖设计声明的关键路径。
- **`tokio` runtime flavor**：multi_thread / current_thread 与设计 SLA 一致。
- **panic 策略**：`panic = "abort"` vs `"unwind"` 与设计一致。
- **`#[deny(unsafe_code)]`** 是否在 lib.rs 启用。

## 8. 测试维度

- **`#[cfg(test)]`** 模块组织。
- **`tokio::test` runtime**：与生产 runtime flavor 是否一致。
- **`proptest` / `quickcheck`**：性质测试覆盖设计声明的不变量。
- **`cargo bench` / criterion**：基准测试覆盖设计 SLA。

## 9. 文档维度

- **`///` 文档注释**：`# Errors` / `# Panics` / `# Safety` 段是否与签名一致。
- **`cargo doc` 生成的链接** 是否完整。
- **README `cargo run`** 命令是否仍可用。

## 推荐 grep 模式

| 用途 | 模式 |
|------|------|
| 绕过日志 | `println!\|eprintln!\|dbg!` |
| panic 风险 | `\.unwrap\(\)\|\.expect\(\|panic!\|unreachable!\|todo!\|unimplemented!` |
| unsafe | `\bunsafe\s*\{\|unsafe\s+fn\|unsafe\s+impl` |
| 路由 | `#\[(get\|post\|put\|delete\|patch)` |
| 配置 | `std::env::var\|envy::\|config::` |
