# Python 一致性核对盲点

## 1. 结构维度

- **类型注解（type hints）的有效性**：仅有注解但未启用 `mypy` 严格模式时，注解与运行时不强一致；要核对 `mypy.ini` 是否启用 `--strict` 与设计是否要求强类型。
- **`__init__` 必填参数 vs `dataclass` 默认值**：设计要求"必填字段" → 代码用 `field(default=...)` 静默放宽。
- **`@dataclass(frozen=True)` 与可变性**：设计要求"不可变" → 漏 `frozen=True` 即漂移。
- **抽象基类 `ABC` / `Protocol`**：设计声明"接口" → 代码可能用普通类 + 继承 / Protocol 隐式接口，需核对约束面。
- **`__slots__`**：设计要求"内存严格" → 漏 `__slots__` 性能与封闭性走样。
- **包结构**：`__init__.py` 是否暴露/隐藏对应符号；`__all__` 列表与设计公共 API 一致性。
- **多重继承与 MRO**：设计的"线性继承链"被代码改成 mixin 链，行为可能改变。

## 2. 行为维度

- **异常类型层级**：自定义异常根类（`BizError(Exception)`）是否被一致继承；广泛 `except Exception` 吞没。
- **`asyncio` vs 同步**：设计要求异步 → 代码混合 `time.sleep` 阻塞；或反之。
- **`with` 上下文管理器**：资源泄漏（文件、连接、锁）；设计要求"必须释放"而代码未用 with。
- **生成器 vs 列表**：设计要求"流式" → 代码 `list(gen)` 一次性物化。
- **可变默认参数陷阱**：`def f(x=[])` —— 设计未要求共享，但代码因此造成跨调用污染。
- **GIL 与多线程**：设计要求 CPU 并行 → 代码用 `threading` 而非 `multiprocessing` / `concurrent.futures.ProcessPool`。
- **decorator 链顺序**：`@retry` + `@cache` 顺序错位行为差异巨大。

## 3. 接口契约维度

- **FastAPI**：路径参数、`Query`/`Body`/`Header` 标注是否齐备；`response_model` 缺失导致返回字段泄漏。
- **Flask**：`request.args.get(...)` 默认 `None` —— 设计要求必填但代码静默放空。
- **Pydantic 模型**：字段 `Optional[X]` vs `X`；`Field(...)` 与 `Field(default=None)` 区分。
- **DRF**：Serializer 与 Model 字段不一致；`required=True` / `read_only` / `write_only` 易漏。
- **JSON 序列化**：`datetime` 默认 ISO 字符串；时区 `tzinfo` 与设计要求一致性。

## 4. 数据模型维度

- **SQLAlchemy 1.x vs 2.x 风格**：`Column` 默认 nullable 行为差异；`relationship` 的 lazy 策略与设计一致性。
- **Alembic 迁移**：`autogenerate` 漏掉的修改（默认值变更、索引名变更）。
- **Pydantic ↔ ORM 双向转换**：`from_orm` / `model_validate` 字段映射缺失。
- **Decimal vs float**：金额字段；`decimal.Decimal` 必须用而非 float。

## 5. 配置维度

- **环境变量解析**：`os.getenv("X", default)` 默认值与设计文档不一致。
- **pydantic-settings**：`Settings(BaseSettings)` 字段与 .env 文件 key 大小写差异（默认大小写敏感）。
- **`.env` 优先级**：dotenv vs 真实环境变量优先级与设计一致性。

## 6. 依赖维度

- **`requirements.txt` vs `pyproject.toml`**：项目用 poetry / pip-tools 时，两者不能同源被同时修改。
- **传递依赖锁定**：是否有 `poetry.lock` / `pip-compile` lock 文件。
- **隐式依赖**：`import xxx` 但未声明 —— 借用其他包的传递引入。
- **Python 版本**：`python_requires` 与设计 / docker base image 一致。

## 7. 非功能维度

- **`logging` 配置**：`logging.basicConfig` 被多次调用、handler 重复添加、级别不生效。
- **`print()` 残留** = 绕过日志框架。
- **PII 脱敏**：日志里 `f"user={user}"` 输出整个对象（含密码字段）。
- **性能**：N+1（SQLAlchemy 默认 lazy load）、未用 `bulk_insert_mappings`。
- **GIL 下的"伪并发"**：误以为线程能并行 CPU 任务。
- **缓存**：`functools.lru_cache` 被用在实例方法上 → 内存泄漏 + 缓存键含 self。

## 8. 测试维度

- **pytest fixture scope**：`function` / `class` / `module` / `session` 误用导致状态泄漏。
- **`monkeypatch` vs `unittest.mock`**：mock 对象作用域。
- **异步测试**：`pytest-asyncio` 是否启用；同步测试调用 async 函数无效。
- **覆盖率工具**：`coverage` 配置是否排除测试自身。

## 9. 文档维度

- **docstring 风格**：Google / NumPy / Sphinx 风格混用 → 文档生成器只识别一种，其他被丢弃。
- **类型注解 vs docstring 类型**：双重声明可能漂移。
- **README 中的 `pip install` 命令**：是否与 pyproject.toml 同步。

## 推荐 grep 模式

| 用途 | 模式 |
|------|------|
| 绕过日志 | `^[^#]*\bprint\(\|sys\.stdout\.write\|sys\.stderr\.write` |
| 异常吞没 | `except\s+Exception\s*:|except\s*:\s*(pass|continue)` |
| 可变默认参数 | `def\s+\w+\([^)]*=\s*\[\]\|=\s*\{\}` |
| FastAPI 路由 | `@(app\|router)\.(get\|post\|put\|delete\|patch)` |
| 配置读取 | `os\.getenv\|os\.environ\.get\|BaseSettings` |
