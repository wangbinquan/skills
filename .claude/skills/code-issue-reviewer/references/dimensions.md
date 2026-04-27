# 13 大检视维度核对要点

本文件是审视 subagent 的"作战手册"。每个维度按统一结构展开：**主题 → 关键症状 → 排查动作 → 严重度提示 → 常见误判**。

盘点 subagent 只需读"风险关键字速查"段（文末）即可。审视 subagent 必须读完整 13 维度 + 风险关键字速查段。

---

## 维度 1：null_safety 空值与未初始化

**主题**：值可能为 null / nil / undefined / None / 未初始化时被解引用。

**关键症状**：
- 直接对可能为空的返回值取属性 / 调方法（`obj.field`、`obj.method()`）
- `Optional.get()` / `Option.unwrap()` / `.unwrap()` / `!` 强解包，未做存在性判定
- 集合 / map 取值后不判 null 直接用（`map.get(k).doSomething()`）
- 构造期分支没初始化全部字段；二阶段构造（构造后再 init）漏调用
- 空数组 / 空集合传入做 `[0]` 取值
- 网络反序列化 / JSON 解析的字段，按"必填"假设但未校验

**排查动作**：
1. 找所有 `findById` / `findFirst` / `Optional` / `Option` / `Maybe` / `?.` / `!` 类返回值的调用，确认下一步是否做了存在性判定
2. 找 `Map.get` / `dict.get` / `obj["key"]` / `properties.get` 的链式调用
3. 找网络反序列化结果（JSON / protobuf / form）后立即 `.field` 的代码
4. 找构造函数 / 工厂方法的所有分支，确认字段初始化完整
5. 看 catch 块里是否假设变量已初始化（catch 之前的赋值可能未执行）

**严重度提示**：
- **blocker**：核心业务路径（订单、支付、登录）上的无条件解引用
- **critical**：高频路径（每请求都走）的解引用且空值可触发（外部输入控）
- **major**：低频路径或被宽 catch 兜底的解引用
- **minor**：内部工具类、unit-tested 区域的潜在空值

**常见误判**：
- 已在前 N 行做过 `if (x != null)` 或 `requireNonNull` 的不算
- IDE 已标注 `@NonNull` / `NotNull` 的字段不算（除非有反射 / 反序列化绕路）
- 通过 `Objects.requireNonNullElse` / `??` / `or` 兜底的不算

---

## 维度 2：resource_leak 资源泄漏

**主题**：连接、文件句柄、锁、goroutine、协程、定时器、流、监听器在某些路径未关闭 / 未释放。

**关键症状**：
- `open` / `connect` / `acquire` 后没有匹配的 `close` / `disconnect` / `release`
- 关闭逻辑在异常路径不会执行（缺 `finally` / `defer` / `try-with-resources` / `using` / `RAII`）
- `lock()` 后异常路径未 `unlock()`（缺 `try { } finally { unlock() }`）
- Java：未用 try-with-resources，自己 `close()` 但抛异常时未关
- Go：`defer` 写在 `for` 循环里且循环巨长（defer 链堆积到函数末才执行 → 实际等于泄漏）
- Go：goroutine 启动但无关闭信号 / context 取消机制
- Java：`ExecutorService` 创建后未 shutdown
- Node：监听器 `addEventListener` 未对应 `removeEventListener`
- Rust：`std::mem::forget` 滥用 / RAII 被错误绕过
- Python：`open()` 未在 `with` 中

**排查动作**：
1. grep `open` / `connect` / `acquire` / `lock` / `socket` / `goroutine` / `setTimeout` / `setInterval`，对每处定位关闭点
2. 看每个分支 / catch / `if (err != nil)` 是否都关闭
3. Go：`for` 中 `defer file.Close()` 是否实际意图（往往应改为提取函数 + 函数级 defer）
4. Java：`Stream` / `BufferedReader` / `Connection` / `Statement` / `ResultSet` 是否 try-with-resources

**严重度提示**：
- **blocker**：长生命周期服务的高频路径泄漏（每分钟泄漏 N 个连接 → 几小时打满池）
- **critical**：低频路径但每次必泄漏（错误路径泄漏，故障时雪上加霜）
- **major**：仅特定异常分支泄漏
- **minor**：单元测试、临时脚本中的泄漏

