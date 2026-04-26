# Golang 单元测试参考指南

## 推荐技术栈

| 用途 | 推荐库 | 说明 |
|------|--------|------|
| 测试框架 | testing（标准库） | Go 内置，无需安装 |
| 断言库 | testify/assert | 最流行的 Go 断言库 |
| Mock 框架 | testify/mock | 与 testify 配套的 Mock 库 |
| Mock 生成 | mockery | 自动生成 interface Mock 代码 |
| 覆盖率 | go test -cover | 内置覆盖率工具 |
| 性能测试 | testing.B | 内置 Benchmark 支持 |
| 并发测试 | go test -race | 内置竞态条件检测 |

## 模块配置

```bash
# 安装 testify
go get github.com/stretchr/testify

# 安装 mockery（用于自动生成 Mock）
go install github.com/vektra/mockery/v2@latest

# 运行测试并查看覆盖率
go test ./... -cover -coverprofile=coverage.out
go tool cover -html=coverage.out

# 运行竞态检测（并发测试必备）
go test -race ./...

# 运行性能测试
go test -bench=. -benchmem ./...
```

## 测试命名规范

```go
// 文件命名：<被测文件名>_test.go（同包）或 <包名>_test.go（外部测试包）
// 测试函数：Test<被测函数名>_<场景描述>
// 性能测试：Benchmark<被测函数名>

// 示例：
func TestGetUserByID_ReturnsUserWhenValidID(t *testing.T) {}
func TestGetUserByID_ReturnsErrorWhenUserNotFound(t *testing.T) {}
func BenchmarkGetUserByID(b *testing.B) {}
```

## 标准测试结构（表驱动测试）

```go
package service_test

import (
    "context"
    "errors"
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"
)

// MockUserRepository 是 UserRepository 接口的 Mock 实现
// 通过 mockery 自动生成，或手动实现
type MockUserRepository struct {
    mock.Mock
}

// FindByID Mock 实现：记录调用并返回预设值
func (m *MockUserRepository) FindByID(ctx context.Context, id int64) (*User, error) {
    args := m.Called(ctx, id)
    // 处理可能为 nil 的返回值
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*User), args.Error(1)
}

// TestGetUserByID_正常场景 测试通过有效ID查询用户
func TestGetUserByID_ReturnsUserWhenValidID(t *testing.T) {
    /*
     * 测试场景：正常场景 - 通过有效ID查询用户
     * 测试思路：Mock 仓库层返回预期用户，验证 Service 层正确处理
     * 前置条件：ID=1 的用户存在
     * 预期结果：返回对应的用户对象，无错误
     */

    // ===== 准备（Arrange）=====
    // 创建 Mock 仓库对象
    mockRepo := new(MockUserRepository)
    // 创建被测 Service，注入 Mock 依赖
    svc := NewUserService(mockRepo)
    ctx := context.Background()

    // 构造预期返回的用户对象
    expectedUser := &User{ID: 1, Name: "张三", Email: "zhangsan@example.com"}
    // 配置 Mock：当以 ctx 和 int64(1) 为参数调用时，返回预期用户
    mockRepo.On("FindByID", ctx, int64(1)).Return(expectedUser, nil)

    // ===== 执行（Act）=====
    result, err := svc.GetUserByID(ctx, 1)

    // ===== 验证（Assert）=====
    // require 在断言失败时立即停止测试（避免空指针等后续错误）
    require.NoError(t, err, "正常场景不应返回错误")
    require.NotNil(t, result, "正常场景应返回用户对象")
    // assert 失败后继续执行后续断言
    assert.Equal(t, expectedUser.Name, result.Name, "用户名应与预期一致")
    assert.Equal(t, expectedUser.Email, result.Email, "邮箱应与预期一致")
    // 验证 Mock 方法被按预期调用
    mockRepo.AssertExpectations(t)
}

// TestGetUserByID_表驱动测试 使用表格驱动方式覆盖多个场景
func TestGetUserByID_TableDriven(t *testing.T) {
    /*
     * 测试场景：多场景覆盖（表驱动测试）
     * 测试思路：Go 惯用表驱动测试，一次定义多个用例，减少重复代码
     * 覆盖：有效ID、不存在ID、无效ID（边界值）
     */

    // 定义测试用例表格
    testCases := []struct {
        name          string        // 测试场景名称
        inputID       int64         // 输入的用户 ID
        mockReturn    *User         // Mock 仓库层返回的用户
        mockError     error         // Mock 仓库层返回的错误
        expectedUser  *User         // 期望的用户结果
        expectedError string        // 期望的错误类型（空表示无错误）
    }{
        {
            name:         "正常场景：有效ID查询成功",
            inputID:      1,
            mockReturn:   &User{ID: 1, Name: "张三"},
            mockError:    nil,
            expectedUser: &User{ID: 1, Name: "张三"},
        },
        {
            name:          "异常场景：用户不存在",
            inputID:       999,
            mockReturn:    nil,
            mockError:     ErrUserNotFound,
            expectedError: "用户不存在",
        },
        {
            name:          "异常场景：数据库连接失败",
            inputID:       1,
            mockReturn:    nil,
            mockError:     errors.New("数据库连接超时"),
            expectedError: "查询失败",
        },
    }

    for _, tc := range testCases {
        // 使用 t.Run 为每个用例创建子测试，便于识别失败的场景
        t.Run(tc.name, func(t *testing.T) {
            // ===== 准备（Arrange）=====
            mockRepo := new(MockUserRepository)
            svc := NewUserService(mockRepo)
            ctx := context.Background()

            // 配置 Mock 返回值
            mockRepo.On("FindByID", ctx, tc.inputID).
                Return(tc.mockReturn, tc.mockError)

            // ===== 执行（Act）=====
            result, err := svc.GetUserByID(ctx, tc.inputID)

            // ===== 验证（Assert）=====
            if tc.expectedError != "" {
                // 验证错误场景
                require.Error(t, err, "应返回错误")
                assert.Contains(t, err.Error(), tc.expectedError, "错误信息应符合预期")
                assert.Nil(t, result, "错误时不应返回用户对象")
            } else {
                // 验证成功场景
                require.NoError(t, err, "不应返回错误")
                assert.Equal(t, tc.expectedUser, result, "返回的用户应与预期一致")
            }
            mockRepo.AssertExpectations(t)
        })
    }
}

// TestGetUserByID_边界场景 验证 ID 边界值
func TestGetUserByID_InvalidIDCases(t *testing.T) {
    /*
     * 测试场景：边界场景 - 无效 ID 值
     * 测试思路：无效 ID 应在调用仓库层之前就被拒绝（参数校验）
     * 前置条件：无
     * 预期结果：返回参数校验错误，不调用仓库层
     */

    // 无效 ID 的边界值列表
    invalidIDs := []int64{0, -1, -100, -9223372036854775808} // 0、负数、int64 最小值

    for _, id := range invalidIDs {
        t.Run(fmt.Sprintf("无效ID=%d", id), func(t *testing.T) {
            // ===== 准备（Arrange）=====
            mockRepo := new(MockUserRepository)
            svc := NewUserService(mockRepo)

            // ===== 执行（Act）=====
            result, err := svc.GetUserByID(context.Background(), id)

            // ===== 验证（Assert）=====
            // 验证参数校验失败
            require.Error(t, err, "无效ID应返回错误")
            assert.Nil(t, result, "无效ID不应返回用户")
            // 验证仓库层从未被调用（参数校验在调用 DB 之前）
            mockRepo.AssertNotCalled(t, "FindByID")
        })
    }
}
```

