# 软件设计文档 - 用户管理模块

## 3.1 UserService 设计

### 架构层次
- UserServiceImpl 位于应用服务层（Application Service Layer）
- 不直接依赖 Spring Data JPA 或 Hibernate 等具体实现类，通过接口与持久化层解耦
- 依赖注入方式：构造函数注入（禁止 @Autowired 字段注入）

### 4.2.3 邮件发送降级策略
欢迎邮件通过 EmailService.sendWelcomeEmailAsync() 异步发送（返回 CompletableFuture）。
失败处理：使用 .exceptionally() 捕获异常，记录 WARN 日志，返回 null。
重要：不得 .get() 或 .join() 等待结果，也不得将 CompletableFuture 加入主事务。

### 4.3 事务策略
- 写操作（createUser, updateUser, deleteUser）：@Transactional（默认 propagation=REQUIRED）
- 读操作（getUserById）：@Transactional(readOnly = true)
- 邮件发送不参与主事务（异步执行，独立 CompletableFuture）

### 4.5 数据保留策略
- 用户数据不物理删除
- 注销通过状态字段（UserStatus）控制：ACTIVE → DEACTIVATED
- DEACTIVATED 状态需记录 deactivatedAt 时间戳（User.deactivate() 方法负责）

## 3.2 UserMapper

UserMapper.toDTO(user) 将 User 领域对象转换为 UserDTO，规则：
- 复制 id, name, email, status, createdAt 字段
- 不复制 passwordHash 字段（安全要求）

## 3.3 User 领域对象工厂方法

User.register(name, email, passwordHash) — 静态工厂方法，创建新用户：
- 自动生成 UserId（UUID）
- 设置 status = UserStatus.ACTIVE
- 设置 createdAt = Instant.now()

User.deactivate() — 实例方法，软删除：
- 设置 status = UserStatus.DEACTIVATED
- 设置 deactivatedAt = Instant.now()
