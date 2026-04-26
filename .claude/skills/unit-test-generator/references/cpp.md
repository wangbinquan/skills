# C++ 单元测试参考指南

## 推荐技术栈

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 测试框架 | Google Test (GTest) | C++ 事实标准测试框架 |
| Mock 框架 | Google Mock (GMock) | 与 GTest 配套，功能强大 |
| 覆盖率 | lcov / gcov | GNU 覆盖率工具 |
| 内存检测 | Valgrind / AddressSanitizer | 内存泄漏和越界检测 |
| 性能测试 | Google Benchmark | C++ 微基准测试 |

## CMake 配置

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.14)
project(MyProject)

set(CMAKE_CXX_STANDARD 17)

# 启用测试
enable_testing()

# 使用 FetchContent 自动下载 GTest（无需手动安装）
include(FetchContent)
FetchContent_Declare(
    googletest
    URL https://github.com/google/googletest/archive/v1.14.0.zip
)
FetchContent_MakeAvailable(googletest)

# 创建测试可执行文件
add_executable(user_service_test
    tests/user_service_test.cpp
)

target_link_libraries(user_service_test
    GTest::gtest_main
    GTest::gmock_main
    user_service_lib  # 被测库
)

# 注册测试
include(GoogleTest)
gtest_discover_tests(user_service_test)
```

## 运行测试

```bash
# 构建并运行所有测试
cmake -B build && cmake --build build
cd build && ctest --output-on-failure

# 运行特定测试
./user_service_test --gtest_filter="UserServiceTest.*"

# 启用 AddressSanitizer（内存错误检测）
cmake -B build -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined"
cmake --build build && ./build/user_service_test

# 生成覆盖率报告
cmake -B build -DCMAKE_CXX_FLAGS="--coverage"
cmake --build build && ./build/user_service_test
gcovr --html-details coverage.html
```

## 标准测试结构

```cpp
#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include <memory>
#include <stdexcept>
#include "user_service.h"
#include "user_repository.h"

using ::testing::Return;
using ::testing::Throw;
using ::testing::_;
using ::testing::StrictMock;
using ::testing::NiceMock;

// ===== Mock 类定义 =====

/**
 * UserRepository 接口的 Mock 实现
 * 使用 GMock 宏自动生成 Mock 方法
 */
class MockUserRepository : public IUserRepository {
public:
    // MOCK_METHOD(返回类型, 方法名, (参数列表), (修饰符))
    MOCK_METHOD(std::optional<User>, FindById, (int64_t id), (override));
    MOCK_METHOD(bool, Save, (const User& user), (override));
    MOCK_METHOD(bool, Delete, (int64_t id), (override));
};

// ===== 测试夹具（Test Fixture）=====

/**
 * UserService 测试夹具
 * SetUp/TearDown 在每个测试用例前后自动调用
 * 将公共初始化逻辑提取到夹具中，避免重复代码
 */
class UserServiceTest : public ::testing::Test {
protected:
    void SetUp() override {
        // 每个测试前：创建 Mock 和被测对象
        // 使用 StrictMock：任何未预期的调用都会导致测试失败
        mock_repo_ = std::make_shared<StrictMock<MockUserRepository>>();
        // 通过依赖注入传入 Mock 仓库
        user_service_ = std::make_unique<UserService>(mock_repo_);
    }

    void TearDown() override {
        // 每个测试后：清理资源（智能指针自动释放）
        user_service_.reset();
        mock_repo_.reset();
    }

    // 测试夹具成员：所有测试用例共享
    std::shared_ptr<StrictMock<MockUserRepository>> mock_repo_;
    std::unique_ptr<UserService> user_service_;

    // 测试数据常量
    const int64_t kValidUserId = 1;
    const std::string kValidUserName = "张三";
};

// ===== 正常场景测试 =====

/**
 * 测试场景：正常场景 - 通过有效ID查询用户
 * 测试思路：配置 Mock 仓库返回有效用户，验证 Service 层正确透传
 * 前置条件：ID=1 的用户存在于仓库中
 * 预期结果：返回正确的用户对象，无异常
 */