## 性能测试（Benchmark）

```go
// BenchmarkGetUserByID 测量单次查询的性能
func BenchmarkGetUserByID(b *testing.B) {
    /*
     * 性能测试：单次用户查询的基准性能
     * 使用方式：go test -bench=BenchmarkGetUserByID -benchmem
     * 输出含义：ns/op（每次操作纳秒数）、B/op（每次操作分配字节数）
     */

    // ===== 准备（Arrange）=====
    mockRepo := new(MockUserRepository)
    svc := NewUserService(mockRepo)
    ctx := context.Background()
    expectedUser := &User{ID: 1, Name: "张三"}
    // Benchmark 不需要精确验证调用次数，用 Anything 匹配
    mockRepo.On("FindByID", mock.Anything, int64(1)).Return(expectedUser, nil)

    // 重置计时器，排除准备阶段的时间
    b.ResetTimer()

    // ===== 执行（Act）=====
    for i := 0; i < b.N; i++ {
        // b.N 由 Go 运行时自动调整，确保测试结果稳定
        _, _ = svc.GetUserByID(ctx, 1)
    }
}

// BenchmarkGetUserByID_并行 测量并发查询的性能
func BenchmarkGetUserByID_Parallel(b *testing.B) {
    /*
     * 性能测试：并发查询的基准性能
     * 测试在并发压力下的性能表现，用于检测竞态条件的性能影响
     */
    mockRepo := new(MockUserRepository)
    svc := NewUserService(mockRepo)
    ctx := context.Background()
    mockRepo.On("FindByID", mock.Anything, mock.AnythingOfType("int64")).
        Return(&User{ID: 1, Name: "张三"}, nil)

    b.ResetTimer()

    // RunParallel 使用 GOMAXPROCS 个 goroutine 并发执行
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            _, _ = svc.GetUserByID(ctx, 1)
        }
    })
}
```

## 常用断言速查

```go
// 基本断言（assert：失败继续 | require：失败停止）
assert.Equal(t, expected, actual, "错误信息")
assert.NotNil(t, obj)
assert.Nil(t, err)
assert.True(t, condition)
assert.False(t, condition)

// 错误断言
assert.Error(t, err)
assert.NoError(t, err)
assert.EqualError(t, err, "期望的错误信息")
assert.ErrorIs(t, err, targetErr)  // errors.Is 语义

// 集合断言
assert.Len(t, slice, 3)
assert.Contains(t, slice, element)
assert.Empty(t, slice)
assert.ElementsMatch(t, expected, actual)  // 忽略顺序比较

// 类型断言
assert.IsType(t, &User{}, result)
```

## 并发安全测试

```go
// TestConcurrentAccess 验证并发访问的安全性
// 配合 go test -race 运行，自动检测竞态条件
func TestConcurrentAccess(t *testing.T) {
    /*
     * 测试场景：并发场景 - 多 goroutine 同时读写
     * 测试思路：启动多个 goroutine 并发调用，用 -race 标志检测竞态
     * 预期结果：无数据竞争，结果一致
     */
    var wg sync.WaitGroup
    cache := NewUserCache()

    // 启动 100 个并发 goroutine 同时读写缓存
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            cache.Set(int64(id), &User{ID: int64(id)})
            cache.Get(int64(id))
        }(i)
    }

    // 等待所有 goroutine 完成
    wg.Wait()
}
```
