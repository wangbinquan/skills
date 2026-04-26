# Java 单元测试参考指南

## 推荐技术栈

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 测试框架 | JUnit 4 | 企业级 Java 测试标准 |
| Mock 框架 | Mockito | 最流行的 Java Mock 库 |
| 静态/构造/Final Mock | PowerMock | 扩展 Mockito，支持 static、final、构造方法 Mock |
| 断言库 | AssertJ | 流式断言，可读性强 |
| 性能测试 | JMH | Java 微基准测试框架 |

## 测试命名规范

```java
// 格式：should_[预期结果]_when_[测试条件]
@Test
public void should_returnNull_when_inputIsEmpty() { }

// 或中文方法名（推荐，直观清晰）
@Test
public void 当输入为空字符串时_应返回默认值() { }
```

## 标准测试结构

```java
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.*;
import org.powermock.api.mockito.PowerMockito;
import org.powermock.core.classloader.annotations.PowerMockIgnore;
import org.powermock.core.classloader.annotations.PrepareForTest;
import org.powermock.modules.junit4.PowerMockRunnerJava21;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 被测类：com.example.service.UserService
 * 测试策略：Mock UserRepository 隔离数据库调用；静态工具类使用 PowerMock
 * 覆盖场景汇总：
 *   - UserServiceTest-TC-01 ~ TC-03  正常场景：用户查询与创建
 *   - UserServiceTest-TC-04 ~ TC-06  异常场景：用户不存在、数据库异常
 *   - UserServiceTest-TC-07 ~ TC-09  边界场景：空值、极值 ID
 * 覆盖率目标：行 ≥ 90% / 分支 ≥ 85%
 * 对应设计文档章节：UT 总体设计 > UserServiceTest
 */
@RunWith(PowerMockRunnerJava21.class)
@PowerMockIgnore({"javax.management.*", "jdk.internal.reflect.*"})
@PrepareForTest({SomeStaticUtil.class})  // 仅当需要 Mock 静态方法时添加；无需 Mock 静态方法则删除此注解
public class UserServiceTest {

    // ===== Mock 对象声明 =====
    @Mock
    private UserRepository userRepository;  // Mock 数据库层，避免真实 DB 调用

    @InjectMocks
    private UserService userService;  // 被测对象，自动注入 Mock

    // ===== 测试数据常量 =====
    private static final Long VALID_USER_ID = 1L;
    private static final String VALID_USERNAME = "张三";

    @Before
    public void setUp() {
        MockitoAnnotations.initMocks(this);
    }

    /**
     * 场景编号：UserServiceTest-TC-01
     * 场景类型：正常
     * 场景描述：通过有效 ID 查询用户成功
     * 前置条件：用户 ID 为 1L 的用户存在于数据库
     * 测试步骤：Mock findById 返回用户对象 → 调用 getUserById → 验证返回值与交互
     * 预期结果：返回对应的用户对象，且用户名正确
     * 关注点/风险：防止 Service 层未透传查询结果或错误地修改了返回对象
     */
    @Test
    public void should_returnUser_when_validIdProvided() {
        // ===== 准备（Arrange）=====
        // 构造预期返回的用户对象
        User expectedUser = new User(VALID_USER_ID, VALID_USERNAME);
        // 配置 Mock：当调用 findById(1L) 时，返回预期用户
        when(userRepository.findById(VALID_USER_ID))
            .thenReturn(Optional.of(expectedUser));

        // ===== 执行（Act）=====
        // 调用被测方法
        User actualUser = userService.getUserById(VALID_USER_ID);

        // ===== 验证（Assert）=====
        // 验证返回结果不为空
        assertThat(actualUser).isNotNull();
        // 验证用户名与预期一致
        assertThat(actualUser.getName()).isEqualTo(VALID_USERNAME);
        // 验证仓库层只被调用一次，防止不必要的多次查询
        verify(userRepository, times(1)).findById(VALID_USER_ID);
    }

    /**
     * 场景编号：UserServiceTest-TC-04
     * 场景类型：异常
     * 场景描述：查询不存在的用户时应抛出业务异常
     * 前置条件：用户 ID 为 999L 的用户不存在
     * 测试步骤：Mock findById 返回 empty → 调用 getUserById → 验证异常类型与消息
     * 预期结果：抛出 UserNotFoundException，且异常信息包含用户 ID
     * 关注点/风险：防止 Service 层吞掉异常或抛出错误类型
     */
    @Test
    public void should_throwException_when_userNotFound() {
        // ===== 准备（Arrange）=====
        Long nonExistentId = 999L;
        // 配置 Mock：用户不存在时返回空
        when(userRepository.findById(nonExistentId))
            .thenReturn(Optional.empty());

        // ===== 执行 & 验证（Act & Assert）=====
        // 验证抛出的异常类型与消息
        assertThatThrownBy(() -> userService.getUserById(nonExistentId))
            .isInstanceOf(UserNotFoundException.class)
            // 验证异常信息包含用户 ID，便于问题定位
            .hasMessageContaining(String.valueOf(nonExistentId));
    }

    /**
     * 场景编号：UserServiceTest-TC-07
     * 场景类型：边界
     * 场景描述：用户 ID 为 0 或负数时应拒绝请求
     * 前置条件：无
     * 测试步骤：直接调用 getUserById(0) → 验证抛出 IllegalArgumentException
     * 预期结果：抛出 IllegalArgumentException，消息说明 ID 必须大于 0
     * 关注点/风险：防止非法 ID 透传到数据库层产生无意义查询
     */
    @Test
    public void should_throwException_when_idIsZero() {
        // ===== 执行 & 验证（Act & Assert）=====
        assertThatThrownBy(() -> userService.getUserById(0L))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("用户ID必须大于0");
    }
}
```

