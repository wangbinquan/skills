---
name: business-logging
description: 用于"审视、补全、新增"商业系统业务日志的专业技能。当用户提到"加日志 / 补日志 / 打日志 / 审视日志 / 日志不够 / 日志太多 / 日志规范 / 日志级别 / logging / log review / add logging / instrument logs / observability / 排障日志 / 审计日志"等关键词，或在完成功能开发后希望补齐可观测性、在代码审查中发现日志问题、在排障后希望错误路径留下足够诊断信息、或发现现有日志存在敏感信息泄漏 / 级别混乱 / 用 println/System.out/console.log 绕过统一日志框架等情况时，**必须主动触发**此技能。技能的两条硬性约束：(1) 严禁引入新的开源日志框架——必须先在仓库中定位项目**已有**的日志封装（SLF4J 包装器、LOG_INFO 宏、logging.getLogger 工厂、zap/zerolog、tracing、winston/pino 等），直接复用；若未找到任何日志系统，停下来向用户确认而不是自作主张选型。(2) 日志消息一律使用英文，禁止 emoji、表情、装饰性符号、花哨分隔线、全大写横幅等非正式内容，商业系统的日志是可被运维、SRE、安全、审计读取与告警的正式产物。支持 C++ / Java / Python / Go / Rust / JavaScript / TypeScript / Scala 八种语言，自动检测项目语言并**按需加载**对应 `references/<lang>.md`，避免上下文膨胀。核心原则覆盖：日志级别正确选择、敏感数据 / 合规脱敏（密码 / 令牌 / API Key / PII / 银行卡号 / 医疗信息）、结构化 + 关联 ID（trace_id / request_id / span_id / tenant_id）、异常与错误路径的完整栈与 cause chain、参数化 / 惰性求值 / 级别守卫防止性能回退、日志注入（CRLF / 控制字符）防护、消息的可诊断与可 grep 性、循环 / 热点中的频率限制、重复日志去抖、禁止"吞异常不记日志"、与 metrics / tracing 协同的可观测性。工作流：意图识别 → 发现既有 logger → 按语言加载参考 → 按"审视"或"新增"剧本给出改动 → 复核 checklist → 交付最小化 diff。
---

# 业务日志技能（Business Logging）

本技能面向**商业系统**的业务日志质量。典型使用场景：

- 审视一段代码/一个模块/一个服务的日志，找出级别混乱、敏感信息泄漏、缺失上下文、可读性差、性能问题
- 在新写或已有功能中补齐日志（入口/出口、错误路径、外部调用、状态迁移）
- 统一团队日志风格，消灭 `println` / `System.out` / `console.log` / `fmt.Println` / `printf` 这类"绕过"统一日志系统的情况
- 代码审查时给出具体、可落地的日志改动建议

---

## 工作流程总览

```
意图识别 → 发现既有 logger → 语言检测 & 加载 references/<lang>.md
        → 按"审视"或"新增"剧本给出改动
        → 核对完整 Checklist → 交付最小化 diff
```

每一步都**不要省略**。尤其是"发现既有 logger"，它直接决定改动是否能被项目接受。

---

## 步骤 1：意图识别

先用一句话与用户对齐三种典型任务之一，默认为"审视 + 在不足处补齐"：

| 任务类型 | 触发语句示例 | 产出 |
|---------|------------|------|
| **审视现有日志** | "帮我看看这段日志打得怎么样 / review 一下日志" | 问题清单 + 逐条改动建议 |
| **新增日志** | "给这段代码加日志 / 加点可观测性" | 新增/修改的日志语句（最小化 diff） |
| **审视 + 补齐** | "这段代码日志够不够？该加的加、该删的删、该改级别的改级别" | 综合产出 |

若用户意图不清晰，**停下来反问一句**，不要自行扩大范围。

---

## 步骤 2：发现项目既有的日志系统（关键，严禁跳过）

**硬性规则**：不得引入新的开源日志框架。项目早已选定日志方案，你的任务只是**复用**，不是**替换**。

### 2.1 检索策略

