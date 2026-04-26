# C++ 代码骨架参考规范

## 目录
1. [Doxygen注释规范](#doxygen)
2. [头文件模板（.h/.hpp）](#header-template)
3. [源文件模板（.cpp）](#source-template)
4. [接口（纯虚类）模板](#interface-template)
5. [TODO注释规范](#todo)
6. [现代C++约定](#modern-cpp)

---

## Doxygen注释规范 {#doxygen}

### 类级Doxygen（头文件中，必须包含以下所有字段）

```cpp
/**
 * @brief [一句话职责描述]
 *
 * [扩展描述：该类在整体架构中的角色，解决什么问题]
 *
 * @par 设计思路
 * [该类的设计思路：设计模式选择、核心数据结构、内存管理策略]
 *
 * @par 实现思路
 * [核心实现方案：使用什么技术手段，关键算法，线程模型]
 *
 * @par 主要依赖
 * - [依赖A（通过构造函数注入）]: [作用描述]
 * - [依赖B（全局单例）]: [作用描述]
 *
 * @par 线程安全性
 * [是否线程安全；若否，说明使用限制]
 *
 * @par 内存管理
 * [对象的生命周期管理方式：unique_ptr持有、shared_ptr共享、原始指针不拥有]
 *
 * @par 设计约束
 * - [来自设计文档的约束1]
 * - [来自设计文档的约束2]
 *
 * @note [其他注意事项]
 * @since 1.0.0
 * @see RelatedClass
 */
```

### 方法级Doxygen

```cpp
/**
 * @brief [一句话方法职责描述]
 *
 * @par 实现思路
 * [该方法的核心实现思路：算法选择、内存策略、错误处理方式]
 *
 * @par 实现步骤
 * -# 步骤1：[具体操作，例如"校验指针非空，防止未定义行为"]
 * -# 步骤2：[具体操作，例如"加锁保护共享资源访问"]
 * -# 步骤3：[具体操作，例如"遍历容器，查找满足条件的元素"]
 * -# 步骤4：[具体操作，例如"构造返回值对象并返回"]
 *
 * @param[in] paramName [参数说明：含义、约束（如"不可为nullptr"）]
 * @param[out] outParam [输出参数说明]
 * @param[in,out] inOutParam [输入输出参数说明]
 * @return [返回值说明，以及nullptr/空容器等特殊情况]
 * @throw std::invalid_argument [触发条件]
 * @throw SomeException [触发条件]
 * @pre [前置条件，如"对象已初始化"]
 * @post [后置条件，如"内部状态X变为Y"]
 * @warning [重要警告，如"调用方负责管理返回指针的生命周期"]
 * @note [并发注意事项或其他说明]
 */
```

---

## 头文件模板 {#header-template}

```cpp
// UserService.h
#pragma once

#include <memory>
#include <optional>
#include <string>
#include <vector>
// TODO: 根据实现步骤确定具体需要的include

namespace example {

// 前向声明，减少头文件依赖
class UserRepository;
class EmailService;
struct UserId;
struct UserDTO;

/**
 * @brief 用户服务类，负责用户注册、查询、更新等核心业务操作。
 *
 * 作为应用层服务，UserService协调领域对象（User）与基础设施层
 * （UserRepository、EmailService）之间的交互。
 *
 * @par 设计思路
 * 采用分层架构，本类位于应用服务层。通过构造函数注入依赖，
 * 使用unique_ptr持有依赖以明确所有权语义，便于单测中注入Mock对象。
 *
 * @par 实现思路
 * 核心操作使用RAII管理资源；错误处理采用异常机制（遵循项目规范）；
 * 查询操作返回std::optional以明确表达"可能不存在"语义。
 *
 * @par 主要依赖
 * - UserRepository（通过构造函数注入）: 用户数据持久化操作
 * - EmailService（通过构造函数注入）: 注册成功后发送欢迎邮件
 *
 * @par 线程安全性
 * 非线程安全。依赖的线程安全性由各依赖实现保证。
 *
 * @par 内存管理
 * 通过构造函数接受unique_ptr，转移所有权，析构时自动释放。
 *
 * @par 设计约束
 * - 邮箱在系统中全局唯一（来自设计文档第3.2节）
 * - 密码使用bcrypt哈希，强度因子不低于12（来自安全需求）
 *
 * @since 1.0.0
 * @see IUserService
 */
class UserService : public IUserService {
public:
    /**
     * @brief 构造函数，注入所需依赖。
     *
     * @par 实现思路
     * 通过移动语义接管依赖的所有权，避免额外拷贝，同时明确生命周期归属。
     *
     * @par 实现步骤
     * -# 步骤1：校验入参指针非空（否则抛出std::invalid_argument）
     * -# 步骤2：通过std::move转移unique_ptr所有权
     *
     * @param[in] userRepository 用户数据访问对象，不可为nullptr，所有权转移给本类
     * @param[in] emailService 邮件服务，不可为nullptr，所有权转移给本类
     * @throw std::invalid_argument 当任一参数为nullptr时
     */
    explicit UserService(
        std::unique_ptr<UserRepository> userRepository,
        std::unique_ptr<EmailService> emailService
    );

    /**
     * @brief 析构函数。
     * @note unique_ptr成员会自动释放，无需手动管理。
     */
    ~UserService() override = default;

    // 禁止拷贝（含unique_ptr成员），允许移动
    UserService(const UserService&) = delete;
    UserService& operator=(const UserService&) = delete;
    UserService(UserService&&) = default;
    UserService& operator=(UserService&&) = default;

    /**
     * @brief 注册新用户，校验唯一性并发送欢迎邮件。
     *
     * @par 实现思路
     * 采用"先检查后执行"模式：写入前先验证邮箱唯一性，
     * 给出明确的业务错误信息（而非依赖数据库约束异常）。
     * 密码使用bcrypt不可逆哈希存储。
     *
     * @par 实现步骤
     * -# 步骤1：入参校验 - 验证name非空(2-50字符)、email合法格式、password强度
     * -# 步骤2：唯一性检查 - 调用userRepository_->existsByEmail(email)
     * -# 步骤3：密码哈希 - 使用bcrypt_hashpw(password, bcrypt_gensalt(12))
     * -# 步骤4：构建User实体 - 填充name、email、passwordHash、createTime
     * -# 步骤5：持久化 - userRepository_->save(user)
     * -# 步骤6：发送欢迎邮件 - emailService_->sendWelcomeEmail(user)（异步）
     * -# 步骤7：返回新用户ID
     *
     * @param[in] name 用户名，不可为空，长度2-50字符
     * @param[in] email 用户邮箱，不可为空，必须是合法邮箱格式，全局唯一
     * @param[in] password 明文密码，不可为空，至少8位含大小写字母和数字
     * @return 新创建用户的ID
     * @throw std::invalid_argument 当name/email/password不合法时
     * @throw EmailAlreadyExistsException 当邮箱已被注册时
     */
    UserId createUser(
        const std::string& name,
        const std::string& email,
        const std::string& password
    ) override;

    /**
     * @brief 根据ID查询用户信息。
     *
     * @par 实现步骤
     * -# 步骤1：校验userId有效（非空UUID格式）
     * -# 步骤2：调用userRepository_->findById(userId)
     * -# 步骤3：若找到则转换为UserDTO，否则返回std::nullopt
     *
     * @param[in] userId 用户ID，不可为空
     * @return 用户DTO（若存在），否则std::nullopt
     */
    std::optional<UserDTO> getUserById(const UserId& userId) const override;

private:
    std::unique_ptr<UserRepository> userRepository_; ///< 用户数据访问对象
    std::unique_ptr<EmailService> emailService_;     ///< 邮件服务
};

} // namespace example
```

---

## 源文件模板 {#source-template}

```cpp
// UserService.cpp
#include "UserService.h"

#include "EmailService.h"
#include "UserRepository.h"
#include "exceptions/EmailAlreadyExistsException.h"
// TODO: 根据实现步骤确定具体需要的include

namespace example {

UserService::UserService(
    std::unique_ptr<UserRepository> userRepository,
    std::unique_ptr<EmailService> emailService)
{
    // TODO: Step 1 - 入参非空校验
    //   - if (!userRepository) throw std::invalid_argument("userRepository must not be null")
    //   - if (!emailService) throw std::invalid_argument("emailService must not be null")

    // TODO: Step 2 - 移动语义转移所有权
    //   - userRepository_ = std::move(userRepository)
    //   - emailService_ = std::move(emailService)
}

UserId UserService::createUser(
    const std::string& name,
    const std::string& email,
    const std::string& password)
{
    // TODO: Step 1 - 入参校验
    //   - 校验name非空且长度在[2,50]，否则throw std::invalid_argument("Invalid name")
    //   - 校验email非空且符合邮箱格式（正则匹配），否则throw std::invalid_argument("Invalid email")
    //   - 校验password非空且强度满足要求，否则throw std::invalid_argument("Weak password")

    // TODO: Step 2 - 邮箱唯一性检查
    //   - if (userRepository_->existsByEmail(email)) throw EmailAlreadyExistsException(email)

    // TODO: Step 3 - 密码哈希
    //   - std::string passwordHash = bcryptHash(password, 12)

    // TODO: Step 4 - 构建User实体
    //   - User user{generateUserId(), name, email, passwordHash, getCurrentTimestamp()}

    // TODO: Step 5 - 持久化
    //   - userRepository_->save(user)

    // TODO: Step 6 - 异步发送欢迎邮件
    //   - std::async(std::launch::async, [&]{ emailService_->sendWelcomeEmail(user); })
    //   - 注意：异步任务的异常处理，避免静默失败

    // TODO: Step 7 - 返回用户ID
    return UserId{}; // TODO: implement - 返回实际创建的用户ID
}

std::optional<UserDTO> UserService::getUserById(const UserId& userId) const {
    // TODO: Step 1 - 参数校验
    //   - 校验userId有效（非空UUID格式）

    // TODO: Step 2 - 查询数据库
    //   - auto user = userRepository_->findById(userId)

    // TODO: Step 3 - 转换并返回
    //   - if (!user) return std::nullopt
    //   - return UserDTO::fromUser(*user)
    return std::nullopt; // TODO: implement
}

} // namespace example
```

---

## 接口（纯虚类）模板 {#interface-template}

```cpp
// IUserService.h
#pragma once

#include <optional>
#include <string>

namespace example {

struct UserId;
struct UserDTO;

/**
 * @brief 用户服务接口，定义用户管理相关操作的契约。
 *
 * @par 设计思路
 * 使用纯虚类（抽象接口）而非具体类，实现依赖倒置原则（DIP）。
 * 接口使用virtual析构函数确保多态删除安全。
 *
 * @par 设计约束
 * - 所有写操作须在事务中执行（由实现类保证）
 * - 接口方法不暴露内部数据库实体（使用DTO或值对象）
 */
class IUserService {
public:
    virtual ~IUserService() = default;

    /**
     * @brief 注册新用户。
     * [完整的Doxygen注释同具体类的方法注释]
     */
    virtual UserId createUser(
        const std::string& name,
        const std::string& email,
        const std::string& password
    ) = 0;

    /**
     * @brief 根据ID查询用户信息。
     */
    virtual std::optional<UserDTO> getUserById(const UserId& userId) const = 0;

protected:
    IUserService() = default;
    // 接口不可拷贝（防止对象切割）
    IUserService(const IUserService&) = delete;
    IUserService& operator=(const IUserService&) = delete;
};

} // namespace example
```

---

## TODO注释规范 {#todo}

```cpp
// 推荐格式：分步骤、精确描述
void OrderService::processPayment(const OrderId& orderId, const PaymentInfo& payment) {
    // TODO: Step 1 - 加载订单（悲观锁，防止并发支付）
    //   - auto order = orderRepository_->findByIdForUpdate(orderId)
    //   - if (!order) throw OrderNotFoundException(orderId.toString())
    //   - if (order->status != OrderStatus::PENDING_PAYMENT)
    //       throw InvalidOrderStatusException("Order not in PENDING_PAYMENT state")

    // TODO: Step 2 - 调用支付网关
    //   - auto result = paymentGateway_->charge(payment.amount, payment.token)
    //   - 处理PaymentGateway可能抛出的网络异常（重试3次，指数退避）
    //   - 处理支付拒绝响应（余额不足、卡号无效等）

    // TODO: Step 3 - 更新订单状态（在同一事务内）
    //   - order->status = result.success ? OrderStatus::PAID : OrderStatus::PAYMENT_FAILED
    //   - order->paymentId = result.paymentId
    //   - orderRepository_->save(*order)

    // TODO: Step 4 - 触发后续流程
    //   - 若支付成功：发布OrderPaidEvent，触发出库流程
    //   - 若支付失败：发布OrderPaymentFailedEvent，释放库存预留
}
```

---

## 现代C++约定 {#modern-cpp}

```cpp
// 资源管理（RAII）
std::unique_ptr<T>  // 独占所有权
std::shared_ptr<T>  // 共享所有权（谨慎使用，可能造成循环引用）
std::weak_ptr<T>    // 观察者，不参与引用计数

// 类型安全
std::optional<T>    // 可能为空的值（替代裸指针或-1等魔法值）
std::variant<T, E>  // 错误处理（C++17，替代异常的一种方式）
std::string_view    // 只读字符串引用（避免拷贝）

// 移动语义
explicit ClassName(ClassName&&) = default;              // 移动构造
ClassName& operator=(ClassName&&) = default;            // 移动赋值
explicit ClassName(const ClassName&) = delete;          // 禁止拷贝

// 虚函数规范
virtual void method() = 0;       // 纯虚函数（接口方法）
void method() override;          // 必须加override（编译期检查）
void method() override final;    // 禁止子类再次覆盖

// noexcept标注
bool isEmpty() const noexcept;   // 保证不抛异常的方法
void swap(T& other) noexcept;    // 交换操作通常noexcept

// 常量正确性
void read() const;               // 只读方法加const
const std::string& getName() const noexcept;  // 返回引用的getter
```
