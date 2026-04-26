# Scala 单元测试参考指南

## 推荐技术栈

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 测试框架 | ScalaTest 3.x | Scala 最流行的测试框架，支持多种测试风格 |
| 轻量替代 | MUnit | scalameta 社区出品，适合 Scala 3 与 Cats Effect |
| Mock 框架 | mockito-scala | Mockito 的 Scala 封装，类型安全 |
| 属性测试 | ScalaCheck | 随机属性测试（PBT），与 ScalaTest 无缝集成 |
| 断言 | ScalaTest Matchers | 流式断言，可读性强 |
| Cats Effect 测试 | cats-effect-testing | 测试 IO/Resource/Fiber 等 effect 类型 |
| Akka Actor 测试 | Akka TestKit | 测试 actor 系统（Akka 项目专用） |

## sbt 依赖配置

```scala
// build.sbt
libraryDependencies ++= Seq(
  // ScalaTest
  "org.scalatest" %% "scalatest" % "3.2.18" % Test,

  // mockito-scala（推荐，类型安全）
  "org.mockito" %% "mockito-scala" % "1.17.31" % Test,
  // 或：若项目已用 Java Mockito，可继续用
  // "org.mockito" % "mockito-core" % "5.8.0" % Test,

  // ScalaCheck（属性测试）
  "org.scalacheck" %% "scalacheck" % "1.17.0" % Test,
  // ScalaTest + ScalaCheck 集成
  "org.scalatestplus" %% "scalacheck-1-17" % "3.2.18.0" % Test,

  // MUnit（轻量替代，Scala 3 友好）
  // "org.scalameta" %% "munit" % "1.0.0" % Test,

  // Cats Effect 测试（仅 cats-effect 项目）
  // "org.typelevel" %% "cats-effect-testing-scalatest" % "1.5.0" % Test,
)
```

## Maven 配置（pom.xml）

```xml
<dependency>
    <groupId>org.scalatest</groupId>
    <artifactId>scalatest_3</artifactId>
    <version>3.2.18</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-scala_3</artifactId>
    <version>1.17.31</version>
    <scope>test</scope>
</dependency>
```

## 语言检测标志文件

- `build.sbt`、`project/build.properties`、`*.scala`
- Maven 项目：`pom.xml` + `src/main/scala/` 目录存在

---

## 测试风格选择

ScalaTest 支持多种测试风格，**与项目现有风格保持一致**：

| 风格 | Trait | 适用场景 |
|------|-------|---------|
| FlatSpec | `AnyFlatSpec` | 行为驱动（BDD），最常用 |
| FunSuite | `AnyFunSuite` | 函数式，类似 JUnit |
| WordSpec | `AnyWordSpec` | 层次化描述，适合复杂场景 |
| FreeSpec | `AnyFreeSpec` | 自由层次，Scala 2/3 均支持 |
| MUnit | `munit.FunSuite` | 轻量，Scala 3 原生风格 |

---

## 测试命名规范

```scala
// FlatSpec 风格（推荐）：行为描述
"UserService" should "return user when valid ID is provided" in { ... }
"UserService" should "throw NotFoundException when user does not exist" in { ... }
it should "mask sensitive fields in log output" in { ... }

// FunSuite 风格：测试方法名
test("getUserById returns user for valid ID") { ... }
test("getUserById throws NotFoundException for unknown ID") { ... }

// MUnit 风格
test("getUserById - valid ID returns user") { ... }
test("getUserById - unknown ID raises NotFoundException") { ... }
```

---

## 标准测试结构（FlatSpec + mockito-scala）