按顺序执行以下检索，命中即停；每一步都应给出"命中的文件路径 + 最小代码片段"作为证据：

1. **在业务代码里找现成日志语句**
   - 优先扫描 `src/` `app/` `service/` `internal/` `pkg/` 这类生产代码目录，排除 `test/` `build/` `vendor/` `node_modules/` `target/` `dist/`
   - 关键正则（按语言使用）：
     - Java：`LoggerFactory\.getLogger|@Slf4j|@Log4j2|LogManager\.getLogger|private\s+.*\s+Logger\s`
     - C++：`LOG_(INFO|WARN|ERROR|DEBUG)|SPDLOG_|log\.(info|warn|error)|LOGGER_`
     - Python：`logging\.getLogger|get_logger\(|from\s+.*\s+import\s+logger`
     - Go：`zap\.|zerolog\.|log/slog|logrus\.|logger\.(Info|Error|Warn|Debug)`
     - Rust：`tracing::(info|warn|error|debug)|log::(info|warn|error|debug)|slog::`
     - JS/TS：`winston|pino|bunyan|from\s+['"].*/logger['"]|createLogger`
     - Scala：`LoggerFactory\.getLogger|LazyLogging|StrictLogging|Slf4jLogger|zio\.logging|context\.log`
2. **找项目自建的日志封装**
   - 常见命名：`Logger.*` / `AppLogger` / `log_util.*` / `logging_config.*` / `logger.ts` / `log.go`
   - 项目自建封装**优先级最高**——即便底层是 slf4j / zap / winston，也应调用封装后的 API 而非直接调用底层
3. **读配置文件确认输出格式与级别**
   - `logback.xml` / `log4j2.xml` / `logback-spring.xml` / `logging.yaml` / `zap.Config` / `tracing-subscriber`
   - 关注：JSON 还是文本格式？时间戳字段名？MDC/上下文字段是否已配置？
4. **看一段真实日志输出**（若有 sample log 或单测断言）理解实际落地形态

### 2.2 识别要点（需要在给用户的答复中明确写出）

检索完成后，向用户**明确回报**以下 6 项，缺一不可：

1. **Logger 类型**：是 slf4j / zap / pino / tracing / 自建封装 / 其他
2. **获取方式**：`LoggerFactory.getLogger(XxxService.class)` / `logging.getLogger(__name__)` / `ctx.Logger()` / …
3. **API 签名**：支持哪些级别、是否支持结构化字段（`kv` / `With` / `extra=` / `MDC` / span）、异常参数位置
4. **消息格式约定**：参数化占位符用 `{}` / `%s` / `{0}` / fmt 风格；禁止 `+` 拼串
5. **关联上下文注入点**：trace_id / request_id 是在哪里进入 MDC/context（拦截器 / 中间件 / gRPC 拦截 / logback pattern）
6. **是否存在旁路**：代码里是否还有 `System.out.println` / `console.log` / `fmt.Println` / `printf` 这类绕过统一日志的"口子"——这些应作为待清理项列出

**若项目中未发现任何日志系统，或存在两套并行的日志系统**：**停下来向用户询问**采用哪一套，不要自行决定；尤其不要"顺手"引入一个新的开源库。

---

## 步骤 3：识别语言并按需加载参考

### 3.1 语言检测规则

| 语言 | 标志文件 / 扩展名 |
|------|------------------|
| Java | `pom.xml` / `build.gradle` / `*.java` |
| C++ | `CMakeLists.txt` / `Makefile` / `*.cpp` / `*.cc` / `*.h` / `*.hpp` |
| Python | `pyproject.toml` / `requirements.txt` / `setup.py` / `*.py` |
| Go | `go.mod` / `go.sum` / `*.go` |
| Rust | `Cargo.toml` / `Cargo.lock` / `*.rs` |
| JavaScript | `package.json` / `*.js` / `*.mjs` / `*.cjs`（无 `tsconfig.json` 且无 `.ts` 源文件） |
| TypeScript | `tsconfig.json` / `*.ts` / `*.tsx`（与 JS 共存时以此为准） |
| Scala | `build.sbt` / `project/build.properties` / `*.scala` |

