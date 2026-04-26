# Go 业务日志参考

> 本文件是语言特定补充，**SKILL.md 中的十条核心原则优先**。本文件**不推荐新框架**——你的第一件事永远是从项目里找到既有 logger。Go 项目可能用 `log/slog`（1.21+）、`zap`、`zerolog`、`logrus`、项目自建，或少数老项目直接用标准 `log`。

---

## 1. 如何定位项目已有的 logger

### 1.1 生产代码里的获取方式

```go
// log/slog（Go 1.21+ 标准结构化日志）
slog.Info("Order created", "order_id", oid, "user_id", uid)
logger := slog.Default()
logger := slog.New(handler)

// zap
logger, _ := zap.NewProduction()
logger.Info("Order created", zap.Int64("order_id", oid))
sugared := logger.Sugar()

// zerolog
log.Info().Int64("order_id", oid).Msg("Order created")
logger := zerolog.New(os.Stdout).With().Timestamp().Logger()

// logrus
logrus.WithFields(logrus.Fields{"order_id": oid}).Info("Order created")

// 项目自建
import "github.com/company/app/pkg/logger"
logger.FromContext(ctx).Info("Order created", ...)
```

### 1.2 检索正则

```
zap\.|zerolog\.|logrus\.|slog\.(Info|Warn|Error|Debug)|log/slog|
FromContext\(ctx\)|ctx\.Logger\(\)|logger\.(Info|Warn|Error|Debug)
```

### 1.3 配置位置

- `main.go` / `cmd/*/main.go`：logger 初始化
- `internal/logger` / `pkg/log`：项目封装
- `config.yaml` 中的 `log_level` / `log_format`

### 1.4 识别旁路

```
fmt\.Print(ln|f)?\(|fmt\.Fprint(ln|f)?\(os\.(Stdout|Stderr)|println\(|print\(|log\.Print(ln|f)?\(
```

业务代码里出现 `fmt.Println` / 标准 `log.Println` 基本都是 **P0 待改**（标准 `log` 没有等级、不结构化）。

---

## 2. 良好 / 不良示例对照

### 2.1 结构化字段 vs 字符串拼接

```go
// BAD：格式化拼进 message，字段无法被过滤
log.Infof("processing order %d for user %d", oid, uid)
slog.Info(fmt.Sprintf("processing order %d", oid))

// GOOD：slog
slog.Info("Processing order", "order_id", oid, "user_id", uid)
// 或用 slog.Attr，更显式
slog.LogAttrs(ctx, slog.LevelInfo, "Processing order",
    slog.Int64("order_id", oid),
    slog.Int64("user_id", uid),
)

// GOOD：zap
logger.Info("Processing order",
    zap.Int64("order_id", oid),
    zap.Int64("user_id", uid),
)

// GOOD：zerolog
log.Info().Int64("order_id", oid).Int64("user_id", uid).Msg("Processing order")
```

### 2.2 context 传播 logger（Go 习惯）

每个请求一个 logger，通过 `context` 携带；业务函数从 `ctx` 取 logger，自动带 trace_id。

```go
// 入口：middleware 塞 logger
func TraceMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        traceID := r.Header.Get("X-Trace-Id")
        if traceID == "" { traceID = newID() }
        l := slog.Default().With("trace_id", traceID)
        ctx := ContextWithLogger(r.Context(), l)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

// 业务代码
func CreateOrder(ctx context.Context, req *Request) error {
    logger := LoggerFromContext(ctx)
    logger.Info("Order create received", "user_id", req.UserID)
    ...
}
```

如果项目本身就是 `zap` + 自己的 `ContextWithLogger` / `LoggerFromContext`，**直接复用**。

### 2.3 错误路径

Go 没有 exception，错误是一等公民。原则：

- 错误 `return` 到上层时，**只在最终处理点（handler / main loop）记录**；中间层用 `fmt.Errorf("...: %w", err)` 包装保留 cause
- 若某层决定"吃掉"错误（比如后台任务里 recover 后继续），**必须** log 且说明为何不往上冒
- 避免相同错误被每层都 log 一遍

```go
// BAD：每层都记 + 直接返回
func (s *Service) Pay(ctx context.Context, oid int64) error {
    if err := s.charge(oid); err != nil {
        logger.Error("charge failed", "err", err)   // 重复
        return err
    }
    return nil
}

// 更上层又 log 一次
func Handler(w http.ResponseWriter, r *http.Request) {
    if err := svc.Pay(...); err != nil {
        logger.Error("pay failed", "err", err)      // 第二次
        http.Error(w, "...", 500)
    }
}

// GOOD：中间层 wrap，最终处理点 log 一次
func (s *Service) Pay(ctx context.Context, oid int64) error {
    if err := s.charge(oid); err != nil {
        return fmt.Errorf("charge order_id=%d: %w", oid, err)
    }
    return nil
}
func Handler(w http.ResponseWriter, r *http.Request) {
    if err := svc.Pay(...); err != nil {
        LoggerFromContext(r.Context()).Error("Failed to pay",
            "order_id", oid, "err", err)
        http.Error(w, "...", 500)
    }
}
```

`"err", err` 在 slog / zap / zerolog 里会调用 error 接口并展开；若 err 实现了 stacktracer（pkg/errors / cockroachdb/errors），栈会跟着进入日志。

### 2.4 panic / recover

