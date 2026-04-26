# Python 业务日志参考

> 本文件是语言特定补充，**SKILL.md 中的十条核心原则优先**。本文件**不推荐新框架**——你的第一件事永远是从项目里找到既有 logger。Python 绝大多数项目都用标准库 `logging`（直接或通过封装），少数用 `structlog` / `loguru`。

---

## 1. 如何定位项目已有的 logger

### 1.1 生产代码里的获取方式

```python
import logging
logger = logging.getLogger(__name__)         # 最常见
log = logging.getLogger("app.order")         # 显式名字

# 项目自建
from app.logging import get_logger
logger = get_logger(__name__)

# structlog 风格
import structlog
logger = structlog.get_logger()

# loguru 风格
from loguru import logger
```

### 1.2 检索正则

```
logging\.getLogger\(|get_logger\(|structlog\.get_logger|from\s+loguru\s+import|import\s+loguru
```

### 1.3 配置位置

- `logging.yaml` / `logging.ini` / `logging.conf`
- Django：`settings.py` 里的 `LOGGING = {...}` dict
- Flask / FastAPI：`app.logger` 或自己 `dictConfig`
- `log_config` / `logging_setup.py` / `logger.py`

关键看**已有 handler/formatter**：是普通 text 还是 `pythonjsonlogger` / 自制 JSON formatter。这决定你是用 `extra=` 还是其他方式传结构化字段。

### 1.4 识别旁路

```
\bprint\(|sys\.stdout\.write|sys\.stderr\.write|traceback\.print_exc\(\)
```

业务代码里出现即 **P0 待改**（测试脚本、调试脚本除外）。

---

## 2. 良好 / 不良示例对照

### 2.1 参数化（**千万不要用 f-string**）

```python
# BAD：f-string / % / format 都是预先构造字符串
logger.debug(f"processing order {order} for user {user}")
logger.debug("processing order %s" % order)
logger.debug("processing order {}".format(order))

# GOOD：把参数交给 logging，等级过滤掉时不会构造
logger.debug("Processing order order_id=%s user_id=%s", order.id, user.id)
```

注意：Python `logging` 的占位符是 `%s` / `%d`（C printf 风格），不是 `{}`。

**例外**：若项目已统一使用 `structlog` / `loguru`，按框架规范走；他们对惰性求值有各自处理。

### 2.2 异常记录

```python
# BAD：丢栈
try:
    do_work()
except Exception as e:
    logger.error("failed: %s", str(e))

# BAD：吞异常
try: do_work()
except Exception:
    pass

# GOOD：exc_info=True 或 logger.exception()
try:
    pay(order_id, amount)
except PaymentError as e:
    logger.error("Failed to pay order_id=%s amount=%s", order_id, amount, exc_info=True)
    raise ServiceError("pay failed") from e
# 等价写法：
    logger.exception("Failed to pay order_id=%s amount=%s", order_id, amount)  # 自带 exc_info
```

`from e` 保留 cause chain，traceback 里会出现 "The above exception was the direct cause of the following exception"。

### 2.3 结构化字段（`extra=` 传入）

前提：logger 的 formatter 支持读取 record 的 extra 字段（JSON formatter 普遍支持；普通 text formatter 要在 format 字符串里列出字段名）。

```python
# GOOD：extra 把结构化字段放进 LogRecord
logger.info(
    "Order created",
    extra={"order_id": order.id, "user_id": order.user_id, "amount": order.amount},
)

# structlog
logger.info("order_created", order_id=order.id, user_id=order.user_id, amount=order.amount)

# loguru
logger.bind(order_id=order.id, user_id=order.user_id).info("Order created")
```

**常见坑**：`extra` 里的 key 若与 LogRecord 内置字段重名（`name` / `msg` / `args` / `message` / `levelname` / `asctime` / `filename` ...）会 `KeyError`。常见冲突项：`name` `message` `module`。**换名**即可（`svc_name` 代替 `name`）。

### 2.4 上下文传播（trace_id / user_id）

Python 没有 MDC 但有等价物：

```python
# 方式 1：ContextVar + Filter（推荐，支持 asyncio）
import contextvars
_trace_id = contextvars.ContextVar("trace_id", default="-")

class TraceFilter(logging.Filter):
    def filter(self, record):
        record.trace_id = _trace_id.get()
        return True

# formatter 里放入 %(trace_id)s
# 入口处 _trace_id.set(req.headers.get("X-Trace-Id"))，业务代码无需再传

# 方式 2：structlog bind / contextvars 原生集成
structlog.contextvars.bind_contextvars(trace_id=trace_id, user_id=user_id)

# 方式 3：LoggerAdapter 显式包一层
adapter = logging.LoggerAdapter(logger, {"trace_id": trace_id})
adapter.info("Order created order_id=%s", order_id)
```

异步任务（`asyncio.create_task` / `run_in_executor`）：`ContextVar` 在 `asyncio.Task` 复制时会自动传递；线程池则不会，需要显式 set。

### 2.5 敏感数据脱敏

