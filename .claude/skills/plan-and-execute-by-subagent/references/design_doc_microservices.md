# 微服务架构设计文档

## 项目概述

一个中等规模的电商平台，拆分为8个微服务，各服务独立开发、部署和扩展。

## 技术栈

- **编程语言**：Java 17
- **框架**：Spring Boot 3.0+ Spring Cloud
- **构建工具**：Maven
- **数据库**：PostgreSQL（每个服务独立数据库）
- **消息队列**：RabbitMQ
- **注册中心**：Eureka
- **配置中心**：Config Server

## 微服务清单

### 1. 用户服务（user-service）
**职责**：用户账号、权限、认证

**核心模块**：
- 用户管理（User, UserProfile）
- 权限管理（Role, Permission, UserRole）
- 认证令牌（AuthToken, RefreshToken）
- 用户地址簿（Address）

**API 端点**：
- POST /api/users/register
- GET /api/users/{id}
- PUT /api/users/{id}
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/users/{id}/addresses
- POST /api/users/{id}/addresses

### 2. 商品服务（product-service）
**职责**：商品、类目、库存

**核心模块**：
- 商品信息（Product, ProductDetail）
- 分类（Category, SubCategory）
- 库存（Inventory, StockLog）
- 价格管理（PriceHistory）

**API 端点**：
- GET /api/products
- GET /api/products/{id}
- POST /api/products（仅管理员）
- PUT /api/products/{id}（仅管理员）
- GET /api/categories
- POST /api/inventory/reserve
- POST /api/inventory/release

### 3. 订单服务（order-service）
**职责**：订单、购物车、支付

**核心模块**：
- 购物车（Cart, CartItem）
- 订单（Order, OrderItem）
- 订单状态流（OrderStatus, OrderStatusLog）
- 发票（Invoice）

**API 端点**：
- POST /api/cart/add
- GET /api/cart/{userId}
- DELETE /api/cart/clear
- POST /api/orders/create
- GET /api/orders/{id}
- GET /api/orders/user/{userId}
- PUT /api/orders/{id}/status

### 4. 支付服务（payment-service）
**职责**：支付处理、退款、账单

**核心模块**：
- 支付记录（Payment, PaymentMethod）
- 退款（Refund）
- 发票生成（Invoice）
- 账单（Bill）

**API 端点**：
- POST /api/payments/process
- GET /api/payments/{id}
- POST /api/refunds
- GET /api/refunds/{id}
- POST /api/invoices/generate

### 5. 配送服务（shipping-service）
**职责**：配送、物流跟踪、退货

**核心模块**：
- 配送单（ShipmentOrder, TrackingLog）
- 退货处理（Return, ReturnApproval）
- 配送地址（ShippingAddress）
- 配送商管理（ShippingProvider）

**API 端点**：
- POST /api/shipments/create
- GET /api/shipments/{id}
- GET /api/tracking/{trackingNumber}
- POST /api/returns/request
- PUT /api/returns/{id}/status

### 6. 评价服务（review-service）
**职责**：商品评价、用户评价

**核心模块**：
- 商品评价（ProductReview, ReviewImage）
- 用户评价（UserRating）
- 评价标签（ReviewTag）

**API 端点**：
- POST /api/reviews/product/{productId}
- GET /api/reviews/product/{productId}
- PUT /api/reviews/{id}
- DELETE /api/reviews/{id}
- GET /api/user-ratings/{userId}

### 7. 通知服务（notification-service）
**职责**：邮件、短信、推送通知

**核心模块**：
- 消息模板（MessageTemplate）
- 发送记录（MessageLog）
- 通知规则（NotificationRule）

**API 端点**：
- POST /api/notifications/send
- GET /api/notifications/logs
- PUT /api/templates/{id}

### 8. 报表服务（analytics-service）
**职责**：数据统计、报表生成

**核心模块**：
- 数据汇聚（DailyStatistics, HourlyMetrics）
- 报表（Report, ReportSchedule）

**API 端点**：
- GET /api/reports/sales
- GET /api/reports/users
- POST /api/reports/custom
- GET /api/metrics/dashboard

## 共享编码规范

### 包结构
```
src/
  main/java/com/example/{service-name}/
    entity/           # JPA 实体类
    dto/              # 数据传输对象
    repository/       # 数据访问层（Spring Data JPA）
    service/          # 业务逻辑层（接口）
    service/impl/     # 业务逻辑层（实现）
    controller/       # REST 控制器
    exception/        # 自定义异常
    config/           # 配置类
    util/             # 工具类
    constant/         # 常量定义
    event/            # 事件类
  test/java/com/example/{service-name}/
    service/
    controller/
    repository/
```

### 命名约定
- **实体类**：PascalCase，如 `User`, `Product`, `Order`
- **DTO 类**：类名后缀 `DTO` 或 `VO`，如 `UserDTO`, `ProductVO`
- **Repository**：类名后缀 `Repository`，如 `UserRepository`
- **Service 接口**：类名后缀 `Service`，如 `UserService`
- **Service 实现**：类名加 `Impl`，如 `UserServiceImpl`
- **Controller**：路由名称 + `Controller`，如 `UserController`
- **常量类**：`Constants` 或 `{Domain}Constants`

### 注解规范
- `@Entity` 注解所有实体类
- `@Repository` 注解所有 Repository
- `@Service` 注解 Service 实现类
- `@RestController` 注解 REST Controller
- `@GetMapping`, `@PostMapping` 等注解 API 方法
- 使用 `@Transactional` 处理事务

### 共同配置文件
- **application.yml**：基础配置
- **application-{profile}.yml**：环境特定配置（dev/test/prod）
- **pom.xml**：依赖管理

## 部署架构

```
Nginx 网关
   ↓
Eureka 服务注册与发现
   ↓
多个微服务实例（Docker 容器）
   ↓
PostgreSQL 集群 + RabbitMQ
```

每个微服务需要：
- application.yml
- application-dev.yml
- application-test.yml
- application-prod.yml
- pom.xml

## 代码生成目标

为上述 8 个微服务分别生成：
1. **基础模块**（每个服务）
   - 3~5 个 Entity 类
   - 3~5 个 DTO 类
   - 配置文件（4 个：基础 + 3 个环境）
   - 常量定义文件
   - 异常类文件

2. **数据层**（每个服务）
   - 3~5 个 Repository 接口
   - 每个 Repository 配套 1 个测试类

3. **业务层**（每个服务）
   - 3~5 个 Service 接口
   - 3~5 个 Service 实现类
   - 每个 Service 配套 1 个测试类

4. **API 层**（每个服务）
   - 1~2 个 Controller
   - 每个 Controller 配套 1 个测试类

5. **通用工具**
   - 工具类集合（至少 3 个）
   - 共享异常处理

**预期总文件数**：
- Entity：8 服务 × 4 个 = 32 个
- DTO：8 × 4 = 32 个
- Repository：8 × 4 = 32 个
- Repository 测试：8 × 4 = 32 个
- Service 接口：8 × 4 = 32 个
- Service 实现：8 × 4 = 32 个
- Service 测试：8 × 4 = 32 个
- Controller：8 × 2 = 16 个
- Controller 测试：8 × 2 = 16 个
- 配置文件：8 × 5 = 40 个
- 常量/异常/工具：8 × 3 = 24 个
- 其他（主类、启动配置等）：8 + 10 = 18 个

**总计约 336 个文件**