**常见误判**：
- 容器自动管理的资源（Spring 的 `@Transactional` 事务 / Dataflow 框架托管的连接）
- 进程退出会被 OS 回收的（不放过常驻服务，但放过短命 CLI 工具）

---

## 维度 3：concurrency 并发安全

**主题**：多线程 / 多协程访问共享状态，存在竞态、原子性破坏、死锁、可见性问题。

**关键症状**：
- 共享可变状态（实例字段 / 全局变量 / 静态 map）无锁直接读写
- check-then-act 模式无原子操作（`if (!map.contains(k)) map.put(k, v)`）
- 双重检查锁（DCL）写错（缺 volatile / 顺序不对）
- 读写锁滥用（写少读多写成读锁；写期间读读取脏数据）
- `synchronized` 锁错对象（锁了 this，但实际共享状态在另一个对象）
- Go：`map` 并发读写（runtime panic）；channel 关闭后写入
- Go：goroutine 闭包捕获循环变量（多个 goroutine 共享同一个变量地址）
- Java：`HashMap` 并发使用（应用 `ConcurrentHashMap`）；`SimpleDateFormat` 共用（非线程安全）
- Python：自以为有 GIL 就线程安全（GIL 保证单字节码原子，复合操作仍非原子）
- Rust：unsafe 中破坏 Send/Sync 约束
- 锁顺序不一致 → 死锁（A 锁 1→2，B 锁 2→1）
- 长持锁中调网络 / 慢 IO（锁 + IO = 灾难）

**排查动作**：
1. 识别所有共享状态（实例字段、static / global、单例）
2. 看每个写入点是否在锁内；每个读取点是否在同一把锁内或用了原子类型
3. 找 `synchronized` 锁的对象是否覆盖到所有写入路径
4. Go：`go func()` 闭包是否捕获了循环变量
5. Java：找 `SimpleDateFormat` / `DateTimeFormatter`（前者非线程安全，后者安全）
6. 找锁内的 `http` / `client.call` / `Thread.sleep`

**严重度提示**：
- **blocker**：核心计数器 / 状态机的非原子更新（直接导致数据丢失 / 错乱）
- **critical**：可触达死锁路径
- **major**：偶发数据竞争但无明确数据破坏
- **minor**：理论上的可见性问题但实际平台保证

**常见误判**：
- 单线程明确的代码（main 启动时配置）
- 不可变对象（`final` / `val` / `Object.freeze`）的共享读取

---

## 维度 4：performance 性能热点

**主题**：算法 / IO 模式 / 序列化在热路径上有显著超线性开销。

**关键症状**：
- **N+1 查询**：循环内对每个 item 单独发 SQL / RPC（应批量）
- **循环内 IO**：循环内 `requests.get` / `client.call`（应批量 / 并发 / 缓存）
- **O(n²) 嵌套**：嵌套循环对相同集合做线性查找（应建 hash map）
- **热路径阻塞调用**：响应链路上同步调慢服务而无超时 / 异步
- **每请求重建对象**：每次都 `new ObjectMapper()` / `new Gson()` / 编译正则（应静态化）
- **重复反序列化**：同一 payload 在 handler 不同地方反复 parse
- **未做分页**：列表接口默认返回全表
- **String 拼接**：循环内 `+=` 拼字符串（Java / JS 现代 JIT 可优化但仍劝改）
- **不必要序列化**：缓存 key 用 JSON 序列化大对象
- **缺索引的查询**：where 条件不走索引（这维度涉及 DB schema，仅作 hint）

**排查动作**：
1. 找循环内的 IO 关键字（`http`、`client`、`query`、`find`、`get` 等）
2. 找嵌套循环 + 内层 contains / indexOf（O(n²) 信号）
3. 找单例性资源在每次请求里 new
4. 找 list 接口的查询是否带 `LIMIT` / `Pageable`
5. 找正则 / Pattern 是否在循环 / 函数体内编译
6. 找文件 / 网络读取后 `read_to_string` / `readAll` 是否对大文件危险

