# Python 专属盲点

---

## 维度 1 · null_safety（None / 未初始化）

```python
# BAD — dict.get 返回 None 后链式
name = users.get(uid).name  # AttributeError if uid not in users

# GOOD
u = users.get(uid)
if u is None:
    raise UserNotFound(uid)
name = u.name
```

- `dict[k]` 与 `dict.get(k)` 行为不同（前者抛 KeyError，后者返回 None）
- `os.environ.get('X')` 没有默认 → 后续若拼接路径会得 `'None/data'`
- 未赋值的局部变量在条件分支后引用 → `UnboundLocalError`
- 类属性 vs 实例属性混淆（`self.x = 1` 之前读 `self.x` 走类属性）

---

## 维度 2 · resource_leak

```python
# BAD
f = open('a.txt')
data = f.read()
# 异常路径不关

# GOOD
with open('a.txt') as f:
    data = f.read()
```

- `requests.get(stream=True)` 不调用 `r.close()` 或不进 with → 连接泄漏
- 自建 connection pool / DB session 无 close
- `threading.Thread` 启动但不 `join` 也不设 daemon
- `multiprocessing.Pool` 不 close + join → 子进程僵尸
- `tempfile.mkstemp` 返回 fd 必须 `os.close`
- asyncio task 创建后未取消 / 未 await → 取消信号丢失

---

## 维度 3 · concurrency

### GIL 误区

GIL 保证**单字节码**原子；复合操作（`x += 1`）非原子。多线程对共享 dict / list 的复合操作仍需锁。

```python
# BAD
counter += 1  # not atomic across threads
```

### asyncio 高频陷阱

- `asyncio.gather(*tasks)` 默认 `return_exceptions=False` → 一个任务失败取消其他但已开始的不会回滚
- 同步 IO（`requests.get`、`time.sleep`）在 async 函数中 → 阻塞整个事件循环；用 `httpx.AsyncClient` / `await asyncio.sleep`
- `loop.run_until_complete` 在已运行的 loop 内调 → RuntimeError
- 创建 task 不持引用 → GC 回收 → "Task was destroyed but it is pending"

### multiprocessing

- fork 后子进程共享父进程内存的副本（`os.fork()` 之前的全局状态）
- macOS/Windows 默认 spawn → import 副作用执行多次

---

## 维度 4 · performance

```python
# BAD — N+1
for o in orders:
    u = User.objects.get(id=o.user_id)  # Django: N 次 DB

# GOOD
user_ids = {o.user_id for o in orders}
users_by_id = {u.id: u for u in User.objects.filter(id__in=user_ids)}
```

- list `for x in lst: if x in other_list` → O(n²)；改 set
- `re.compile` 在函数内反复 → 提到模块级
- `json.loads` / `json.dumps` 大对象在热路径
- pandas: `df.iterrows()` 慢；改向量化
- 列表推导 vs 生成器：内存敏感时用生成器（`sum(x for x in ...)` vs `sum([x for x in ...])`）
- `+ ` 拼字符串：`"".join(parts)` 更高效

---

## 维度 5 · memory

- 模块级 list / dict / cache 不 evict
- `functools.lru_cache(maxsize=None)` → 无界
- `pandas.read_csv` 大文件不传 `chunksize`
- generator 不消费就持有引用
- 循环引用 → CPython GC 慢（含 `__del__` 时不会回收）

---

## 维度 6 · error_handling

```python
# BAD
try:
    do()
except Exception:
    pass

try:
    do()
except Exception as e:
    logger.error(e)  # only str(e), 无 traceback
```

```python
# GOOD
try:
    do()
except SpecificError as e:
    logger.exception("Failed to do X foo=%s", foo)  # 自带 traceback
    raise ServiceError("do failed") from e
```

