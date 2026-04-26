# 九大一致性维度核对要点

> 本文件供盘点 subagent（抽取待验证项时使用）与核对 subagent（核对时使用）共同 Read。
> 每个维度都给出：**核对什么 / 设计文档常见出处 / 代码常见出处 / 容易漏掉的盲点 / 双向核对方向**。

---

## 1. 结构（structure）

### 核对什么
- 类、接口、抽象类、枚举、record、struct、trait 等顶层声明的**存在性**
- 类的**类型**（class / interface / abstract / enum / sealed / final）
- **继承 / 实现**关系链
- **字段**：名称、类型、可见性、final/static/const、默认值、关键注解（`@NotNull` / `@Column` / `@JsonProperty` 等）
- **方法签名**：名称、参数（顺序 / 类型 / 数量 / 是否可变参 / 默认值）、返回类型、抛出异常列表、关键注解
- **可见性修饰符**与**封闭性**（package-private、protected、internal、pub(crate)、export 与否）
- **包路径 / 模块路径 / 命名空间**
- **泛型**：类型参数列表、上下界约束、协变逆变
- **构造函数 / 析构 / Drop / Dispose** 的存在性与签名

### 设计文档常见出处
- 类图（PlantUML、Mermaid classDiagram、UML 截图）
- "类清单 / 接口清单"表
- "字段定义"小节
- 接口签名代码块

### 代码常见出处
- 业务源码主目录（`src/main/<lang>/...` 等）
- 公共 API 模块、SPI 模块
- generated 目录（如 protobuf、openapi）—— 注意区分：generated 代码与设计是同源关系，不算"代码超出设计"

### 容易漏掉的盲点
- **泛型边界静默放宽**：设计写 `Repository<T extends BaseEntity>`，代码写成 `Repository<T>` —— 编译能过但语义弱化。
- **包私有 vs public**：设计意图把内部类设为包私有，代码漏写 `public` 导致跨模块滥用。
- **方法重载与覆盖**：设计列出一个签名，代码实际有多个重载；要核对每个重载是否都符合设计意图。
- **隐式构造函数**：Java/Kotlin 编译器自动给的无参构造与设计要求"必须传 X"冲突。
- **接口默认实现**：Java 8+/Scala/Kotlin 的 default 方法可能实质改变继承体系。
- **静态方法与单例**：设计画的是普通类，代码却用了 object/static utility 模式。

### 双向核对方向
- **设计 → 代码**：设计每条字段 / 方法是否能在代码里 grep 到对应签名。
- **代码 → 设计**：代码中 `public` 类与 `public` 方法是否都有设计依据；找出"代码出口面"超出设计的部分（潜在的隐式 API）。

---

## 2. 行为（behavior）

### 核对什么
- **业务规则**：设计中的"必须 / 应当 / 不得"句式逐条核对（如"金额 ≤ 0 时必须拒绝"）
- **状态机**：所有状态、所有合法转移、非法转移的拒绝处理、终态语义、持久化
- **算法**：复杂度（设计要求 O(log n) 是否落地为二分而非线性扫）、精度（BigDecimal vs double）、边界（空、极大、NaN、负数、Unicode、重复元素）
- **流程顺序**：与时序图的调用顺序、参数流向、回调时机一致
- **异常分支**：每条业务异常是否都被显式抛出与捕获，未捕获的异常是否会冒泡到设计声明的边界
- **回滚 / 补偿语义**：事务边界、Saga 补偿步骤、对账机制
- **幂等性**：幂等键、幂等窗口、重复请求处理
- **重试 / 超时**：重试次数、退避策略、总超时
- **并发语义**：线程安全、锁粒度、CAS、原子操作、是否存在 ABA、读写一致性

### 设计文档常见出处
- 业务规则表 / 决策表
- 状态机图（PlantUML state、Mermaid stateDiagram）
- 时序图
- 异常码表
- 算法伪代码块

