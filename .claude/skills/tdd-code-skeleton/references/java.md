# Java 代码骨架参考规范

## 目录
1. [JavaDoc注释规范](#javadoc)
2. [类骨架模板](#class-template)
3. [接口骨架模板](#interface-template)
4. [抽象类骨架模板](#abstract-template)
5. [枚举骨架模板](#enum-template)
6. [字段注释规范](#field-comment)
7. [方法骨架规范](#method-skeleton)
8. [TODO注释规范](#todo)
9. [常见注解](#annotations)

---

## JavaDoc注释规范 {#javadoc}

### 类级JavaDoc（必须包含以下所有字段）

```java
/**
 * [一句话职责描述]
 *
 * <p>[扩展描述：该类在整体架构中的角色，解决什么问题]
 *
 * <h3>设计思路</h3>
 * <p>[该类的设计思路：为什么这样设计，采用什么设计模式，核心数据结构选择理由]
 *
 * <h3>实现思路</h3>
 * <p>[核心实现方案：使用什么技术手段，关键算法或流程概述]
 *
 * <h3>主要依赖</h3>
 * <ul>
 *   <li>{@link DependencyA} - [该依赖的作用]</li>
 *   <li>{@link DependencyB} - [该依赖的作用]</li>
 * </ul>
 *
 * <h3>线程安全性</h3>
 * <p>[是否线程安全；若否，说明原因及使用注意事项]
 *
 * <h3>设计约束</h3>
 * <ul>
 *   <li>[来自设计文档的约束1]</li>
 *   <li>[来自设计文档的约束2]</li>
 * </ul>
 *
 * @author [作者，可留空]
 * @since [版本号，如 1.0.0]
 * @see RelatedClass
 */
```

### 方法级JavaDoc（必须包含以下所有字段）

```java
/**
 * [一句话方法职责描述]
 *
 * <h4>实现思路</h4>
 * <p>[该方法的核心实现思路：关键判断逻辑、算法选择、处理流程]
 *
 * <h4>实现步骤</h4>
 * <ol>
 *   <li>步骤1：[具体操作，例如"校验入参非空且格式合法"]</li>
 *   <li>步骤2：[具体操作，例如"通过userRepo查询用户实体"]</li>
 *   <li>步骤3：[具体操作，例如"应用业务规则，计算结果"]</li>
 *   <li>步骤4：[具体操作，例如"将结果转换为DTO并返回"]</li>
 * </ol>
 *
 * @param paramName [参数说明：含义、约束（如"不可为null"、"范围0-100"）]
 * @param anotherParam [参数说明]
 * @return [返回值说明：含义，以及null/empty等特殊情况]
 * @throws SomeException [触发条件]
 * @throws AnotherException [触发条件]
 * @pre [前置条件，如"调用前必须已完成初始化"]
 * @post [后置条件，如"调用后状态X保证为Y"]
 */
```

### 字段注释

```java
/** [字段含义，约束，默认值说明] */
private String fieldName;

/**
 * [多行说明时使用块注释]
 * [例如：缓存用户信息，key为userId，TTL为10分钟]
 */
private Map<String, User> userCache;
```

---

## 类骨架模板 {#class-template}

```java
package com.example.service;

import com.example.domain.User;
import com.example.repository.UserRepository;
// TODO: 根据实现步骤确定具体需要的import

/**
 * 用户服务实现类，负责用户注册、查询、更新等核心业务操作。
 *
 * <p>作为应用层服务，UserService协调领域对象（User）与基础设施层（UserRepository、
 * EmailService）之间的交互，实现用户相关业务流程。
 *
 * <h3>设计思路</h3>
 * <p>采用DDD分层架构，本类位于应用服务层（Application Service）。
 * 通过构造函数注入依赖，确保依赖可测试性（便于单测中Mock）。
 * 所有对外接口遵循"命令查询分离"原则（CQRS）。
 *
 * <h3>实现思路</h3>
 * <p>使用Spring事务管理保证数据一致性；读操作标注@Transactional(readOnly=true)
 * 以优化数据库连接资源；写操作使用默认事务隔离级别（READ_COMMITTED）。
 *
 * <h3>主要依赖</h3>
 * <ul>
 *   <li>{@link UserRepository} - 用户数据持久化操作</li>
 *   <li>{@link EmailService} - 注册成功后发送欢迎邮件</li>
 * </ul>
 *
 * <h3>线程安全性</h3>
 * <p>线程安全。所有字段为final且不可变，无共享可变状态。
 *
 * <h3>设计约束</h3>
 * <ul>
 *   <li>邮箱在系统中全局唯一（来自设计文档第3.2节）</li>
 *   <li>用户名长度2-50个字符（来自需求文档FR-001）</li>
 * </ul>
 *
 * @author
 * @since 1.0.0
 * @see IUserService
 */
@Service
public class UserService implements IUserService {

    /** 用户数据访问对象，提供CRUD操作 */
    private final UserRepository userRepository;

    /** 邮件服务，用于发送系统通知邮件 */
    private final EmailService emailService;

    /**
     * 构造函数，通过依赖注入初始化服务。
     *
     * <h4>实现思路</h4>
     * <p>使用构造函数注入（而非字段注入）以确保依赖在单测中可被Mock替换，
     * 同时使字段声明为final，强制不变性。
     *
     * <h4>实现步骤</h4>
     * <ol>
     *   <li>步骤1：校验入参不为null（防御性编程）</li>
     *   <li>步骤2：赋值给对应的final字段</li>
     * </ol>
     *
     * @param userRepository 用户数据访问对象，不可为null
     * @param emailService 邮件服务，不可为null
     */
    public UserService(UserRepository userRepository, EmailService emailService) {
        // TODO: Step 1 - 参数非空校验
        //   - Objects.requireNonNull(userRepository, "userRepository must not be null")
        //   - Objects.requireNonNull(emailService, "emailService must not be null")
        // TODO: Step 2 - 字段赋值
        //   - this.userRepository = userRepository
        //   - this.emailService = emailService
        this.userRepository = userRepository;
        this.emailService = emailService;
    }

    /**
     * 注册新用户，校验唯一性并发送欢迎邮件。
     *
     * <h4>实现思路</h4>
     * <p>采用"先检查后执行"模式：在写入数据库前先检查邮箱唯一性，
     * 避免依赖数据库唯一键约束产生不友好的异常信息。
     * 密码使用BCrypt哈希存储，不存储明文。
     *
     * <h4>实现步骤</h4>
     * <ol>
     *   <li>步骤1：入参校验 - 验证name非空（2-50字符）、email格式合法、password强度符合规则</li>
     *   <li>步骤2：唯一性检查 - 通过userRepository.existsByEmail()查询邮箱是否已被注册</li>
     *   <li>步骤3：密码加密 - 使用BCryptPasswordEncoder对password进行hash</li>
     *   <li>步骤4：构建User实体 - 创建User对象，设置name、email、passwordHash、createTime</li>
     *   <li>步骤5：持久化 - 调用userRepository.save()保存用户</li>
     *   <li>步骤6：发送欢迎邮件 - 异步调用emailService.sendWelcomeEmail(user)</li>
     *   <li>步骤7：返回新用户ID</li>
     * </ol>
     *
     * @param name 用户名，不可为null，长度2-50字符
     * @param email 用户邮箱，不可为null，必须是合法邮箱格式，全局唯一
     * @param password 明文密码，不可为null，至少8位含大小写字母和数字
     * @return 新创建用户的ID，非null
     * @throws IllegalArgumentException 当name/email/password不合法时
     * @throws EmailAlreadyExistsException 当邮箱已被注册时
     */
    @Override
    @Transactional
    public UserId createUser(String name, String email, String password) {
        // TODO: Step 1 - 入参校验
        //   - 校验name非空且长度在[2,50]之间，否则抛出IllegalArgumentException
        //   - 校验email非空且符合邮箱格式（正则或EmailValidator），否则抛出IllegalArgumentException
        //   - 校验password非空且长度>=8且含大小写字母和数字，否则抛出IllegalArgumentException

        // TODO: Step 2 - 邮箱唯一性检查
        //   - 调用userRepository.existsByEmail(email)
        //   - 若已存在，抛出EmailAlreadyExistsException("Email already registered: " + email)

        // TODO: Step 3 - 密码加密
        //   - 使用BCryptPasswordEncoder.encode(password)生成passwordHash

        // TODO: Step 4 - 构建User实体
        //   - 创建User对象，填充name、email、passwordHash
        //   - 设置createTime = LocalDateTime.now()、status = UserStatus.ACTIVE

        // TODO: Step 5 - 持久化
        //   - User savedUser = userRepository.save(user)

        // TODO: Step 6 - 异步发送欢迎邮件
        //   - emailService.sendWelcomeEmailAsync(savedUser)

        // TODO: Step 7 - 返回用户ID
        //   - return savedUser.getId()
        return null; // TODO: implement
    }
}
```

---

## 接口骨架模板 {#interface-template}

```java
package com.example.service;

/**
 * 用户服务接口，定义用户管理相关的核心操作契约。
 *
 * <p>本接口是应用层与外部（Controller、其他Service）交互的边界，
 * 通过接口隔离具体实现，便于单元测试中进行Mock替换。
 *
 * <h3>设计思路</h3>
 * <p>遵循依赖倒置原则（DIP），上层模块依赖此接口而非具体实现类。
 * 接口方法命名采用业务语义（如createUser而非insertUser），体现领域语言。
 *
 * <h3>设计约束</h3>
 * <ul>
 *   <li>所有写操作均在事务中执行（由实现类保证）</li>
 *   <li>返回值不应暴露内部数据库实体，使用DTO或值对象（来自设计文档）</li>
 * </ul>
 *
 * @since 1.0.0
 */
public interface IUserService {

    /**
     * [方法JavaDoc同上，接口方法同样需要完整注释]
     */
    UserId createUser(String name, String email, String password);

    /**
     * [另一个方法的完整JavaDoc]
     */
    Optional<UserDTO> getUserById(UserId id);
}
```

---

## 抽象类骨架模板 {#abstract-template}

```java
/**
 * 通知发送器抽象基类，定义通知发送的通用流程（模板方法模式）。
 *
 * <h3>设计思路</h3>
 * <p>使用模板方法模式：sendNotification()定义发送流程的骨架，
 * 具体的"构建消息体"和"实际发送"由子类实现。
 * 公共的"校验"和"记录日志"逻辑在本类中实现，避免子类重复。
 *
 * <h3>实现思路</h3>
 * <p>抽象方法：buildMessage()由子类实现消息格式化；doSend()由子类实现具体传输。
 * 钩子方法：beforeSend()可被子类覆盖以插入前置逻辑（默认空实现）。
 */
public abstract class AbstractNotificationSender {

    /**
     * 发送通知的模板方法，定义标准发送流程（不可被子类重写）。
     *
     * <h4>实现步骤</h4>
     * <ol>
     *   <li>步骤1：调用validate()校验recipient和content</li>
     *   <li>步骤2：调用beforeSend()钩子（子类可覆盖）</li>
     *   <li>步骤3：调用buildMessage()获取格式化消息体</li>
     *   <li>步骤4：调用doSend()执行实际发送</li>
     *   <li>步骤5：记录发送日志</li>
     * </ol>
     */
    public final void sendNotification(String recipient, String content) {
        // TODO: Step 1 - 参数校验
        // TODO: Step 2 - 调用beforeSend()前置钩子
        // TODO: Step 3 - 构建消息体：String message = buildMessage(recipient, content)
        // TODO: Step 4 - 执行发送：doSend(recipient, message)
        // TODO: Step 5 - 记录日志
    }

    /**
     * 构建消息体，由子类实现具体的消息格式。
     *
     * <h4>实现思路</h4>
     * <p>子类根据各自的消息格式（如SMS短文本、Email HTML、Push JSON）构建消息体。
     *
     * @param recipient 接收方标识（手机号、邮箱、设备Token等）
     * @param content 原始内容文本
     * @return 格式化后的消息体字符串，不可为null
     */
    protected abstract String buildMessage(String recipient, String content);

    /**
     * 执行实际消息发送，由子类实现具体的传输逻辑。
     *
     * @param recipient 接收方标识
     * @param formattedMessage 已格式化的消息体
     * @throws NotificationException 发送失败时抛出
     */
    protected abstract void doSend(String recipient, String formattedMessage);

    /**
     * 发送前钩子方法（可选覆盖），默认空实现。
     * 子类可覆盖此方法实现限流、黑名单检查等前置逻辑。
     */
    protected void beforeSend(String recipient, String content) {
        // 默认空实现，子类按需覆盖
    }
}
```

---

## 枚举骨架模板 {#enum-template}

```java
/**
 * 用户状态枚举，表示用户账户在系统生命周期中的各种状态。
 *
 * <h3>设计思路</h3>
 * <p>使用枚举而非常量字符串，确保类型安全，防止非法状态值。
 * 每个枚举值携带displayName用于前端展示和日志记录。
 *
 * <h3>状态流转</h3>
 * <p>PENDING_VERIFY → ACTIVE → SUSPENDED → DEACTIVATED（不可逆）
 */
public enum UserStatus {

    /** 待邮箱验证状态，注册成功但尚未验证邮箱 */
    PENDING_VERIFY("待验证"),

    /** 正常活跃状态，可正常使用所有功能 */
    ACTIVE("活跃"),

    /** 已暂停状态，因违规或管理员操作被临时禁用 */
    SUSPENDED("已暂停"),

    /** 已注销状态，用户主动注销或系统清理（不可逆） */
    DEACTIVATED("已注销");

    /** 展示名称，用于前端显示和日志记录 */
    private final String displayName;

    UserStatus(String displayName) {
        this.displayName = displayName;
    }

    /**
     * 获取状态的展示名称。
     *
     * @return 展示名称，不可为null
     */
    public String getDisplayName() {
        return displayName;
    }

    /**
     * 判断当前状态是否允许执行登录操作。
     *
     * <h4>实现思路</h4>
     * <p>只有ACTIVE状态允许登录，其他状态均拒绝。
     *
     * @return true表示允许登录
     */
    public boolean isLoginAllowed() {
        // TODO: Step 1 - 返回 this == ACTIVE
        return false; // TODO: implement
    }
}
```

---

## TODO注释规范 {#todo}

### 正确的TODO格式（分步骤、精确）

```java
public Order createOrder(UserId userId, List<CartItem> items) {
    // TODO: Step 1 - 参数校验
    //   - 校验userId不为null
    //   - 校验items不为null且不为空列表
    //   - 遍历items，校验每个CartItem的productId和quantity(>0)有效

    // TODO: Step 2 - 库存检查（防止超卖）
    //   - 调用inventoryService.checkBatchAvailability(items)
    //   - 若任一商品库存不足，收集所有不足商品，抛出InsufficientStockException(insufficientItems)
    //   - 注意：这里需要批量检查而非逐个检查，避免N+1问题

    // TODO: Step 3 - 计算订单金额
    //   - 调用pricingService.calculateOrderPrice(items)获取每项价格
    //   - 汇总计算totalAmount，使用BigDecimal避免浮点精度问题
    //   - 检查是否有可用优惠券（调用couponService.getAvailableCoupons(userId)）

    // TODO: Step 4 - 构建Order领域对象
    //   - new Order(orderId=OrderIdGenerator.next(), userId, items, totalAmount)
    //   - 设置status=PENDING_PAYMENT, createTime=now()

    // TODO: Step 5 - 持久化订单
    //   - orderRepository.save(order)
    //   - 同时通过inventoryService.reserveStock(items)预扣库存

    // TODO: Step 6 - 发布领域事件
    //   - eventBus.publish(new OrderCreatedEvent(order))

    return null; // TODO: implement
}
```

### 常见注解使用 {#annotations}

```java
// Spring注解
@Service           // 服务层Bean
@Repository        // 数据访问层Bean
@Component         // 通用Bean
@Controller / @RestController  // 控制器
@Transactional     // 事务管理（写操作）
@Transactional(readOnly = true)  // 只读事务（查询优化）

// 校验注解（javax.validation / jakarta.validation）
@NotNull           // 不可为null
@NotBlank          // 字符串不可为null且trim后不为空
@Size(min=2, max=50)  // 字符串长度范围
@Email             // 邮箱格式
@Min(0) @Max(100)  // 数值范围
@Valid             // 触发嵌套对象校验

// Lombok注解（若项目使用）
@Data              // getter+setter+toString+equals+hashCode
@Builder           // 构建者模式
@RequiredArgsConstructor  // final字段的构造函数
@Slf4j             // 注入log字段

// JPA注解
@Entity @Table(name="users")
@Id @GeneratedValue(strategy = GenerationType.IDENTITY)
@Column(name="email", unique=true, nullable=false)
@OneToMany(mappedBy="userId", cascade=CascadeType.ALL)
```
