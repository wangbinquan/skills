# Go 实现规范参考

## 1. 方法级注释格式（GoDoc 实现版）

```go
// CreateUser 创建新用户并异步发送欢迎邮件。
//
// 实现策略:
// 采用"先检查后执行"模式完成邮箱唯一性校验。密码哈希在持久化前完成，
// rawPassword 不离开本函数作用域。欢迎邮件通过 goroutine 异步发送，
// 失败只记录警告日志，不影响主流程返回。
//
// 业务规则落地:
//   - C-001 邮箱唯一性: ExistsByEmail 前置检查（FR-003）
//   - C-002 密码哈希: bcrypt cost=12（SEC-001），来自配置项 config.BcryptCost
//   - C-003 欢迎邮件: goroutine fire-and-forget，失败降级（设计文档 4.2.3）
//
// 异常处理策略:
//   - ErrEmailAlreadyExists: 邮箱已注册，调用方转 HTTP 409
//   - ErrValidation: 参数格式不合规，调用方转 HTTP 422
//   - 数据库错误: 上抛原始 error，调用方转 HTTP 500
//
// ctx 必须传入，超时和取消信号通过 ctx 传播到所有 I/O 操作。
func (s *UserService) CreateUser(ctx context.Context, name, email, rawPassword string) (UserID, error) {
```

## 2. error 处理惯用法

### 2.1 error wrapping（保留调用链）
```go
user, err := s.userRepo.FindByID(ctx, id)
if err != nil {
    // 使用 %w 包装错误，保留完整调用链便于上层 errors.Is/As 判断
    // 同时附加足够的上下文（方法名+参数），避免仅返回 err
    return nil, fmt.Errorf("UserService.GetUserByID(id=%s): %w", id, err)
}
```

### 2.2 哨兵错误与 errors.Is
```go
var (
    // 业务层哨兵错误：使用导出变量，允许调用方用 errors.Is 判断
    ErrEmailAlreadyExists = errors.New("email already exists")
    ErrUserNotFound       = errors.New("user not found")
    ErrValidation         = errors.New("validation error")
)

// 检查时使用 errors.Is，而非 == 比较（支持 wrapping 链）
if errors.Is(err, ErrEmailAlreadyExists) {
    // HTTP 409
}
```

### 2.3 多返回值的错误优先检查
```go
// 惯用：先检查 error，再使用返回值，避免 nil dereference
exists, err := s.userRepo.ExistsByEmail(ctx, normalizedEmail)
if err != nil {
    return UserID(""), fmt.Errorf("check email existence: %w", err)
}
if exists {
    // 抛出业务错误，而非依赖数据库唯一索引（给出友好提示）
    return UserID(""), fmt.Errorf("create user with email %q: %w", email, ErrEmailAlreadyExists)
}
```

## 3. context.Context 规范

```go
// context.Context 必须作为第一个参数传递给所有 I/O 操作（网络、数据库、文件）
// 目的：支持超时取消，防止 goroutine 泄漏，便于链路追踪（设计文档 6.1 可观测性要求）
func (s *UserService) CreateUser(ctx context.Context, ...) (UserID, error) {
    // 所有下游调用都传递 ctx
    exists, err := s.userRepo.ExistsByEmail(ctx, email)
    ...
    user, err := s.userRepo.Save(ctx, newUser)
    ...
}

// goroutine 中使用独立 context，不继承可能被取消的请求 context：
// 主请求的 context 在响应返回后会被取消，
// 但 goroutine 需要独立生命周期完成发邮件（设计文档 4.2.3）
go func() {
    // 使用 context.Background() 创建独立 context，设置合理超时
    emailCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    if err := s.emailSvc.SendWelcomeEmail(emailCtx, email, name); err != nil {
        s.logger.Warn("welcome email failed",
            zap.String("email", email),
            zap.Error(err),
        )
    }
}()
```

## 4. 接口满足与依赖注入

