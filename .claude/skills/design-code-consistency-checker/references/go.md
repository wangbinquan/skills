# Go 一致性核对盲点

## 1. 结构维度

- **导出与非导出**：首字母大小写决定可见性；设计标"内部" → 代码大写首字母即泄漏。
- **interface 隐式实现**：编译器不报错但语义未对齐；设计说"实现 OrderRepository" → 应有 `var _ OrderRepository = (*OrderRepoImpl)(nil)` 断言。
- **struct embedding** vs 显式字段：嵌入会带来意外的方法集；设计要求"组合" 但代码用了 embedding 实质继承。
- **指针接收者 vs 值接收者**：设计要求方法修改状态 → 必须指针接收者；混用导致接口实现性丢失。
- **包路径**：`internal/` 包跨模块不可见，与设计的"可见模块"边界一致性。
- **type alias vs type definition**：`type A = B` 与 `type A B` 行为大不同。

## 2. 行为维度

- **error 处理**：忽略 `err` 是 Go 最常见漂移点；设计声明"必须处理" → 代码 `_ = doSomething()` 静默吞没。
- **errors.Is / errors.As 与 sentinel 错误**：设计声明的错误码体系是否真的被 wrap 与 unwrap 一致使用。
- **panic / recover**：设计要求"恢复" → 代码漏 `defer recover()` 致进程退出。
- **goroutine 泄漏**：未关 channel、未取消 context；设计要求"优雅退出"但 goroutine 无 ctx 传入。
- **channel buffer 大小**：与设计"背压策略"不一致 → 阻塞或 OOM。
- **context.Context 传递**：每个外部调用是否携带；超时是否生效。
- **map / slice 的"零值可用"**：未初始化的 map 写入 panic。
- **time.Sleep 阻塞重试**：与设计"指数退避 + 抖动"不一致。

## 3. 接口契约维度

- **net/http 路由**：`http.HandleFunc("/x", h)` vs `gin.GET("/x", h)` —— 路径前缀、trailing slash 差异。
- **gin / echo / chi binding**：`c.ShouldBindJSON` 错误处理是否齐备；`binding:"required"` tag 与设计必填字段对齐。
- **gRPC**：proto 字段编号变更（语义破坏）、`oneof` 字段处理、字段缺省值（proto3 默认值不可区分零值与缺失）。
- **JSON tag**：`json:"name,omitempty"` 与设计"始终返回"不一致；字段大小写。

## 4. 数据模型维度

- **GORM**：`gorm:"column:xxx"` tag 与 DDL 不一致；软删除 `gorm.DeletedAt` 与设计的"硬删除"语义冲突。
- **sqlx / sqlc**：sqlc 由 SQL 生成代码，必须保证 SQL 文件与设计同步。
- **migrate**：迁移脚本命名 `000001_xxx.up.sql` / `.down.sql` 必须成对。
- **time.Time 序列化**：JSON 默认 RFC3339；与前端约定不一致致解析失败。

## 5. 配置维度

- **viper**：`viper.SetDefault` 默认值与设计文档；`viper.AutomaticEnv` 大小写规则。
- **envconfig / kelseyhightower**：tag `default` 与配置中心实际值不一致。
- **flag 与 env 优先级**：与设计"环境变量优先" / "命令行优先"约定一致。

## 6. 依赖维度

- **go.mod 直接 / 间接依赖**：`// indirect` 标注是否一致；`replace` 指令是否仍指向本地路径（不应在 release）。
- **GOPROXY / GOSUMDB**：私有依赖配置。
- **CGO_ENABLED**：设计要求纯 Go（静态二进制） → 代码 `import "C"` 引入 cgo 致跨平台失败。

## 7. 非功能维度

- **logger**：log.Println / fmt.Println 绕过 zap/zerolog/slog。
- **trace_id 透传**：`context.WithValue` 用 string key 易冲突；推荐 unexported type key。
- **goroutine 泄漏检测**：是否有 `goleak.VerifyNone` 在 TestMain。
- **rate limiting**：`golang.org/x/time/rate` 配置与设计 QPS 一致。
- **HTTP server 超时**：`ReadTimeout` / `WriteTimeout` / `IdleTimeout` 默认 0 = 永不超时，与设计 SLA 不一致。
- **TLS 配置**：`MinVersion` 是否设为 TLS1.2+；自签证书在生产环境出现。

## 8. 测试维度

- **table-driven test** 是否覆盖设计声明的所有 case。
- **`t.Parallel()`** 调用导致 fixture 共享时崩。
- **集成测试 build tag**：`//go:build integration` 是否阻止 CI 误跑。
- **race detector**：`go test -race` 是否在 CI 启用。

## 9. 文档维度

- **godoc 注释**：每个导出符号必须有以符号名开头的注释；缺失则 lint 报错但常被忽略。
- **README 的命令**：`go run ./cmd/...` 路径变更后失效。

## 推荐 grep 模式

| 用途 | 模式 |
|------|------|
| 忽略 err | `_ = .*\(\|, _ :=` |
| 绕过日志 | `fmt\.Print\(\|fmt\.Println\(\|fmt\.Printf\(\|log\.Print\(` |
| 接口实现断言 | `var _ \w+ = ` |
| 路由 | `\.(GET\|POST\|PUT\|DELETE\|PATCH\|Handle)\(` |
| context 透传缺失 | `func.*\([^)]*\)` 配合无 ctx 参数 |
| panic | `panic\(` |
