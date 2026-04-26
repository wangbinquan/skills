# Scala 代码骨架参考规范

## 目录
1. [ScalaDoc注释规范](#scaladoc)
2. [Trait骨架模板](#trait-template)
3. [Class骨架模板](#class-template)
4. [Case Class / Sealed Trait模板](#case-class-template)
5. [Companion Object模板](#companion-object)
6. [TODO注释规范](#todo)
7. [Scala惯用约定](#scala-idioms)

---

## ScalaDoc注释规范 {#scaladoc}

Scala使用 `/** ... */` 格式（JavaDoc兼容），ScalaDoc工具生成API文档。

### 类级ScalaDoc（必须包含以下所有字段）

```scala
/**
 * 用户服务，负责用户注册、查询、更新等核心业务操作。
 *
 * 作为应用层服务，`UserService`协调领域对象（`User`）与基础设施层
 * （`UserRepository`、`EmailService`）之间的交互。
 *
 * ==设计思路==
 * 采用函数式风格：核心操作返回`Future[Either[UserError, T]]`，
 * 避免副作用在调用链中扩散。依赖通过构造函数注入，便于测试中替换为Mock。
 *
 * ==实现思路==
 * 使用`Future`处理异步IO操作，配合`ExecutionContext`管理线程池。
 * 错误处理使用`Either[UserError, T]`而非异常，调用方通过模式匹配处理错误。
 *
 * ==主要依赖==
 *   - `userRepository`: 用户数据持久化接口
 *   - `emailService`: 邮件通知服务接口
 *
 * ==线程安全性==
 * 线程安全。所有字段为val（不可变）引用，无共享可变状态。
 *
 * ==设计约束==
 *   - 邮箱在系统中全局唯一（来自设计文档第3.2节）
 *   - 密码使用bcrypt哈希，强度因子不低于12（来自安全需求）
 *
 * @param userRepository 用户数据访问对象，不可为null
 * @param emailService 邮件服务，不可为null
 * @since 1.0.0
 * @see [[UserRepository]]
 */
```

### 方法级ScalaDoc

```scala
/**
 * 注册新用户，校验邮箱唯一性并发送欢迎邮件。
 *
 * ==实现思路==
 * 采用"先检查后执行"模式，写入前先验证邮箱唯一性。
 * 使用`for`推导式（monadic composition）链式组合异步操作，
 * 每一步失败时短路（left值传播）。
 *
 * ==实现步骤==
 *   1. 参数校验：验证name非空(2-50字符)、email合法格式、password强度
 *   2. 唯一性检查：`userRepository.existsByEmail(email)`
 *   3. 密码哈希：`BCrypt.hashpw(password, BCrypt.gensalt(12))`
 *   4. 构建User实体：填充name、email、passwordHash、createdAt
 *   5. 持久化：`userRepository.save(user)`
 *   6. 异步发送欢迎邮件：`emailService.sendWelcomeEmail(user)`（fire-and-forget）
 *   7. 返回新用户ID：`Right(savedUser.id)`
 *
 * @param name 用户名，不可为null，长度2-50字符
 * @param email 用户邮箱，不可为null，必须合法格式，全局唯一
 * @param password 明文密码，不可为null，至少8位含大小写字母和数字
 * @return `Future[Either[UserError, UserId]]`：
 *         成功时返回`Right(userId)`，失败时返回`Left(error)`
 */
```

---

## Trait骨架模板 {#trait-template}

```scala
// UserService.scala
package com.example.user

import scala.concurrent.Future

/**
 * 用户服务接口，定义用户管理相关操作的契约。
 *
 * ==设计思路==
 * 使用Scala trait定义接口，通过cake pattern或构造函数注入实现依赖倒置。
 * 所有方法返回`Future[Either[UserError, T]]`，统一异步+错误处理模式：
 *   - `Future`处理异步（不阻塞线程）
 *   - `Either`处理业务错误（左侧错误，右侧成功值）
 *
 * ==设计约束==
 *   - 所有写操作须幂等（来自设计文档）
 *   - 接口方法不暴露内部数据库实体，使用DTO或值对象
 */
trait UserService {

  /**
   * 注册新用户。[完整注释见上方规范]
   */
  def createUser(
    name: String,
    email: String,
    password: String
  ): Future[Either[UserError, UserId]]

  /**
   * 根据ID查询用户信息。
   * 若用户不存在，返回`Right(None)`而非`Left(UserError)`。
   */
  def getUserById(id: UserId): Future[Either[UserError, Option[UserDTO]]]

  /**
   * 更新用户信息（部分更新）。
   */
  def updateUser(id: UserId, req: UpdateUserRequest): Future[Either[UserError, Unit]]

  /**
   * 注销用户账户（软删除）。
   */
  def deleteUser(id: UserId): Future[Either[UserError, Unit]]
}

/**
 * 用户数据访问接口（Repository模式）。
 *
 * ==设计思路==
 * Repository trait位于领域层，具体实现（如`SlickUserRepository`）
 * 位于基础设施层，实现领域层与持久化框架的解耦。
 */
trait UserRepository {
  def save(user: User): Future[Either[UserError, User]]
  def findById(id: UserId): Future[Either[UserError, Option[User]]]
  def findByEmail(email: String): Future[Either[UserError, Option[User]]]
  def existsByEmail(email: String): Future[Either[UserError, Boolean]]
  def delete(id: UserId): Future[Either[UserError, Unit]]
}
```

---

## Class骨架模板 {#class-template}

```scala
// UserServiceImpl.scala
package com.example.user

import scala.concurrent.{ExecutionContext, Future}
// TODO: 根据实现步骤确定具体需要的import

/**
 * 用户服务实现类。[完整注释见上方规范]
 *
 * @param userRepository 用户数据访问对象，通过构造函数注入
 * @param emailService 邮件通知服务，通过构造函数注入
 * @param ec 隐式ExecutionContext，用于Future的线程调度
 */
class UserServiceImpl(
  private val userRepository: UserRepository,
  private val emailService: EmailService
)(implicit val ec: ExecutionContext) extends UserService {

  /**
   * 注册新用户。[完整注释见上方规范]
   */
  override def createUser(
    name: String,
    email: String,
    password: String
  ): Future[Either[UserError, UserId]] = {
    // TODO: Step 1 - 参数校验（同步，立即返回Left或继续）
    //   - if (name == null || name.trim.length < 2 || name.trim.length > 50)
    //       return Future.successful(Left(UserError.InvalidInput("name", "must be 2-50 chars")))
    //   - if (!EmailValidator.isValid(email))
    //       return Future.successful(Left(UserError.InvalidInput("email", "invalid format")))
    //   - if (!isStrongPassword(password))
    //       return Future.successful(Left(UserError.InvalidInput("password", "too weak")))

    // TODO: Step 2-7 - 使用for推导式链式组合异步操作
    //   for {
    //     exists       <- userRepository.existsByEmail(email)
    //     _            <- if (exists.exists(identity)) Future.successful(Left(UserError.EmailAlreadyExists(email)))
    //                     else Future.successful(Right(()))
    //     passwordHash  = BCrypt.hashpw(password, BCrypt.gensalt(12))
    //     user          = User(UserId.generate(), name, email, passwordHash, UserStatus.Active)
    //     savedUser    <- userRepository.save(user)
    //     _             = emailService.sendWelcomeEmail(savedUser.toOption.get) // fire-and-forget
    //   } yield savedUser.map(_.id)

    Future.successful(Left(UserError.NotImplemented("createUser"))) // TODO: implement
  }

  /**
   * 根据ID查询用户信息。[完整注释见上方规范]
   */
  override def getUserById(id: UserId): Future[Either[UserError, Option[UserDTO]]] = {
    // TODO: Step 1 - 参数校验
    //   - if (id == null) return Future.successful(Left(UserError.InvalidInput("id", "must not be null")))

    // TODO: Step 2 - 查询并转换
    //   - userRepository.findById(id).map(_.map(_.map(UserDTO.fromUser)))

    Future.successful(Left(UserError.NotImplemented("getUserById"))) // TODO: implement
  }

  override def updateUser(id: UserId, req: UpdateUserRequest): Future[Either[UserError, Unit]] = {
    // TODO: Step 1 - 加载现有用户（确认存在）
    // TODO: Step 2 - 应用部分更新（req中非None的字段更新到user）
    // TODO: Step 3 - 持久化
    Future.successful(Left(UserError.NotImplemented("updateUser"))) // TODO: implement
  }

  override def deleteUser(id: UserId): Future[Either[UserError, Unit]] = {
    // TODO: Step 1 - 确认用户存在
    // TODO: Step 2 - 软删除（更新status为Deactivated）
    // TODO: Step 3 - 持久化
    Future.successful(Left(UserError.NotImplemented("deleteUser"))) // TODO: implement
  }
}
```

---

## Case Class / Sealed Trait模板 {#case-class-template}

```scala
// domain.scala
package com.example.user

import java.time.Instant
import java.util.UUID

/**
 * 用户ID值对象，封装UUID以提供类型安全。
 *
 * ==设计思路==
 * 使用case class（而非裸String/UUID），防止将OrderId误传给需要UserId的方法。
 * 不可变性由case class保证。
 *
 * @param value 底层UUID值
 */
final case class UserId(value: UUID) {
  override def toString: String = value.toString
}

object UserId {
  /**
   * 生成新的UserId。
   *
   * ==实现步骤==
   *   1. 使用UUID.randomUUID()生成随机UUID
   *   2. 包装为UserId返回
   */
  def generate(): UserId = {
    // TODO: Step 1 - 生成并返回新UserId
    //   - UserId(UUID.randomUUID())
    throw new NotImplementedError("TODO: implement UserId.generate") // TODO: implement
  }

  /**
   * 从字符串解析UserId。
   *
   * ==实现步骤==
   *   1. 尝试UUID.fromString(str)解析
   *   2. 解析失败返回Left(UserError.InvalidInput(...))，成功返回Right(UserId(...))
   */
  def fromString(str: String): Either[String, UserId] = {
    // TODO: Step 1 - 解析UUID字符串
    //   - try Right(UserId(UUID.fromString(str)))
    //   - catch { case _: IllegalArgumentException => Left(s"Invalid UUID: $str") }
    Left("TODO: implement") // TODO: implement
  }
}

/**
 * 用户状态枚举（sealed trait + case object模式）。
 *
 * ==设计思路==
 * 使用sealed trait确保所有子类型在编译期可知，
 * 使模式匹配时编译器可以检查是否覆盖了所有情况（exhaustiveness check）。
 *
 * 状态流转: PendingVerify → Active → Suspended → Deactivated（不可逆）
 */
sealed trait UserStatus {
  /**
   * 判断当前状态是否允许登录。
   *
   * ==实现步骤==
   *   1. 使用模式匹配：只有Active允许登录
   */
  def isLoginAllowed: Boolean
}

object UserStatus {
  /** 待邮箱验证 */
  case object PendingVerify extends UserStatus {
    override def isLoginAllowed: Boolean = false // TODO: implement（当前为false，正确）
  }

  /** 正常活跃 */
  case object Active extends UserStatus {
    override def isLoginAllowed: Boolean = true // TODO: implement（当前为true，正确）
  }

  /** 已暂停 */
  case object Suspended extends UserStatus {
    override def isLoginAllowed: Boolean = false // TODO: implement（当前为false，正确）
  }

  /** 已注销（不可逆） */
  case object Deactivated extends UserStatus {
    override def isLoginAllowed: Boolean = false // TODO: implement（当前为false，正确）
  }
}

/**
 * 用户领域实体，包含用户的核心属性。
 *
 * ==设计思路==
 * 使用case class的不可变性，更新操作通过copy()返回新实例。
 * id有默认值（generate()），便于在创建流程中直接构建。
 *
 * @param name 用户名，2-50字符
 * @param email 用户邮箱，全局唯一，不可变更
 * @param passwordHash 密码哈希值，不存储明文
 * @param id 用户唯一标识，默认自动生成
 * @param status 账户状态，默认为待验证
 * @param createdAt 创建时间，默认为当前时间
 */
final case class User(
  name: String,
  email: String,
  passwordHash: String,
  id: UserId = UserId.generate(),
  status: UserStatus = UserStatus.PendingVerify,
  createdAt: Instant = Instant.now()
)
```

---

## Companion Object模板 {#companion-object}

```scala
// UserService.scala（继续）
package com.example.user

import scala.concurrent.ExecutionContext

/**
 * `UserService` companion object，提供工厂方法。
 *
 * ==设计思路==
 * Companion object作为工厂，封装创建细节，
 * 确保调用方始终面向`UserService` trait而非具体实现类。
 */
object UserService {
  /**
   * 创建`UserService`实例。
   *
   * ==实现步骤==
   *   1. 校验userRepository和emailService均不为null
   *   2. 返回UserServiceImpl实例（类型为UserService接口）
   *
   * @param userRepository 用户数据访问对象，不可为null
   * @param emailService 邮件服务，不可为null
   * @param ec 隐式ExecutionContext
   * @return UserService接口实例
   */
  def apply(
    userRepository: UserRepository,
    emailService: EmailService
  )(implicit ec: ExecutionContext): UserService = {
    // TODO: Step 1 - 参数非空校验
    //   - require(userRepository != null, "userRepository must not be null")
    //   - require(emailService != null, "emailService must not be null")

    // TODO: Step 2 - 创建并返回实现类实例（返回类型为接口）
    //   - new UserServiceImpl(userRepository, emailService)
    throw new NotImplementedError("TODO: implement UserService.apply") // TODO: implement
  }
}
```

---

## TODO注释规范 {#todo}

```scala
def processPayment(
  orderId: OrderId,
  payment: PaymentInfo
): Future[Either[OrderError, PaymentResult]] = {
  // TODO: Step 1 - 加载订单（加锁防止并发支付）
  //   - for { orderOpt <- orderRepository.findByIdForUpdate(orderId) } yield ...
  //   - 若订单不存在：Left(OrderError.NotFound(orderId))
  //   - 若状态不是PendingPayment：Left(OrderError.InvalidStatus(current, expected))

  // TODO: Step 2 - 调用支付网关（含重试：最多3次，指数退避）
  //   - 使用akka-retry或自定义重试逻辑
  //   - PaymentDeclinedError是业务错误，不应重试（直接返回Left）
  //   - NetworkError是技术错误，重试后仍失败则返回Left(OrderError.PaymentGatewayUnavailable)

  // TODO: Step 3 - 更新订单状态（在同一事务内）
  //   - 成功：order.copy(status = OrderStatus.Paid, paymentId = Some(result.paymentId))
  //   - 失败：order.copy(status = OrderStatus.PaymentFailed)
  //   - orderRepository.save(updatedOrder)

  // TODO: Step 4 - 发布领域事件（fire-and-forget）
  //   - eventBus.publish(if (result.success) OrderPaidEvent(orderId) else OrderPaymentFailedEvent(orderId))

  Future.successful(Left(OrderError.NotImplemented("processPayment"))) // TODO: implement
}
```

---

## Scala惯用约定 {#scala-idioms}

```scala
// 1. Option处理（避免null）
val opt: Option[String] = Some("value")
opt.map(_.toUpperCase)          // 转换（若存在）
opt.getOrElse("default")        // 获取或默认值
opt.fold("empty")(_.length)     // 折叠（同getOrElse + map）
opt.filter(_.nonEmpty)          // 过滤

// 2. Either错误处理（函数式风格）
type Result[A] = Either[UserError, A]
val result: Result[UserId] = Right(UserId.generate())
result.map(id => s"Created: $id")
result.left.map(err => s"Error: $err")
result.flatMap(id => validateId(id))

// 3. Future + Either组合
import scala.concurrent.Future
def combined: Future[Either[UserError, String]] =
  Future.successful(Right("success"))

// for推导式（可读性最佳）
for {
  user   <- userRepository.findById(id)       // Future[Either[E, Option[User]]]
  dto    <- Future.successful(user.map(_.map(UserDTO.fromUser)))
} yield dto

// 4. 模式匹配
result match {
  case Right(userId)                        => s"Created: $userId"
  case Left(UserError.EmailAlreadyExists(e)) => s"Email $e exists"
  case Left(err)                            => s"Error: $err"
}

// 5. 不可变更新（case class copy）
val updatedUser = user.copy(
  name = req.name.getOrElse(user.name),
  status = UserStatus.Active
)

// 6. 隐式参数（ExecutionContext）
def asyncOp(implicit ec: ExecutionContext): Future[Unit] =
  Future { /* 在ec指定的线程池上运行 */ }

// 7. 泛型与类型上界/下界
def process[A <: BaseEntity](entity: A): Future[A] = ???
def narrow[A >: SpecificType](value: A): A = value
```