```go
// goroutine 必须 recover，否则进程崩溃
go func() {
    defer func() {
        if r := recover(); r != nil {
            logger.Error("panic recovered",
                "panic", r,
                "stack", string(debug.Stack()),
            )
        }
    }()
    doWork()
}()
```

### 2.5 敏感数据脱敏

```go
// BAD
logger.Info("User login", "email", email, "password", password)

// GOOD
logger.Info("User login succeeded",
    "user_id", userID,
    "email_masked", mask.Email(email),
)

// 项目里若有 Stringer/MarshalJSON 自定义，注意敏感字段单独处理
type User struct {
    ID       int64
    Email    string `json:"email_masked"`   // 若整个 struct 进日志，自定义 MarshalLogObject
    Password string `json:"-"`              // 永不序列化
}

// zap 提供 zap.Object(...) + MarshalLogObject 接口：
func (u User) MarshalLogObject(enc zapcore.ObjectEncoder) error {
    enc.AddInt64("id", u.ID)
    enc.AddString("email_masked", mask.Email(u.Email))
    return nil
}
```

### 2.6 日志注入防护

```go
// 简易 sanitize
var crlfReplacer = strings.NewReplacer("\n", "_", "\r", "_", "\t", "_")
func safe(s string) string { return crlfReplacer.Replace(s) }

logger.Info("HTTP request received", "path", safe(r.URL.Path), "method", r.Method)

// 若是结构化 JSON handler，字段值会被 JSON 编码自动转义，风险低——优先用结构化字段
```

### 2.7 循环 / 热点节流

```go
// BAD
for _, m := range batch {
    if err := process(m); err != nil {
        logger.Error("failed", "id", m.ID, "err", err)
    } else {
        logger.Info("processed", "id", m.ID)  // 每条一行 info 高峰期刷屏
    }
}

// GOOD：成功汇总；失败独打
var ok, fail int
for _, m := range batch {
    if err := process(m); err != nil {
        logger.Warn("Failed to process message", "id", m.ID, "err", err)
        fail++
    } else {
        ok++
    }
}
logger.Info("Batch processed",
    "total", len(batch), "ok", ok, "fail", fail, "duration_ms", durMs)
```

### 2.8 级别选择示例（slog）

```go
slog.Debug("Cache miss", "key", key)                             // 开发诊断
slog.Info("Order created", "order_id", oid, "user_id", uid)      // 业务事件
slog.Warn("Retrying remote call", "attempt", n, "cause", reason) // 异常可恢复
slog.Error("Failed to publish event", "topic", topic, "err", err)// 需关注失败
```

`log.Fatal*` / `os.Exit` 应当只在 main/init 阶段；业务路径里别用——它们会跳过 defer。

### 2.9 性能敏感场景（zap 的 sugared vs 非 sugared）

```go
// 热点路径：非 sugared（零分配）
logger.Info("rpc done",
    zap.String("method", method),
    zap.Duration("duration", d),
    zap.Int("code", code),
)

// 非热点：sugared（更简洁，但分配更多）
logger.Sugar().Infow("rpc done", "method", method, "duration", d, "code", code)
```

### 2.10 `log/slog` 的 handler 选择

- `slog.NewJSONHandler` 生产首选（结构化）
- `slog.NewTextHandler` 本地开发可读性更好
- 若项目已有统一 handler（JSON + trace_id source），**直接用**，别自己 new 一个

---

## 3. 常见反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `fmt.Println` / `fmt.Printf` 业务用 | 无等级、无采集 | 项目 logger |
| 标准库 `log.Println` | 无等级、无结构化 | `slog` / 项目 logger |
| `logger.Infof("...%s...", obj)` | 非结构化 | K-V 字段 |
| `logger.Error("failed: " + err.Error())` | 丢 cause / stack | `"err", err` |
| 多层反复 log 同一错误 | 重复告警 | wrap + 顶层记录 |
| `panic(err)` 作为错误传递 | 跨边界 panic 难复原 | `return fmt.Errorf("...: %w", err)` |
| 未 recover 的 goroutine panic | 进程崩溃 | defer recover + log |
| `context.WithValue(ctx, "key", ...)` 用裸字符串 key | 类型不安全 + 碰撞 | 定义 `type ctxKey int` |
| 业务 struct 直接 `%+v` 到日志 | 可能含敏感字段 | 自定义 `MarshalLogObject` / `MarshalJSON` |
| 循环里 per-item log | 日志风暴 | 汇总 |
| `log.Fatal` 业务路径 | 跳过 defer，资源未回收 | 返回 error 到顶层 |

---

## 4. 检视要点清单（Go 专属）

- [ ] 业务代码里是否有 `fmt.Print*` / `log.Print*`（标准库 log）等旁路
- [ ] 错误链是否用 `%w` 保留 cause
- [ ] goroutine 是否都有 `defer recover()` 且 recover 里有 log
- [ ] logger 是否从 `context` 取，而不是用全局 `Default`（丢 trace_id）
- [ ] zap / slog 的 `With(...)` 是否被滥用把敏感字段"粘"到每条日志
- [ ] 结构化字段名是否统一 snake_case（跨服务聚合前提）
- [ ] 业务 struct 是否实现了安全的 `MarshalLogObject` / `MarshalJSON` / `String`
- [ ] zerolog 的 `log.Logger` 全局单例是否被不小心覆盖
- [ ] 是否在热点路径用了 sugared（性能）
- [ ] 循环 / 高并发 goroutine 里是否存在未节流 INFO