多语言仓库：只加载**本次改动所涉及的语言**的参考文件，不要一股脑把所有都读一遍。

### 3.2 按需加载

| 语言 | 参考文件 |
|------|---------|
| Java | `references/java.md` |
| C++ | `references/cpp.md` |
| Python | `references/python.md` |
| Go | `references/go.md` |
| Rust | `references/rust.md` |
| JavaScript | `references/javascript.md` |
| TypeScript | `references/javascript.md` + `references/typescript.md`（先读 JS 通用规范，再读 TS 特有补充） |

参考文件包含：**如何识别项目已有 logger 的更多提示**、**良好 / 不良日志代码对照**、**该语言的特定坑**。它们是细节补充，SKILL.md 里的原则优先。

---

## 步骤 4：核心原则（十条，所有改动须同时满足）

### 原则 1：复用项目既有日志系统

- 调用**步骤 2 已定位到的** logger，不新增依赖、不自选框架
- 业务代码中绝不使用 `System.out` / `System.err` / `println!` / `eprintln!` / `print` / `fmt.Print*` / `console.log` / `console.error` / `std::cout` / `std::cerr` / `printf` 向 stdout/stderr 写日志
- 若项目有自建封装（`AppLogger.xxx`），优先用封装而非底层库直接调用——团队在封装里通常做了上下文注入、脱敏、级别重映射等
- 调试期间临时打印可以使用 `println`，但**提交前必须清除或替换为正式日志**

### 原则 2：日志级别正确选择

**不要把一切都打成 INFO / ERROR**。级别是告警与过滤的基石，错用就是噪声。

| 级别 | 语义 | 典型场景 |
|------|------|---------|
| TRACE | 极细粒度诊断 | 热点函数入口/每步中间值；生产**默认关闭** |
| DEBUG | 开发期诊断 | 关键分支走向、参数值、中间计算；生产**按需开启** |
| INFO | 正常业务事件 | 请求受理、订单创建、用户登录、配置加载、服务启动 |
| WARN | 异常但可恢复 | 重试成功、降级生效、配额接近上限、外部接口慢响应 |
| ERROR | 需要关注的失败 | 持久化失败、外部依赖不可用、核心业务流程中断、数据不一致 |
| FATAL / CRITICAL | 进程无法继续 | 启动关键配置缺失、资源耗尽、必须人工介入（可选级别） |

**常见误用**：
- 把所有异常都打 ERROR（业务正常的"用户输入错误"不应 ERROR，INFO/WARN 即可）
- 把正常业务成功打 WARN（这是 INFO）
- 业务成功路径一条日志也没有（INFO 缺失，排障困难）
- DEBUG 内容打在 INFO（日志量暴增）

### 原则 3：消息规范（English only, no decoration）

- **全部英文**。理由：便于跨国团队、日志聚合工具的分词、避免编码问题、便于 grep/regex
- **禁止** emoji（🚀 ✅ ❌ ⚠️）、颜文字（:-) (>_<) ）、装饰分隔（`====`、`****`、`------`）、全大写横幅、ASCII art
- 动词开头、陈述语气、使用主动态：`Failed to publish order event` 而不是 `Order event publishing failed`
- 一条消息聚焦一件事，不要把多件事塞在一行里
- 消息应**唯一可 grep**：避免 `"error occurred"` 这种毫无特征的字样；独有关键字帮助从千亿行日志中定位

**示例对照**：
```
// BAD
log.info("🚀 user {} logged in successfully!!!", userId);
log.error("error");
log.info("=== SERVICE STARTED ===");

// GOOD
log.info("User login succeeded userId={}", userId);
log.error("Failed to load pricing config from remote", ex);
log.info("OrderService started port={} profile={}", port, profile);
```

### 原则 4：敏感数据保护（合规红线，任何泄漏都需立刻改）

**绝不明文记录以下内容**（任何级别都不允许）：