TEST_F(UserServiceTest, GetUser_ReturnsUser_WhenValidIdProvided) {
    // ===== 准备（Arrange）=====
    // 构造预期返回的用户对象
    User expected_user{kValidUserId, kValidUserName, "zhangsan@example.com"};

    // 配置 Mock：当调用 FindById(1) 时，返回预期用户
    EXPECT_CALL(*mock_repo_, FindById(kValidUserId))
        .Times(1)  // 验证恰好被调用一次
        .WillOnce(Return(std::optional<User>{expected_user}));

    // ===== 执行（Act）=====
    auto result = user_service_->GetUser(kValidUserId);

    // ===== 验证（Assert）=====
    // 验证结果存在且内容正确
    ASSERT_TRUE(result.has_value()) << "有效ID应返回用户对象";
    EXPECT_EQ(result->name, kValidUserName) << "用户名应与预期一致";
    EXPECT_EQ(result->id, kValidUserId) << "用户ID应与预期一致";
}

// ===== 异常场景测试 =====

/**
 * 测试场景：异常场景 - 查询不存在的用户
 * 测试思路：Mock 仓库返回空，验证 Service 抛出 UserNotFoundException
 * 前置条件：ID=999 的用户不存在
 * 预期结果：抛出 UserNotFoundException，异常信息含用户 ID
 */
TEST_F(UserServiceTest, GetUser_ThrowsException_WhenUserNotFound) {
    // ===== 准备（Arrange）=====
    const int64_t nonexistent_id = 999;

    // 配置 Mock：用户不存在时返回空的 optional
    EXPECT_CALL(*mock_repo_, FindById(nonexistent_id))
        .WillOnce(Return(std::optional<User>{}));

    // ===== 执行 & 验证（Act & Assert）=====
    // 验证抛出正确类型的异常
    EXPECT_THROW(
        user_service_->GetUser(nonexistent_id),
        UserNotFoundException
    );
}

/**
 * 测试场景：异常场景 - 验证异常信息内容
 * 测试思路：捕获异常并验证其 what() 信息包含关键信息
 * 预期结果：异常信息包含用户 ID，便于问题定位
 */
TEST_F(UserServiceTest, GetUser_ExceptionContainsUserId_WhenUserNotFound) {
    // ===== 准备（Arrange）=====
    const int64_t nonexistent_id = 999;
    EXPECT_CALL(*mock_repo_, FindById(nonexistent_id))
        .WillOnce(Return(std::optional<User>{}));

    // ===== 执行 & 验证（Act & Assert）=====
    try {
        user_service_->GetUser(nonexistent_id);
        FAIL() << "应抛出异常但未抛出";
    } catch (const UserNotFoundException& e) {
        // 验证异常信息包含用户 ID
        EXPECT_THAT(std::string(e.what()), ::testing::HasSubstr("999"));
    }
}

/**
 * 测试场景：异常场景 - 仓库层抛出底层异常
 * 测试思路：模拟数据库连接失败，验证 Service 层的异常包装处理
 * 预期结果：底层异常被包装为 ServiceException 重新抛出
 */
TEST_F(UserServiceTest, GetUser_WrapsException_WhenRepositoryThrows) {
    // ===== 准备（Arrange）=====
    // 配置 Mock 抛出数据库连接异常
    EXPECT_CALL(*mock_repo_, FindById(_))
        .WillOnce(Throw(std::runtime_error("数据库连接超时")));

    // ===== 执行 & 验证（Act & Assert）=====
    // 验证底层异常被包装为 ServiceException
    EXPECT_THROW(
        user_service_->GetUser(kValidUserId),
        ServiceException
    );
}

// ===== 边界场景测试（参数化）=====

/**
 * 参数化测试：边界场景 - 验证多个无效 ID 值
 * 测试思路：用 INSTANTIATE_TEST_SUITE_P 一次覆盖多个边界值
 */
class GetUserInvalidIdTest : public UserServiceTest,
                              public ::testing::WithParamInterface<int64_t> {};

