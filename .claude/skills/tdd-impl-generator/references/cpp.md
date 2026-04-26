# C++ 实现规范参考

## 1. 方法级注释格式（Doxygen 实现版）

```cpp
/**
 * @brief 创建新用户账户并异步发送欢迎邮件。
 *
 * @details
 * **实现策略**：采用"先检查后执行"模式完成邮箱唯一性校验，在持久化前
 * 抛出友好业务异常。密码哈希完成后立即用 RAII 清零原始密码内存（SEC-001）。
 * 欢迎邮件通过 std::async(launch::async) 异步发送，失败只记录警告日志。
 *
 * **业务规则落地**：
 * - C-001 邮箱唯一性：`user_repo_.ExistsByEmail()` 前置检查（FR-003）
 * - C-002 密码哈希：Argon2id，参数来自 SecurityConfig（SEC-001）
 * - C-003 欢迎邮件：std::async fire-and-forget，失败降级（设计文档 4.2.3）
 *
 * **异常安全级别**：基本保证（失败时不泄漏资源，但不保证状态回滚）
 * - 持久化成功后邮件失败 → 用户已创建，邮件失败仅记录日志，不回滚（业务设计）
 *
 * @param name 用户名，长度 [2, 50]，非空
 * @param email 邮箱地址，RFC 5322 格式，全局唯一（不区分大小写）
 * @param raw_password 明文密码，不会被持久化，函数返回后内存清零
 * @return 新建用户的唯一 ID
 * @throws EmailAlreadyExistsException 邮箱已注册
 * @throws ValidationException 参数格式校验失败
 * @throws RepositoryException 数据库写入失败
 */
UserId UserService::CreateUser(
    std::string_view name,
    std::string_view email,
    std::string_view raw_password);
```

## 2. RAII 惯用法

```cpp
// 使用 RAII 包装器确保密码明文在所有退出路径（包括异常）上都被清零
// 而非手动 try/catch/finally（C++ 无 finally，手动清理常被遗漏）
class SensitiveString {
public:
    explicit SensitiveString(std::string_view data) : data_(data) {}
    ~SensitiveString() {
        // explicit_bzero 不会被优化器消除（memset 可能被优化）
        explicit_bzero(data_.data(), data_.size());
    }
    std::string_view view() const { return data_; }
private:
    std::string data_;
};

// 使用示例：
{
    SensitiveString pwd(raw_password);  // 构造时复制
    auto hash = hasher_->Hash(pwd.view());
    // ... pwd 在此作用域结束时自动清零，无论是否抛出异常
}
```

## 3. 智能指针

```cpp
// unique_ptr：独占所有权，明确"本对象拥有此资源"
// shared_ptr：共享所有权，用于跨服务共享基础设施（如 Logger）
// 禁止裸指针持有资源（禁止 new/delete 配对）

class UserService {
public:
    // 构造函数注入：依赖通过 unique_ptr 传入，明确所有权转移
    explicit UserService(
        std::unique_ptr<UserRepository> repo,
        std::unique_ptr<PasswordHasher> hasher,
        std::shared_ptr<EmailService> email_svc,  // 共享：其他 Service 也持有
        std::shared_ptr<spdlog::logger> logger);

private:
    std::unique_ptr<UserRepository> repo_;
    std::unique_ptr<PasswordHasher> hasher_;
    std::shared_ptr<EmailService> email_svc_;
    std::shared_ptr<spdlog::logger> logger_;
};
```

## 4. 异常层次设计

```cpp
// 业务异常继承自 BusinessException（应用层基类）
class EmailAlreadyExistsException : public BusinessException {
public:
    explicit EmailAlreadyExistsException(std::string_view email)
        : BusinessException(
              ErrorCode::kEmailAlreadyExists,
              fmt::format("Email already registered: {}", MaskEmail(email))),
          email_(email) {}

    std::string_view email() const { return email_; }

private:
    std::string email_;

    // 邮箱脱敏：保护用户隐私，错误消息不暴露完整邮箱
    static std::string MaskEmail(std::string_view email);
};

// 异常安全的使用模式：
try {
    auto user_id = service.CreateUser(name, email, password);
} catch (const EmailAlreadyExistsException& e) {
    // 业务异常，可以恢复（提示用户换邮箱）
    return Response::Conflict(e.what());
} catch (const BusinessException& e) {
    return Response::BadRequest(e.what());
} catch (const std::exception& e) {
    // 基础设施异常，不可恢复，记录后返回 500
    logger_->error("Unexpected error: {}", e.what());
    return Response::InternalError();
}
```