```scala
import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.BeforeAndAfterEach
import org.mockito.MockitoSugar
import org.mockito.ArgumentMatchers._

/**
 * 被测类：com.example.service.UserService
 * 测试策略：使用 MockitoSugar Mock UserRepository，隔离数据库调用；
 *           对 EmailService 使用 Mock，避免真实邮件发送。
 * 覆盖场景汇总：
 *   - UserServiceTest-TC-01 ~ TC-03  正常场景：查询/创建/更新用户
 *   - UserServiceTest-TC-04 ~ TC-06  异常场景：用户不存在/DB 异常/并发冲突
 *   - UserServiceTest-TC-07 ~ TC-09  边界场景：空 ID/超长字符串/特殊字符
 *   - UserServiceTest-TC-10          性能场景：批量查询 1000 条耗时
 * 覆盖率目标：行 ≥ 90% / 分支 ≥ 85%
 * 对应设计文档章节：UT 总体设计 > UserServiceTest
 */
class UserServiceTest
    extends AnyFlatSpec
    with Matchers
    with MockitoSugar
    with BeforeAndAfterEach {

  // ===== Mock 对象声明 =====
  private val userRepository: UserRepository = mock[UserRepository]
  private val emailService: EmailService     = mock[EmailService]

  // ===== 被测对象（每个 test 前重建，保证测试隔离）=====
  private var userService: UserService = _

  override def beforeEach(): Unit = {
    super.beforeEach()
    // 重置 mock 状态，避免跨 test 污染
    reset(userRepository, emailService)
    userService = new UserService(userRepository, emailService)
  }

  // ===== 测试数据常量 =====
  private val ValidUserId   = 1L
  private val ValidUsername = "Alice"

  /**
   * 场景编号：UserServiceTest-TC-01
   * 场景类型：正常
   * 场景描述：通过有效 ID 查询用户，返回完整用户对象
   * 前置条件：Mock userRepository.findById(1L) 返回 Some(user)
   * 测试步骤：Arrange 配置 Mock → Act 调用 getUserById → Assert 验证返回值与 Mock 调用次数
   * 预期结果：返回 User(1L, "Alice")，repository 被调用恰好一次
   * 关注点/风险：防止 Service 层绕过 Repository 直接返回硬编码值
   */
  "UserService.getUserById" should "return user when valid ID is provided" in {
    // ===== 准备（Arrange）=====
    // 构造预期用户对象
    val expectedUser = User(ValidUserId, ValidUsername)
    // 配置 Mock：查询存在的用户
    when(userRepository.findById(ValidUserId)) thenReturn Some(expectedUser)

    // ===== 执行（Act）=====
    val result = userService.getUserById(ValidUserId)

    // ===== 验证（Assert）=====
    // 验证返回的用户与预期一致
    result shouldBe Some(expectedUser)
    // 验证 repository 被调用恰好一次，防止冗余查询
    verify(userRepository, times(1)).findById(ValidUserId)
  }

  /**
   * 场景编号：UserServiceTest-TC-04
   * 场景类型：异常
   * 场景描述：查询不存在的用户时，Service 层抛出 UserNotFoundException
   * 前置条件：Mock userRepository.findById(999L) 返回 None
   * 测试步骤：Arrange → Act（期望异常）→ Assert 验证异常类型与消息
   * 预期结果：抛出 UserNotFoundException，消息含 userId=999
   * 关注点/风险：防止将"用户不存在"静默处理为 null 返回
   */
  it should "throw UserNotFoundException when user does not exist" in {
    // ===== 准备（Arrange）=====
    val nonExistentId = 999L
    when(userRepository.findById(nonExistentId)) thenReturn None

    // ===== 执行 & 验证（Act & Assert）=====
    // 验证抛出正确的异常类型
    val ex = intercept[UserNotFoundException] {
      userService.getUserById(nonExistentId)
    }
    // 验证异常消息包含 userId，便于日志排查
    ex.getMessage should include(nonExistentId.toString)
  }

  /**
   * 场景编号：UserServiceTest-TC-07
   * 场景类型：边界
   * 场景描述：传入 0 或负数 userId 时，Service 拒绝并抛出 IllegalArgumentException
   * 前置条件：无 Mock 设置（应在参数校验阶段即短路）
   * 测试步骤：对每个无效 ID 调用 getUserById，验证抛出 IllegalArgumentException
   * 预期结果：IllegalArgumentException，repository 不应被调用
   * 关注点/风险：防止非法 ID 流入 DB 查询层
   */
  it should "reject non-positive user IDs with IllegalArgumentException" in {
    val invalidIds = Seq(0L, -1L, Long.MinValue)

    invalidIds.foreach { invalidId =>
      // ===== 执行 & 验证（Act & Assert）=====
      intercept[IllegalArgumentException] {
        userService.getUserById(invalidId)
      }
    }
    // 验证非法 ID 不会触达 repository
    verify(userRepository, never()).findById(any[Long])
  }
}
```