### 代码常见出处
- Service / UseCase / Domain 层
- 状态机配置（Spring Statemachine、akka FSM）
- 事务注解处
- try/catch 块
- 重试装饰器（Spring `@Retryable`、Resilience4j、go-retry）

### 容易漏掉的盲点
- **状态机的"非法转移"没显式拒绝**：代码默认 fallthrough，业务上可能制造脏数据。
- **异常被静默吞没**：`catch (Exception e) { /* ignore */ }` —— 设计写明要抛，但代码偷偷吞了。
- **`@Transactional` 漏标 / 错标**：Spring 中 self-invocation、private 方法、`rollbackFor` 缺失。
- **重试嵌套放大**：上层与下层都配了重试，导致总重试次数指数级。
- **算法常数因子失控**：复杂度对但常数巨大，例如每次循环都 new 大对象。
- **并发原语错配**：设计要求"无锁"，代码用了 synchronized；或反过来该用锁却用了普通字段。

### 双向核对方向
- **设计 → 代码**：每条业务规则、每个状态转移是否都能在代码定位到对应分支。
- **代码 → 设计**：代码中存在但设计没提的状态分支（例如多了一个"暂停"状态），或捕获了设计未声明的异常类型。

---

## 3. 接口契约（api）

### 核对什么
- **路由 URL**：路径、版本号、占位参数命名
- **HTTP 方法**（GET/POST/PUT/PATCH/DELETE）；RPC 服务名 + 方法名
- **请求字段**：名称、类型、必填、长度 / 格式 / 取值范围、默认值
- **返回字段**：同上；包含错误响应体格式
- **错误码**：业务错误码与 HTTP 状态码的对应；错误消息模板
- **鉴权方式**：是否需要登录、需要哪些角色 / 权限 / 作用域
- **幂等头**（`Idempotency-Key`）、限流头、版本协商头
- **Content-Type / 序列化**：JSON / Protobuf / FormData
- **分页 / 排序 / 过滤**约定
- **版本兼容策略**：是否破坏性变更、是否走 v2 路径

### 设计文档常见出处
- 接口表
- OpenAPI / Swagger / Protobuf 定义
- curl / HTTP 示例代码块
- "鉴权与权限"小节

### 代码常见出处
- Controller（Spring `@RestController`、Express `app.get`、Gin `r.GET`）
- gRPC service impl、Protobuf 文件
- DTO / Request / Response 类
- 全局异常处理器（`@ControllerAdvice`、Express middleware）
- 鉴权拦截器 / Guard / Filter

### 容易漏掉的盲点
- **请求字段类型放宽**：设计写 `int32`，代码用了 `string` 然后内部转。
- **可选字段静默必填**：DTO 用了基本类型 `int` 而非 `Integer`/`Optional`，反序列化失败。
- **错误码字符串化**：设计要求数字 `40001`，代码返了字符串 `"INVALID_INPUT"`。
- **鉴权遗漏**：忘加 `@PreAuthorize` / 忘进路由 group。
- **CORS / CSRF 配置静默放开**。
- **响应字段大小写或下划线风格不一致**（`createdAt` vs `created_at`），破坏前端契约。
- **gzip / charset 默认值差异**导致字符串截断。

### 双向核对方向
- **设计 → 代码**：每个接口、每个字段、每个错误码都能在代码定位。
- **代码 → 设计**：扫描所有 controller / 路由，找出设计未声明的接口（隐式 API、调试接口、actuator 端点暴露）。

---

## 4. 数据模型（data）

### 核对什么
- **实体 / DTO / PO / VO** 的字段、类型、约束
- **数据库表**：表名、字段名、类型、长度、可空性、默认值、注释、字符集
- **索引**：主键、唯一索引、普通索引、覆盖索引、组合索引顺序
- **外键 / 约束**：CHECK 约束、FK 关系、级联策略
- **枚举**：取值集合、序列化形式（数字 vs 字符串）、新增枚举值的兼容性
- **迁移脚本**：Liquibase / Flyway / Alembic / golang-migrate / TypeORM migration
- **幂等键 / 唯一键**：业务幂等列与唯一索引是否对齐
- **软删除**：deleted_at / is_deleted 字段是否齐备，查询是否都过滤
- **审计字段**：created_at / created_by / updated_at / updated_by / version

