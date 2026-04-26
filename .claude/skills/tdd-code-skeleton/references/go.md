# Go 代码骨架参考规范

## 目录
1. [GoDoc注释规范](#godoc)
2. [Interface骨架模板](#interface-template)
3. [Struct + 方法骨架模板](#struct-template)
4. [错误类型定义](#error-types)
5. [TODO注释规范](#todo)
6. [Go惯用约定](#go-idioms)

---

## GoDoc注释规范 {#godoc}

Go注释直接跟在声明前（无空行），第一行以被注释的名称开头，是GoDoc工具的强制要求。

### 包注释

```go
// Package user 提供用户管理相关的核心业务服务。
//
// 本包包含用户注册、查询、更新等业务逻辑，采用依赖注入模式，
// 所有外部依赖通过接口定义，便于单元测试中进行Mock替换。
//
// 设计思路：
// 遵循DDD分层架构，本包位于应用服务层（Application Layer）。
// 领域对象（User、UserId等）不依赖任何基础设施层实现。
//
// 使用示例：
//
//	repo := postgres.NewUserRepository(db)
//	emailSvc := smtp.NewEmailService(smtpConfig)
//	svc := user.NewUserService(repo, emailSvc)
//	userID, err := svc.CreateUser(ctx, "Alice", "alice@example.com", "Pass123!")
package user
```

### 类型（struct/interface）注释

```go
// UserService 用户服务，负责用户注册、查询、更新等核心业务操作。
//
// 作为应用层服务，UserService协调领域对象（User）与基础设施层
// （UserRepository、EmailService）之间的交互，实现用户相关业务流程。
//
// 设计思路：
// 通过NewUserService构造函数注入依赖，避免全局状态，便于并发使用和测试。
// 依赖均以接口类型声明，生产代码与测试代码可使用不同实现。
//
// 实现思路：
// 核心操作使用context.Context传递截止时间和取消信号；
// 错误处理遵循Go惯用法：返回(value, error)，不使用panic。
// 写操作在Repository层保证原子性（通过数据库事务）。
//
// 主要依赖：
//   - UserRepository：用户数据持久化接口（通过构造函数注入）
//   - EmailService：邮件通知服务接口（通过构造函数注入）
//
// 线程安全性：
// 线程安全。所有字段为只读接口引用，无共享可变状态。
//
// 设计约束：
//   - 邮箱在系统中全局唯一（来自设计文档第3.2节）
//   - 密码使用bcrypt哈希，强度因子不低于12（来自安全需求）
```

### 方法注释

```go
// CreateUser 注册新用户，校验邮箱唯一性并发送欢迎邮件。
//
// 实现思路：
// 采用"先检查后执行"模式：写入前先验证邮箱唯一性，
// 给出明确的业务错误信息。密码使用bcrypt不可逆哈希存储。
// 邮件发送通过goroutine异步执行，避免阻塞主流程。
//
// 实现步骤：
//  1. 参数校验：验证name非空(2-50字符)、email合法格式、password强度
//  2. 唯一性检查：通过repo.ExistsByEmail(ctx, email)查询邮箱是否已注册
//  3. 密码哈希：bcrypt.GenerateFromPassword([]byte(password), 12)
//  4. 构建User实体：填充Name、Email、PasswordHash、CreatedAt
//  5. 持久化：repo.Save(ctx, user)
//  6. 异步发送欢迎邮件：go emailSvc.SendWelcomeEmail(user)（含错误日志）
//  7. 返回新用户ID
//
// ctx用于传递截止时间和取消信号，所有IO操作均应遵守ctx。
// 返回的error使用自定义错误类型以便调用方判断错误类别。
```

---

## Interface骨架模板 {#interface-template}

```go
// user_service.go
package user

import "context"

// IUserService 定义用户管理相关操作的服务接口。
//
// 设计思路：
// 通过接口隔离具体实现，上层模块（Handler、其他Service）依赖此接口，
// 遵循依赖倒置原则（DIP）。所有方法接受context.Context作为第一个参数。
//
// 设计约束：
//   - 所有写操作须幂等（来自设计文档）
//   - 接口方法不返回内部数据库实体，使用DTO或值对象
type IUserService interface {
    // CreateUser 注册新用户。[注释同上]
    CreateUser(ctx context.Context, name, email, password string) (UserId, error)

    // GetUserByID 根据ID查询用户信息。
    // 若用户不存在，返回(nil, nil)而非error（"找不到"不是错误）。
    GetUserByID(ctx context.Context, id UserId) (*UserDTO, error)

    // UpdateUser 更新用户信息（部分更新）。
    UpdateUser(ctx context.Context, id UserId, req UpdateUserRequest) error

    // DeleteUser 注销用户账户（软删除）。
    DeleteUser(ctx context.Context, id UserId) error
}

// UserRepository 定义用户数据访问接口（Repository模式）。
//
// 设计思路：
// Repository接口位于领域层，具体实现（PostgresUserRepo等）位于基础设施层，
// 实现领域层与持久化技术的解耦。
type UserRepository interface {
    Save(ctx context.Context, user *User) (*User, error)
    FindByID(ctx context.Context, id UserId) (*User, error)
    FindByEmail(ctx context.Context, email string) (*User, error)
    ExistsByEmail(ctx context.Context, email string) (bool, error)
    Delete(ctx context.Context, id UserId) error
}
```

---

## Struct + 方法骨架模板 {#struct-template}

```go
// user_service_impl.go
package user

import (
    "context"
    "fmt"
    "time"
    // TODO: 根据实现步骤确定具体需要的import
)

// UserService 用户服务实现。[完整注释见上方规范]
type UserService struct {
    repo      UserRepository // 用户数据访问对象
    emailSvc  EmailService   // 邮件通知服务
    // TODO: 根据需要添加其他依赖（如logger、metrics等）
}

// NewUserService 创建UserService实例，注入所需依赖。
//
// 实现思路：
// 使用工厂函数而非直接构造，确保依赖校验和未来扩展的灵活性。
// 返回接口类型（IUserService）而非具体类型，强制调用方面向接口编程。
//
// 实现步骤：
//  1. 校验repo和emailSvc均不为nil（否则panic，因这是程序配置错误）
//  2. 返回初始化好的UserService指针
//
// 参数repo和emailSvc均不可为nil，否则触发panic（属于编程错误而非运行时错误）。
func NewUserService(repo UserRepository, emailSvc EmailService) IUserService {
    // TODO: Step 1 - 参数非空校验
    //   - if repo == nil { panic("user: repo must not be nil") }
    //   - if emailSvc == nil { panic("user: emailSvc must not be nil") }

    // TODO: Step 2 - 构建并返回实例
    //   - return &UserService{repo: repo, emailSvc: emailSvc}
    return nil // TODO: implement
}

// CreateUser 注册新用户，校验邮箱唯一性并发送欢迎邮件。
// [完整注释见上方规范]
func (s *UserService) CreateUser(ctx context.Context, name, email, password string) (UserId, error) {
    // TODO: Step 1 - 参数校验
    //   - if err := validateName(name); err != nil { return UserId{}, fmt.Errorf("createUser: %w", err) }
    //   - if err := validateEmail(email); err != nil { return UserId{}, fmt.Errorf("createUser: %w", err) }
    //   - if err := validatePassword(password); err != nil { return UserId{}, fmt.Errorf("createUser: %w", err) }

    // TODO: Step 2 - 邮箱唯一性检查
    //   - exists, err := s.repo.ExistsByEmail(ctx, email)
    //   - if err != nil { return UserId{}, fmt.Errorf("createUser: check email existence: %w", err) }
    //   - if exists { return UserId{}, &EmailAlreadyExistsError{Email: email} }

    // TODO: Step 3 - 密码哈希
    //   - hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
    //   - if err != nil { return UserId{}, fmt.Errorf("createUser: hash password: %w", err) }

    // TODO: Step 4 - 构建User实体
    //   - user := &User{
    //       ID:           NewUserId(),
    //       Name:         name,
    //       Email:        email,
    //       PasswordHash: string(hash),
    //       CreatedAt:    time.Now().UTC(),
    //       Status:       UserStatusActive,
    //     }

    // TODO: Step 5 - 持久化
    //   - saved, err := s.repo.Save(ctx, user)
    //   - if err != nil { return UserId{}, fmt.Errorf("createUser: save user: %w", err) }

    // TODO: Step 6 - 异步发送欢迎邮件（goroutine，不阻塞主流程）
    //   - go func() {
    //       if err := s.emailSvc.SendWelcomeEmail(saved); err != nil {
    //           // 记录日志，但不影响注册结果
    //           log.Printf("createUser: send welcome email failed: %v", err)
    //       }
    //     }()

    // TODO: Step 7 - 返回用户ID
    //   - return saved.ID, nil
    return UserId{}, fmt.Errorf("not implemented") // TODO: implement
}

// GetUserByID 根据ID查询用户信息。
//
// 实现思路：
// 用户不存在时返回(nil, nil)，而非返回error，因为"找不到"是正常业务情况。
// 调用方通过检查返回值是否为nil来判断用户是否存在。
//
// 实现步骤：
//  1. 校验id有效（非零值）
//  2. 调用repo.FindByID(ctx, id)
//  3. 若用户不存在（ErrNotFound），返回(nil, nil)
//  4. 若其他错误，包装后返回
//  5. 转换为UserDTO并返回
func (s *UserService) GetUserByID(ctx context.Context, id UserId) (*UserDTO, error) {
    // TODO: Step 1 - 参数校验
    //   - if id.IsZero() { return nil, fmt.Errorf("getUserByID: invalid user id") }

    // TODO: Step 2 - 查询数据库
    //   - user, err := s.repo.FindByID(ctx, id)

    // TODO: Step 3 - 处理"未找到"情况（返回nil而非error）
    //   - if errors.Is(err, ErrNotFound) { return nil, nil }
    //   - if err != nil { return nil, fmt.Errorf("getUserByID: %w", err) }

    // TODO: Step 4 - 转换为DTO
    //   - return UserDTO.FromUser(user), nil
    return nil, fmt.Errorf("not implemented") // TODO: implement
}
```

---

## 错误类型定义 {#error-types}

```go
// errors.go
package user

import "fmt"

// ErrNotFound 表示资源不存在的标准错误，可通过errors.Is判断。
var ErrNotFound = fmt.Errorf("user: not found")

// EmailAlreadyExistsError 邮箱已被注册错误。
//
// 设计思路：
// 使用自定义错误类型（而非fmt.Errorf字符串），使调用方可以通过errors.As
// 提取错误详情（如具体的邮箱地址）以构造用户友好的错误响应。
type EmailAlreadyExistsError struct {
    Email string // 已存在的邮箱地址
}

// Error 实现error接口。
func (e *EmailAlreadyExistsError) Error() string {
    // TODO: Step 1 - 返回格式化错误信息
    //   - return fmt.Sprintf("email already exists: %s", e.Email)
    return fmt.Sprintf("email already exists: %s", e.Email) // TODO: implement
}
```

---

## TODO注释规范 {#todo}

```go
func (s *OrderService) ProcessPayment(ctx context.Context, orderID OrderId, payment PaymentInfo) error {
    // TODO: Step 1 - 加载订单（悲观锁，防止并发支付）
    //   - order, err := s.orderRepo.FindByIDForUpdate(ctx, orderID)
    //   - if errors.Is(err, ErrNotFound) { return &OrderNotFoundError{ID: orderID} }
    //   - if err != nil { return fmt.Errorf("processPayment: load order: %w", err) }
    //   - if order.Status != OrderStatusPendingPayment {
    //       return &InvalidOrderStatusError{Got: order.Status, Want: OrderStatusPendingPayment}
    //     }

    // TODO: Step 2 - 调用支付网关（含重试）
    //   - var result *PaymentResult
    //   - for attempt := 0; attempt < 3; attempt++ {
    //       result, err = s.paymentGW.Charge(ctx, payment.Amount, payment.Token)
    //       if err == nil || errors.As(err, &PaymentDeclinedError{}) { break }
    //       time.Sleep(time.Duration(1<<attempt) * time.Second)  // 指数退避
    //     }
    //   - if err != nil { return fmt.Errorf("processPayment: charge: %w", err) }

    // TODO: Step 3 - 更新订单状态（事务内）
    //   - if result.Success { order.Status = OrderStatusPaid } else { order.Status = OrderStatusPaymentFailed }
    //   - order.PaymentID = result.PaymentID
    //   - order.UpdatedAt = time.Now().UTC()
    //   - if err := s.orderRepo.Save(ctx, order); err != nil { return fmt.Errorf("processPayment: save: %w", err) }

    // TODO: Step 4 - 发布领域事件
    //   - 若支付成功：s.eventBus.Publish(OrderPaidEvent{OrderID: orderID})
    //   - 若支付失败：s.eventBus.Publish(OrderPaymentFailedEvent{OrderID: orderID})

    return fmt.Errorf("not implemented") // TODO: implement
}
```

---

## Go惯用约定 {#go-idioms}

```go
// 1. 错误包装（保留调用链）
return fmt.Errorf("methodName: operation: %w", err)

// 2. 错误判断
errors.Is(err, ErrNotFound)           // 判断错误类型（含wrapped error）
errors.As(err, &target)               // 提取具体错误类型

// 3. Context使用
func (s *Service) Method(ctx context.Context, ...) error {
    select {
    case <-ctx.Done():
        return ctx.Err()  // 尊重取消信号
    default:
    }
    // ... 正常逻辑
}

// 4. 接口返回类型（构造函数返回接口而非具体类型）
func NewService(deps ...) IService { ... }  // 而非 *ServiceImpl

// 5. 零值可用（设计结构体时尽量让零值有意义）
type Counter struct{ count int64 }
func (c *Counter) Inc() { atomic.AddInt64(&c.count, 1) }  // 零值即可用

// 6. 选项模式（Option Pattern，可选参数）
type Option func(*ServiceConfig)
func WithTimeout(d time.Duration) Option { return func(c *ServiceConfig) { c.timeout = d } }
func NewService(opts ...Option) IService { ... }

// 7. 表驱动测试的接口设计
// 方法签名应避免使用time.Now()等不可控全局状态，改为注入clock接口
type Clock interface { Now() time.Time }
```