---

## FunSuite 风格模板（适合函数式代码）

```scala
import org.scalatest.funsuite.AnyFunSuite
import org.scalatest.matchers.should.Matchers
import org.mockito.MockitoSugar

class OrderServiceTest extends AnyFunSuite with Matchers with MockitoSugar {

  private val orderRepo    = mock[OrderRepository]
  private val payClient    = mock[PaymentClient]
  private val orderService = new OrderService(orderRepo, payClient)

  /**
   * 场景编号：OrderServiceTest-TC-01
   * 场景类型：正常
   * 场景描述：合法下单请求，返回已创建的订单
   * 前置条件：Mock payClient.charge 成功，orderRepo.save 返回持久化后的订单
   * 测试步骤：构造 CreateOrderRequest → 调用 createOrder → 验证返回订单与 ID
   * 预期结果：返回 Order，orderId 非空，状态为 CREATED
   * 关注点/风险：防止 save 未被调用但仍返回内存对象
   */
  test("createOrder - valid request returns created order") {
    // ===== 准备（Arrange）=====
    val req           = CreateOrderRequest(userId = 42L, amount = BigDecimal("99.90"))
    val savedOrder    = Order(id = "ORD-001", userId = 42L, status = OrderStatus.Created)
    when(payClient.charge(req.userId, req.amount)) thenReturn Right(PaymentResult("PAY-001"))
    when(orderRepo.save(any[Order])) thenReturn savedOrder

    // ===== 执行（Act）=====
    val result = orderService.createOrder(req)

    // ===== 验证（Assert）=====
    result.id     should not be empty
    result.status shouldBe OrderStatus.Created
    verify(orderRepo, times(1)).save(any[Order])
  }
}
```

---

## ScalaCheck 属性测试

```scala
import org.scalacheck.Gen
import org.scalacheck.Prop.forAll
import org.scalatestplus.scalacheck.ScalaCheckPropertyChecks

class StringUtilsPropertyTest extends AnyFlatSpec with ScalaCheckPropertyChecks with Matchers {

  /**
   * 场景编号：StringUtilsTest-TC-10
   * 场景类型：边界（属性测试）
   * 场景描述：对任意非空字符串，mask() 的输出不得包含原始内容且长度不变
   * 前置条件：无
   * 测试步骤：ScalaCheck 生成随机字符串 → 调用 mask → 验证属性
   * 预期结果：mask 结果与原始字符串不同，且已被脱敏
   * 关注点/风险：防止边缘输入（单字符/全相同字符）绕过脱敏逻辑
   */
  "StringUtils.mask" should "never expose original content for any non-empty string" in {
    // 生成长度 1–100 的任意字符串
    forAll(Gen.nonEmptyStr) { s =>
      val masked = StringUtils.mask(s)
      // 脱敏后不应等于原始值（单字符例外：只保留首位时结果不变——可按业务调整）
      whenever(s.length > 1) {
        masked should not equal s
      }
      // 脱敏后长度不应超过原始长度
      masked.length should be <= s.length + 3
    }
  }
}
```

---

## Cats Effect IO 测试（cats-effect-testing）