### 设计文档常见出处
- ER 图
- 字段定义表
- "数据迁移方案"小节
- DDL 代码块

### 代码常见出处
- ORM 实体（JPA、MyBatis Plus、SQLAlchemy、GORM、TypeORM、Diesel）
- 迁移脚本目录
- DDL SQL 文件
- DTO / 请求响应类

### 容易漏掉的盲点
- **ORM 实体与 DDL 不同步**：实体加了字段，DDL 没补迁移脚本。
- **VARCHAR 长度不一致**：设计 256，代码 255 或 1024，报错或浪费空间。
- **DECIMAL 精度漂移**：金额字段 `(15,2)` vs `(18,4)` —— 计算结果差一分钱。
- **枚举数字化但数据库存字符串**，序列化点错配。
- **复合唯一索引顺序**：`(tenant_id, email)` vs `(email, tenant_id)`，查询性能天差地别。
- **软删除字段未加索引**：低 cardinality 全表扫。
- **迁移脚本缺回滚（down）**。

### 双向核对方向
- **设计 → 代码**：每个表 / 字段 / 索引在 DDL 与 ORM 实体中都齐全。
- **代码 → 设计**：实体与 DDL 中存在的"额外字段"（开发自己加的）是否在设计中有出处。

---

## 5. 配置（config）

### 核对什么
- **配置项**：key 名、类型、默认值、单位、必填、来源（文件 / 环境变量 / 配置中心）
- **特性开关 / 灰度比例**
- **敏感配置**：是否经由 secret manager / vault，禁止明文落配置文件
- **多环境配置**：dev / staging / prod 之间是否一致；prod 不应包含调试开关
- **配置中心 watcher**：动态刷新边界（哪些 key 支持热更新）
- **超时 / 重试 / 限流值**与设计承诺的 SLA 对齐
- **资源池**：DB 连接池大小、Redis pool、HTTP client max conn

### 设计文档常见出处
- "配置说明"表
- 示例 application.yml / .env 代码块
- "运维 & 部署"小节

### 代码常见出处
- application.yml / application.properties / .env / config.toml / settings.py
- ConfigMap / Helm values
- @ConfigurationProperties / pydantic Settings / viper / config-rs
- 默认值常量

### 容易漏掉的盲点
- **代码里硬编码默认值与配置不一致**：`@Value("${x:30}")` 默认 30，设计文档写默认 60。
- **环境变量名大小写 / 分隔符差异**：`USER_TIMEOUT` vs `USER.TIMEOUT`。
- **被静默忽略的配置**：业务里 `if (cfg.featureX)` 被 dead code 包住，开关无效。
- **prod 配置仍指向测试服务器**。
- **Spring Profile 命名不一致**：`prod` vs `production`。
- **超时单位混用**：秒 vs 毫秒。

### 双向核对方向
- **设计 → 代码**：每个配置项都能在配置文件 + 代码中找到 binding。
- **代码 → 设计**：配置文件中存在但设计未提的 key（隐式扩展、遗留、调试开关）。

---

## 6. 依赖（dependency）

### 核对什么
- **第三方库**：是否都在依赖声明中（pom.xml、build.gradle、package.json、Cargo.toml、go.mod、requirements.txt、build.sbt）
- **版本约束**：与设计要求的版本是否对齐（特别是有安全 CVE 修复的版本下限）
- **依赖范围**：compile / runtime / test / provided / dev
- **传递依赖与 BOM**：是否有版本冲突或被传递依赖意外升级
- **外部服务依赖**：DB、Redis、MQ、第三方 API
- **JNI / 本地库 / 系统命令**：设计是否声明
- **License 合规**：禁止引入 GPL/AGPL（如设计文档有合规声明）

