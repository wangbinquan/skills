# Python 单元测试参考指南

## 推荐技术栈

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 测试框架 | pytest | Python 事实标准，功能强大 |
| Mock 库 | unittest.mock | 标准库内置，无需额外安装 |
| 断言增强 | pytest 内置 assert | 自动提供详细断言错误信息 |
| 覆盖率 | pytest-cov | 生成覆盖率报告 |
| 性能测试 | pytest-benchmark | 微基准测试 |
| 参数化 | pytest.mark.parametrize | 内置参数化支持 |

## 安装配置

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "-v --cov=src --cov-report=term-missing"

[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*"]
```

```bash
# 安装测试依赖
pip install pytest pytest-cov pytest-benchmark pytest-mock
```

## 测试命名规范

```python
# 文件命名：test_<被测模块名>.py
# 测试类：Test<被测类名>
# 测试函数：test_<场景描述>_<条件>

# 示例：
def test_get_user_returns_user_when_id_is_valid(): ...
def test_get_user_raises_exception_when_user_not_found(): ...
```

## 标准测试结构

```python
import pytest
from unittest.mock import Mock, MagicMock, patch, call
from datetime import datetime


class TestUserService:
    """
    UserService 的单元测试套件

    测试覆盖：正常场景、异常场景、边界场景、性能场景
    """

    def setup_method(self):
        """
        每个测试方法执行前的初始化
        创建被测对象和所需的 Mock 依赖
        """
        # 创建 Mock 仓库层，隔离数据库依赖
        self.mock_repo = Mock()
        # 创建被测的 Service 对象，注入 Mock 依赖
        self.user_service = UserService(repository=self.mock_repo)

    def test_get_user_by_id_returns_user_when_valid_id(self):
        """
        测试场景：正常场景 - 通过有效ID查询用户
        测试思路：配置仓库层返回预期用户对象，验证 Service 层正确返回
        前置条件：ID为1的用户存在
        预期结果：返回对应用户对象，用户名正确
        """
        # ===== 准备（Arrange）=====
        # 构造预期的用户数据
        expected_user = {"id": 1, "name": "张三", "email": "zhangsan@example.com"}
        # 配置 Mock：仓库层查询 ID=1 时返回预期用户
        self.mock_repo.find_by_id.return_value = expected_user

        # ===== 执行（Act）=====
        result = self.user_service.get_user_by_id(1)

        # ===== 验证（Assert）=====
        # 验证返回结果与预期一致
        assert result == expected_user
        # 验证仓库层被调用且参数正确
        self.mock_repo.find_by_id.assert_called_once_with(1)

    def test_get_user_by_id_raises_when_user_not_found(self):
        """
        测试场景：异常场景 - 查询不存在的用户
        测试思路：仓库层返回 None，验证 Service 层抛出 UserNotFoundError
        前置条件：ID为999的用户不存在
        预期结果：抛出 UserNotFoundError，错误信息包含用户ID
        """
        # ===== 准备（Arrange）=====
        # 配置 Mock：用户不存在时返回 None
        self.mock_repo.find_by_id.return_value = None

        # ===== 执行 & 验证（Act & Assert）=====
        # 使用 pytest.raises 捕获并验证异常
        with pytest.raises(UserNotFoundError) as exc_info:
            self.user_service.get_user_by_id(999)

        # 验证异常信息包含用户 ID，方便问题定位
        assert "999" in str(exc_info.value)

    @pytest.mark.parametrize("invalid_id,expected_error", [
        (0, "用户ID必须大于0"),
        (-1, "用户ID必须大于0"),
        (None, "用户ID不能为空"),
        ("abc", "用户ID必须为整数"),
    ])
    def test_get_user_by_id_raises_when_id_is_invalid(self, invalid_id, expected_error):
        """
        测试场景：边界场景 - 使用参数化测试验证多个无效ID
        测试思路：用参数化测试一次覆盖多种非法输入，避免重复代码
        前置条件：无
        预期结果：各种无效 ID 均触发对应的 ValueError
        """
        # ===== 执行 & 验证（Act & Assert）=====
        with pytest.raises((ValueError, TypeError)) as exc_info:
            self.user_service.get_user_by_id(invalid_id)

        # 验证错误信息描述准确
        assert expected_error in str(exc_info.value)

    def test_get_user_raises_when_repository_throws_exception(self):
        """
        测试场景：异常场景 - 数据库连接失败
        测试思路：仓库层抛出数据库异常，验证 Service 层的容错包装处理
        前置条件：数据库连接不可用
        预期结果：Service 层将异常包装为 ServiceException 重新抛出
        """
        # ===== 准备（Arrange）=====
        # 配置 Mock 抛出底层数据库异常
        self.mock_repo.find_by_id.side_effect = DatabaseConnectionError("连接超时")

        # ===== 执行 & 验证（Act & Assert）=====
        with pytest.raises(ServiceException) as exc_info:
            self.user_service.get_user_by_id(1)

        # 验证原始异常被包含（便于链式异常追踪）
        assert exc_info.value.__cause__ is not None


class TestUserServiceBoundary:
    """
    UserService 边界场景专项测试
    """

    def test_create_user_handles_max_length_username(self):
        """
        测试场景：边界场景 - 用户名最大长度
        测试思路：测试用户名恰好等于最大长度限制时的行为
        前置条件：系统限制用户名最长50个字符
        预期结果：成功创建用户，不抛出异常
        """
        # ===== 准备（Arrange）=====
        mock_repo = Mock()
        service = UserService(repository=mock_repo)
        # 构造恰好50个字符的用户名（边界值）
        max_length_name = "张" * 50
        mock_repo.save.return_value = {"id": 1, "name": max_length_name}

        # ===== 执行（Act）=====
        result = service.create_user(name=max_length_name)

        # ===== 验证（Assert）=====
        assert result is not None
        assert result["name"] == max_length_name

    def test_create_user_raises_when_username_exceeds_max_length(self):
        """
        测试场景：边界场景 - 用户名超出最大长度
        测试思路：测试超过最大长度限制时的行为
        前置条件：系统限制用户名最长50个字符
        预期结果：抛出 ValidationError
        """
        # ===== 准备（Arrange）=====
        mock_repo = Mock()
        service = UserService(repository=mock_repo)
        # 构造超出限制的用户名（51个字符）
        too_long_name = "张" * 51

        # ===== 执行 & 验证（Act & Assert）=====
        with pytest.raises(ValidationError):
            service.create_user(name=too_long_name)


class TestUserServicePerformance:
    """
    UserService 性能场景测试
    使用 pytest-benchmark 进行微基准测试
    """

    def test_batch_get_users_performance(self, benchmark):
        """
        测试场景：性能场景 - 批量查询性能基准
        测试思路：使用 benchmark fixture 测量批量查询的执行时间
        前置条件：Mock 数据 1000 条记录
        预期结果：基准测试提供性能数据，用于回归对比
        """
        # ===== 准备（Arrange）=====
        mock_repo = Mock()
        service = UserService(repository=mock_repo)
        # 准备 1000 条 Mock 用户数据
        user_ids = list(range(1, 1001))
        mock_users = [{"id": i, "name": f"用户{i}"} for i in user_ids]
        mock_repo.find_all_by_ids.return_value = mock_users

        # ===== 执行（Act）=====
        # benchmark 会多次运行被测函数，收集统计数据
        result = benchmark(service.get_users_by_ids, user_ids)

        # ===== 验证（Assert）=====
        assert len(result) == 1000
```

## Mock 进阶用法

```python
# 1. 使用 patch 装饰器 Mock 模块级对象
@patch('mymodule.requests.get')
def test_api_call(mock_get):
    mock_get.return_value.json.return_value = {"status": "ok"}
    # ...

# 2. 使用 patch 作为上下文管理器
with patch('mymodule.datetime') as mock_dt:
    mock_dt.now.return_value = datetime(2024, 1, 1)
    # ...

# 3. 验证调用顺序
from unittest.mock import call
mock_obj.method('a')
mock_obj.method('b')
mock_obj.method.assert_has_calls([call('a'), call('b')])

# 4. 验证从未调用
mock_obj.method.assert_not_called()

# 5. MagicMock：支持魔术方法的 Mock
mock_file = MagicMock()
mock_file.__enter__.return_value = mock_file
mock_file.read.return_value = "文件内容"
```

## Fixture 使用规范

```python
# conftest.py - 共享 fixture 定义
import pytest

@pytest.fixture
def mock_repository():
    """
    提供 Mock 仓库层的 fixture
    作用域：函数级（每个测试独立创建）
    """
    return Mock()

@pytest.fixture
def user_service(mock_repository):
    """
    提供已注入 Mock 依赖的 UserService fixture
    """
    return UserService(repository=mock_repository)

@pytest.fixture(scope="module")
def sample_users():
    """
    模块级共享的测试用户数据
    作用域：模块级（整个测试文件共享一份）
    """
    return [
        {"id": 1, "name": "张三"},
        {"id": 2, "name": "李四"},
    ]
```