```go
// 在编译时验证 UserServiceImpl 满足 UserService 接口
// 放在文件顶部，任何签名不匹配会立即报错（而非运行时 panic）
var _ UserService = (*UserServiceImpl)(nil)

// 通过构造函数注入依赖，而非全局变量或 init()：
// 1. 明确声明依赖，便于单测 Mock
// 2. 依赖生命周期由调用方控制
// 3. 支持多实例（如测试用不同配置的实例）
func NewUserService(
    repo UserRepository,
    hasher PasswordHasher,
    emailSvc EmailService,
    logger *zap.Logger,
) *UserServiceImpl {
    if repo == nil || hasher == nil || emailSvc == nil || logger == nil {
        panic("UserService: all dependencies must be non-nil")
    }
    return &UserServiceImpl{
        repo:     repo,
        hasher:   hasher,
        emailSvc: emailSvc,
        logger:   logger,
    }
}
```

## 5. 并发安全

```go
// 若 struct 包含可变状态（如缓存），需要在注释中说明并发安全性
type UserServiceImpl struct {
    repo     UserRepository
    hasher   PasswordHasher
    emailSvc EmailService
    logger   *zap.Logger
    // cache 非线程安全，用 sync.RWMutex 保护读写
    mu    sync.RWMutex
    cache map[UserID]*UserDTO
}

// 读操作使用 RLock（允许并发读）
func (s *UserServiceImpl) getCached(id UserID) (*UserDTO, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    dto, ok := s.cache[id]
    return dto, ok
}
```

## 6. 日志规范（zap）

```go
// 使用结构化日志，避免字符串拼接（便于日志平台解析）
s.logger.Info("user registered",
    zap.String("user_id", string(userID)),
    // 邮箱脱敏：只记录域名部分，保护隐私
    zap.String("email_domain", emailDomain(email)),
)

s.logger.Warn("welcome email failed (non-critical)",
    zap.String("user_id", string(userID)),
    zap.Error(err),
)

s.logger.Error("database write failed",
    zap.String("operation", "UserService.CreateUser"),
    zap.Error(err),
)

// 禁止在日志中记录密码、完整邮箱等敏感信息
s.logger.Debug("processing registration", zap.String("email_domain", emailDomain(email)))  // ✅
s.logger.Debug("raw password", zap.String("pwd", rawPassword))                             // ❌
```

## 7. 内联注释惯用法

```go
// === Step 1: 参数校验 ===
// 在进入业务逻辑前统一校验，保证后续步骤的前置条件。
// 校验规则来源：需求文档 FR-001 到 FR-003。
if err := validateCreateUserInput(name, email, rawPassword); err != nil {
    return UserID(""), fmt.Errorf("validate input: %w", err)
}

// === Step 2: 邮箱唯一性检查 ===
// 邮箱统一转小写（FR-003：唯一性不区分大小写）
normalizedEmail := strings.ToLower(email)
// 用轻量 COUNT 查询检查，避免加载完整实体（性能优化，高频操作）
exists, err := s.repo.ExistsByEmail(ctx, normalizedEmail)
if err != nil {
    return UserID(""), fmt.Errorf("check email %q: %w", normalizedEmail, err)
}
if exists {
    return UserID(""), fmt.Errorf("email %q: %w", normalizedEmail, ErrEmailAlreadyExists)
}

// === Step 3: 密码哈希 ===
// rawPassword 不离开本函数作用域，hash 完成后 rawPassword 不再引用
hashedPwd, err := s.hasher.Hash(rawPassword)
if err != nil {
    return UserID(""), fmt.Errorf("hash password: %w", err)
}

// === Step 4: 持久化 ===
newUser := NewUser(name, normalizedEmail, hashedPwd)
saved, err := s.repo.Save(ctx, newUser)
if err != nil {
    return UserID(""), fmt.Errorf("save user: %w", err)
}

// === Step 5: 异步发送欢迎邮件（非关键路径）===
// goroutine 使用独立 context，不受请求超时影响（设计文档 4.2.3）
go s.sendWelcomeEmailAsync(saved.ID, normalizedEmail, name)

s.logger.Info("user registered", zap.String("user_id", string(saved.ID)))
return saved.ID, nil
```

## 8. 单元测试友好设计

```go
// 使用接口而非具体类型作为依赖，便于测试中注入 mock
type UserRepository interface {
    ExistsByEmail(ctx context.Context, email string) (bool, error)
    FindByID(ctx context.Context, id UserID) (*User, error)
    Save(ctx context.Context, user *User) (*User, error)
}

// 在测试中：
// mockRepo := &MockUserRepository{}
// mockRepo.On("ExistsByEmail", ctx, "test@example.com").Return(false, nil)
// svc := NewUserService(mockRepo, mockHasher, mockEmailSvc, logger)
```
