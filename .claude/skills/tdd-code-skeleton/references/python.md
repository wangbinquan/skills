# Python 代码骨架参考规范

## 目录
1. [Docstring注释规范（Google风格）](#docstring)
2. [类骨架模板](#class-template)
3. [抽象类/Protocol模板](#abstract-template)
4. [Dataclass模板](#dataclass-template)
5. [TODO注释规范](#todo)
6. [类型标注约定](#type-hints)

---

## Docstring注释规范（Google风格） {#docstring}

Python项目优先使用Google风格Docstring（比NumPy风格更简洁，比reStructuredText更易读）。

### 类级Docstring（必须包含以下所有字段）

```python
class UserService:
    """用户服务类，负责用户注册、查询、更新等核心业务操作。

    作为应用层服务，UserService协调领域对象（User）与基础设施层
    （UserRepository、EmailService）之间的交互。

    设计思路:
        采用依赖注入（DI）模式，通过构造函数接受依赖，使所有外部依赖
        可在单测中被Mock替换。遵循单一职责原则，本类只处理业务编排，
        不直接操作数据库或发送邮件。

    实现思路:
        核心流程为：入参校验 → 业务规则检查 → 持久化 → 事件通知。
        使用contextlib.contextmanager管理事务边界；
        异步通知操作使用asyncio或线程池以避免阻塞主流程。

    Attributes:
        _user_repository: 用户数据访问对象，提供CRUD操作。
        _email_service: 邮件服务，用于发送系统通知邮件。

    线程安全性:
        非线程安全。若需并发使用，调用方应为每个请求创建新实例，
        或通过锁保护共享状态。

    设计约束:
        - 邮箱在系统中全局唯一（来自设计文档第3.2节）
        - 密码使用bcrypt哈希，强度因子不低于12（来自安全需求）

    Example:
        >>> repo = InMemoryUserRepository()
        >>> email_svc = FakeEmailService()
        >>> service = UserService(repo, email_svc)
        >>> user_id = service.create_user("Alice", "alice@example.com", "Pass123!")
    """
```

### 方法级Docstring（必须包含以下所有字段）

```python
    def create_user(self, name: str, email: str, password: str) -> UserId:
        """注册新用户，校验唯一性并发送欢迎邮件。

        实现思路:
            采用"先检查后执行"模式：写入前先验证邮箱唯一性，
            给出明确的业务错误信息。密码使用bcrypt不可逆哈希存储。
            邮件发送异步执行，避免阻塞注册响应。

        实现步骤:
            1. 入参校验：验证name非空(2-50字符)、email合法格式、
               password强度（>=8位含大小写字母和数字）
            2. 唯一性检查：通过_user_repository.exists_by_email(email)
               查询邮箱是否已被注册
            3. 密码哈希：使用bcrypt.hashpw(password, bcrypt.gensalt(12))
            4. 构建User实体：填充name、email、password_hash、created_at
            5. 持久化：调用_user_repository.save(user)
            6. 异步发送欢迎邮件：通过线程池调用_email_service.send_welcome_email
            7. 返回新用户ID

        Args:
            name: 用户名，不可为None，长度2-50字符。
            email: 用户邮箱，不可为None，必须是合法邮箱格式，全局唯一。
            password: 明文密码，不可为None，至少8位含大小写字母和数字。

        Returns:
            新创建用户的UserId对象，非None。

        Raises:
            ValueError: 当name/email/password不合法时。
            EmailAlreadyExistsError: 当邮箱已被注册时。

        Note:
            此方法非线程安全。并发调用时可能出现"检查-写入"竞态，
            需要在数据库层通过唯一索引兜底。
        """
```

---

## 类骨架模板 {#class-template}

```python
# user_service.py
from __future__ import annotations

from typing import Optional
# TODO: 根据实现步骤确定具体需要的import

from .interfaces import IUserService
from .repositories import UserRepository
from .services import EmailService
from .models import User, UserId, UserDTO
from .exceptions import EmailAlreadyExistsError


class UserService(IUserService):
    """用户服务类，负责用户注册、查询、更新等核心业务操作。

    [完整类级Docstring见上方规范]
    """

    def __init__(
        self,
        user_repository: UserRepository,
        email_service: EmailService,
    ) -> None:
        """初始化用户服务，注入必要依赖。

        实现思路:
            使用构造函数注入（而非全局单例），确保依赖可在测试中被替换。
            对入参进行防御性校验，尽早发现配置错误。

        实现步骤:
            1. 校验user_repository和email_service均不为None
            2. 将参数赋值给私有属性（前缀_表示非公开）

        Args:
            user_repository: 用户数据访问对象，不可为None。
            email_service: 邮件服务，不可为None。

        Raises:
            TypeError: 当任一参数为None时。
        """
        # TODO: Step 1 - 参数非空校验
        #   - if user_repository is None: raise TypeError("user_repository must not be None")
        #   - if email_service is None: raise TypeError("email_service must not be None")

        # TODO: Step 2 - 赋值给私有属性
        #   - self._user_repository = user_repository
        #   - self._email_service = email_service
        self._user_repository = user_repository
        self._email_service = email_service

    def create_user(self, name: str, email: str, password: str) -> UserId:
        """注册新用户，校验唯一性并发送欢迎邮件。

        [完整方法级Docstring见上方规范]
        """
        # TODO: Step 1 - 入参校验
        #   - 校验name非None且strip后长度在[2,50]，否则raise ValueError(f"Invalid name: {name!r}")
        #   - 校验email非None且符合邮箱格式（re.match或email-validator库）
        #   - 校验password非None且长度>=8且含大小写字母和数字

        # TODO: Step 2 - 邮箱唯一性检查
        #   - if self._user_repository.exists_by_email(email):
        #       raise EmailAlreadyExistsError(f"Email already registered: {email}")

        # TODO: Step 3 - 密码哈希
        #   - import bcrypt
        #   - password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()

        # TODO: Step 4 - 构建User实体
        #   - from datetime import datetime, timezone
        #   - user = User(name=name, email=email, password_hash=password_hash,
        #                 created_at=datetime.now(timezone.utc), status=UserStatus.ACTIVE)

        # TODO: Step 5 - 持久化
        #   - saved_user = self._user_repository.save(user)

        # TODO: Step 6 - 异步发送欢迎邮件
        #   - import concurrent.futures
        #   - executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        #   - executor.submit(self._email_service.send_welcome_email, saved_user)
        #   - 注意：不阻塞主流程，异常需要单独记录日志

        # TODO: Step 7 - 返回用户ID
        #   - return saved_user.id
        raise NotImplementedError("TODO: implement create_user")  # TODO: implement

    def get_user_by_id(self, user_id: UserId) -> Optional[UserDTO]:
        """根据ID查询用户信息。

        实现思路:
            简单的查询委托，加入防御性校验后转发给Repository。
            使用Optional[UserDTO]而非抛出异常，让调用方自行决定"找不到"的处理方式。

        实现步骤:
            1. 校验user_id不为None且有效
            2. 调用_user_repository.find_by_id(user_id)
            3. 若找到则转换为UserDTO，否则返回None

        Args:
            user_id: 用户ID，不可为None。

        Returns:
            UserDTO（若用户存在），否则None。

        Raises:
            ValueError: 当user_id为None或格式不合法时。
        """
        # TODO: Step 1 - 参数校验
        #   - if user_id is None: raise ValueError("user_id must not be None")

        # TODO: Step 2 - 查询Repository
        #   - user = self._user_repository.find_by_id(user_id)

        # TODO: Step 3 - 转换并返回
        #   - if user is None: return None
        #   - return UserDTO.from_user(user)
        raise NotImplementedError("TODO: implement get_user_by_id")  # TODO: implement
```

---

## 抽象类/Protocol模板 {#abstract-template}

### 使用ABC定义接口

```python
# interfaces.py
from abc import ABC, abstractmethod
from typing import Optional


class IUserService(ABC):
    """用户服务接口，定义用户管理相关操作的契约。

    设计思路:
        使用ABC（Abstract Base Class）定义接口，强制实现类提供所有方法。
        通过接口隔离具体实现，便于单测中使用Mock或Fake替代。
    """

    @abstractmethod
    def create_user(self, name: str, email: str, password: str) -> "UserId":
        """注册新用户。[完整Docstring同具体类]"""

    @abstractmethod
    def get_user_by_id(self, user_id: "UserId") -> Optional["UserDTO"]:
        """根据ID查询用户。[完整Docstring同具体类]"""
```

### 使用Protocol定义结构化接口（Python 3.8+）

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class UserRepositoryProtocol(Protocol):
    """用户Repository协议，定义数据访问层的结构化接口。

    设计思路:
        使用Protocol实现"鸭子类型"接口：无需显式继承，
        只要实现了相同签名的方法，即视为满足此协议。
        适合为第三方库或遗留代码定义接口而无需修改源码。
    """

    def find_by_id(self, user_id: "UserId") -> Optional["User"]: ...
    def save(self, user: "User") -> "User": ...
    def exists_by_email(self, email: str) -> bool: ...
```

---

## Dataclass模板 {#dataclass-template}

```python
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum, auto
from typing import Optional
import uuid


class UserStatus(Enum):
    """用户账户状态枚举。

    状态流转: PENDING_VERIFY → ACTIVE → SUSPENDED → DEACTIVATED（不可逆）
    """
    PENDING_VERIFY = auto()  # 待邮箱验证
    ACTIVE = auto()          # 正常活跃
    SUSPENDED = auto()       # 已暂停
    DEACTIVATED = auto()     # 已注销（不可逆）

    def is_login_allowed(self) -> bool:
        """判断当前状态是否允许登录。

        实现思路:
            只有ACTIVE状态允许登录，其他状态均拒绝。

        Returns:
            True表示允许登录，False表示拒绝。
        """
        # TODO: Step 1 - 返回 self == UserStatus.ACTIVE
        raise NotImplementedError("TODO: implement")  # TODO: implement


@dataclass
class UserId:
    """用户ID值对象，封装UUID以提供类型安全。

    设计思路:
        使用值对象（Value Object）而非裸字符串，
        防止将OrderId误传给需要UserId的方法。
        frozen=True确保不可变性。
    """
    value: str = field(default_factory=lambda: str(uuid.uuid4()))

    def __post_init__(self) -> None:
        """校验UUID格式。

        实现步骤:
            1. 校验value为有效的UUID格式（使用uuid.UUID(self.value)尝试解析）
            2. 若格式不合法，抛出ValueError

        Raises:
            ValueError: 当value不是合法UUID格式时。
        """
        # TODO: Step 1 - 校验UUID格式
        #   - try: uuid.UUID(self.value)
        #   - except ValueError: raise ValueError(f"Invalid UUID: {self.value!r}")
        pass  # TODO: implement


@dataclass
class User:
    """用户领域实体，包含用户的核心属性。

    设计思路:
        使用dataclass简化样板代码，同时保留领域逻辑方法。
        id字段默认生成新UUID，支持从数据库重建时传入已有ID。

    设计约束:
        - email不可修改（来自设计文档：邮箱作为唯一标识不可变更）
    """
    name: str
    email: str
    password_hash: str
    id: UserId = field(default_factory=UserId)
    status: UserStatus = UserStatus.PENDING_VERIFY
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

    def is_active(self) -> bool:
        """判断用户是否处于活跃状态。

        实现步骤:
            1. 返回 self.status == UserStatus.ACTIVE

        Returns:
            True表示用户活跃，可正常使用系统功能。
        """
        # TODO: Step 1 - 返回 self.status == UserStatus.ACTIVE
        raise NotImplementedError("TODO: implement")  # TODO: implement
```

---

## TODO注释规范 {#todo}

```python
def process_payment(self, order_id: OrderId, payment: PaymentInfo) -> PaymentResult:
    # TODO: Step 1 - 加载订单（使用悲观锁防止并发支付）
    #   - order = self._order_repo.find_by_id_for_update(order_id)
    #   - if order is None: raise OrderNotFoundError(f"Order not found: {order_id.value}")
    #   - if order.status != OrderStatus.PENDING_PAYMENT:
    #       raise InvalidOrderStatusError(f"Expected PENDING_PAYMENT, got {order.status}")

    # TODO: Step 2 - 调用支付网关（带重试逻辑）
    #   - 使用tenacity库配置重试：stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8)
    #   - result = self._payment_gateway.charge(payment.amount, payment.token)
    #   - 捕获NetworkError进行重试，捕获PaymentDeclinedError直接失败不重试

    # TODO: Step 3 - 更新订单状态（在同一事务内）
    #   - order.status = OrderStatus.PAID if result.success else OrderStatus.PAYMENT_FAILED
    #   - order.payment_id = result.payment_id
    #   - order.updated_at = datetime.now(timezone.utc)
    #   - self._order_repo.save(order)

    # TODO: Step 4 - 发布领域事件
    #   - if result.success:
    #       self._event_bus.publish(OrderPaidEvent(order_id=order_id, payment_id=result.payment_id))
    #   - else:
    #       self._event_bus.publish(OrderPaymentFailedEvent(order_id=order_id, reason=result.error_msg))

    raise NotImplementedError("TODO: implement process_payment")  # TODO: implement
```

---

## 类型标注约定 {#type-hints}

```python
# 基础类型标注
from typing import (
    Optional,       # 可能为None的值：Optional[str] = str | None
    List,           # 列表（Python 3.9+可直接用list[str]）
    Dict,           # 字典（Python 3.9+可直接用dict[str, int]）
    Tuple,          # 元组
    Set,            # 集合
    Union,          # 联合类型：Union[str, int]
    Any,            # 任意类型（尽量避免）
    Callable,       # 可调用对象：Callable[[int, str], bool]
    Iterator,       # 迭代器
    Generator,      # 生成器
    ClassVar,       # 类变量（在dataclass中使用）
    Final,          # 不可变常量
    TypeVar,        # 泛型类型变量
)
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    # 仅用于类型检查的import，避免循环导入
    from .models import User

# Python 3.10+ 新语法
def func(value: str | None) -> int | None: ...  # 替代Optional[str]

# 泛型
T = TypeVar("T")
def first(items: list[T]) -> T | None:
    return items[0] if items else None

# 函数签名完整标注示例
def process(
    data: dict[str, list[int]],
    callback: Callable[[str, int], bool],
    timeout: float = 30.0,
) -> tuple[bool, str | None]:
    ...
```