**严重度提示**：
- **blocker**：单请求 O(n²) 且 n 受外部控制（DoS）
- **critical**：高 QPS 接口的 N+1（数据库压力 N 倍）
- **major**：可改进但目前 QPS 低
- **minor**：边角脚本的次优写法

**常见误判**：
- 一次性启动初始化（哪怕慢也只跑一次）
- 后台离线任务（吞吐而非延迟敏感）

---

## 维度 5：memory 内存爆炸

**主题**：堆 / 栈 / 缓存可能无界增长，或单次请求峰值过大。

**关键症状**：
- **无界集合**：单例 / 长生命周期对象不断 add 不 remove（List / Set / Map）
- **缓存无 TTL / 无 capacity**：自建 Map 当缓存（无淘汰策略）
- **全量加载**：`SELECT *` 拉全表到内存；读大文件 `readAll` 到 byte 数组
- **String 拼接**：超长循环 `+=` 形成 O(n²) 内存（旧引擎）
- **大对象常驻**：static 变量持有 GB 级数据
- **流未消费 / 未关**：响应体读一半就丢
- **递归无终止**：递归深度由外部控制时栈溢出
- **listener / observer 累积**：注册了不取消（事件总线 / EventEmitter）
- **ThreadLocal / context 持有大对象**：线程池复用导致泄漏
- **大对象 in 短作用域反复分配**：触发 GC 压力 / Old Gen promotion

**排查动作**：
1. 找 static / global 集合的 add / push / append 调用，确认是否有移除
2. 找 `SELECT *` / `find_all` / `findAll`，确认是否分页
3. 找 `read_to_string` / `readAll` / `readAllBytes` / `Files.readString`，看读取来源
4. 找 listener / EventEmitter 的 add 是否对应 remove
5. ThreadLocal 是否在使用后 remove
6. 缓存 Map 是否带 TTL / 容量上限（用 Caffeine / Guava / LRU）

**严重度提示**：
- **blocker**：长生命周期服务的无界增长（必 OOM 只是时间问题）
- **critical**：单请求峰值数百 MB 且 QPS 不低
- **major**：偶发大对象但 QPS 低
- **minor**：测试 / 工具代码

**常见误判**：
- 容器内存固定 + 进程定期重启（仍标记 major，但放低优先级）
- 显式短命对象（栈上即销毁）

---

## 维度 6：error_handling 错误处理

**主题**：错误被吞、cause 丢失、级别错乱、retry 风暴、不区分可重试 / 不可重试。

**关键症状**：
- `catch (Exception e) { /* ignored */ }`、`except: pass`、`_ = err` 后继续
- 只 `log.error(e.getMessage())` 不传 exception 对象（栈丢失）
- 同一异常多层重复 ERROR 日志
- 业务正常的"用户输入错"也打 ERROR（噪声）
- retry 无 backoff（紧密 retry 风暴）
- retry 不区分错误类型（4xx 也重试）
- 包装异常但不传 cause（`throw new ServiceException("xx")` 丢失原 cause）
- panic / 抛异常但调用方明显期待错误码
- recover / catch 后状态不一致（半完成事务、半释放资源）

**排查动作**：
1. grep 空 catch / `except:` `pass` / `_ = err` 模式
2. 看 catch 后是否传 e、是否抛或处理
3. 找 retry 循环：是否有上限、是否带退避（exponential backoff + jitter）
4. 找 wrap exception 的代码，看是否传 cause / `%w` / `from e`

**严重度提示**：
- **blocker**：吞掉关键业务异常（金额、订单、安全）
- **critical**：retry 风暴可能（高频路径 + 无退避）
- **major**：吞次要异常 / 丢失 cause
- **minor**：消息噪声 / 级别不当

**常见误判**：
- 显式注释"故意忽略，因为 X"（仍标记 info 级建议关注）
- 业务上"找不到也是正常返回"的 catch（如 `findOptional`）

---

## 维度 7：external_call 外部调用韧性

**主题**：调用 DB、缓存、MQ、第三方 API 时的超时、熔断、限流、降级、幂等保障。