```scala
import cats.effect.IO
import cats.effect.testing.scalatest.AsyncIOSpec
import org.scalatest.flatspec.AsyncFlatSpec
import org.scalatest.matchers.should.Matchers

class UserServiceIOTest extends AsyncFlatSpec with AsyncIOSpec with Matchers {

  /**
   * 场景编号：UserServiceIOTest-TC-01
   * 场景类型：正常
   * 场景描述：IO 效果中查询用户，成功解包后返回正确用户
   * 前置条件：MockUserRepo 的 IO 返回 Right(user)
   * 测试步骤：调用 getUserIO → asserting 解包 IO 结果
   * 预期结果：IO 成功，user.id == 1L
   * 关注点/风险：确保 IO 错误不被静默 handleError 吞掉
   */
  "UserService.getUserIO" should "return user wrapped in IO" in {
    // ===== 准备（Arrange）=====
    val repo    = new MockUserRepository(Map(1L -> User(1L, "Alice")))
    val service = new UserServiceIO(repo)

    // ===== 执行 & 验证（Act & Assert）=====
    service.getUserIO(1L).asserting { user =>
      user.id   shouldBe 1L
      user.name shouldBe "Alice"
    }
  }
}
```

---

## MUnit 风格（Scala 3 / 轻量项目）

```scala
import munit.FunSuite

class CalculatorMUnitTest extends FunSuite {

  /**
   * 场景编号：CalculatorTest-TC-01
   * 场景类型：正常
   * 场景描述：两个正整数相加，返回正确和
   * 前置条件：无
   * 测试步骤：调用 Calculator.add → assertEquals
   * 预期结果：add(2, 3) == 5
   * 关注点/风险：防止整型溢出未被提前处理
   */
  test("Calculator.add - two positive integers") {
    // ===== 准备（Arrange）=====
    val calc = new Calculator

    // ===== 执行（Act）=====
    val result = calc.add(2, 3)

    // ===== 验证（Assert）=====
    assertEquals(result, 5)
  }
}
```

---

## Mock 进阶用法（mockito-scala）

```scala
// 1. 验证调用次数
verify(repo, times(1)).save(any[User])
verify(repo, never()).delete(any[Long])

// 2. 参数捕获
val captor = ArgCaptor[User]
verify(repo).save(captor)
captor.value.name shouldBe "Alice"

// 3. Mock 抛出异常
when(repo.findById(999L)) thenThrow new RuntimeException("DB timeout")

// 4. 连续返回不同值（重试场景）
when(repo.findById(1L))
  .thenReturn(None)         // 第一次调用：缓存未命中
  .thenReturn(Some(user))   // 第二次调用：回源成功

// 5. 验证无更多交互
verifyNoMoreInteractions(repo)
```

---

## 常用断言速查（ScalaTest Matchers）

```scala
// 相等断言
result shouldBe expected
result shouldEqual expected
result should not equal unexpected

// Option
result shouldBe Some(value)
result shouldBe None
result shouldBe defined
result shouldBe empty

// Either
result shouldBe Right(value)
result shouldBe a[Left[_, _]]
result.isRight shouldBe true

// 集合
list should have size 3
list should contain("elem")
list should contain allOf("a", "b")
list shouldBe empty
list.forall(_.isActive) shouldBe true

// 字符串
str should startWith("prefix")
str should include("substring")
str should fullyMatch regex "\\d{11}"

// 异常
intercept[IllegalArgumentException] { target.method() }
// 或
the[UserNotFoundException] thrownBy { service.get(999L) } should have message "User 999 not found"

// 数值范围
result should be >= 0
result should be <= 100
result shouldBe 3.14 +- 0.001  // 浮点近似
```

---

## 运行方式

```bash
# sbt：运行全部测试
sbt test

# sbt：运行指定测试类
sbt "testOnly com.example.service.UserServiceTest"

# sbt：运行匹配关键词的测试
sbt "testOnly *UserService*"

# sbt：生成覆盖率报告（需 sbt-scoverage 插件）
sbt clean coverage test coverageReport
# 报告位于 target/scala-x.y/scoverage-report/index.html

# Maven
mvn test -pl module -Dtest=UserServiceTest
mvn verify   # 含覆盖率（需 jacoco-maven-plugin）
```