- 密码、密钥、API Token、OAuth refresh_token、JWT 完整串、TLS 私钥
- 信用卡号全量（仅允许 `****1234` 末四位）、CVV、完整银行账号
- 身份证、社会安全号、护照号、驾照号
- 完整手机号 / 邮箱（脱敏成 `13812****90` / `a***@example.com`）
- 完整姓名 + 生日的组合、精确地理位置
- 医疗记录、生物特征
- 会话 ID 全量、Cookie 原文

**脱敏策略**：
- 定长保留首尾：`masked = s[:3] + "***" + s[-2:]`（注意长度不够时全替换为 `***`）
- 对于 token/secret 只打 hash 前 8 位：`hash=abc12345`
- 结构化日志里给敏感字段打 tag（如 `"card_tail": "1234"` 而不是 `"card_no"`），方便运维统一审计
- 业务对象序列化为日志前，调用项目已有的 `mask` / `redact` / `SafeLogger` 工具——不要自己临时写一个
- 若你发现现有日志中有泄漏，**把它列为 P0 待改项并建议清理历史日志**（仅建议，真正清理由运维执行）

### 原则 5：结构化日志 + 上下文字段

一条好的业务日志 ≈ **固定消息 + 键值对上下文**。键值对应当机器友好（可做 Kibana/Loki 过滤）、字段名跨服务保持一致。

**必须尽量携带的上下文字段**（由项目 MDC / context / span 自动注入最佳）：
- `trace_id` / `request_id` / `correlation_id`：跨服务追踪
- `span_id`：若存在分布式追踪
- `service` / `app`：来源服务名（容器环境通常由采集侧注入，不必代码里硬编码）
- `env`：生产/预发/测试
- `user_id` / `tenant_id` / `org_id`：业务主体（注意：是 ID，不是 PII）
- `action` / `biz_event`：业务事件名（便于按事件聚合）
- `duration_ms`：耗时类事件
- `result` / `status_code`：成功失败状态

**切忌**把这些字段拼进消息串（`"trace_id=abc..."`）。用 logger 提供的结构化 API 传入。

### 原则 6：异常与错误路径

- **捕获异常必须记录**或**显式重抛**——绝不允许 `catch { /* ignored */ }` 默默吞掉
- 打印异常要传 **exception 对象**本身（而不是只写 `e.getMessage()`），让框架输出完整栈与 cause chain
- 同一异常**不要在多层反复 ERROR**。惯例是：**只在"最终处理点"记录一次**（比如最外层的 Controller/Handler）；中间层用 `throw` / `throw new XxxException(cause)` 传递
- 重抛时包装要保留 cause：`throw new ServiceException("xxx", originalException)` / `fmt.Errorf("xxx: %w", err)` / `Err(MyError::Xxx { source })`
- ERROR 日志必须附带**足以复现问题**的业务上下文：哪个用户、哪个请求、哪条数据、哪个依赖方

**示例**：
```
// BAD
try { doWork(); } catch (Exception e) { log.error(e.getMessage()); }

// GOOD
try { doWork(); }
catch (Exception e) {
    log.error("Failed to process refund orderId={} amount={}", orderId, amount, e);
    throw new ServiceException("refund failed", e);
}
```

### 原则 7：性能与可持续性

- **参数化日志**：用 logger 的占位符机制，不用字符串拼接——拼接会在日志被过滤掉时依然消耗 CPU
- **昂贵对象序列化做级别守卫**：`if (log.isDebugEnabled()) log.debug("payload={}", heavyToString())`；或使用 lambda/supplier 形式
- **循环 / 热点路径中禁止 INFO 级别 per-iteration 日志**；用**汇总**（每 N 次/每秒 1 次）或**采样**
- **分布式高并发场景下**考虑异步 appender，但必须关注缓冲区溢出行为（丢弃 or 阻塞）
- 单条日志控制在合理大小（经验上 < 4KB），避免把整个 request body / SQL 结果集打出来
- **不要**在 finally 或析构/defer 中默默记录大量无差别 TRACE——清理逻辑必须简洁

### 原则 8：日志注入防护（CRLF / 控制字符）