**关键症状**：
- HTTP / RPC 调用未设超时（默认无限等）
- 超时只设 connect 不设 read / total
- 无重试（瞬时故障直接失败）；或反向无限重试
- 重试无退避 / 无 jitter
- 写操作无幂等键（重试导致重复写）
- 无熔断器 / Bulkhead 隔离
- 同步调用慢服务且无降级路径
- 单点 RPC 失败传播到整链路（缺 fallback）
- MQ 消费失败无 DLQ（死信队列）
- 第三方 webhook 无签名校验（这条偏安全，归 #9 / 提示用户走安全审查）

**排查动作**：
1. 找所有 HTTP / gRPC / 数据库 client 的初始化，看 timeout 配置
2. 找 RestTemplate / OkHttp / requests / fetch / axios 的调用是否传 timeout
3. 看是否使用了 Resilience4j / Hystrix / Sentinel / breaker 库；写入是否有 idempotency_key
4. 看是否有 fallback 路径（catch 后返回兜底值）

**严重度提示**：
- **blocker**：核心链路调慢服务无超时（一次故障全链路雪崩）
- **critical**：高 QPS 写无幂等键
- **major**：缺熔断 / 降级
- **minor**：重试参数次优

**常见误判**：
- 内部进程内调用（无网络 → 不需要超时）
- 已被基础设施统一处理（service mesh / sidecar 设了超时和重试）—— 标记 info 级提醒

---

## 维度 8：boundary 边界条件

**主题**：极值 / 空 / 零 / 越界 / 溢出 / 超大输入。

**关键症状**：
- `arr[0]` / `arr[arr.length - 1]` 未先判空
- `for (int i = 0; i <= arr.length; i++)`（off-by-one）
- 整数 `a + b` / `a * b` 未防溢出（Java 31-bit / Go int64 边界）
- 除法未防零除（`a / b`，b 来自外部）
- `Integer.parseInt` 未捕获 NumberFormatException
- 字符串 `substring` 未先校长度
- 时间戳精度损失（毫秒 → 秒，秒 → 分）
- 输入大小无上限（用户上传超大文件 / 巨大 JSON → 内存爆炸 / DoS）
- 浮点比较 `==` / 浮点累加误差
- 负数取模行为（Java、Go、Python 不一致）

**排查动作**：
1. 找数组 / 集合下标访问，看是否前置长度判定
2. 找 for 循环边界 `<=` 还是 `<`
3. 找 parseInt / parseDouble / atoi
4. 找算术运算（特别是 cast 前）
5. 找读外部输入大小的代码，是否有 max 限制

**严重度提示**：
- **blocker**：用户输入直接控制循环上限（DoS 路径）
- **critical**：金额 / 计数的整数溢出
- **major**：低频路径的越界
- **minor**：内部纯函数的边界假设

**常见误判**：
- 已在上游 controller / DTO 层用 `@Valid` / `@Max` / pydantic 约束的字段

---

## 维度 9：observability 可观测性

**主题**：关键路径无日志 / 指标 / trace；错误路径缺诊断信息；缺关联 ID。

**关键症状**：
- 业务事件无 INFO 日志（订单 / 支付 / 状态切换）
- 错误路径无 ERROR + 异常对象（只 log.error("failed")）
- 无 trace_id / request_id 关联
- 用 println / System.out / console.log / fmt.Println 绕过统一 logger
- 错误日志无业务上下文（user_id / order_id / 关键参数）
- 缺指标埋点（成功 / 失败计数、延迟分布）
- 关键告警事件未独立 metric
- Debug 消息打成 INFO（噪声）
- 循环内打 INFO（日志风暴）

**排查动作**：
1. 找业务关键方法（创建订单、支付、退款、状态切换），看是否有 INFO 入/出日志
2. 找 catch 块，看是否记录 ERROR 且传 exception
3. 找 print / println / console.log 旁路
4. 找循环 / 高频回调内的日志级别

**严重度提示**：
- **blocker**：核心错误路径无任何日志（事故现场无证据）
- **critical**：循环内 INFO（生产日志风暴）
- **major**：关键事件缺日志
- **minor**：消息措辞 / 字段命名问题

**常见误判**：
- AOP 拦截器 / 中间件已统一记录的，方法体内不必重复
- 详细补 / 改建议归 `business-logging` skill；本 skill 仅"指出存在缺口"，不给完整 diff

---

## 维度 10：config_env 配置与环境

