# Lesson Taxonomy（分类法）

本经验库采用 **单主分类 + 多维标签** 治理：
- **主分类（primary category）**：每条经验恰好一个，落到 `categories/<category>.md`
- **标签（tags）**：每条经验可携带多个，常见维度为 lang / layer / severity / status / source

> 主分类是**变更控制**项：新增 / 重命名 / 合并主分类**必须**同步更新本文件、`INDEX.md`、对应的 `categories/<x>.md` 与 `archive/<x>.md`。

---

## 1. 主分类清单（17 项）

| ID | 主分类 | 涵盖范围 | 典型例子 |
|----|--------|----------|----------|
| `null-safety` | 空值与未初始化 | NPE / nil panic / undefined / Optional 解包 / map 默认值 | `new User()` 后立即 `.getName()` |
| `resource-leak` | 资源泄漏 | 连接、文件句柄、锁、定时器、stream / 协程 / goroutine 未关闭 | DB 连接未在 finally 关闭 |
| `concurrency` | 并发与同步 | 数据竞争、死锁、原子性、共享可变状态、线程/协程/goroutine 泄漏 | 同一 map 在两个 goroutine 中写入导致 panic |
| `performance` | 性能热点 | N+1、循环内 IO/RPC、O(n²)、热路径序列化、同步阻塞 | 列表页对每行执行一次 SELECT |
| `memory` | 内存管理 | 无界集合、缓存无 TTL/无淘汰、字符串拼接、流未消费、大对象常驻 | 用 ArrayList 一次装百万级行导致 OOM |
| `error-handling` | 错误处理与异常传播 | 吞异常、retry 风暴、分级缺失、上下文丢失、可重试与不可重试不分 | `catch(Exception)` 后只 log warn 不抛 |
| `external-resilience` | 外部调用韧性 | 超时、熔断、限流、降级、幂等键 | HTTP 调用没设 ConnectTimeout |
| `api-contract` | 接口契约 | URL / method / 字段 / 错误码 / 鉴权 / 版本兼容 | 旧客户端不带 X-Version 被新版拒掉 |
| `data-consistency` | 数据一致性 | 事务边界、缓存与 DB 不一致、读写顺序、缺乐观锁、事务中跨网络调用 | 写 DB 后才发 MQ 导致丢消息 |
| `boundary` | 边界条件 | 空集合 / 零除 / 整数溢出 / off-by-one / 负数 / 空字符串 / 超大输入 DoS | 空数组求平均值除以 0 |
| `observability` | 可观测性 | 日志 / 指标 / trace 缺失或滥用、缺关联 ID、错误路径无诊断信息 | 错误路径无 ERROR 级日志 |
| `config-environment` | 配置与环境 | 默认值不合理、env 未校验、池大小、特性开关、硬编码常量 | DB 池大小硬编码 10，高并发饿死 |
| `time-encoding` | 时间与编码 | 时区 / DST / Unicode / charset / 时间戳精度 | 用 LocalDateTime 存历史时间没带时区 |
| `security` | 安全 | 鉴权 / 注入 / 越权 / 密钥泄漏 / token 写日志 | token 被写入 INFO 日志 |
| `testing` | 测试与可测性 | mock 误用、flaky test、覆盖率盲点、单测过但集成挂 | mock 数据库导致迁移脚本未被覆盖 |
| `build-tooling` | 构建与工具链 | 依赖 / 构建脚本 / CI / 本地与 CI 差异 / 供应链 | Docker base 升级导致行为漂移 |
| `process-collab` | 流程与协作 | 评审 / 发布 / 回滚 / 文档 / 沟通 / 责任边界（多数应入团队 wiki，但若直接关系到代码仓使用习惯，可入库） | 上线无 rollback plan |

> ⚠️ **`security` 类目的特殊提示**：本类目仅作为已发现安全问题的归档；安全漏洞的深度分析和修复请使用专门的安全工具。lesson 内容应聚焦"教训本身"，不堆砌 CVE / 攻击链细节。

---

## 2. 标签维度

### lang（语言）
- `lang:java` / `lang:python` / `lang:go` / `lang:cpp` / `lang:scala` / `lang:rust` / `lang:javascript` / `lang:typescript`
- 与具体语言无关时**省略**（许多 concurrency / data-consistency 类经验是跨语言的，不强求 lang 标签）

### layer（架构层次）
- `layer:infrastructure` — OS / 容器 / 网络 / 内核
- `layer:framework` — 中间件 / 框架 / SDK
- `layer:business` — 业务逻辑
- `layer:datastore` — 数据库 / 缓存 / 队列
- `layer:ui` — 前端 / 用户界面

### severity（严重度）
- `severity:blocker` — 阻断上线 / 阻断核心流程
- `severity:critical` — 高概率引发线上事故
- `severity:major` — 影响功能但有 workaround
- `severity:minor` — 体验或可维护性问题
- `severity:info` — 提示性 / 风格建议

### status（成熟度）
- `status:active` — 首次记录，待二次验证
- `status:validated` — 在 ≥2 个不同上下文复现确认
- `status:stable` — 已固化为团队规范 / 自动化规则
- `status:superseded` — 被新条目取代
- `status:deprecated` — 上下文已失效

### source（来源）
- `source:incident` — 线上事故
- `source:debug` — 调试会话
- `source:review` — 代码评审
- `source:postmortem` — 复盘会议
- `source:perfteam` — 压测/性能演练
- `source:secaudit` — 安全审计
- `source:userreport` — 用户/客户报障

---

## 3. 何时新增主分类

只有当**连续 ≥3 条经验**都找不到合适归属，或用户明确希望增加，才扩充。新增主分类必须：
1. 在本文件添加一行（含范围 + 典型例子）
2. 在 `INDEX.md` 的"By category"段添加一行
3. 在 `categories/` 下新建对应文件（用 `assets/category.md.template` 初始化）
4. 在 `archive/` 下新建对应空文件

新增主分类**必须用户确认**。

---

## 4. 何时拆分一条经验为多条

如果一条经验同时跨多个主分类，**不要选其一**——而是拆成多条 lesson，分别落在各自主分类中，并通过 Related 字段相互引用。

**例**：一次事故同时暴露了"无超时（external-resilience）"+"无降级（external-resilience）"+"日志缺失（observability）"+"未在 postmortem 中复盘（process-collab）"——可以是 1 个 postmortem + 3~4 条 lesson，互相 Related。

拆分能让每条 lesson 独立可被检索、独立升降级、独立反哺到不同 skill。

---

## 5. 反向：何时合并多条经验

如果发现同一根因被分别归在两个主分类下，且双方都讨论的是**同一抽象规则**——考虑合并：
1. 走 SUPERSEDE 流程
2. 选择更"上位"的主分类（如 concurrency vs synchronization-primitive，留 concurrency）
3. 旧条目走 archive，新合并条目重新分配 ID（不复用）

合并比拆分罕见。除非有强证据，宁可保留两条 + Related。
