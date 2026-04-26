# Java 业务日志参考

> 本文件是语言特定补充，**SKILL.md 中的十条核心原则优先**。本文件**不推荐新框架**——你的第一件事永远是从项目里找到既有 logger。

---

## 1. 如何定位项目已有的 logger

按顺序检索（能命中就停止，不要继续引入新的）：

### 1.1 生产代码里的日志声明

```
# 常见获取方式
private static final Logger log = LoggerFactory.getLogger(OrderService.class);
private static final Logger log = LogManager.getLogger();              // Log4j2
private static final Logger log = Logger.getLogger(OrderService.class); // JUL / Log4j 1.x
@Slf4j                                                                  // Lombok
@Log4j2
```

检索正则（多选任一命中即可）：
```
LoggerFactory\.getLogger|LogManager\.getLogger|Logger\.getLogger|
@Slf4j|@Log4j2|@CommonsLog|
private\s+(static\s+)?(final\s+)?org\.(slf4j|apache)\.logging.*Logger
```

### 1.2 项目自建封装

```
# 常见命名 - 若存在必须优先用封装
AppLogger / BizLogger / TraceLogger / SafeLogger / LogUtil / LogHelper
com.<company>.log.Logger
```

自建封装里通常已经做了：MDC 注入、字段脱敏、trace_id 透传、级别重映射。**直接绕过它调用 slf4j 会破坏团队约定**。

### 1.3 配置文件

- `src/main/resources/logback.xml` / `logback-spring.xml`
- `src/main/resources/log4j2.xml`
- `application.yml` 里的 `logging.*` 段

看配置能确认：
- 输出格式（JSON encoder / pattern layout）
- MDC 字段是否已经被 layout 显示（`%X{trace_id}`）
- 根 logger 级别
- 是否已有 async appender

### 1.4 识别旁路

```
System\.out\.println|System\.err\.println|e\.printStackTrace\(|\.printStackTrace\(\)
```

业务代码里出现即 **P0 待改**。

---

## 2. 良好 / 不良示例对照

### 2.1 参数化 vs 字符串拼接

```java
// BAD：拼接导致字符串在日志被过滤时也会被构造
log.debug("processing order " + order + " for user " + user);

// BAD：String.format 同样吃性能
log.debug(String.format("processing order %s for user %s", order, user));

// GOOD：slf4j / log4j2 占位符（惰性）
log.debug("Processing order orderId={} userId={}", order.getId(), user.getId());
```

### 2.2 昂贵序列化加级别守卫

```java
// BAD：不管级别开没开，dump() 都执行
log.debug("state dump: {}", state.dump());

// GOOD 方式 1：级别守卫
if (log.isDebugEnabled()) {
    log.debug("state dump: {}", state.dump());
}

// GOOD 方式 2：slf4j 2.x fluent + Supplier
log.atDebug().setMessage("state dump: {}").addArgument(state::dump).log();

// GOOD 方式 3：log4j2 lambda
log.debug("state dump: {}", () -> state.dump());
```

### 2.3 异常记录（**必须**传 Throwable）

```java
// BAD：只记 message，丢失栈
try { pay(order); }
catch (PaymentException e) {
    log.error("pay failed: " + e.getMessage());
}

// BAD：吞掉异常
try { pay(order); } catch (PaymentException e) { }

// GOOD：最后一个参数传 Throwable，框架会打完整栈 + cause chain
try { pay(order); }
catch (PaymentException e) {
    log.error("Failed to pay order orderId={} amount={}", order.getId(), order.getAmount(), e);
    throw new ServiceException("pay failed", e);  // 包装保留 cause
}
```

### 2.4 结构化字段（推荐 slf4j 2.x `KeyValuePair` / `StructuredArgument`）

```java
// slf4j 2.x fluent API
log.atInfo()
   .setMessage("Order created")
   .addKeyValue("order_id", order.getId())
   .addKeyValue("user_id", order.getUserId())
   .addKeyValue("amount", order.getAmount())
   .log();

// 配合 logstash-logback-encoder（项目可能已经依赖）
import static net.logstash.logback.argument.StructuredArguments.kv;
log.info("Order created {} {} {}",
    kv("order_id", order.getId()),
    kv("user_id", order.getUserId()),
    kv("amount", order.getAmount()));
```

JSON 输出形态（便于 Kibana/Loki 过滤）：
```json
{"level":"INFO","msg":"Order created","order_id":"O-1001","user_id":"U-42","amount":299.0,"trace_id":"ab12..."}
```

### 2.5 MDC 注入 trace_id / user_id

```java
// 通常在入口拦截器 / gRPC intercept / MQ consumer wrapper 里做一次
MDC.put("trace_id", traceId);
MDC.put("user_id", String.valueOf(userId));
try {
    chain.doFilter(request, response);
} finally {
    MDC.clear();  // 关键：线程复用时必须清理
}
```