### 设计文档常见出处
- "技术栈选型"小节
- "外部依赖"清单
- 部署架构图

### 代码常见出处
- 依赖声明文件（同上）
- import 语句的扫描结果
- DI 容器配置（注册了哪些 bean）
- docker-compose / kubernetes manifest（外部服务）

### 容易漏掉的盲点
- **未声明就 import**：在某些语言中（Python、JS）能借用其他依赖传递引入；切换运行时即崩。
- **版本范围过宽**：`^1.2.3` 实际拉到 `1.9.x` 引入破坏性变化。
- **设计未提的"调试用依赖"**留在生产 build 里。
- **shaded / vendored 依赖**导致版本判断不准。
- **重复实现**：设计要求用 Apache Commons，代码却引入 Guava 同名工具。

### 双向核对方向
- **设计 → 代码**：每个声明的依赖都被实际使用（防止"声明了但没引入"）。
- **代码 → 设计**：每个被使用的依赖都有设计依据（防止"野生引入"）。

---

## 7. 非功能（nfr）

### 核对什么
- **日志埋点**：设计要求的关键节点（入参 / 出参 / 异常 / 状态迁移 / 外部调用）是否都打了日志；级别是否合理；脱敏是否到位
- **监控指标**：metrics（counter / gauge / histogram）是否埋点；指标命名规范；标签维度
- **链路追踪**：trace_id / span_id 是否传递；跨服务调用是否打 span
- **健康检查 / 就绪检查**：是否实现 `/health`、`/ready`
- **安全**：
  - 鉴权 / 授权点是否齐全
  - 敏感数据脱敏（密码、令牌、身份证、手机号、银行卡、医疗信息）
  - 加密：传输 TLS / 存储加密 / 密钥管理
  - 输入校验、SQL 注入 / XSS / CSRF / SSRF / 反序列化攻击
- **性能**：
  - 缓存策略（设计要求 Redis 缓存的是否真的接了缓存，还是直连 DB）
  - 批量 / 流式处理
  - N+1 查询
  - 异步化点
- **可用性**：
  - 熔断 / 降级（Hystrix / Resilience4j / go-circuitbreaker）
  - 限流（令牌桶 / 漏桶 / 滑动窗口）
  - 优雅关机（shutdown hook）

### 设计文档常见出处
- "可观测性"、"安全合规"、"性能 & 容量规划"小节
- 监控大盘截图

### 代码常见出处
- logger 调用点
- micrometer / prometheus client / opentelemetry SDK
- 鉴权 filter / interceptor
- 缓存注解（`@Cacheable`、go-cache）
- 限流 / 熔断装饰器

### 容易漏掉的盲点
- **日志打了但级别错**：业务流量级 INFO 打成 ERROR 触发误告警。
- **指标只在快乐路径打**，异常路径无埋点。
- **trace_id 没透传到异步线程**。
- **脱敏不彻底**：日志里 `password=***` 但 trace 里全文打了。
- **缓存不一致**：设计要求 cache-aside，代码写成 write-through 却没双写失败补偿。
- **限流键选错**：按 IP 限流但用户都过 NAT 同 IP。

### 双向核对方向
- **设计 → 代码**：每个 NFR 要求是否都有落地的代码 / 配置依据。
- **代码 → 设计**：代码中存在的"未在设计声明"的非功能能力（例如悄悄上了一套 cache 但没说），可能是隐性技术债。

---

## 8. 测试（test）