**主题**：硬编码常量 / env 未校验 / 默认值不合理 / 配置错乱。

**关键症状**：
- 硬编码 URL / IP / 端口（应注入配置）
- 硬编码超时 / 池大小 / 重试次数
- env 读取后未校验是否存在（`os.getenv("X")` 返回空仍继续）
- 默认值不合理（HTTP timeout 默认 0 = 永等；连接池 max=1 等）
- 多环境共用同一配置（生产 / 测试混淆）
- 密钥 / token 在代码中（→ 走 `/security-review`）
- 配置变更需要重启（缺热更新）—— 视情况
- 同一配置项在多处定义且取值不同

**排查动作**：
1. grep IP 字面量（`\d+\.\d+\.\d+\.\d+`）、`localhost`、端口字面量
2. 找数字字面量在 timeout / size / retry 处
3. `os.getenv` / `System.getenv` / `process.env.` 后是否有 null / 空校验
4. 同一关键字（如 `MAX_RETRY`）多处定义？

**严重度提示**：
- **blocker**：硬编码生产 URL / 密钥
- **critical**：超时默认 0 / 连接池过小
- **major**：硬编码业务参数
- **minor**：测试代码硬编码

**常见误判**：
- 单元测试 fixture 中的硬编码（合理）

---

## 维度 11：data_consistency 数据一致性

**主题**：事务边界 / 乐观锁 / 读写顺序 / 缓存一致性。

**关键症状**：
- 事务中跨网络调用（`@Transactional` 内调外部 HTTP → 锁持有时间不可控）
- 事务中发 MQ（事务回滚但消息已发）
- 缺乐观锁（version / etag）的并发写
- 读写穿透（先读后写无锁，丢更新）
- 缓存先删后写 / 先写后删的选择错误（取决于业务模式）
- 缓存过期 / 失效后击穿（无防护）
- 多步操作无补偿（一半成功一半失败无回滚）
- 跨多 DB / 多服务的写无 saga / 2PC
- ORM 默认 isolation 不当（read-uncommitted / 可读到中间态）
- ID 生成依赖单点（自增 ID 在分库下重复）

**排查动作**：
1. 找 `@Transactional` / `BEGIN ... COMMIT` 块，看内部是否有 `httpClient.call` / `kafka.send`
2. 找 update 语句是否带 version / where status=...
3. 找缓存模式：Cache-Aside / Read-Through / Write-Behind 的具体落地
4. 多步骤业务流程是否考虑半成功

**严重度提示**：
- **blocker**：金额 / 库存的丢更新
- **critical**：事务内长 IO（连接池耗尽）
- **major**：缓存不一致但业务可容忍
- **minor**：理论一致性问题但实际未触发

**常见误判**：
- 单步原子操作（CAS）已经处理
- 业务幂等天然兜底（即使写两次也无副作用）

---

## 维度 12：time_encoding 时间与编码

**主题**：时区、DST、Unicode、charset、时间戳精度。

**关键症状**：
- 用 `LocalDateTime` 存储跨时区数据（应用 `Instant` / `OffsetDateTime`）
- `new Date()` / `Date.now()` 与 `time.Now()` 直接转字符串无显式时区
- DST 切换日的 +1day / -1day 计算错误
- `getBytes()` 不指定 charset（依赖平台默认）
- `String.toLowerCase()` 不传 Locale（土耳其 i 问题）
- Unicode 等价 / NFD vs NFC 比较不一致
- 时间戳从毫秒转秒丢精度
- 用户输入字符串处理不考虑代理对（emoji / surrogate pair）
- 长 ID 用 number / int 接收（精度丢失，应 string）

**排查动作**：
1. grep `LocalDateTime\.now` / `Date\(\)` / `time\.Now\(\)`，看上下文是否需要时区
2. grep `getBytes\(\)` 无参数调用
3. grep `toLowerCase\(\)` / `toUpperCase\(\)` 无 Locale
4. JS：长数字 ID 看是否用 string（`Number.MAX_SAFE_INTEGER` ≈ 9e15）

**严重度提示**：
- **blocker**：金额 / 时间敏感业务的时区错误
- **critical**：用户输入跨地域处理
- **major**：内部使用但偶尔输出
- **minor**：日志显示问题