## PowerMock 进阶用法

### Mock 静态方法

```java
@RunWith(PowerMockRunnerJava21.class)
@PowerMockIgnore({"javax.management.*", "jdk.internal.reflect.*"})
@PrepareForTest({DateUtils.class})  // 必须在此声明要 Mock 静态方法的类
public class OrderServiceTest {

    @Before
    public void setUp() {
        // 开启静态方法 Mock
        PowerMockito.mockStatic(DateUtils.class);
    }

    @Test
    public void should_useCurrentDate_when_orderCreated() {
        // ===== 准备（Arrange）=====
        // Mock 静态方法返回固定时间，使测试结果确定
        when(DateUtils.now()).thenReturn(LocalDate.of(2024, 1, 1));

        // ===== 执行（Act）=====
        Order order = orderService.createOrder(item);

        // ===== 验证（Assert）=====
        assertThat(order.getCreatedDate()).isEqualTo(LocalDate.of(2024, 1, 1));
        // 验证静态方法被调用
        PowerMockito.verifyStatic(DateUtils.class, times(1));
        DateUtils.now();
    }
}
```

### Mock 构造方法

```java
@RunWith(PowerMockRunnerJava21.class)
@PowerMockIgnore({"javax.management.*", "jdk.internal.reflect.*"})
@PrepareForTest({PaymentGateway.class})
public class PaymentServiceTest {

    @Test
    public void should_mockConstructor_when_gatewayCreated() throws Exception {
        // ===== 准备（Arrange）=====
        PaymentGateway mockGateway = mock(PaymentGateway.class);
        // 当 new PaymentGateway(any()) 时，返回 mockGateway
        PowerMockito.whenNew(PaymentGateway.class)
            .withAnyArguments()
            .thenReturn(mockGateway);
        when(mockGateway.charge(any())).thenReturn(true);

        // ===== 执行（Act）=====
        boolean result = paymentService.pay(order);

        // ===== 验证（Assert）=====
        assertThat(result).isTrue();
    }
}
```

### Mock final 类 / final 方法

```java
@RunWith(PowerMockRunnerJava21.class)
@PowerMockIgnore({"javax.management.*", "jdk.internal.reflect.*"})
@PrepareForTest({FinalService.class})
public class SomeServiceTest {

    @Test
    public void should_mockFinalMethod_when_called() {
        // ===== 准备（Arrange）=====
        FinalService mockFinal = PowerMockito.mock(FinalService.class);
        when(mockFinal.finalMethod()).thenReturn("mocked");

        // ===== 执行（Act）=====
        String result = someService.callFinal(mockFinal);

        // ===== 验证（Assert）=====
        assertThat(result).isEqualTo("mocked");
    }
}
```

## Mockito 常用 API

```java
// 1. 验证方法调用次数
verify(userRepository, times(1)).save(any(User.class));
verify(userRepository, never()).delete(any());

// 2. 参数捕获器：验证传入参数的内容
ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
verify(userRepository).save(userCaptor.capture());
assertThat(userCaptor.getValue().getName()).isEqualTo("张三");

// 3. Mock void 方法抛出异常
doThrow(new RuntimeException("保存失败"))
    .when(userRepository).save(any(User.class));

// 4. 连续调用返回不同值（模拟重试场景）
when(userRepository.findById(1L))
    .thenReturn(Optional.empty())   // 第一次调用返回空
    .thenReturn(Optional.of(user)); // 第二次调用返回用户

// 5. Mock void 方法执行自定义逻辑
doAnswer(invocation -> {
    User u = invocation.getArgument(0);
    u.setId(100L);  // 模拟数据库自增 ID 回写
    return null;
}).when(userRepository).save(any(User.class));
```

## 常用断言速查

```java
// 基本断言
assertThat(result).isNotNull();
assertThat(result).isEqualTo(expected);
assertThat(result).isTrue();

// 集合断言
assertThat(list).hasSize(3);
assertThat(list).contains("元素A", "元素B");
assertThat(list).isEmpty();
assertThat(list).allMatch(item -> item.isActive());

// 字符串断言
assertThat(str).startsWith("前缀");
assertThat(str).contains("包含内容");
assertThat(str).matches("\\d{11}");  // 正则匹配

// 异常断言
assertThatThrownBy(() -> target.method())
    .isInstanceOf(IllegalArgumentException.class)
    .hasMessage("具体错误信息");
```

## 注解使用说明

| 注解 | 用途 |
|------|------|
| `@RunWith(PowerMockRunnerJava21.class)` | **必须**：替代默认 Runner，使 PowerMock 与 JDK 21 兼容 |
| `@PowerMockIgnore({"javax.management.*", "jdk.internal.reflect.*"})` | **必须**：忽略 JDK 21 内部反射类，防止类加载冲突 |
| `@PrepareForTest({Foo.class})` | 仅当需要 Mock 静态方法、构造方法、final 类/方法时添加 |
| `@Mock` | 声明普通 Mock 对象 |
| `@InjectMocks` | 声明被测对象，Mockito 自动注入 `@Mock` 字段 |
| `@Before` | 每个测试方法执行前运行（等价于 JUnit 5 的 `@BeforeEach`）|
| `@BeforeClass` | 整个测试类只运行一次的初始化（方法须为 `static`）|
| `@After` | 每个测试方法执行后运行（清理资源）|
| `@Test(expected = Foo.class)` | JUnit 4 风格的异常断言，推荐改用 `assertThatThrownBy` 更精确 |
| `@Test(timeout = 1000)` | JUnit 4 超时断言，单位毫秒 |