## 5. 现代 C++ 惯用法

```cpp
// string_view：避免不必要的字符串拷贝（参数只读时使用）
void ValidateEmail(std::string_view email);

// std::optional：明确表达"可能不存在"，而非返回 nullptr 或特殊值
std::optional<UserDTO> UserService::GetUserById(UserId id) {
    auto user = repo_->FindById(id);
    if (!user) {
        return std::nullopt;  // 显式表达"未找到"，而非返回 nullptr
    }
    return UserMapper::ToDTO(*user);
}

// 结构化绑定（C++17）：提高可读性
auto [exists, error] = repo_->ExistsByEmail(email);
if (error) {
    throw RepositoryException(*error);
}

// if constexpr（C++17）：编译时分支，避免运行时类型判断
template<typename T>
auto Serialize(const T& value) {
    if constexpr (std::is_integral_v<T>) {
        return std::to_string(value);
    } else {
        return value.ToString();
    }
}
```

## 6. 异步处理

```cpp
#include <future>
#include <thread>

// std::async + std::launch::async 确保在独立线程执行（而非惰性执行）
// 使用 detach 而非持有 future，实现 fire-and-forget 语义
// 注意：被 detach 的线程需要捕获所有异常，否则会调用 std::terminate
void UserService::SendWelcomeEmailAsync(std::string email, std::string name) {
    // 按值捕获（而非引用），因为 lambda 可能在当前帧销毁后执行
    std::thread([this, email = std::move(email), name = std::move(name)]() {
        try {
            email_svc_->SendWelcomeEmail(email, name);
        } catch (const std::exception& e) {
            // 邮件失败只记录警告，不传播（设计文档 4.2.3 降级策略）
            logger_->warn("Welcome email failed for {}: {}", MaskEmail(email), e.what());
        } catch (...) {
            // 捕获所有未预期异常，防止 std::terminate
            logger_->error("Unexpected exception in SendWelcomeEmailAsync");
        }
    }).detach();
}
```

## 7. 日志规范（spdlog）

```cpp
// 使用结构化日志（spdlog fmt 格式）
logger_->info("User registered: user_id={}, email_domain={}", user_id, EmailDomain(email));
logger_->warn("Welcome email failed: user_id={}, error={}", user_id, e.what());
logger_->error("Database write failed: operation=CreateUser, error={}", e.what());

// 禁止打印敏感信息
logger_->debug("Processing registration: email_domain={}", EmailDomain(email));  // ✅
logger_->debug("Password hash: {}", hashed_password);                            // ❌ 禁止
```

## 8. 分步骤内联注释

```cpp
UserId UserService::CreateUser(
    std::string_view name,
    std::string_view email,
    std::string_view raw_password) {

    // === Step 1: 参数校验 ===
    // 统一前置校验，保证后续步骤的前置条件。规则来源：FR-001 到 FR-003
    ValidateCreateUserInput(name, email, raw_password);

    // === Step 2: 邮箱规范化与唯一性检查 ===
    // 邮箱转小写（FR-003：唯一性不区分大小写）
    std::string normalized_email = ToLowerCase(email);
    // COUNT 前置检查：给出友好业务错误，而非依赖数据库唯一索引异常
    if (repo_->ExistsByEmail(normalized_email)) {
        throw EmailAlreadyExistsException(normalized_email);
    }

    // === Step 3: 密码哈希（RAII 保证明文清零）===
    // SensitiveString 确保 raw_password 在所有退出路径上被清零（SEC-001）
    SensitiveString sensitive_pwd(raw_password);
    auto hashed_password = hasher_->Hash(sensitive_pwd.view());

    // === Step 4: 构建领域对象并持久化 ===
    // 使用工厂方法封装不变量，而非直接调用构造函数（领域驱动设计）
    auto new_user = User::Register(name, normalized_email, std::move(hashed_password));
    auto saved_user = repo_->Save(std::move(new_user));

    // === Step 5: 触发欢迎邮件（非关键路径）===
    // fire-and-forget，失败降级（设计文档 4.2.3）
    // 按值捕获 email 和 name 副本，独立于当前栈帧生命周期
    SendWelcomeEmailAsync(normalized_email, std::string(name));

    logger_->info("User registered: user_id={}", saved_user->id);
    return saved_user->id;
}
```