```python
# BAD
logger.info("login email=%s password=%s", email, password)

# GOOD：用项目内 masker / redactor
from app.security.mask import mask_email, mask_phone, hash_token
logger.info("User login succeeded user_id=%s email_masked=%s", user_id, mask_email(email))

# GOOD：局部实现（项目无工具时）
def mask_email(s: str) -> str:
    if not s or "@" not in s: return "***"
    name, domain = s.split("@", 1)
    return (name[:2] + "***") if name else "***" + "@" + domain

# 对 dataclass / Pydantic model：__repr__ / model_config 要排除敏感字段
class User(BaseModel):
    id: int
    email: str
    password_hash: str = Field(repr=False)  # 不进 repr，也就不会进日志
```

**坑**：`logger.info("%s", some_dict)` 会调用 `__str__`，若 dict 含敏感值会整个打出来。打印前过滤。

### 2.6 日志注入防护

```python
import re
_CRLF = re.compile(r"[\r\n\t]")
def safe_for_log(s):
    return _CRLF.sub("_", s) if s else s

logger.info("HTTP request path=%s", safe_for_log(request.path))

# 若用 JSON formatter，field 值会被自动转义，风险更低——优先走 extra=
```

### 2.7 循环 / 热点节流

```python
# BAD
for msg in batch:
    process(msg)
    logger.info("processed id=%s", msg.id)

# GOOD
ok, fail = 0, 0
for msg in batch:
    try:
        process(msg); ok += 1
    except Exception:
        fail += 1
        logger.warning("Failed to process message id=%s", msg.id, exc_info=True)
logger.info("Batch processed total=%s ok=%s fail=%s duration_ms=%s",
            len(batch), ok, fail, duration_ms)
```

### 2.8 级别选择示例

```python
logger.debug("Cache miss key=%s", key)                                   # 开发诊断
logger.info("Order created order_id=%s user_id=%s", oid, uid)            # 业务事件
logger.warning("Retrying remote call attempt=%s cause=%s", n, reason)    # 异常可恢复
logger.error("Failed to publish event topic=%s order_id=%s",
             topic, oid, exc_info=True)                                  # 需关注失败
logger.critical("Config missing key=%s", k)                              # 无法继续
```

### 2.9 Django / FastAPI 特定

```python
# Django：settings.LOGGING 已经配好，直接 getLogger(__name__)
# 请求上下文通常通过 middleware 写进 ContextVar 或 django-log-request-id 扩展

# FastAPI：用 starlette middleware 抽取 X-Request-ID，存到 ContextVar
@app.middleware("http")
async def trace_mw(request: Request, call_next):
    trace_id = request.headers.get("x-trace-id") or str(uuid.uuid4())
    token = _trace_id.set(trace_id)
    try:
        return await call_next(request)
    finally:
        _trace_id.reset(token)
```

---

## 3. 常见反模式速查

| 反模式 | 问题 | 改法 |
|--------|------|------|
| `print(...)` 代替 logger | 无级别、stdout 采集不一致 | `logger.info(...)` |
| `logger.error(f"...{e}...")` | 丢栈、即时求值 | `logger.exception(...)` 或 `exc_info=True` |
| `except: pass` | 吞异常 | 至少 `logger.exception(...)` 或重抛 |
| `logger.info(dict)` 含敏感字段 | PII 泄漏 | 过滤后再打 |
| `extra={"name": ...}` | 与 LogRecord 字段冲突 | 换名（`svc_name`） |
| `traceback.print_exc()` | 写到 stderr，与采集脱离 | `logger.exception(...)` |
| `logger.setLevel` 在业务代码里随意改 | 影响全局 | 配置集中在启动处 |
| 循环里 per-iteration info | 日志风暴 | 汇总 + 失败独打 |
| 复用全局 `logging.basicConfig()` 多次 | 行为不一致 | 仅启动处一次 |
| 把 secret/token 存进 `LoggerAdapter.extra` | 所有日志带密钥 | 只注入非敏感 ID |

---

## 4. 检视要点清单（Python 专属）

- [ ] 是否有 `print()` / `sys.stdout.write` / `traceback.print_exc()` 绕开 logger
- [ ] 所有 except 块是否都有 `logger.exception` 或 `exc_info=True`（或显式 raise）
- [ ] f-string / `%` 拼接传入 `logger.debug` / `logger.info` 的情况是否被改为参数化
- [ ] `extra=` 的 key 是否与 `LogRecord` 内置字段冲突
- [ ] `__repr__` / `Pydantic model_config` / dataclass `repr=False` 是否覆盖了敏感字段
- [ ] `ContextVar` 在 `ThreadPoolExecutor` 场景下是否显式传递
- [ ] 单次启动是否多次 `basicConfig` 或重复 addHandler，导致重复行
- [ ] `logger.setLevel` 是否只在初始化处出现
- [ ] 生产是否禁用了 `DEBUG` 级别默认写盘（性能）
- [ ] 循环 / 高并发热点是否存在未节流 INFO
