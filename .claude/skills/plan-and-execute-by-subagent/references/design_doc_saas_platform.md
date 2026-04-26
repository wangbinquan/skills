# 多租户 SaaS 平台设计文档

## 项目概述

一个通用的多租户数据分析与报表平台（类似 Tableau/Looker），支持多个客户（租户）上传数据、构建数据集、创建仪表板和报表。

## 技术栈

- **后端**：Python 3.11 + FastAPI
- **前端**：Vue 3 + TypeScript
- **数据库**：PostgreSQL（带行级安全 RLS）
- **缓存**：Redis
- **消息队列**：Celery + Redis
- **存储**：S3 兼容存储
- **容器化**：Docker + Kubernetes

## 核心模块结构

### 1. 多租户管理模块
**文件生成数量**：约 40 个

核心实体：
- Tenant（租户）
- TenantUser（租户用户）
- TenantSubscription（订阅计划）
- TenantSettings（租户配置）
- TenantAuditLog（审计日志）

生成内容：
- 5 个模型文件（models/）
- 5 个 Schema 文件（schemas/）
- 5 个数据库迁移文件
- 3 个 Repository 文件
- 3 个 Service 文件
- 2 个 API Router 文件
- 3 个中间件文件
- 1 个认证工具模块
- 1 个权限检查模块
- 1 个租户上下文管理模块
- 1 个错误处理模块
- 1 个常量定义模块
- 8 个单元测试文件
- 1 个集成测试文件

### 2. 数据集管理模块
**文件生成数量**：约 60 个

核心实体：
- Dataset（数据集）
- DatasetColumn（列定义）
- DatasetTable（表关联）
- DatasetUpload（数据上传记录）
- DatasetPreview（数据预览缓存）

生成内容：
- 5 个模型文件
- 5 个 Schema 文件
- 5 个数据库迁移文件
- 4 个 Repository 文件
- 5 个 Service 文件（数据导入、列分析、数据预览、数据验证、缓存管理）
- 2 个 API Router 文件
- 3 个处理器文件（CSV 处理、Excel 处理、JSON 处理）
- 1 个数据类型推断模块
- 1 个数据清洗模块
- 1 个数据采样模块
- 3 个 Celery Task 文件
- 1 个异步任务监控文件
- 10 个单元测试文件
- 2 个集成测试文件

### 3. 仪表板模块
**文件生成数量**：约 80 个

核心实体：
- Dashboard（仪表板）
- DashboardLayout（布局配置）
- DashboardWidget（小部件）
- WidgetConfig（小部件配置）

生成内容：
- 4 个模型文件
- 4 个 Schema 文件
- 4 个数据库迁移文件
- 3 个 Repository 文件
- 4 个 Service 文件（仪表板管理、布局管理、小部件管理、权限管理）
- 3 个 API Router 文件
- 5 个小部件类型定义文件
- 5 个小部件配置处理文件
- 1 个仪表板渲染引擎文件
- 1 个缓存管理文件
- 1 个版本控制文件
- 1 个分享管理文件
- 3 个 Celery Task 文件
- 12 个单元测试文件
- 3 个集成测试文件

### 4. 报表模块
**文件生成数量**：约 70 个

核心实体：
- Report（报表）
- ReportSchedule（定时任务）
- ReportDelivery（传送配置）
- ReportHistory（执行历史）

生成内容：
- 4 个模型文件
- 4 个 Schema 文件
- 4 个数据库迁移文件
- 3 个 Repository 文件
- 5 个 Service 文件（报表管理、定时管理、传送管理、执行引擎、导出管理）
- 2 个 API Router 文件
- 3 个报表格式处理文件（PDF、Excel、HTML）
- 1 个邮件传送模块
- 1 个 Webhook 传送模块
- 1 个云存储上传模块
- 5 个 Celery Task 文件
- 1 个定时任务调度文件
- 10 个单元测试文件
- 2 个集成测试文件

### 5. 数据查询与分析模块
**文件生成数量**：约 50 个

核心实体：
- Query（查询）
- QueryHistory（查询历史）
- SavedQuery（保存的查询）

生成内容：
- 3 个模型文件
- 3 个 Schema 文件
- 3 个数据库迁移文件
- 2 个 Repository 文件
- 4 个 Service 文件（查询构建、查询执行、查询优化、缓存管理）
- 2 个 API Router 文件
- 1 个 SQL 构建器模块
- 1 个 SQL 验证器模块
- 1 个查询执行器模块
- 1 个查询结果处理模块
- 1 个缓存管理模块
- 3 个 Celery Task 文件
- 8 个单元测试文件
- 2 个集成测试文件

### 6. 用户与权限模块
**文件生成数量**：约 50 个

核心实体：
- User（用户）
- UserRole（用户角色）
- Permission（权限）
- RolePermission（角色权限）

生成内容：
- 4 个模型文件
- 4 个 Schema 文件
- 4 个数据库迁移文件
- 3 个 Repository 文件
- 4 个 Service 文件（用户管理、角色管理、权限管理、认证）
- 2 个 API Router 文件
- 1 个 JWT 管理模块
- 1 个密码加密模块
- 1 个权限检查装饰器
- 1 个角色检查装饰器
- 1 个审计日志记录模块
- 8 个单元测试文件
- 2 个集成测试文件

### 7. 通知与告警模块
**文件生成数量**：约 40 个

核心实体：
- Notification（通知）
- Alert（告警）
- AlertRule（告警规则）