TEST_P(GetUserInvalidIdTest, ThrowsInvalidArgument_WhenIdIsInvalid) {
    /*
     * 测试场景：边界场景 - 无效 ID（0、负数、极值）
     * 预期结果：抛出 std::invalid_argument，不调用仓库层
     */
    int64_t invalid_id = GetParam();

    // 验证仓库层从不被调用（参数校验在进入仓库前发生）
    EXPECT_CALL(*mock_repo_, FindById(_)).Times(0);

    // 验证参数校验异常
    EXPECT_THROW(
        user_service_->GetUser(invalid_id),
        std::invalid_argument
    );
}

// 注册参数化用例：0、负数、int64 最小值
INSTANTIATE_TEST_SUITE_P(
    边界值,
    GetUserInvalidIdTest,
    ::testing::Values(
        int64_t(0),
        int64_t(-1),
        int64_t(-100),
        std::numeric_limits<int64_t>::min()
    )
);
```

## 性能测试（Google Benchmark）

```cpp
#include <benchmark/benchmark.h>

/**
 * 性能测试：单次用户查询的基准性能
 * 运行：./benchmark_test --benchmark_format=console
 * 输出：每次操作的时间（ns）、吞吐量（items/s）
 */
static void BM_GetUser_SingleQuery(benchmark::State& state) {
    /*
     * 性能测试：GetUser 方法的单次执行时间基准
     * 测试思路：Mock 仓库层消除 IO 开销，专注测量 Service 层逻辑性能
     */
    // ===== 准备（Arrange）=====
    auto mock_repo = std::make_shared<NiceMock<MockUserRepository>>();
    UserService service(mock_repo);
    User test_user{1, "张三", "test@example.com"};

    // 使用 NiceMock 忽略未预期的调用（Benchmark 不关心调用次数）
    ON_CALL(*mock_repo, FindById(1))
        .WillByDefault(Return(std::optional<User>{test_user}));

    // ===== 执行（Act）=====
    for (auto _ : state) {
        // benchmark::DoNotOptimize 防止编译器优化掉被测代码
        auto result = service.GetUser(1);
        benchmark::DoNotOptimize(result);
    }
}

BENCHMARK(BM_GetUser_SingleQuery);
BENCHMARK_MAIN();
```

## 内存安全测试

```cpp
/**
 * 测试场景：内存安全 - 验证无内存泄漏
 * 运行时配合 AddressSanitizer 或 Valgrind 使用
 * cmake 配置：-DCMAKE_CXX_FLAGS="-fsanitize=address"
 */
TEST_F(UserServiceTest, GetUser_NoMemoryLeak_WhenExceptionThrown) {
    /*
     * 测试场景：异常场景下的内存安全
     * 测试思路：在异常路径上验证没有内存泄漏（配合 ASAN 运行）
     * 预期结果：异常被抛出，所有分配的内存被正确释放
     */
    EXPECT_CALL(*mock_repo_, FindById(_))
        .WillOnce(Return(std::optional<User>{}));

    // 多次调用，确保异常路径上没有累积内存泄漏
    for (int i = 0; i < 100; ++i) {
        EXPECT_THROW(user_service_->GetUser(999), UserNotFoundException);
    }
    // ASAN 会在测试结束后自动报告泄漏，无需额外断言
}
```

## 常用 GMock 匹配器速查

```cpp
// 参数匹配
EXPECT_CALL(mock, Method(42));          // 精确值匹配
EXPECT_CALL(mock, Method(_));           // 任意值（通配符）
EXPECT_CALL(mock, Method(Gt(0)));       // 大于 0
EXPECT_CALL(mock, Method(Lt(100)));     // 小于 100
EXPECT_CALL(mock, Method(HasSubstr("关键词")));  // 字符串包含

// 调用次数
EXPECT_CALL(mock, Method(_)).Times(1);           // 恰好1次
EXPECT_CALL(mock, Method(_)).Times(AtLeast(1));  // 至少1次
EXPECT_CALL(mock, Method(_)).Times(0);           // 从不调用

// 返回值
.WillOnce(Return(value));              // 调用一次后返回
.WillRepeatedly(Return(value));        // 每次都返回
.WillOnce(Throw(exception));           // 抛出异常
```
