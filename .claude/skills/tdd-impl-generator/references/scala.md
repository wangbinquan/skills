# Scala 实现规范参考

## 1. 方法级注释格式（ScalaDoc 实现版）

```scala
/**
 * 创建新用户账户并异步发送欢迎邮件。
 *
 * ==实现策略==
 * 采用"先检查后执行"模式完成邮箱唯一性校验。所有操作通过
 * [[scala.concurrent.Future]] 组合，实现完全非阻塞流水线。
 * 欢迎邮件通过独立 Future 异步发送，失败只记录警告，不影响主 Future 结果。
 *
 * ==业务规则落地==
 *   - '''C-001 邮箱唯一性'''：`existsByEmail` 前置检查（FR-003）
 *   - '''C-002 密码哈希'''：BCrypt rounds=12，来自配置项（SEC-001）
 *   - '''C-003 欢迎邮件'''：Future fire-and-forget，失败降级（设计文档 4.2.3）
 *
 * ==错误处理策略==
 *   - [[EmailAlreadyExistsException]]：邮箱已注册，调用方转 HTTP 409
 *   - [[ValidationException]]：参数格式不合规，转 HTTP 422
 *   - 数据库失败：Future 以 [[RepositoryException]] 完成，转 HTTP 500
 *
 * @param name 用户名，长度 [2, 50]，非空
 * @param email 邮箱地址，RFC 5322 格式，全局唯一（不区分大小写）
 * @param rawPassword 明文密码，不会被持久化
 * @return 包含新建用户 ID 的 Future；失败时 Future 以业务异常完成
 */
def createUser(name: String, email: String, rawPassword: String): Future[UserId]
```

## 2. Future 组合惯用法

```scala
def createUser(name: String, email: String, rawPassword: String): Future[UserId] = {
  // === Step 1: 参数校验（同步，立即失败快速）===
  // 校验失败返回 Future.failed，传播到 Future 链末端的 recover/recoverWith
  val validationResult = validateInput(name, email, rawPassword)
  if (validationResult.isFailure) {
    return Future.failed(new ValidationException(validationResult.failed.get.getMessage))
  }

  // === Step 2: 邮箱规范化与唯一性检查 ===
  // 邮箱转小写（FR-003：唯一性不区分大小写）
  val normalizedEmail = email.toLowerCase

  // flatMap 保持 Future 链式，避免嵌套 Future[Future[T]]
  userRepo.existsByEmail(normalizedEmail).flatMap { exists =>
    if (exists) {
      // 邮箱已存在：返回 failed Future，而非抛出异常（Future 链内不应抛出）
      Future.failed(EmailAlreadyExistsException(normalizedEmail))
    } else {
      // === Step 3: 密码哈希与持久化（顺序执行）===
      // map 在同一线程池内同步执行密码哈希（CPU 密集型）
      val hashedPassword = passwordHasher.hash(rawPassword)
      val newUser = User.register(name, normalizedEmail, hashedPassword)

      // flatMap 链接异步持久化
      userRepo.save(newUser).map { savedUser =>
        // === Step 4: 触发欢迎邮件（非关键路径）===
        // andThen 不改变 Future 结果，只添加副作用（发邮件）
        // Future 内部失败通过 recover 处理，不影响已完成的 save Future
        emailService.sendWelcomeEmail(normalizedEmail, name)
          .recover {
            case ex =>
              // 邮件失败只记录警告，不传播（设计文档 4.2.3 降级策略）
              logger.warn(s"Welcome email failed for ${maskEmail(normalizedEmail)}: ${ex.getMessage}")
          }
          .foreach(_ => ()) // 触发执行，不等待结果

        logger.info(s"User registered: userId=${savedUser.id}")
        savedUser.id
      }
    }
  }
}
```

## 3. Either / Try 错误处理

```scala
// Either[Error, Value] 用于同步操作的错误表达（避免异常用于控制流）
def validateInput(name: String, email: String, password: String): Either[ValidationError, Unit] = {
  for {
    // for-comprehension 在 Either 上：遇到 Left 立即短路
    _ <- validateName(name)
    _ <- validateEmail(email)
    _ <- validatePassword(password)
  } yield ()
}

// Try 用于包装可能抛出异常的第三方库调用
def hashPassword(rawPassword: String): Try[String] =
  Try(BCrypt.hashpw(rawPassword, BCrypt.gensalt(12)))
    .recoverWith {
      case ex: Exception =>
        // 包装为业务异常，避免暴露 BCrypt 实现细节
        Failure(new PasswordHashingException(s"Failed to hash password: ${ex.getMessage}", ex))
    }
```