**常见误判**：
- 项目明确单时区运营（仍 info 级提示）

---

## 维度 13：api_compat API 兼容性

**主题**：对外接口（HTTP / RPC / SDK / 库 API）的破坏性变更。

**关键症状**：
- 接口字段重命名 / 删除（旧客户端崩）
- 字段类型变更（int → string）
- 枚举新增值无默认 / 旧客户端识别失败
- HTTP method 改动（POST → PUT）
- URL 路径改动（`/v1/x` → `/x`）
- 响应字段从 nullable 变 non-null（反之亦然）
- 错误码值变更
- 序列化格式变更（snake_case ↔ camelCase）
- proto 字段编号变更 / 复用
- 库的 public 方法签名变更（小版本号内）

**排查动作**：
1. 找 controller / endpoint / proto / OpenAPI 文件
2. 找 `@Deprecated` 与新版本是否双向兼容
3. 看版本号规则（语义化版本）

**严重度提示**：
- **blocker**：生产 SDK 公共 API 在 patch 版本破坏
- **critical**：业务接口字段在未通知 caller 时变更
- **major**：枚举新增值无默认
- **minor**：内部 RPC 在 monorepo 同步发布

**常见误判**：
- 内部 monorepo 同步发布（多服务一起改 → 不算破坏）

---

## 风险关键字速查（盘点 subagent 仅需此段）

供盘点 subagent 在轻量预扫描时给文件打 risk_dimensions hint。命中即标，不深判。

```
null_safety:        Optional, .get(),  unwrap, expect, ?., !, .findById, getOrElse, fromNullable
resource_leak:      open(, connect(, Lock(, mutex, socket, goroutine, go func, setTimeout, setInterval,
                    ExecutorService, addEventListener, FileInputStream, BufferedReader,
                    Connection, Statement
concurrency:        synchronized, Atomic, ConcurrentHashMap, Mutex, RWLock, sync.Mutex, sync.Map,
                    SimpleDateFormat, ThreadLocal, volatile, channel, goroutine, parallelStream
performance:        for.*for, findAll, query, JSON.stringify, JSON.parse, Pattern.compile,
                    new ObjectMapper, new Gson, regex 编译于热路径,
                    forEach.*forEach
memory:             new ArrayList\(\), Cache, LinkedList, bytes.Buffer, []byte{,
                    readAll, read_to_string, ReadString, ReadAllBytes,
                    static .* List, static .* Map, EventEmitter
error_handling:     catch.*\{\s*\}, except:\s*pass, _ = err, .unwrap\(\),
                    log.error\(.*getMessage, throw new .* (.*),  // wrap 不传 cause
external_call:      RestTemplate, OkHttp, requests., fetch(, axios, gRPC, http.Client,
                    DefaultHttpClient, AsyncHttpClient,
                    @Retry, retry(, backoff
boundary:           parseInt, parseLong, atoi, .size\(\), .length, Math.abs, % ,  / ,
                    substring, slice, indexOf
observability:      println, System.out, console.log, fmt.Println, printf, eprintln,
                    缺少 logger / log / slog / tracing 调用
config_env:         localhost, 127\.0\.0\.1, getenv, System.getenv, process.env.,
                    硬编码 timeout / port / size 字面量
data_consistency:   @Transactional, BEGIN, COMMIT, ROLLBACK, tx., .lock\(\), select.*for update,
                    optimistic, version=, etag
time_encoding:      LocalDateTime.now, time.Now, Date(), getBytes\(\), toLowerCase\(\),
                    Instant, OffsetDateTime, Calendar, DateFormat
api_compat:         @Deprecated, @ApiOperation, @RequestMapping, @GetMapping, @PostMapping,
                    Controller, Endpoint, .proto, openapi, swagger, schema
```

---

## 跨维度：测试代码与生成代码

测试代码（`*_test.go`、`*Test.java`、`*.spec.ts` 等）在默认排除范围内。**审视 subagent 不应**对测试代码做发现，除非用户明确要求纳入。

生成代码（含 `// Code generated`、`*.pb.go`、`*_pb2.py`）默认排除。即使纳入，也降低严重度——这些代码的所有问题都应在生成器源头修。
