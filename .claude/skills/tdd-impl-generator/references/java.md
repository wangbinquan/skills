# Java 实现规范参考

## 1. 方法级注释格式（实现版 JavaDoc）

```java
/**
 * [职责] 一句话描述方法做什么。
 *
 * <p>[实现策略] 选用的技术方案及原因，例如：
 * 使用双重检查锁（DCL）保证线程安全，而非 synchronized 全方法，
 * 因为初始化只发生一次，后续读操作不需要锁竞争开销。
 *
 * <p>[业务规则落地]
 * <ul>
 *   <li>C-001 邮箱唯一性：{@link UserRepository#existsByEmail} 前置检查，
 *       而非捕获 DataIntegrityViolationException，以提供友好业务错误（FR-003）</li>
 *   <li>C-002 密码哈希：BCrypt 强度因子 ≥ 12，来自安全需求 SEC-001</li>
 * </ul>
 *
 * <p>[异常处理策略]
 * <ul>
 *   <li>邮箱已存在 → 抛出 {@link EmailAlreadyExistsException}（业务异常，HTTP 409）</li>
 *   <li>数据库写入失败 → 上抛 {@link DataAccessException}（基础设施异常，HTTP 500）</li>
 *   <li>邮件发送失败 → 仅记录 WARN 日志，不影响主事务（设计文档 4.2.3 降级策略）</li>
 * </ul>
 *
 * @param name 用户名，长度 [2,50]，不能为 null
 * @param email 邮箱地址，RFC 5322 格式，全局唯一
 * @param rawPassword 明文密码，≥8位含大小写字母和数字，不会持久化
 * @return 新建用户的唯一 ID，永不为 null
 * @throws EmailAlreadyExistsException 邮箱已注册
 * @throws ValidationException 参数格式校验失败
 */
```

## 2. 内联注释惯用法

### 2.1 解释约束来源
```java
// 邮箱大小写不敏感（FR-003：需求明确要求 case-insensitive 唯一性）
String normalizedEmail = email.toLowerCase(Locale.ROOT);
```

### 2.2 解释技术选型
```java
// 使用 Optional 而非 null 返回，明确表达"可能不存在"语义，
// 避免调用方忘记空值检查（Item 55 of Effective Java）
return userRepository.findById(id);
```

### 2.3 解释异常策略
```java
// 捕获 OptimisticLockException 并重试一次，而非直接上抛：
// 并发更新冲突在本业务场景下属于可恢复情况（设计文档 5.3 并发策略）
try {
    return orderRepository.save(order);
} catch (OptimisticLockException ex) {
    log.warn("Optimistic lock conflict on orderId={}, retrying once", order.getId());
    order = orderRepository.findById(order.getId()).orElseThrow();
    return orderRepository.save(applyUpdate(order, request));
}
```

### 2.4 解释事务边界
```java
// @Transactional 在本方法级声明，而非接口级：
// 确保 save() 和 publishEvent() 在同一事务内提交或回滚（设计文档 4.3 事务一致性要求）
@Transactional
public UserId createUser(...) { ... }
```

## 3. 异常设计

### 3.1 业务异常（应用层定义）
```java
// 业务异常继承 RuntimeException，不强制调用方 catch
// 使用 errorCode 便于 REST 层统一映射 HTTP 状态码
public class EmailAlreadyExistsException extends BusinessException {
    public EmailAlreadyExistsException(String email) {
        super(ErrorCode.EMAIL_ALREADY_EXISTS, "Email already registered: " + email);
    }
}
```

### 3.2 异常转换边界
```java
// Repository 层捕获 DataAccessException 并转换为领域异常：
// 防止基础设施异常泄漏到业务层（依赖倒置原则）
try {
    return userRepository.save(user);
} catch (DuplicateKeyException ex) {
    // 并发场景下 existsByEmail 检查后仍可能发生唯一索引冲突
    throw new EmailAlreadyExistsException(user.getEmail());
}
```

## 4. Stream / Optional 惯用法

```java
// 用 Optional.map/orElseThrow 代替嵌套 if-null 检查，提升可读性
return userRepository.findById(id)
    .map(userMapper::toDTO)                       // 存在时转 DTO
    .orElseThrow(() -> new UserNotFoundException(id));  // 不存在时抛业务异常

// 批量转换：Stream.map 配合方法引用，避免 for 循环
List<UserDTO> dtos = users.stream()
    .filter(User::isActive)                       // 只返回激活用户（业务规则 FR-008）
    .map(userMapper::toDTO)
    .collect(Collectors.toUnmodifiableList());    // 返回不可变集合（防御性编程）
```

## 5. 事务管理

```java
// 写操作默认 @Transactional（propagation=REQUIRED），
// 不需要显式声明，除非有特殊传播行为需求
@Transactional
public void updateUser(UserId id, UpdateUserRequest req) { ... }

// 读操作加 readOnly=true：优化数据库连接（某些驱动会跳过 flush），
// 同时作为文档声明"此方法不修改状态"
@Transactional(readOnly = true)
public Optional<UserDTO> getUserById(UserId id) { ... }

// 异步操作（如发邮件）不应在主事务内运行：
// 若邮件服务阻塞，会持有数据库连接，导致连接池耗尽
@Async
public CompletableFuture<Void> sendWelcomeEmailAsync(String email, String name) { ... }
```

## 6. 日志规范（Slf4j）

```java
private static final Logger log = LoggerFactory.getLogger(UserService.class);

// INFO：记录业务里程碑（成功创建、状态变更）
log.info("User registered: userId={}, email={}", userId, email);

// WARN：可恢复的非预期情况（重试成功、降级处理）
log.warn("Welcome email failed for userId={}: {}", userId, ex.getMessage());

// ERROR：需要人工介入的故障（数据不一致、外部依赖不可用）
log.error("Failed to persist user, rolling back. email={}", email, ex);

// 禁止在日志中打印敏感信息
log.debug("Processing user registration for email={}", email);  // ✅
log.debug("Password hash: {}", hashedPassword);                 // ❌ 禁止
```

## 7. 依赖注入（构造函数注入）

```java
// 所有依赖通过构造函数注入（而非 @Autowired 字段注入）：
// 1. 强制声明依赖，提高可测试性（Mock 注入无需反射）
// 2. 保证依赖不可变（final 字段）
// 3. 构造失败早于运行时失败，便于快速发现缺失 Bean
@Service
public class UserServiceImpl implements UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    public UserServiceImpl(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            EmailService emailService) {
        this.userRepository = Objects.requireNonNull(userRepository);
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder);
        this.emailService = Objects.requireNonNull(emailService);
    }
}
```

## 8. 集合防御性编程

```java
// 返回集合时使用 Collections.unmodifiableList，
// 防止调用方无意间修改内部状态（Item 17 of Effective Java）
public List<Order> getOrdersByUser(UserId userId) {
    return Collections.unmodifiableList(orderRepository.findByUserId(userId));
}

// 入参集合做防御性拷贝（若需要持久化引用）
public void addTags(Set<String> tags) {
    // 防止调用方持有引用并后续修改集合
    this.tags = new HashSet<>(tags);
}
```
