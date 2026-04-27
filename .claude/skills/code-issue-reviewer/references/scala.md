# Scala 专属盲点

Scala 跑在 JVM 上，许多 Java 风险（参见 `java.md`）依然适用。Scala 自身的高频问题集中在 `Option.get` / `Future` 误用 / `implicit` 滥用 / Java 互操作的 null / lazy val 死锁 / `var` + 闭包并发。

---

## 维度 1 · null_safety

```scala
// BAD
val u: User = userMap(id)            // Map.apply 抛 NoSuchElementException
val name: String = userOpt.get       // Option.get 抛
val v: User = javaCall()             // Java 互操作返回值可能 null

// GOOD
userMap.get(id) match {
  case Some(u) => u.name
  case None    => throw UserNotFound(id)
}

userOpt.getOrElse(throw UserNotFound(id))
Option(javaCall()).getOrElse(default)   // wrap Java null
```

- `Option.get` / `Try.get` / `Either.right.get` 全是 panic 入口
- `java.util.Map.get(k)` 返回的可能是 `null`，应包 `Option(...)`
- pattern match 不全（无 `case _ =>`）→ `MatchError`
- `head` / `last` 在空集合抛 `NoSuchElementException`；用 `headOption`

---

## 维度 2 · resource_leak

JVM 资源同 Java；Scala 特异：

- `scala.io.Source.fromFile(...)` 必须 `.close()`；无 try-with-resources 等价（Scala 2 用 `scala.util.Using`，Scala 3 同）

```scala
// GOOD
import scala.util.Using
val lines = Using(Source.fromFile("a.txt")) { src => src.getLines().toList }
```

- `Future` 未配 ExecutionContext → 默认 `global` 容易撑爆
- akka actor 未 `system.terminate()`
- ZIO / cats-effect 资源用 `Resource` / `Scope` 表达；逃逸到外部需谨慎

---

## 维度 3 · concurrency

```scala
// BAD — var + 闭包跨线程
var counter = 0
List(1, 2, 3).par.foreach { _ => counter += 1 }   // race

// GOOD
import java.util.concurrent.atomic.AtomicInteger
val counter = new AtomicInteger(0)
List(1, 2, 3).par.foreach { _ => counter.incrementAndGet() }
```

- `var` 共享是高频炸点；改 `val` + 不可变集合 + atomic
- `mutable.Map` / `mutable.ArrayBuffer` 跨线程 → 用 `TrieMap` / `ConcurrentHashMap`
- `lazy val` 跨线程初始化死锁：两个 lazy val 互相依赖 + 多线程触发 → 死锁
- akka：Actor 接收消息处理时不能 `Await.result`（阻塞 actor 线程）
- ZIO / cats-effect Fiber 取消语义：`bracket` / `onCancel` 处理

---

## 维度 4 · performance

- `List` 是单链表；`length` 是 O(n)，`prepend` O(1) 但 `append` O(n) → 用 `Vector` / `ArrayBuffer`
- `for { x <- xs; y <- ys } yield ...` desugar 为 flatMap+map，在大数据集合开销大
- `view` vs eager：`xs.map(f).filter(g)` 多趟；`xs.view.map(f).filter(g).toList` 一趟
- `Future.sequence(largeList)` 一次性派发所有 future
- 隐式转换在热路径（`implicit def` 引发的临时对象）
- `foldLeft` 类型推导退化时性能差

---

## 维度 5 · memory

- `Stream` (Scala 2.12-) / `LazyList` (2.13+) 强引用 head 防止 GC（已知陷阱）
- `mutable.Map` 无 evict
- ZIO `Ref` 持大对象
- akka 邮箱无界（默认）+ 慢消费 → OOM；用 `BoundedMailbox`

---

## 维度 6 · error_handling

```scala
// BAD
Try(doit()).getOrElse(default)    // 吞所有异常含 OOM
try { ... } catch { case _: Throwable => ... }   // 同样吃 OOM / Interrupt

// GOOD
import scala.util.control.NonFatal
try { ... } catch { case NonFatal(e) => logger.error("...", e); throw e }
```

- `Future { ... }` 失败默默丢失 → 必须 `.recover` / `.onComplete`
- Either / EitherT 错误链路在 monadic 组合中容易丢
- ZIO / cats-effect 错误通道（E）vs 缺陷（die）区分

---

## 维度 7 · external_call

JVM 网络客户端同 Java；Scala 特异：

- `Future` + `Await.result(f, Duration.Inf)` → 永等
- akka-http `RequestTimeout` 默认 20s（可配）
- sttp / tapir 客户端：超时配置
- ZIO `ZIO.timeout` / cats-effect `IO.timeout` 显式包装

---

## 维度 8 · boundary

- `Int.MaxValue + 1` 静默回绕（同 Java）
- `BigDecimal` 用 String 构造避免 double 精度
- `String.toInt` 抛 NumberFormatException；用 `.toIntOption`
- `List(1,2,3)(10)` 越界异常
- 模式匹配不全 + sealed trait → 编译警告（应启用 `-Xfatal-warnings`）

---

## 维度 9 · observability

- `println` / `Console.err.println` 旁路 → 项目 logger（log4cats / scala-logging / ZIO Logging）
- `e.printStackTrace()` → logger.error 传 e
- akka 无 Mdc 跨消息（需 `context.log`）
- `Future` 中切换 EC 后 MDC 丢

---

## 维度 10 · config_env

- `sys.env.get("X")` 返回 Option（OK），`.get` 又抛
- Typesafe Config (HOCON)：缺 key 抛 `ConfigException.Missing`，应用 `getOrElse`
- 启动校验配置（fail-fast 优于运行时崩）

---

## 维度 11 · data_consistency

- Slick / Doobie 事务 monad 组合：必须最终 `.transact(...)` / `.run`，否则不执行
- akka cluster sharding 跨节点状态一致性
- ZIO STM 提供事务内存；非 STM 路径不保证

---

## 维度 12 · time_encoding

同 Java（`LocalDateTime` 无 tz / `Instant` / `ZonedDateTime`）。Scala 特异：

- `java.time.LocalDateTime.now()` 持久化前必须带 tz
- joda-time 旧项目还在用 → 注意混用 java.time 和 joda

---

## 维度 13 · api_compat

- `case class` 字段重命名 → unapply 破坏
- `case class` 加字段需带默认值兼容；二进制兼容性更复杂（MiMa 检测）
- sealed trait 加 case → exhaustive match 破坏
- implicit 默认值变化 → 上游解析行为变化（隐性破坏）

---

## 工具与生态信号

- `build.sbt` 含 `scalafix` / `scalafmt` / `scapegoat` → 已有静态检查
- 含 `scala-logging` / `log4cats` → logger 框架成熟
- 含 `cats-effect` / `zio` → 函数式效果系统；错误 / 资源由 monad 管理
- 含 `akka-actor` → 关注阻塞调用、邮箱大小、监督策略
- 含 `slick` / `doobie` → DB 事务 monad 不调用 = 不执行
- MiMa（Migration Manager）配置 → 二进制兼容性已检测