- `except:` 裸 catch 包括 `KeyboardInterrupt` / `SystemExit`（避免）
- `raise` vs `raise from` vs `raise from None` 链不同
- `finally` 中 `return` 会吞掉异常
- async：未处理 exception 在 task 中静默累积，需 `task.add_done_callback` 或 `gather(return_exceptions=True)` 后扫

---

## 维度 7 · external_call

```python
# BAD
r = requests.get(url)  # 无 timeout，永等
```

```python
# GOOD
r = requests.get(url, timeout=(2, 5))  # connect, read
```

- `urllib.request.urlopen` 默认无 timeout
- `httpx.Client` 默认 timeout 5s（合理）；`AsyncClient` 同
- celery task 默认无 soft_time_limit
- 重试用 `tenacity` 时务必设 `stop_after_attempt` + `wait_exponential`

---

## 维度 8 · boundary

- `int("abc")` 抛 ValueError；外部输入务必 try
- 浮点精度：`0.1 + 0.2 != 0.3`，金额用 `Decimal`
- `range(len(x))` + 嵌套修改 → 边界错乱
- 切片 `s[a:b]` 越界不抛错（返回空），但取值后假设非空崩
- 大整数运算无溢出（Python 任意精度），但 numpy / pandas 默认 int64 溢出
- `min([])` / `max([])` 抛 ValueError → 空集合传入需先判

---

## 维度 9 · observability

- `print(...)` 在生产代码 → 旁路（用 `logging`）
- `logger.error(str(e))` 丢 traceback；改用 `logger.exception(...)` 或 `logger.error(..., exc_info=True)`
- `logging.basicConfig` 在 lib 中调用会污染应用配置
- f-string 在 log 中提前求值（不延迟）：`logger.debug(f"x={heavy()}")` 即使 DEBUG 关闭也算 → 用 `%`-style 让 logging 自己决定

---

## 维度 10 · config_env

```python
# BAD
HOST = os.environ['DB_HOST']  # 缺失时 KeyError 不友好
HOST = os.environ.get('DB_HOST')  # 可能 None 后用

# GOOD
HOST = os.environ.get('DB_HOST') or 'localhost'  # 显式默认
# or pydantic Settings / dynaconf
```

- `pydantic.BaseSettings` / `pydantic-settings` 是事实标准，校验类型
- `python-dotenv` 优先级：`.env` 不应覆盖真实 env

---

## 维度 11 · data_consistency

- Django `select_for_update` 必须在 `transaction.atomic()` 内
- SQLAlchemy session: `session.commit()` 后对象进 detached 状态，访问 lazy 属性抛错
- `@transaction.atomic` 内调外部 API → 长事务
- celery task 内 commit 前发其他 task → 子 task 可能找不到数据（先于父 commit 跑）

---

## 维度 12 · time_encoding

- `datetime.now()` naive → 跨时区危险；用 `datetime.now(tz=timezone.utc)`
- `datetime.utcnow()` 返回 naive，**很容易出错**；标准库 3.12+ 已废弃
- `time.time()` 是 epoch float，时区无关
- `str.encode()` 默认 UTF-8（OK），但 `open()` 默认编码跟随平台 → 显式 `encoding='utf-8'`
- DST：`pytz.timezone('America/New_York').localize(dt)` vs `dt.replace(tzinfo=...)`，前者正确

---

## 维度 13 · api_compat

- pydantic v1 → v2 行为变化大
- DRF `serializers.Serializer` 字段删除立即破坏
- protobuf 字段删除 → 消费者解析失败（应保留并标记 reserved）
- python 库 `__all__` 缺失会让 `from x import *` 行为漂移

---

## 工具与生态信号

- 项目有 `pyproject.toml` + ruff/mypy → 已有一定静态检查；NPE / 类型问题大概率被覆盖
- 含 `Django` → 关注 N+1（`select_related` / `prefetch_related`）
- 含 `FastAPI` + `pydantic` → 输入校验已强制；boundary 维度重点查 path / query
- 含 `celery` → 任务幂等、重试、可见性超时是 #7 重点
