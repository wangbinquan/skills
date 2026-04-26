# Scala 业务日志参考

> 本文件是语言特定补充，**SKILL.md 中的十条核心原则优先**。本文件**不推荐新框架**——你的第一件事永远是从项目里找到既有 logger。

---

## 1. 如何定位项目已有的 logger

按顺序检索（命中即停）：

### 1.1 生产代码里的日志声明

```
# 常见获取方式（Scala 生态）
private val logger = LoggerFactory.getLogger(getClass)             // slf4j 原生
private val logger = Logger(getClass)                              // scala-logging
private val log    = org.slf4j.LoggerFactory.getLogger(classOf[X])
val logger         = LoggerFactory.getLogger("com.example.MyClass")

# Cats Effect / log4cats
val logger: Logger[IO] = Slf4jLogger.getLogger[IO]
val logger             = LoggerFactory.getLogger[IO, MyService]

# ZIO Logging
import zio.logging._
ZIO.serviceWithZIO[Logger[String]] { log => ... }

# Akka / Pekko Actor
val log = Logging(context.system, this)    // 旧 API
val log = context.log                      // Akka Typed

# Play Framework
val logger: Logger = Logger(this.getClass)
val logger         = Logger("application")

# Logback / SLF4J + Scala（直接使用 Java API 也很常见）
import org.slf4j.LoggerFactory
private val log = LoggerFactory.getLogger(classOf[OrderService])
```

检索正则（多选任一）：
```
LoggerFactory\.getLogger|Logger\(|Logger\.apply|
com\.typesafe\.scalalogging|log4cats|Slf4jLogger|
zio\.logging|context\.log|Logging\(|play\.api\.Logger
```

### 1.2 项目自建封装

```
# 常见命名
Logging trait / LazyLogging / StrictLogging（scala-logging 提供的 mixin）
AppLogger / BizLogger / ServiceLogger / LogSupport
com.<company>.util.Logging
```

**`com.typesafe.scalalogging` 的 LazyLogging/StrictLogging trait** 是 Scala 生态中最常见的封装，`LazyLogging` 提供一个 `lazy val logger`，**惰性初始化且线程安全**——项目若已引入，优先使用 mixin 而非手工 `LoggerFactory.getLogger`。

### 1.3 配置文件

- `src/main/resources/logback.xml` / `logback-spring.xml`
- `src/main/resources/log4j2.xml`
- `application.conf` / `application.yml`（Play / Akka 项目）
- `zio-logging` 配置在 `ZLayer`（无独立配置文件）

关注点：JSON encoder 还是 pattern layout？MDC 字段是否在 pattern 中（`%X{trace_id}`）？

### 1.4 识别旁路（Scala 特有）

```
println\(|System\.out\.print|System\.err\.print|
Console\.print|Console\.err|
scala\.Console\.|pprint\(|
print\(   # 顶层 print 函数
```

Scala 的 `println`、`print`、`Console.out.println` 都绕过统一 logger，业务代码中出现即 **P0 待改**。

---

## 2. 良好 / 不良示例对照

### 2.1 SLF4J / scala-logging 占位符 vs 字符串拼接

```scala
// BAD：字符串拼接——日志被过滤时依然构造字符串
logger.debug("Processing order " + order + " for user " + user)
logger.info(s"Order ${order.id} created for user ${user.id}")  // 插值也是拼接

// GOOD：占位符（惰性，只有日志级别开启时才格式化）
logger.debug("Processing order orderId={} userId={}", order.id, user.id)

// GOOD（scala-logging LazyLogging，内部用宏在调用处展开级别守卫）
// 使用 {} 占位符
logger.debug("Processing order orderId={} userId={}", order.id: Any, user.id: Any)
```

**重要 Scala 坑**：scala-logging 宏展开需要参数类型为 `AnyRef` 或显式 `: Any`；若直接传 `Long`/`Int` 等值类型，编译期宏无法展开守卫，需要 `.toString` 或 `asInstanceOf[AnyRef]` / `: Any` 标注。

### 2.2 LazyLogging / StrictLogging mixin（推荐）

