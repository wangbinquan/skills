# Go 专属盲点

---

## 维度 1 · null_safety（nil panic）

```go
// BAD — nil interface vs nil pointer
var err *MyError = nil
return err  // 调用方 if err != nil 为 true（接口非 nil）

// GOOD
if err != nil { return err }
return nil  // 显式返回 nil interface
```

```go
// BAD — map 取值后链式
u := userMap[id]  // 不存在时返回零值
fmt.Println(u.Name)  // 零值 string 是 ""，不 panic 但是逻辑错

// GOOD
u, ok := userMap[id]
if !ok { return ErrUserNotFound }
```

- 切片 `nil` 和空切片 `[]int{}` 都可 `range` 不 panic（这点反直觉地"安全"）
- 但对 `nil` map 写入 → panic（读取 OK）
- 嵌入接口指针字段未初始化时调方法 → nil pointer panic
- `*sync.Mutex` 用值传递（应该传指针，否则锁错对象）

---

## 维度 2 · resource_leak

```go
// BAD — 循环里 defer 堆积
for _, f := range files {
    fp, err := os.Open(f)
    if err != nil { continue }
    defer fp.Close()  // 全部堆到函数末才执行
    // 处理
}

// GOOD — 提取函数
for _, f := range files {
    if err := process(f); err != nil { ... }
}
func process(f string) error {
    fp, err := os.Open(f)
    if err != nil { return err }
    defer fp.Close()
    // ...
}
```

- HTTP body：`resp, _ := http.Get(...)` 必须 `defer resp.Body.Close()` 否则连接不归还池
- `sql.Rows` 必须 `rows.Close()`（`defer rows.Close()` 即可）
- ticker / timer：`time.NewTicker` 必须 `defer t.Stop()`
- context.WithCancel 返回的 cancel 必须调（即使 ctx 自然超时）
- goroutine 启动后无退出条件 → 永驻

---

## 维度 3 · concurrency

### goroutine 泄漏

```go
// BAD
go func() {
    res := <-ch  // ch 永远没人写 → goroutine 永等
    handle(res)
}()
```

修：用 `select { case <-ctx.Done(): return; case res := <-ch: ... }`

### 闭包捕获循环变量（Go 1.22 前）

```go
// BAD — 1.22 前
for _, v := range items {
    go func() { handle(v) }()  // 所有 goroutine 共享 v
}

// GOOD（旧版本）
for _, v := range items {
    v := v  // shadow
    go func() { handle(v) }()
}
// Go 1.22+ 默认 per-iteration scope，已修
```

### map 并发读写

`map` 多 goroutine 同时读写 → runtime panic。用 `sync.RWMutex` 或 `sync.Map`（仅适合读多写少且 key 集合稳定）。

### 其他

- channel 关闭后再写 → panic；多生产者必须协调
- `select` 中的 `default` 让 select 非阻塞 → 容易写出忙等
- `sync.WaitGroup.Add` 必须在启动 goroutine **前**（或主流程上）调；放进 goroutine 内是经典 race
- `atomic` 原子值访问混用普通赋值 → race
- `context.Background()` 在 lib 中传出 → 失去链路上下文（应传入 ctx）

---

## 维度 4 · performance

- N+1：循环内 `db.QueryRow` / `client.Get` → 批查或并发
- `fmt.Sprintf("%v", obj)` 反射开销大；热路径用具体格式
- `regexp.MustCompile` 在函数内反复编译 → 提到包级 var
- 反射 `reflect.ValueOf(...).FieldByName(...)` 慢
- `json.Marshal` 大对象在热路径
- `strings.Split` + `strings.Join` 多次往返；考虑 `bytes.Buffer` 一次拼

---

## 维度 5 · memory

```go
// BAD — 子切片持有大父切片
big := readHugeFile()
small := big[:10]
return small  // small 引用整个 big 的底层数组 → 无法 GC

// GOOD
return append([]byte(nil), small...)  // copy
```

- `bytes.Buffer` 一直 Write 不 Reset 单例化 → 持续增长
- `sync.Pool` 在低频路径反而拖累 GC（GC 期清空 + 重建）
- `io.ReadAll` 大流 → OOM
- map 删除元素不释放底层 bucket（key 集合稳定但 value 大时可能想换 map）
- goroutine 栈增长 + 阻塞 + 大量 → 内存压力

---

## 维度 6 · error_handling

