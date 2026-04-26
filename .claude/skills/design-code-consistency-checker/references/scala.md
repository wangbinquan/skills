# Scala 一致性核对盲点

## 1. 结构维度

- **`case class` vs `class`**：设计要求"值对象 + 模式匹配" → 必须 case class；普通 class 无 `apply`/`unapply`/`copy`。
- **`sealed trait` / `enum` (Scala 3)**：设计要求"封闭族 + 穷尽匹配" → 必须 sealed；漏 sealed 致编译器不警告 non-exhaustive match。
- **`object` vs class**：单例语义差异；伴生对象（companion object）静态成员位置。
- **`implicit` (Scala 2) / `given`-`using` (Scala 3)**：设计的隐式上下文是否在调用域内可见；隐式作用域歧义。
- **方法可见性**：`private[this]` / `private[pkg]` / `protected[pkg]` 粒度差异。
- **样板抽象类继承**：设计的"抽象成员"是否被 final 类正确实现。
- **`var` vs `val`**：设计要求"不可变" → 任何 `var` 都是漂移点。

## 2. 行为维度

- **`Option` vs null**：与 Java 互操作时 null 渗入；设计要求"无 null"则需用 `Option(...)` 包装。
- **`Try` / `Either` / `Future` 的错误处理**：是否传播；与设计的错误返回约定一致。
- **`Future.recover` 的 PartialFunction**：未匹配的异常会逃逸，破坏"保证捕获"的设计。
- **`for` comprehension 顺序**：副作用顺序与设计期望对齐。
- **惰性 `lazy val`**：初始化时机与线程安全；设计的"启动时初始化"被漂移到首次访问。
- **隐式转换链**：意外的 `Int -> Double` 等转换；设计的"严格类型"被违反。
- **模式匹配穷尽性**：`@unchecked` 抑制了 non-exhaustive 警告。

## 3. 接口契约维度

- **Akka HTTP / Play / http4s / tapir**：路由 DSL 与设计一致；`Marshaller`/`Unmarshaller` 类型推导。
- **Circe / Spray-json / Jackson-scala**：JSON 字段命名 / case class 字段映射。
- **gRPC（ScalaPB）**：proto 字段与生成代码一致。

## 4. 数据模型维度

- **Slick / Quill / Doobie**：Schema 定义与 DDL 一致。
- **case class 与表字段**：列顺序、可空性、类型映射（`Option[String]` ↔ NULLABLE VARCHAR）。
- **`BigDecimal` 精度**：金额字段。

## 5. 配置维度

- **Typesafe Config (HOCON)**：`reference.conf` 默认值与 `application.conf` 覆盖；与设计文档一致性。
- **PureConfig**：case class 字段名 ↔ HOCON key 自动映射；命名策略需对齐。
- **Lightbend / Akka 配置**：actor system 配置与设计一致。

## 6. 依赖维度

- **build.sbt / Mill build**：`libraryDependencies` 与实际 import；scala-version 与 cross-build 与设计一致。
- **Scala 2 vs Scala 3 二进制不兼容**：版本一致性。
- **shaded jar**：相同库不同版本冲突。

## 7. 非功能维度

- **日志**：scala-logging / log4s / zio-logging / cats-effect Logger 与设计一致。
- **`println` 残留**：绕过日志框架。
- **Akka 集群配置**：seed nodes、split brain resolver 与设计 HA 策略一致。
- **ExecutionContext 选择**：阻塞操作误用 default EC 致线程饥饿。

## 8. 测试维度

- **ScalaTest / Specs2 / MUnit**：风格选择与团队约定一致。
- **`Future` 测试**：`whenReady` / `await` 超时配置。
- **PropertyBasedTesting (ScalaCheck)**：是否覆盖设计声明的"对所有输入成立"性质。

## 9. 文档维度

- **Scaladoc** 注释与签名同步。
- **README sbt 命令**：`sbt run` / `sbt test` 是否仍可用。

## 推荐 grep 模式

| 用途 | 模式 |
|------|------|
| 绕过日志 | `\bprintln\(\|System\.out\.\|Console\.print` |
| 可变 var | `\bvar\s+\w+` |
| null 渗入 | `\bnull\b` |
| 隐式 | `\bimplicit\s+(val\|def\|class)\|\bgiven\s+\|\busing\s+` |
| Future 错误吞没 | `\.recover\s*\{` |
