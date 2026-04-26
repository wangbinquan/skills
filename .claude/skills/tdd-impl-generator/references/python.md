# Python 实现规范参考

## 1. 方法级注释格式（Google Docstring 实现版）

```python
def create_user(self, name: str, email: str, raw_password: str) -> UserId:
    """Create a new user account and send a welcome email.

    实现策略:
        采用"先检查后执行"模式进行邮箱唯一性校验，在数据库写入前
        抛出友好业务异常，而非等待 IntegrityError（那样错误信息不可控）。
        密码哈希在事务内完成，raw_password 不离开本方法作用域。

    业务规则落地:
        C-001 邮箱唯一性: 调用 user_repo.exists_by_email() 前置检查（FR-003）
        C-002 密码哈希: bcrypt rounds=12，来自配置项 SEC_BCRYPT_ROUNDS（SEC-001）
        C-003 欢迎邮件: 通过 asyncio.create_task() fire-and-forget，
              失败只记录 warning，不回滚注册事务（设计文档 4.2.3）

    异常处理策略:
        EmailAlreadyExistsError: 邮箱已注册，转 HTTP 409
        ValidationError: 参数格式不合规，转 HTTP 422
        RepositoryError: 数据库写入失败，转 HTTP 500

    Args:
        name: 用户名，长度 [2, 50]，不能为空
        email: 邮箱地址，RFC 5322 格式，全局唯一（不区分大小写）
        raw_password: 明文密码，≥8位含大小写字母和数字，不会被持久化

    Returns:
        新建用户的唯一 ID，UserId 类型

    Raises:
        EmailAlreadyExistsError: 邮箱已注册
        ValidationError: 参数格式校验失败
    """
```

## 2. 内联注释惯用法

### 2.1 解释业务决策
```python
# 邮箱统一转小写：唯一性校验不区分大小写（FR-003 明确要求 case-insensitive）
normalized_email = email.lower()

# 使用 bcrypt 而非 hashlib.sha256：bcrypt 自带 salt 和 cost factor，
# 更抗 GPU 暴力破解（SEC-001 安全需求，rounds 从环境变量读取而非硬编码）
hashed = bcrypt.hashpw(raw_password.encode(), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS))
```

### 2.2 解释异常链
```python
try:
    user = self._user_repo.save(user_entity)
except IntegrityError as exc:
    # 并发场景：exists_by_email 检查后仍可能发生唯一索引冲突
    # 转换为业务异常，保留原始异常链便于调试
    raise EmailAlreadyExistsError(normalized_email) from exc
```

### 2.3 解释上下文管理器
```python
# 使用 @contextmanager 包装事务，确保提交或回滚在 with 块结束时自动执行，
# 而非依赖手动 try/finally（遗漏 rollback 风险高，设计文档 4.3 事务规范）
with self._unit_of_work:
    user = User.register(name, normalized_email, hashed_password)
    user_id = self._user_repo.save(user).id
```

## 3. 类型标注规范

```python
from __future__ import annotations  # 允许前向引用类型，兼容 Python 3.9
from typing import Optional, List
from collections.abc import Sequence  # 优先用 abc，而非 typing（3.9+ 推荐）

# Optional[T] 明确表达"可能为 None"，而非隐式返回 None
def get_user_by_id(self, user_id: UserId) -> Optional[UserDTO]:
    ...

# Sequence[T] 比 List[T] 更通用，允许调用方传 tuple/list（协变友好）
def get_users_by_ids(self, ids: Sequence[UserId]) -> List[UserDTO]:
    ...
```

## 4. 异常设计

```python
# 业务异常继承自 DomainError（应用层基类），携带 error_code 便于 API 层统一处理
class EmailAlreadyExistsError(DomainError):
    """用户尝试注册已存在的邮箱地址时抛出。"""

    error_code = "EMAIL_ALREADY_EXISTS"  # 对应 HTTP 409

    def __init__(self, email: str) -> None:
        # 错误消息不包含密码等敏感信息，邮箱脱敏处理（显示前缀+域名）
        masked = f"{email[:2]}***@{email.split('@')[1]}"
        super().__init__(f"Email already registered: {masked}")
        self.email = email  # 原始值保留在属性中，供日志记录
```

## 5. 异步处理

```python
import asyncio
import logging

logger = logging.getLogger(__name__)

async def _send_welcome_email_fire_and_forget(
    self, email: str, name: str
) -> None:
    """Fire-and-forget 包装器：发送失败只记录警告，不传播异常。

    设计理由: 欢迎邮件是非关键路径，邮件服务故障不应阻断用户注册（设计文档 4.2.3）。
    """
    try:
        await self._email_service.send_welcome_email(email, name)
    except Exception as exc:  # noqa: BLE001 — intentional broad catch for fire-and-forget
        # 记录足够的上下文便于排查，但不重新抛出
        logger.warning(
            "Welcome email failed (non-critical). email=%s error=%s",
            email, type(exc).__name__,
            exc_info=True,  # 包含完整 traceback
        )

# 在主方法中调用
asyncio.create_task(
    self._send_welcome_email_fire_and_forget(normalized_email, name)
)
```

## 6. 日志规范

```python
import logging

logger = logging.getLogger(__name__)  # 模块级 logger，不使用根 logger

# INFO: 业务里程碑
logger.info("User registered: user_id=%s", user_id)

# WARNING: 可恢复的非预期情况
logger.warning("Welcome email failed for user_id=%s: %s", user_id, exc)

# ERROR: 需要人工介入的故障
logger.error("Database write failed for email=%s", email, exc_info=True)

# 禁止打印敏感信息
logger.debug("Processing registration: email=%s", email)  # ✅
logger.debug("Password: %s", raw_password)                # ❌ 禁止
```

## 7. 数据类（dataclass / Pydantic）

```python
from dataclasses import dataclass, field
from datetime import datetime

@dataclass(frozen=True)  # frozen=True：值对象不可变（设计文档中 UserId 为值对象）
class UserId:
    value: str

    def __post_init__(self) -> None:
        # 在对象构造时校验不变量，保证 UserId 对象永远合法
        if not self.value or len(self.value) != 36:
            raise ValueError(f"Invalid UserId format: {self.value!r}")

@dataclass
class User:
    id: UserId
    name: str
    email: str
    password_hash: str
    status: UserStatus = UserStatus.ACTIVE
    created_at: datetime = field(default_factory=datetime.utcnow)

    @classmethod
    def register(cls, name: str, email: str, password_hash: str) -> "User":
        """工厂方法：封装注册不变量（唯一性检查已在 Service 层完成）。"""
        return cls(
            id=UserId(str(uuid.uuid4())),
            name=name,
            email=email,
            password_hash=password_hash,
        )
```

## 8. 上下文管理器（资源管理）

```python
from contextlib import contextmanager
from typing import Generator

@contextmanager
def transaction(self) -> Generator[None, None, None]:
    """数据库事务上下文管理器。

    确保提交或回滚在 with 块退出时自动执行，
    避免手动 try/finally 遗漏 rollback（常见缺陷）。
    """
    try:
        yield
        self._session.commit()
        logger.debug("Transaction committed")
    except Exception:
        self._session.rollback()
        logger.warning("Transaction rolled back", exc_info=True)
        raise  # 重新抛出，不吞掉异常
    finally:
        self._session.close()
```