## 4. 模式匹配惯用法

```scala
// match 表达式替代 if-else 链，编译器检查穷举性
def handleUserStatus(user: User): UserDTO = user.status match {
  case UserStatus.Active =>
    // 激活用户：返回完整 DTO
    UserDTO.from(user)
  case UserStatus.Deactivated =>
    // 注销用户：返回脱敏 DTO（部分字段隐藏，业务规则 FR-010）
    UserDTO.redacted(user)
  case UserStatus.Suspended =>
    // 暂停用户：抛出业务异常（禁止查询，业务规则 FR-011）
    throw new UserSuspendedException(user.id)
  // 若新增状态未处理，编译器会发出警告（穷举性检查的价值）
}

// case class 解构：提取字段，避免重复访问
savedUser match {
  case User(id, name, email, _, _, createdAt) =>
    logger.info(s"User registered: id=$id, email=${maskEmail(email)}, at=$createdAt")
}
```

## 5. Implicit 与 Type Class

```scala
// 隐式转换：避免手动调用映射方法，但必须在注释中说明隐式来源
// （防止其他人不知道转换从哪里来）

// 在 companion object 中定义隐式，按需 import，避免全局污染
object UserDTO {
  // 类型类：定义从 User 到 UserDTO 的转换（单一职责，与 User 解耦）
  implicit val fromUser: User => UserDTO = user => UserDTO(
    id = user.id.value,
    name = user.name,
    email = user.email,
    status = user.status.entryName,
    createdAt = user.createdAt.toString
  )
}

// 使用时需明确 import，避免隐式"魔法"：
import UserDTO.fromUser
val dto: UserDTO = user  // 隐式转换
```

## 6. 函数式惯用法

```scala
// 用 Option 链代替 null 检查
def getUserById(id: UserId): Future[Option[UserDTO]] =
  userRepo.findById(id).map(_.map(UserDTO.from))
  //                       ^ Option.map：存在时转换，None 时保持 None

// 用 sequence 将 List[Future[T]] 转为 Future[List[T]]
val futures: List[Future[UserDTO]] = userIds.map(getUserById)
val result: Future[List[UserDTO]] = Future.sequence(futures)

// 用 traverse 代替 map + sequence（更清晰）
import cats.instances.future._
import cats.syntax.traverse._
val result2: Future[List[UserDTO]] = userIds.traverse(getUserById)
```

## 7. 日志规范（Slf4j + Scala Logging）

```scala
import com.typesafe.scalalogging.StrictLogging

class UserServiceImpl extends UserService with StrictLogging {
  // INFO：业务里程碑
  logger.info(s"User registered: userId=${userId.value}")

  // WARN：可恢复的非预期情况
  logger.warn(s"Welcome email failed for ${maskEmail(email)}: ${ex.getMessage}")

  // ERROR：需要人工介入的故障
  logger.error(s"Database write failed for userId=${userId.value}", ex)

  // 禁止在日志中打印敏感信息
  logger.debug(s"Processing registration: emailDomain=${emailDomain(email)}")  // ✅
  logger.debug(s"Password: $rawPassword")                                        // ❌ 禁止

  // 使用 lazy 插值避免字符串拼接开销（DEBUG 级别通常关闭）
  logger.debug(s"Heavy computation result: ${expensiveToString()}")
  // ↑ StrictLogging 已优化：只有 logger.isDebugEnabled 时才执行插值
}
```

## 8. Case Class 与不可变性

```scala
// case class：值对象，自动生成 equals/hashCode/copy/toString
// sealed：限制子类在同一文件，编译器检查模式匹配穷举性
sealed trait UserStatus {
  def entryName: String
}
object UserStatus {
  case object Active extends UserStatus { val entryName = "ACTIVE" }
  case object Deactivated extends UserStatus { val entryName = "DEACTIVATED" }
  case object Suspended extends UserStatus { val entryName = "SUSPENDED" }
}

// copy 方法：创建部分修改的副本，保持不可变性
// 而非直接修改字段（Scala case class 默认不可变）
val updatedUser = existingUser.copy(
  name = request.name.getOrElse(existingUser.name),
  // 邮箱不可变（业务规则 FR-007）：不出现在 copy 调用中
  updatedAt = Instant.now()
)
```