用户输入（用户名、邮箱、URL、HTTP 头）可能带 `\n` `\r` `\t` 或控制字符。若拼进消息，会**伪造**出额外日志行，混淆审计或触发注入式告警。

- 优先使用**结构化字段**而非字符串拼接——结构化序列化会自动转义
- 若必须放入消息串，调用项目提供的 `sanitize` / `replaceAll("[\r\n]", "_")` 等工具
- 对来自网络边界的字段（HTTP header、URL path、请求体字段），写入日志前统一过一次消毒

### 原则 9：可观测性集成

日志不是孤岛。三者协同：

- **Metrics**：高频、数值、聚合类（QPS、P99、错误率）——不要用日志做计数，用 counter/histogram
- **Tracing**：跨服务调用链——trace_id 必须出现在日志中
- **Logs**：事件级上下文与错误细节——补足前两者看不到的"为什么"

判断标准：**"这个事件我希望每秒看到汇总值"→ metric**；**"这个事件我希望能具体回放某一次的细节"→ log**。两者都需要时，各记一份（但要避免把 INFO 级的业务事件又计成 metric counter——由专门的埋点模块做）。

### 原则 10：日志一致性与团队可读

- **风格对齐**：新加的日志与仓库内现有日志保持相同的语气、字段命名、占位符风格
- **字段命名**：全部 snake_case 或全部 camelCase 二选一——跟随项目现状
- **去抖 / 去重**：不要在同一调用里既 INFO 又 DEBUG 写几乎相同的话
- **业务事件命名**：用稳定的名词短语（`order_created` / `payment_refund_initiated`）方便按事件维度聚合

---

## 步骤 5：审视剧本（用户要"review"时走这个）

逐文件、逐条**现有日志语句**过以下 Checklist，给出：**问题级别（P0 / P1 / P2）** + **原代码** + **改后代码** + **一句话原因**。

### Checklist（按顺序核查每一条日志）

1. [ ] 是否调用项目既有 logger？（否 ⇒ P0）
2. [ ] 级别是否与事件重要性匹配？
3. [ ] 消息是否全英文？是否无 emoji / 装饰符？
4. [ ] 是否存在敏感数据明文（密码 / token / 全量卡号 / 身份证 / 完整手机 / 邮箱 …）？（是 ⇒ P0）
5. [ ] 关键上下文字段是否齐备（trace_id / user_id / action / 相关业务主键）？
6. [ ] 是否为结构化字段而非字符串拼接？
7. [ ] 异常是否传了 exception 对象？cause chain 是否保留？
8. [ ] 是否存在"捕获但吞掉"（空 catch、`except: pass`、`_ = err`）？
9. [ ] 是否在多层对同一异常反复 ERROR？
10. [ ] 循环/热点路径是否有未节流的高频日志？
11. [ ] 用户输入写入日志前是否防注入 / 脱敏？
12. [ ] 消息是否**独有且 grep 友好**？
13. [ ] 是否存在重复 / 自相矛盾的日志（同一行为一条 INFO 一条 DEBUG）？
14. [ ] `println` / `System.out` / `console.log` / `fmt.Println` / `printf` 这类旁路是否全部消除？

### 审视输出格式（严格遵守）

````
## 日志审视报告

### 概览
- 扫描文件数：N
- 发现日志语句：M
- 问题分布：P0 x / P1 y / P2 z

### 定位到的项目 logger
[步骤 2 的 6 项结论简述]

### 问题清单（按 P0 → P1 → P2 排序）

#### [P0] 敏感数据泄漏 — src/service/auth.py:87
原代码：
```
logger.info(f"user login: email={email}, password={password}")
```
建议：
```
logger.info("user login succeeded", extra={"user_id": user_id})
```
原因：密码绝不能出现在日志中（合规红线）；邮箱需脱敏或用 user_id 代替。

#### [P1] 吞异常 — src/service/order.py:142
...

### 统计与建议
- 建议批量清理历史日志：是 / 否（P0 泄漏需评估）
- 建议新增 MDC 中间件：是 / 否（若多处手工写 trace_id）
- 建议修改 CI lint 规则：是 / 否（若 println 旁路反复出现）
````