```scala
import com.typesafe.scalalogging.LazyLogging

// LazyLogging：lazy val logger，惰性初始化，适合大多数场景
class OrderService(repo: OrderRepository) extends LazyLogging {

  def createOrder(req: CreateOrderRequest): Order = {
    // 直接使用 logger，无需声明
    logger.info("Order create received userId={} skuCount={}", req.userId: Any, req.items.size: Any)
    val order = repo.save(Order.from(req))
    logger.info("Order create succeeded orderId={} durationMs={}", order.id, durationMs: Any)
    order
  }
}

// StrictLogging：非 lazy，适合对象或顶层 logger
object PricingEngine extends StrictLogging {
  def calculate(items: Seq[Item]): BigDecimal = {
    logger.debug("Calculating price itemCount={}", items.size: Any)
    // ...
  }
}
```

### 2.3 昂贵对象序列化加级别守卫

```scala
// BAD：不管 debug 级别是否开启，dump() 都执行
logger.debug("state dump: {}", state.dump())

// GOOD 方式 1：LazyLogging 宏自动展开（仅 String 参数或简单类型）
logger.debug("request {}", req.toJson: Any)  // 宏会自动加 isDebugEnabled 守卫

// GOOD 方式 2：手动守卫（通用，任何 logger 都适用）
if (logger.isDebugEnabled) {
  logger.debug("state dump: {}", state.expensiveDump())
}

// GOOD 方式 3：slf4j 2.x fluent API（若项目已升级）
logger.atDebug().log("state dump: {}", () => state.expensiveDump())
```

### 2.4 异常记录（**必须**传 Throwable）

```scala
// BAD：只记 message，丢失栈
try { pay(order) }
catch { case e: PaymentException => logger.error("pay failed: " + e.getMessage) }

// BAD：吞掉异常
try { pay(order) }
catch { case _: PaymentException => () }

// GOOD：SLF4J 最后一个参数传 Throwable，自动输出完整栈与 cause chain
try { pay(order) }
catch {
  case e: PaymentException =>
    logger.error("Failed to pay order orderId={} amount={}", order.id, order.amount, e)
    throw new ServiceException("pay failed", e)  // 包装保留 cause
}

// GOOD（Scala 惯用）：Either / Try 错误路径
def pay(order: Order): Either[PaymentError, PaymentResult] = {
  payClient.charge(order).left.map { err =>
    logger.error("Failed to charge payment orderId={} reason={}", order.id, err.message)
    err
  }
}
```

**Scala Try 的陷阱**：`Try { ... }.recover { case e => ... }` 里的 `recover` 通常不应该吞掉异常——必须显式 log 或 re-throw。

### 2.5 结构化字段（MDC 注入）

```scala
import org.slf4j.MDC

// 通常在 HTTP filter / gRPC interceptor / Akka middleware 里做一次
def withMdc[A](traceId: String, userId: Long)(f: => A): A = {
  MDC.put("trace_id", traceId)
  MDC.put("user_id", userId.toString)
  try f
  finally MDC.clear()  // 关键：Scala 线程池/fiber 复用时必须清理
}

// 业务代码无需手工带字段，logback pattern 里的 %X{trace_id} 自动输出
logger.info("Order created orderId={}", orderId: Any)
```

**Cats Effect / ZIO 场景下的 MDC**：
```scala
// Cats Effect：MDC 不随 IO 自动传播（线程切换），需使用 IOLocal 或 log4cats 的 structured logging
import org.typelevel.log4cats.slf4j.Slf4jLogger
import org.typelevel.log4cats.SelfAwareStructuredLogger

val logger: SelfAwareStructuredLogger[IO] = Slf4jLogger.getLogger[IO]

// 通过 withModifiedString / addContext 附加字段（log4cats 1.x）
logger.info(Map("trace_id" -> traceId, "user_id" -> userId.toString))("Order created")

// ZIO Logging
ZIO.logAnnotate("trace_id", traceId) {
  ZIO.log("Order created")
}
```

### 2.6 敏感数据脱敏

```scala
// BAD
logger.info("User login email={} password={}", email, password)  // 密码 P0 泄漏
logger.info("Charge card={}", cardNo)                            // 完整卡号 P0

// GOOD：项目若有 Masker / SafeLogger，调用它
logger.info("User login succeeded userId={} emailMasked={}", userId: Any, Masker.email(email))
logger.info("Charge completed userId={} cardTail={}", userId: Any, cardNo.takeRight(4))

// GOOD：局部脱敏工具方法（不造新框架）
def maskEmail(email: String): String = {
  val at = email.indexOf('@')
  if (at <= 1) "***"
  else email.take(2) + "***" + email.drop(at)
}
```

