# C++ 业务日志参考

> 本文件是语言特定补充，**SKILL.md 中的十条核心原则优先**。本文件**不推荐新框架**——你的第一件事永远是从项目里找到既有 logger。C++ 项目日志方案最为碎片化（spdlog / glog / log4cxx / Boost.Log / 自建宏），更需要先定位。

---

## 1. 如何定位项目已有的 logger

### 1.1 常见形态

1. **项目自建宏**（生产代码最常见）
   ```cpp
   LOG_INFO("User login succeeded userId={}", userId);
   LOG_ERROR("Failed to open file path={} errno={}", path, errno);
   LOGGER_WARN_FMT(...);
   TLOG_INFO(...);   // 带 trace 前缀的自建宏
   ```
2. **spdlog 风格**
   ```cpp
   spdlog::info("..."); / logger->info("...");
   SPDLOG_INFO("...");  // 带 source location
   ```
3. **glog 风格**
   ```cpp
   LOG(INFO) << "message " << value;
   VLOG(1) << "...";
   LOG_IF(ERROR, cond) << "...";
   ```
4. **Boost.Log**
   ```cpp
   BOOST_LOG_TRIVIAL(info) << "...";
   BOOST_LOG_SEV(logger, severity::info) << "...";
   ```
5. **log4cxx**
   ```cpp
   LOG4CXX_INFO(logger, "...");
   ```

### 1.2 检索正则（择一命中即可）

```
LOG_(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\(
SPDLOG_(INFO|WARN|ERROR|DEBUG|TRACE)\(
spdlog::(info|warn|error|debug|trace|critical)\(
LOG\((INFO|WARNING|ERROR|FATAL)\)\s*<<
LOG4CXX_(INFO|WARN|ERROR|DEBUG|TRACE)\(
BOOST_LOG_(TRIVIAL|SEV)\(
```

还要找**宏的定义**（确认自建宏背后的实际输出）：
```
#define\s+LOG_(INFO|ERROR|WARN|DEBUG)
```

通常在 `log.h` / `logger.h` / `logging.h` / `common/log_util.h`。

### 1.3 配置文件

- spdlog：通常在 `main` / 启动模块里调用 `spdlog::set_pattern` / sink 配置
- glog：启动时 `FLAGS_log_dir` / `google::InitGoogleLogging(argv[0])`
- log4cxx：`log4cxx.properties` / `log4cxx.xml`

### 1.4 识别旁路

```
std::cout|std::cerr|std::clog|printf\(|fprintf\(stderr|fputs\(|puts\(
```

业务代码里出现即 **P0 待改**。

---

## 2. 良好 / 不良示例对照

### 2.1 参数化 / 格式化

现代项目一般已经用 fmt-style（`{}`）；传统 glog 用流（`<<`）。**与项目既有风格保持一致**。

```cpp
// BAD：字符串拼接 / 自己 sprintf
char buf[256];
snprintf(buf, sizeof(buf), "user %d login from %s", userId, ip.c_str());
LOG_INFO("%s", buf);

// BAD：iostream 拼串
LOG_INFO(("user " + std::to_string(userId) + " login").c_str());

// GOOD：fmt-style（spdlog / 大部分自建宏）
LOG_INFO("User login succeeded userId={} ip={}", userId, ip);

// GOOD：glog 流式
LOG(INFO) << "User login succeeded userId=" << userId << " ip=" << ip;
```

### 2.2 级别守卫（热点路径）

对可能触发昂贵序列化的调用：

```cpp
// BAD：无论等级开没开，Dump() 都会调
LOG_DEBUG("state: {}", state.Dump());

// GOOD：等级守卫（spdlog）
if (spdlog::should_log(spdlog::level::debug)) {
    LOG_DEBUG("state: {}", state.Dump());
}

// GOOD：glog VLOG
VLOG(2) << "state: " << state.Dump();  // VLOG 等级自己控制

// GOOD：宏内部已做等级判断（项目自建宏通常如此，确认后可不外加守卫）
#define LOG_DEBUG(fmt, ...) do { if (g_logger->should_log(DEBUG)) g_logger->log(DEBUG, fmt, ##__VA_ARGS__); } while(0)
```

### 2.3 异常 / 错误路径

C++ 的错误路径常见三种：exception、错误码、`std::expected`/`Result<T,E>`。不论哪种，**错误必须留痕**。

```cpp
// BAD：吞异常
try { DoWork(); } catch (...) {}

// BAD：只打 message
try { DoWork(); }
catch (const std::exception& e) {
    LOG_ERROR("{}", e.what());  // 没有业务上下文，没 cause
}

// GOOD：带业务上下文
try { ProcessPayment(orderId, amount); }
catch (const PaymentException& e) {
    LOG_ERROR("Failed to process payment orderId={} amount={} code={} what={}",
              orderId, amount, e.code(), e.what());
    throw;  // 或包装成更高层异常
}

// GOOD：错误码 / Result
auto result = DB::Query(sql);
if (!result.ok()) {
    LOG_ERROR("DB query failed table={} errno={} msg={}",
              table, result.error_code(), result.error_message());
    return result.status();
}
```

### 2.4 结构化字段

spdlog 1.x / 传统宏一般没有原生 KV 结构化，走"键=值"格式化约定即可；若项目启用了 spdlog + json formatter 或自建的结构化 logger，优先走结构化 API。

```cpp
// GOOD：键=值约定（采集侧按空格切分、"="切键值，大多数 log pipeline 都支持）
LOG_INFO("Order created order_id={} user_id={} amount={}", orderId, userId, amount);

// GOOD：若项目封装了 KV API
logger->kv("order_id", orderId).kv("user_id", userId).info("Order created");

// GOOD：fmt::arg 命名参数（spdlog 1.10+ / fmt 8+）
LOG_INFO("Order created order_id={order_id} user_id={user_id}",
         fmt::arg("order_id", orderId), fmt::arg("user_id", userId));
```