生成内容：
- 3 个模型文件
- 3 个 Schema 文件
- 3 个数据库迁移文件
- 2 个 Repository 文件
- 3 个 Service 文件（通知管理、告警管理、告警引擎）
- 1 个 API Router 文件
- 1 个邮件发送模块
- 1 个短信发送模块
- 1 个推送通知模块
- 1 个 Webhook 触发模块
- 2 个 Celery Task 文件
- 1 个告警规则评估引擎
- 6 个单元测试文件
- 1 个集成测试文件

### 8. 系统管理与监控模块
**文件生成数量**：约 35 个

核心实体：
- SystemMetrics（系统指标）
- LogEntry（日志条目）
- HealthCheck（健康检查）

生成内容：
- 3 个模型文件
- 3 个 Schema 文件
- 3 个数据库迁移文件
- 2 个 Repository 文件
- 3 个 Service 文件（指标收集、日志管理、健康检查）
- 1 个 API Router 文件
- 1 个 Prometheus 集成模块
- 1 个 ELK 日志发送模块
- 1 个性能分析工具
- 1 个内存监控工具
- 1 个数据库连接池管理模块
- 5 个单元测试文件
- 1 个集成测试文件

### 9. 配置与初始化
**文件生成数量**：约 30 个

生成内容：
- 1 个主配置文件
- 3 个环境配置文件（dev/test/prod）
- 1 个日志配置文件
- 1 个依赖注入配置文件
- 1 个数据库连接配置文件
- 1 个缓存配置文件
- 1 个消息队列配置文件
- 1 个存储配置文件
- 1 个API 文档配置文件
- 1 个安全配置文件
- 1 个 CORS 配置文件
- 1 个启动事件处理文件
- 1 个关闭事件处理文件
- 1 个数据库迁移脚本
- 1 个初始化脚本
- 1 个常量定义文件
- 1 个枚举定义文件
- 1 个全局异常处理文件
- 1 个中间件注册文件
- 1 个路由注册文件
- 1 个 Docker 相关文件（Dockerfile、docker-compose.yml、.dockerignore）
- 1 个 Kubernetes 配置文件（deployment.yaml、service.yaml）
- 1 个 CI/CD 配置文件（.github/workflows/）

### 10. 工具与库
**文件生成数量**：约 25 个

生成内容：
- 1 个数据验证工具
- 1 个日期时间工具
- 1 个字符串处理工具
- 1 个文件处理工具
- 1 个加密工具
- 1 个 HTTP 请求工具
- 1 个异步任务工具
- 1 个缓存工具
- 1 个分页工具
- 1 个排序工具
- 1 个数据转换工具
- 1 个 API 响应包装工具
- 1 个错误响应生成工具
- 1 个日志工具
- 1 个性能监控工具
- 1 个邮件模板引擎
- 1 个文件上传管理工具
- 1 个数据导出工具
- 1 个定时任务调度工具
- 1 个消息队列管理工具
- 1 个限流工具
- 1 个重试机制工具
- 1 个事务管理工具
- 1 个上下文管理工具
- 1 个装饰器集合文件

## 代码生成总体统计

| 模块 | 文件数量 |
|------|---------|
| 多租户管理 | 40 |
| 数据集管理 | 60 |
| 仪表板 | 80 |
| 报表 | 70 |
| 查询与分析 | 50 |
| 用户与权限 | 50 |
| 通知与告警 | 40 |
| 系统管理 | 35 |
| 配置与初始化 | 30 |
| 工具与库 | 25 |
| **总计** | **480** |

## 编码规范

### 目录结构
```
project/
  app/
    core/              # 核心功能（认证、权限、异常）
    modules/           # 业务模块
      tenant/          # 租户管理
      dataset/         # 数据集管理
      dashboard/       # 仪表板
      report/          # 报表
      query/           # 查询分析
      user/            # 用户权限
      notification/    # 通知告警
      system/          # 系统管理
    utils/             # 工具函数
    config/            # 配置文件
    models/            # 数据模型（定义在各模块下）
  tests/               # 测试文件
  migrations/          # 数据库迁移
  scripts/             # 脚本文件
  docs/                # 文档
  docker-compose.yml
  Dockerfile
  requirements.txt
  .env.example
  README.md
```

### 命名约定
- **模块名**：全小写，多词用下划线，如 `user_service.py`, `dashboard_model.py`
- **类名**：PascalCase，如 `UserService`, `DashboardModel`
- **函数/方法名**：snake_case，如 `get_user_by_id`, `create_dashboard`
- **常量名**：UPPER_SNAKE_CASE，如 `MAX_UPLOAD_SIZE`, `DEFAULT_PAGE_SIZE`
- **文件名**：snake_case，如 `user_service.py`, `dashboard_router.py`

### 模块内部结构
```
app/modules/{module_name}/
  __init__.py
  models.py         # SQLAlchemy 模型
  schemas.py        # Pydantic Schema（DTO）
  repository.py     # 数据访问层
  service.py        # 业务逻辑层
  router.py         # API 路由
  exceptions.py     # 模块特定异常
  constants.py      # 模块常量
  utils.py          # 模块工具函数
  tests/
    __init__.py
    test_models.py
    test_service.py
    test_router.py
```

### 装饰器与通用模式
- 使用 `@app.middleware` 实现多租户隔离
- 使用自定义装饰器 `@require_permission("permission_name")` 检查权限
- 使用 `@async_task` 将长时间操作转为异步任务
- 使用 `@cache_result(ttl=3600)` 缓存查询结果