---

## 步骤 6：新增剧本（用户要"加日志"时走这个）

### 6.1 先识别"哪里该打"（场景矩阵）

| 位置 | 默认级别 | 要点 |
|------|---------|------|
| 服务 / 进程启动 | INFO | 版本、关键配置、监听地址（脱敏后） |
| 对外 HTTP/RPC 入口 | INFO（由统一拦截器记录最佳） | 方法、路径、状态、耗时；body 不打 |
| 对外调用（DB / MQ / 第三方 API） | DEBUG 成功 + WARN 慢 + ERROR 失败 | 依赖名、耗时、响应码；SQL 参数脱敏 |
| 关键业务事件（下单、付款、退款、权限变更） | INFO | 业务事件名 + 业务主键 + 结果 |
| 状态机 / 工作流切换 | INFO | from_state → to_state、触发原因 |
| 定时任务 / 后台作业 | INFO 开始 + INFO 结束（含耗时、处理条数）+ ERROR 失败 | 任务名、batch_id |
| 降级 / 重试 / 熔断 | WARN | 原因、次数、下一步动作 |
| 异常分支 | ERROR（系统性）/ INFO-WARN（用户输入类） | 区分"用户错了"还是"系统错了" |
| 调试辅助 | DEBUG / TRACE | 生产默认关，提交前确认非 INFO |

### 6.2 落笔前的三个问题（对每一条打算新增的日志都问一遍）

1. **谁会读这条日志？什么时候读？** 找不到读者的日志是噪声。
2. **如果只凭这条日志能否定位问题？** 缺什么上下文就补什么。
3. **这条日志会不会每秒千条？** 会，就降级 DEBUG 或改汇总。

### 6.3 新增输出格式

````
## 新增日志建议

### 定位到的项目 logger
[步骤 2 的结论]

### 新增日志一览（最小化 diff）

#### src/service/order.py::createOrder
原代码：
```
def create_order(req): ...
```
建议：
```
logger.info("order create received", extra={"user_id": req.user_id, "sku_count": len(req.items)})
...
logger.info("order create succeeded", extra={"order_id": order.id, "duration_ms": dur})
```

#### ...

### 未新增的场景与原因
- 循环内部的 per-item 调试：改为每批汇总一条 INFO
- payload 全量打印：不建议，可能含 PII

### 后续建议
- 若 trace_id 目前手工写入，建议在中间件统一注入
````

---

## 步骤 7：交付 Checklist

交付前再过一遍：

- [ ] 所有改动使用的是步骤 2 定位到的 logger（没有引入新依赖）
- [ ] 所有消息英文、无 emoji / 装饰
- [ ] 所有 P0 敏感数据问题已修复或明确告知用户
- [ ] 所有 ERROR 都携带 exception 对象
- [ ] 所有结构化字段命名与项目既有风格一致
- [ ] 没有引入高频无节流日志
- [ ] 提供的是**最小化 diff**，未顺手改无关代码
- [ ] 被"吞掉"的异常均已显式记录或显式重抛

---

## 参考文件

仅加载**本次改动涉及语言**的参考文件；参考文件是示例与特定语言坑位的补充，不覆盖 SKILL.md 的原则。

- `references/java.md` — Java
- `references/cpp.md` — C++（含常见 LOG_* 宏与 spdlog-like API）
- `references/python.md` — Python（stdlib logging 与常见封装）
- `references/go.md` — Go（zap / zerolog / slog / logrus / 自建）
- `references/rust.md` — Rust（log facade 与 tracing）
- `references/javascript.md` — JavaScript（winston / pino / bunyan / 自建；TS 项目也先读此文件）
- `references/typescript.md` — TypeScript 特有补充（类型化 logger 契约、`unknown` catch、判别联合驱动的级别、品牌类型脱敏；与 `javascript.md` 叠加使用）
- `references/scala.md` — Scala（scala-logging / SLF4J / log4cats / ZIO Logging / Akka）