**字段命名保持全局一致**：`user_id` 还是 `userId` 取决于项目既有风格。

### 2.5 trace_id / 上下文注入

C++ 无 MDC 标准。常见做法：
- 线程局部存储：`thread_local std::string g_trace_id;`，logger 输出格式里读它
- RAII guard：进入作用域 push trace，退出 pop（支持嵌套）
- 显式参数：每个 log 语句里传 trace_id（最不优雅但最直白）

```cpp
// RAII guard 用法（项目若已有请直接用）
{
    TraceScope scope(req.trace_id());
    LOG_INFO("Request received path={}", req.path());
    // 作用域内所有 log 自动携带 trace_id
}
```

异步任务（线程池 / 协程）边界下 trace 不会自动传递，调度时要把 trace 打包进 task，再在执行线程 restore。

### 2.6 敏感数据脱敏

```cpp
// BAD
LOG_INFO("login email={} password={}", email, password);
LOG_INFO("card={}", card_no);

// GOOD
LOG_INFO("User login succeeded user_id={} email_masked={}", user_id, MaskEmail(email));
LOG_INFO("Charge completed user_id={} card_tail={}", user_id, card_no.substr(card_no.size()-4));

// 对 struct/class 的 operator<< / to_string / fmt::formatter 实现：敏感字段**必须**不输出或输出脱敏
struct User {
    int64_t id;
    std::string email;
    std::string password_hash;  // 绝不可进入日志
};
// fmt::formatter<User>::format 中只写 id 和 email 脱敏后的版本
```

### 2.7 日志注入防护（CRLF）

```cpp
// 简易 sanitize（或调用项目已有工具）
std::string SafeForLog(std::string_view s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        out.push_back((c == '\n' || c == '\r' || c == '\t') ? '_' : c);
    }
    return out;
}

LOG_INFO("HTTP request path={}", SafeForLog(req.path()));
```

### 2.8 循环 / 热点节流

```cpp
// BAD
for (const auto& pkt : packets) {
    ProcessPacket(pkt);
    LOG_INFO("processed packet id={}", pkt.id);  // 每包一条
}

// GOOD：汇总 + 失败单独打
int ok = 0, fail = 0;
for (const auto& pkt : packets) {
    try { ProcessPacket(pkt); ++ok; }
    catch (const std::exception& e) {
        ++fail;
        LOG_WARN("Failed to process packet id={} what={}", pkt.id, e.what());
    }
}
LOG_INFO("Packet batch processed total={} ok={} fail={} duration_us={}",
         packets.size(), ok, fail, elapsed_us);

// GOOD：高频告警的采样（spdlog 可用 "every_n" 插件；或自行用原子计数）
```

### 2.9 级别选择示例

```cpp
LOG_TRACE("Enter Calc() a={} b={}", a, b);                         // 默认关
LOG_DEBUG("Cache miss key={}", key);                               // 开发诊断
LOG_INFO ("Order created order_id={} user_id={}", id, uid);        // 业务事件
LOG_WARN ("Retrying remote call attempt={} cause={}", n, msg);     // 可恢复异常
LOG_ERROR("Failed to publish event topic={} order_id={} what={}",
          topic, id, e.what());                                    // 需关注失败
LOG_CRITICAL("Config missing key={}", k);                          // 无法继续
```

---

## 3. 常见反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `printf` / `std::cout` / `std::cerr` | 绕过 logger，无级别、无采集 | 换成项目宏 / logger |
| `snprintf` + `LOG_INFO("%s", buf)` | 双重格式化，失去结构化 | 用宏自带占位符 |
| 吞异常 `catch (...) {}` | 失去问题线索 | 至少 LOG_ERROR + 必要时重抛 |
| `LOG_ERROR(e.what())` | 无业务上下文 | 加 order_id / user_id 等 |
| 自建宏没做等级短路 | 昂贵序列化始终执行 | 在宏里做 `if (level enabled)` 短路 |
| 业务对象 `operator<<` 打印敏感字段 | PII 泄漏 | 改 formatter 只输出必要字段 |
| 每次迭代一条 LOG_INFO | 日志风暴 | 汇总 + 失败独打 |
| 线程池 / 协程边界丢 trace_id | 无法串联 | 调度时打包 trace 并在执行端恢复 |
| glog `LOG(FATAL)` 乱用 | 进程直接退出 | 仅限真正无法继续的场景 |
| UTF-8 字符串未转义放入 log | 可能被日志解析器截断/注入 | sanitize 或走结构化字段 |

---

## 4. 检视要点清单（C++ 专属）

- [ ] 是否存在 `std::cout` / `printf` / `fprintf(stderr,...)` / `puts` 等旁路
- [ ] 自建 LOG_* 宏是否有等级短路（避免参数求值开销）
- [ ] 业务类型的 `operator<<` / `fmt::formatter` 是否输出了敏感字段
- [ ] 异常捕获块是否都有 LOG + 合适的重抛 / 错误码返回
- [ ] 协程 / 线程池 / 异步任务边界的 trace_id 是否有 RAII scope 或手工恢复
- [ ] `LOG(FATAL)`（glog）或 `spdlog::critical` 的使用是否节制
- [ ] 宏展开后是否存在 `return` / `continue` 副作用（`do { ... } while(0)` 包住）
- [ ] 多线程高并发写入是否用了 async sink，或 sink 本身线程安全
- [ ] 循环 / 网络收发热点路径的日志级别是否合适（不是 INFO 每包一条）
- [ ] 是否把完整的原始请求 buffer / 密钥 / TLS 握手材料等机敏数据打进了 DEBUG