使用中：
```java
// 业务代码无需再手工带 trace_id，只要 logback/log4j2 pattern 里包含 %X{trace_id} 即可
log.info("Order created orderId={}", orderId);
```

异步 / 线程池场景下 MDC 不会自动传播，需要：
- 使用 `MDCContext` / `MdcTaskDecorator`（Spring）/ 手工 `MDC.getCopyOfContextMap()` 再在新线程 `MDC.setContextMap(...)`
- Reactor：用 `Hooks.enableAutomaticContextPropagation()` 或 Context + MDC 适配器

### 2.6 敏感数据脱敏

```java
// BAD
log.info("user login email={} password={}", email, password);   // 密码 P0 泄漏
log.info("card={}", cardNo);                                     // 完整卡号 P0

// GOOD：项目若有 SafeLogger / Masker，调用它
log.info("User login succeeded userId={} emailMasked={}", userId, Masker.email(email));
log.info("Charge completed userId={} cardTail={}", userId, CardUtil.tail(cardNo, 4));

// GOOD：若项目无封装，局部安全脱敏（自己不造框架，但可以写一两行工具方法）
String emailMasked = email.replaceAll("(?<=.{2}).(?=[^@]*@)", "*");
```

`@ToString` 自动生成的 toString 常常把全部字段打印出来——DTO/实体中敏感字段加 `@ToString.Exclude`（Lombok）或自定义 `toString`。

### 2.7 日志注入防护

用户输入（用户名 / URL / HTTP header）写入日志前清洗：

```java
private static final Pattern CRLF = Pattern.compile("[\r\n\t]");

String safe(String s) {
    return s == null ? "" : CRLF.matcher(s).replaceAll("_");
}

// 更优：使用结构化字段，encoder 会做转义
log.atInfo()
   .setMessage("HTTP request received")
   .addKeyValue("method", req.getMethod())
   .addKeyValue("path", req.getRequestURI())
   .log();
```

### 2.8 循环 / 热点的频率控制

```java
// BAD：每条消息一行 INFO，高峰期刷屏
for (Message m : batch) {
    process(m);
    log.info("processed message id={}", m.getId());
}

// GOOD：按批汇总
int ok = 0, fail = 0;
for (Message m : batch) {
    try { process(m); ok++; }
    catch (Exception e) {
        fail++;
        log.warn("Failed to process message id={}", m.getId(), e); // 失败仍单独记录
    }
}
log.info("Batch processed total={} ok={} fail={} duration_ms={}", batch.size(), ok, fail, durationMs);
```

### 2.9 级别选择示例

```java
log.trace("Enter calculate() inputs={}", Arrays.toString(args));   // 默认关
log.debug("Cache miss for key={}", key);                           // 开发诊断
log.info("Order created orderId={} userId={}", id, uid);           // 正常业务事件
log.warn("Retrying remote call attempt={} cause={}", n, msg);      // 异常可恢复
log.error("Failed to publish event topic={} orderId={}", topic, id, e); // 需关注失败
```

---

## 3. 常见反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `log.error(e.getMessage())` | 丢栈 | 把 `e` 作为最后参数传 |
| `log.info("xxx" + obj)` | 拼接、无级别守卫 | 占位符 `{}` |
| `catch (Exception e) {}` | 吞异常 | 至少 `log.error("...", e)` 或显式重抛 |
| `System.out.println(...)` | 绕过 logger | 换成项目 logger |
| `e.printStackTrace()` | 写到 stderr，脱离采集 | `log.error("...", e)` |
| 业务对象全字段 toString | 可能泄漏 PII | 字段级 `@ToString.Exclude` 或手写 toString |
| `log.info("...{}...", obj.heavyCompute())` | 即使关级也计算 | lambda / Supplier / 级别守卫 |
| 循环内 per-item INFO | 日志风暴 | 按批汇总 |
| `log.error` 一路往上每层都打 | 重复告警 | 只在最外层 handler 打 |
| 时间格式 / 字段命名与项目其他模块不一致 | 运维聚合难 | 对齐现有风格 |

---

## 4. 检视要点清单（Java 专属）

- [ ] 是否有未处理的 `e.printStackTrace()` 或 `System.out` / `System.err`
- [ ] 所有 `catch` 块是否记录了 exception 对象（不只是 message）
- [ ] MDC 是否在 filter/interceptor 出口 `clear()`，否则线程池复用会串数据
- [ ] Lombok `@ToString` 的实体是否含敏感字段且未 `@ToString.Exclude`
- [ ] 是否把 `Exception.getMessage()` 拼进 `String.format` 而丢了栈
- [ ] 是否存在大对象（整段 SQL / 完整 HTTP body）直接打进日志
- [ ] `@Slf4j` 与手工 `LoggerFactory.getLogger` 风格是否在同一代码库混用（尽量统一）
- [ ] Reactor/CompletableFuture 异步边界的 MDC 是否丢失