### 核对什么
- **关键分支覆盖**：设计中标注 "P0" 的业务规则是否都有 UT 覆盖
- **边界用例**：边界值、空、极大、负数、Unicode、并发
- **异常路径**：每个声明的异常类型是否都有用例触发
- **集成测试关键流程**：状态机的端到端转移、跨服务调用
- **契约测试**：与外部服务的契约（pact、Spring Cloud Contract）
- **性能测试**：是否有压测脚本，对应设计的 QPS / 延迟 SLA
- **安全测试**：鉴权失败用例、注入攻击用例
- **测试金字塔比例**是否合理（不强制，但严重失衡可标 minor）

### 设计文档常见出处
- "验收标准 / 测试策略"小节
- "性能与容量"小节

### 代码常见出处
- src/test 目录
- *_test.go / *.spec.ts / test_*.py
- conftest.py / fixtures
- benchmark / load test 目录

### 容易漏掉的盲点
- **UT 看似多但只断言 happy path**。
- **mock 过深**导致 UT 只验证 mock 自身。
- **flaky test**：依赖时间 / 顺序 / 网络。
- **没有 negative test**。
- **集成测试用真实数据库但事务未回滚**，造成数据残留。

### 双向核对方向
- **设计 → 代码**：设计声明的关键场景是否都有测试。
- **代码 → 设计**：测试覆盖的范围是否反过来揭示了"设计漏说"的需求（这是高价值的发现）。

---

## 9. 文档（doc）

### 核对什么
- **代码注释（Javadoc / docstring / KDoc / TSDoc）** 与设计是否一致：方法语义、参数、异常、并发约定
- **README** 是否更新（构建、运行、部署、依赖说明）
- **API 文档**（OpenAPI、API Blueprint）与代码实际行为是否一致
- **CHANGELOG / ADR**（架构决策记录）：重要决策是否归档
- **运维手册 / Runbook**：故障处理、重启步骤、应急联系人
- **示例代码 / 教程**：是否仍可运行（chunked example）

### 设计文档常见出处
- "文档交付物"小节
- "API 文档约定"小节

### 代码常见出处
- 源码注释
- README.md / CONTRIBUTING.md
- docs/ 目录
- openapi.yaml / swagger.json

### 容易漏掉的盲点
- **注释滞后**：函数行为变了，注释还是上一版。
- **OpenAPI 是手写的，与实际 controller 漂移**。
- **README 的"快速开始"已经跑不通**（依赖换了、命令换了）。
- **代码示例硬编码了已变更的字段名**。

### 双向核对方向
- **设计 → 代码**：设计要求文档化的内容是否文档化。
- **代码 → 设计**：代码中含 `@deprecated` 但设计未声明的，需要审视是否要在设计中显式承认弃用。

---

## 维度间的耦合关系（核对时注意）

| 关联 | 含义 |
|------|------|
| structure ↔ data | DTO 字段与表字段是否对齐 |
| structure ↔ api | Controller 方法签名与路由契约是否对齐 |
| behavior ↔ test | 业务规则与测试用例是否对应 |
| nfr (security) ↔ api | 鉴权要求与路由 guard 是否对齐 |
| config ↔ nfr | 超时配置与熔断阈值是否互不矛盾 |
| dependency ↔ structure | 引入的库是否真的在结构中被使用 |
| doc ↔ api | OpenAPI 与实际路由是否同步 |

清单中的"关联项"字段可填这些耦合，便于阶段 5.3 综合校验时检测矛盾。

---

## 维度跳过的合理理由（不算违规）

| 维度 | 合理跳过情形 |
|------|-------------|
| data | 设计是纯算法库 / 工具类，不涉及持久化 |
| api | 设计是内部 SDK / CLI，不暴露 HTTP/RPC |
| nfr (caching) | 设计明确"无缓存"，并在跳过说明中引用此约束 |
| test | 用户明确"先做结构核对，UT 单独审"——但此时**严重度提示一档**：若代码已上线却跳过测试维度，需在交付报告显式提醒 |
| doc | 内部一次性脚本，无文档要求 |

跳过时必须在清单"维度跳过说明"小节登记 `dimension`、`reason`、`risk_acknowledgment`。