```go
// BAD
_, _ = doSomething()  // 错误丢弃
if err != nil { return errors.New("failed") }  // cause 丢

// GOOD
result, err := doSomething()
if err != nil { return fmt.Errorf("doSomething: %w", err) }
```

- `errors.Is` / `errors.As` 用于精确判别错误类型
- `panic` 跨 goroutine 不会被外层 recover；每 goroutine 独立 recover
- `defer` 中的 panic 会覆盖原 panic（小心）
- `log.Fatal*` 调用 `os.Exit(1)` → defer 不执行（资源泄漏）

---

## 维度 7 · external_call

```go
// BAD
client := &http.Client{}  // 默认无 timeout

// GOOD
client := &http.Client{ Timeout: 5 * time.Second }
// 或更细粒度 Transport.DialContext / ResponseHeaderTimeout
```

- `http.DefaultClient` 默认无 timeout（绝对不要用于生产）
- `database/sql` 默认 max open conns 0（无限）→ 务必 `db.SetMaxOpenConns`
- gRPC：`grpc.Dial` 默认 unary 调用无 timeout，必须 ctx 带 deadline
- retry 库：`avast/retry-go` / `cenkalti/backoff`，避免手写紧密 retry 循环

---

## 维度 8 · boundary

- 整数：`int` 平台相关（32 vs 64）；溢出**静默**回绕
- 切片下标越界 panic
- nil slice / empty slice 区别（`len(nil) == 0`，可 range，但 marshal JSON 出 `null` vs `[]`）
- `time.Duration` 是 int64 ns；非常大值会回绕
- `for i := byte(0); i < 256; i++` 永真循环（byte 最大 255）

---

## 维度 9 · observability

- `fmt.Println` / `log.Println` / `panic + recover + log` 在生产代码 → 应用结构化 logger（zap / zerolog / slog）
- `slog`（Go 1.21+ stdlib）建议作为新项目首选
- ctx 不带 logger / trace_id → 跨服务断链
- error 路径不记录但 `return err` → 链路上层若也只 return → 顶层无定位信息

---

## 维度 10 · config_env

```go
// BAD
host := os.Getenv("DB_HOST")  // 不存在时空串 → 后续连不上 localhost:5432

// GOOD
host := os.Getenv("DB_HOST")
if host == "" { return errors.New("DB_HOST not set") }
// 或 viper / envconfig + 启动时校验
```

- `flag.Parse()` 在 lib 中 → 污染主程序 flag set
- `viper` 配置改动后默认不热更（除非 WatchConfig）

---

## 维度 11 · data_consistency

- `*sql.Tx` 必须 commit 或 rollback；漏 → 连接持有
- 事务内 `time.Sleep` / 外部 HTTP → 长事务
- `SELECT ... FOR UPDATE` 必须在事务内
- ORM（GORM）默认 update 全字段（包括零值）；用 `.Updates(map)` 或 `.Select` 限定
- ID 生成：`uuid.New()` panic 在某些平台（`uuid.NewRandom` 返回 err）

---

## 维度 12 · time_encoding

- `time.Now()` 默认本地时区；持久化前 `t.UTC()`
- `time.Parse` 不带 tz 字符串 → 假定 UTC（与 Java 默认本地相反）
- `t.Format("2006-01-02")` 是 reference time（容易误写）
- 时间序列化：`time.RFC3339` 标准；自定义 layout 容易兼容性问题
- monotonic clock：`time.Now()` 内含 mono；`t.Round(0)` 去掉 mono（持久化前）

---

## 维度 13 · api_compat

- protobuf 字段编号一旦使用不可重编号；删除字段标 `reserved`
- 公共 struct 字段删除 / 重命名 → SemVer major
- 函数签名变更（接口实现方）→ 编译破坏（这反而是好的，运行期破坏才可怕）
- JSON tag 改动（`json:"x"` → `json:"y"`）→ 序列化破坏

---

## 工具与生态信号

- `go.mod` 含 `go.uber.org/zap` / `github.com/rs/zerolog` → logger 已有；旁路应清除
- `go.mod` 含 `github.com/sony/gobreaker` / `resilience` → 已有熔断设施
- 项目用 `wire` / `fx` → 依赖注入，关注循环依赖
- 项目有 `Makefile` 跑 `go vet` / `staticcheck` / `golangci-lint` → 已有基本检查
- race detector：`go test -race` 是否在 CI 跑（影响 #3 严重度）