**Scala case class 的 toString 问题**：`case class User(id: Long, email: String, password: String)` 的默认 `toString` 会把所有字段打出来，传入 logger 时等于泄漏。对策：
```scala
// 方式 1：自定义 toString
case class User(id: Long, email: String, password: String) {
  override def toString: String = s"User(id=$id, email=${maskEmail(email)})"
}

// 方式 2：在 log 调用处显式提取安全字段
logger.info("User registered userId={}", user.id: Any)  // 不要传整个 user
```

### 2.7 日志注入防护（CRLF / 控制字符）

```scala
private val CrlfPattern = "[\r\n\t]".r

def sanitize(s: String): String =
  if (s == null) "" else CrlfPattern.replaceAllIn(s, "_")

// 对来自 HTTP 请求的字段，写入日志前消毒
logger.info("HTTP request received method={} path={}", req.method, sanitize(req.path))

// 更优：使用结构化 JSON 日志，encoder 自动转义控制字符
```

### 2.8 循环 / 热点的频率控制

```scala
// BAD：每条消息一行 INFO，高峰期日志风暴
messages.foreach { m =>
  process(m)
  logger.info("Processed message id={}", m.id: Any)
}

// GOOD：按批汇总
var ok    = 0
var fail  = 0
messages.foreach { m =>
  Try(process(m)) match {
    case Success(_) => ok += 1
    case Failure(e) =>
      fail += 1
      logger.warn("Failed to process message id={}", m.id, e)  // 失败仍单独记
  }
}
logger.info(
  "Batch processed total={} ok={} fail={} durationMs={}",
  messages.size: Any, ok: Any, fail: Any, durationMs: Any
)
```

### 2.9 级别选择示例（Scala 项目典型场景）

```scala
logger.trace("Enter calculate() inputs={}", args.mkString(","): Any)  // 默认关
logger.debug("Cache miss key={}", key: Any)                            // 开发诊断
logger.info("Order created orderId={} userId={}", id: Any, uid: Any)   // 正常业务事件
logger.warn("Retry attempt={} cause={}", attempt: Any, cause)          // 异常可恢复
logger.error("Failed to publish event topic={} orderId={}", topic, id, e) // 需关注失败
```

---

## 3. Scala 特有反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `logger.debug("val=" + expensiveVal)` | 字符串拼接，级别关也执行 | 占位符 `{}` 或 if-守卫 |
| `logger.info(s"order ${order}")` | 字符串插值=拼接，case class toString 可能泄漏 | 显式提取安全字段 |
| `println(...)` / `Console.out.println` | 绕过 logger | 换成项目 logger |
| `Try { ... }.getOrElse { () }` | 吞掉异常且无日志 | `recover { case e => log.error("...", e); default }` |
| `Future { }.recover { case _ => }` | 吞异常 | `recover { case e: Xxx => log.error("...", e); fallback }` |
| `case class` 全字段 toString 传入 logger | 泄漏 PII | 自定义 toString 或只传 id |
| `logger.debug("dump: {}", obj)` 无守卫，obj 序列化昂贵 | 性能回退 | LazyLogging 宏 / if-守卫 |
| MDC 在 IO/Future 边界丢失 | trace_id 断链 | cats-effect IOLocal / ZIO.logAnnotate / MdcTaskDecorator |
| 每层 catch 都 ERROR 同一异常 | 重复告警 | 只在最外层 handler 记录 |
| 日志消息用中文 | 编码问题 / grep 困难 | 统一英文 |

---

## 4. 检视要点清单（Scala 专属）

- [ ] 是否有 `println` / `Console.out.println` / `pprint` 等旁路
- [ ] 所有 `catch` / `recover` 块是否记录了 Throwable 对象（不只是 message）
- [ ] `case class` 的 toString 是否会暴露敏感字段
- [ ] `logger.debug/trace` 的参数中是否有昂贵序列化（需守卫）
- [ ] Future / IO / ZIO 异步边界的 MDC 是否正确传播（非自动传播！）
- [ ] MDC 在线程池/fiber 完成后是否 `clear()`，避免数据串线程
- [ ] 使用 `s"..."` 字符串插值写入 logger 的 message 参数（拼接陷阱）
- [ ] Try/Either 的 `left`/`recover` 路径是否有完整日志
- [ ] Akka Actor 是否用 `context.log`（Typed）而非手工 `LoggerFactory`
- [ ] log4cats / ZIO Logging 的结构化字段是否跟 logback MDC pattern 对齐
