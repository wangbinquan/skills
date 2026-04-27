---
name: code-issue-reviewer
description: 用来在代码上线前以 SRE 视角**系统性审视整个代码仓**、找出"最容易把人 page 起来"的常见质量与稳定性问题的专业技能。当用户提到「代码检视 / 代码评审 / code review / 上线前检查 / production readiness / prod readiness / 现网问题预防 / 找代码问题 / 找 bug / 隐患排查 / 代码体检 / 质量审视 / 稳定性审视 / SRE 审视 / 排查空指针 / 排查 NPE / nil panic / OOM 风险 / 内存泄漏 / 性能瓶颈 / N+1 / 资源泄漏 / 并发问题 / 竞态 / data race / goroutine 泄漏 / 错误处理 / 异常吞没 / retry 风暴 / 没有超时 / 缺熔断 / 边界条件 / 整数溢出 / 时区问题 / 缓存击穿」等意图，或在合并 PR、上线前、Hotfix 后、压测发现回归、生产事故复盘后、希望"防止下一次"时，**主动触发**本技能。覆盖 13 大稳定性维度——(1) 空值/未初始化（NPE / nil panic / undefined / Optional 解包 / map 未判存在）；(2) 资源泄漏（连接 / 文件句柄 / 锁 / goroutine / 定时器 / stream 未关闭，缺 defer/try-with-resources/finally）；(3) 并发安全（数据竞争、共享可变状态、死锁、原子性破坏、错误的 volatile/Atomic 使用）；(4) 性能热点（N+1 查询、循环内 IO/RPC、O(n²) 嵌套、热路径序列化、同步阻塞）；(5) 内存爆炸（无界集合、全量加载、缓存无 TTL/无淘汰、字符串拼接、流未消费、大对象常驻）；(6) 错误处理（吞异常、错误码丢失、无差别 ERROR、retry 无退避、不区分可重试/不可重试）；(7) 外部调用韧性（缺超时、缺熔断、缺限流、缺降级、缺幂等键、retry 风暴）；(8) 边界条件（空集合、零除、整数溢出、off-by-one、负数、空字符串、超大输入 DoS）；(9) 可观测性（关键路径无日志/无指标/无 trace、错误路径缺诊断信息、缺关联 ID）；(10) 配置与环境（硬编码常量、env 未校验、池大小/超时默认值不合理）；(11) 数据一致性（事务边界错、缺乐观锁、读写顺序错、缓存与 DB 不一致、事务中跨网络调用）；(12) 时间与编码（本地时区做存储、DST、Unicode 比较、charset 假设、时间戳精度丢失）；(13) API 兼容性（破坏性字段变更、枚举新增无默认、版本回退）。每条发现给出维度、严重程度（blocker / critical / major / minor / info）、文件:行号、代码片段、风险描述、修复建议。**只审计、不改代码**——所有发现以可执行修复 TODO 形式落盘。**安全维度不在本 skill 范围内**——若发现疑似安全问题，在报告中提示用户切到 `/security-review`。**不自动调用其他 agent**——交付报告后由用户自行决定下一步。支持 Java、C++、Scala、Python、Go、Rust、JavaScript、TypeScript 八种语言，按检测结果只加载对应 references。**支持断点续作**：启动时先在仓根目录查找 `*-code-review-issues.md` 进度文件；存在且结构完整则按 pending 项续作。**主流程**：盘点 subagent 扫描整仓→建立"待检视文件清单（含风险预判 hint）"→主上下文校验→语言检测→批次派发审视 subagent（每 batch 5~10 个文件，每 wave 5~8 batch 并行；每 subagent 对所拿文件按 13 维度逐一过 checklist）→每 wave 回写状态并反思→pending 收敛后产出问题矩阵 + 严重程度分桶 + 可操作修复清单。**全流程自动化**——仅在硬阻塞（仓库规模超大无法限定范围、语言无法识别、连续补发失败）时暂停。
---

# SRE 视角代码问题检视技能（Code Issue Reviewer）

## 概述

这个 skill 围绕一件事：**给我一个代码仓，告诉我这堆代码里有哪些"会在凌晨三点把 oncall 叫起来"的常见问题**。

定位：**横切 / 上线闸门**。与 `design-code-consistency-checker`（设计 vs 代码）平行——后者管"设计的有没有做"，本 skill 管"做出来的代码本身有没有踩坑"。

---

## 职责边界

**做什么**：
- 全仓扫描，识别 13 个 SRE 高频踩坑维度的具体问题
- 每条发现给出文件:行号 + 代码证据 + 风险描述 + 严重度 + 修复建议
- 按严重度分桶交付报告，附"修复 TODO"清单

**不做什么**：
- **不改代码**（修复留给用户自行调用 `tdd-impl-runner` 或手工改）
- **不补单测**（如发现关键路径无测试，列入维度 9 的发现，但不调用 `unit-test-runner`）
- **不补日志**（如发现可观测性缺口，给出建议，但不调用 `business-logging`）
- **不审安全**（疑似安全问题——SQL 注入、XSS、硬编码密钥等——只在报告中以"提示项"形式列出，引导用户走 `/security-review`，本 skill 不做深入安全分析）
- **不追风格 / 命名 / 注释**（除非这些直接造成稳定性风险，例如误导性命名导致空值假设错误）
- **不重新生成骨架**

**不自动调用其他 skill / agent**——所有"建议下一步"以文字形式写入交付报告 TODO 区，由用户决定。

---

## 13 大检视维度速览

完整核对要点（每维度的"看什么、怎么找、什么是 critical / major / minor"）见 `references/dimensions.md`，**审视 subagent 必读**，主上下文不在此加载。

| # | 维度 (key) | 一句话主题 |
|---|------|-----------|
| 1 | `null_safety` 空值与未初始化 | NPE / nil panic / undefined / Optional 误用 |
| 2 | `resource_leak` 资源泄漏 | 连接 / 句柄 / 锁 / goroutine / 定时器 / stream 未关 |
| 3 | `concurrency` 并发安全 | 竞态 / 死锁 / 原子性破坏 / 错误同步 |
| 4 | `performance` 性能热点 | N+1 / 循环 IO / O(n²) / 热路径阻塞 |
| 5 | `memory` 内存爆炸 | 无界集合 / 全量加载 / 缓存无界 / 大对象 |
| 6 | `error_handling` 错误处理 | 吞异常 / cause 丢失 / 无差别 ERROR |
| 7 | `external_call` 外部调用韧性 | 缺超时 / 缺熔断 / 缺幂等 / retry 风暴 |
| 8 | `boundary` 边界条件 | 空 / 零 / 溢出 / off-by-one / 超大输入 |
| 9 | `observability` 可观测性 | 关键路径无日志/指标/trace |
| 10 | `config_env` 配置与环境 | 硬编码 / 默认值不合理 / env 未校验 |
| 11 | `data_consistency` 数据一致性 | 事务边界 / 乐观锁 / 缓存一致性 |
| 12 | `time_encoding` 时间与编码 | 时区 / DST / Unicode / charset |
| 13 | `api_compat` API 兼容性 | 破坏性变更 / 枚举默认 / 版本 |

严重度分级矩阵见 `references/severity.md`（**审视 subagent 必读**）。

---

## 流程总览（六阶段）

```
0 续作检查 → 1 盘点 subagent 扫整仓落盘"待审文件清单" → 2 自动校验
        → 3 语言检测 → 4 批次派发并行审视 → 5 反思补发循环 + 交付报告
```

每阶段必须串行衔接，主上下文只做调度与回写，**不**把单个文件的全文加载进自己。

---

## 阶段 0：断点续作检查（入口闸门）

进入技能后**第一件事**就是本阶段。

**检测**：
1. 优先目录 = 仓根目录（用户未指定时取 `git rev-parse --show-toplevel` 输出；未在 git 仓中则取当前工作目录）
2. 用 `ls`/`find` 查找匹配 `*-code-review-issues.md`（**注意**：不是 `*-code-review-report.md`，那是最终交付件）
3. 多个候选取最近修改时间那份；用户显式指定路径优先

**校验**（只 Read 总览段约 50 行 + 索引表段，不读全文）：
- 总览计数齐备（总文件数 / done / pending / blocked / 进行中）
- 索引表行数与总数一致
- 抽查 1~2 条 done 的文件路径仍存在；若命中率 < 70% 视为代码已大幅变动，回退第一阶段重新盘点

**分支**：
1. `pending = blocked = 0` → 跳到阶段 5，仅做最终报告生成
2. `pending > 0` → 跳过阶段 1、2，从阶段 3 起对 pending 文件重新打包派发；不重做盘点
3. 仅剩 `blocked` → 询问用户是放弃还是给新方向；放弃则进入阶段 5 交付

**续作摘要**（一次性告知）：
```
[续作] 检测到代码检视进度文件 → [绝对路径]
  待审文件总数：N，done X / blocked Y / pending Z（更新于 YYYY-MM-DD HH:MM）
  续作策略：跳过盘点阶段，对 pending 文件重新打包派发
  即将自动进入语言检测与批次审视
```

**硬约束**：续作时不重新派发盘点 subagent；不修改已 done 项的发现记录；新增的发现追加到原文件。若用户提供与已有清单矛盾的新提交（仓有大幅变化），**停下询问**：是按当前 HEAD 重盘点还是续作旧的。

---

## 阶段 1：派发盘点 subagent 落盘"待审文件清单"

**为什么必须独立 subagent**：整仓文件清单 + 风险预判 + 批次划分体量大，主上下文做必爆窗口；落盘清单可团队复核；窄接口（YAML 批次列表）让主上下文只做调度。

### 1.1 盘点 subagent 职责

**必做**：
1. **扫描仓根**：用 `glob` / `find` 列出所有源代码文件，过滤掉无关目录与文件类型（见 1.5）
2. **快速风险预判**：对每个文件用 `head` / 关键词 grep 做轻量扫描，给出**风险 hint**——例如"此文件包含 `try {` × 12，注意错误处理"、"此文件含 `Cache.get`，关注 #5 内存"、"此文件含 `goroutine` / `go func()`，关注 #3 并发"
3. **划分批次**：每 batch 5~10 个文件，按"模块 / 包路径"聚类（同包的文件一个 batch，便于审视 subagent 复用上下文）
4. **为每个文件写完整字段**：`file_path` / `loc`（粗略行数）/ `risk_dimensions`（hint 命中的维度列表）/ `module`（按目录推断）
5. 用 Write **一次性**落盘清单文件
6. 按 1.7 格式回传 YAML 批次列表

**禁做**：
- 在阶段 1 就做最终问题判定（深度审视是阶段 4 的职责）
- 回传清单全文或大段摘录
- 跳过任何源代码文件（要么纳入清单，要么显式标记排除并给出原因）
- 修改任何源代码

### 1.2 落盘位置与命名

- **目录**：仓根目录（默认）；用户指定其他目录则尊重
- **命名**：`<repo-name>-code-review-issues.md`，repo-name 取自仓根目录名（含特殊字符时用 slug 化处理）
- **冲突处理**：同名已存在 → 优先视为续作（回到阶段 0 校验）；校验失败时追加 `-YYYYMMDD-HHMM` 新建，**禁止覆盖**
- 最终交付报告独立命名 `<repo-name>-code-review-report.md`，在阶段 5.5 生成
- 发现明细落盘 `<repo-name>-code-review-findings.jsonl`（每行一条 finding，便于阶段 5 聚合）

### 1.3 盘点 subagent prompt 模板

主上下文用 `Agent` 工具（subagent_type=`general-purpose`）派发 1 个盘点 subagent，prompt 自包含：

````
任务：作为"SRE 代码检视"的盘点 subagent，独立完成整仓源文件枚举、轻量风险预判、待审清单落盘。**不做最终问题判定**——深度审视由后续 subagent 完成。

【输入】
- 仓根目录：[绝对路径]
- 用户额外排除规则：[可选，例如"忽略 examples/ 子目录"]
- 用户重点维度：[可选，例如"重点查并发与外部调用"]

【清单文件落盘绝对路径】[由主上下文按 1.2 给出]

【13 大检视维度】（参见盘点要点 1.4 风险词典）：
null_safety / resource_leak / concurrency / performance / memory / error_handling /
external_call / boundary / observability / config_env / data_consistency /
time_encoding / api_compat

详细维度核对要点见 `<skill 根目录>/references/dimensions.md`，**本次盘点必须先 Read 该文件的"风险关键字速查"段**，再据此为每个文件打风险 hint。

【扫描范围与排除】
**纳入**：源代码文件（按扩展名）：
- Java: *.java
- C++: *.cpp / *.cc / *.cxx / *.h / *.hpp
- Scala: *.scala
- Python: *.py（排除 *_test.py / test_*.py 默认；用户要求时纳入）
- Go: *.go（排除 *_test.go 默认；用户要求时纳入）
- Rust: *.rs（排除 #[cfg(test)] 模块；以文件为粒度时排除 tests/ 目录）
- JavaScript: *.js / *.mjs / *.cjs（排除 *.test.js / __tests__/）
- TypeScript: *.ts / *.tsx（排除 *.test.ts / __tests__/）

**默认排除目录**：`.git/`、`node_modules/`、`vendor/`、`build/`、`target/`、`dist/`、`out/`、`.gradle/`、`.idea/`、`.vscode/`、`__pycache__/`、`venv/`、`.venv/`、`coverage/`、`generated/`（含名为 generated-sources / generated 的子目录）

**默认排除文件**：以 `.generated.` 为中段名的文件、`*.pb.go` / `*.pb.cc` / `*.pb.h`（protobuf 生成）、`*_pb2.py`、由 `// Code generated by ... DO NOT EDIT` 头部声明的文件

测试代码默认不纳入审视范围；若用户明确要求"测试也审"，纳入并在批次中独立打包。

【风险 hint 打分】
对每个文件做轻量扫描（用 grep 抓关键词，**不**完整 Read），命中下列任意关键字时把对应维度加入 risk_dimensions 列表：

- null_safety: `\.get\(` (Java) / `Optional` / `nil` 检查多于平均 / `?\.` (TS) / `unwrap` / `expect`
- resource_leak: `open\(` / `connect\(` / `Lock\(` / `mutex` / `socket` / `goroutine` / `go func`
- concurrency: `synchronized` / `Atomic` / `ConcurrentHashMap` / `Mutex` / `RWLock` / `goroutine`
- performance: `for .* in .*for` / `findAll` / 循环内 `\.query` `\.find` `\.get` / `JSON\.stringify`
- memory: `new ArrayList\(\)` / `Cache` / `LinkedList` / `bytes\.Buffer` / `\[\]byte\{` / `readAll` / `read_to_string`
- error_handling: `catch.*\{\s*\}` / `except:\s*pass` / `_\s*=\s*err` / `\.unwrap\(\)`
- external_call: `http\.` / `RestTemplate` / `OkHttp` / `requests\.` / `fetch\(` / `gRPC` / `client`
- boundary: `\.size\(\)` / `\.length` / `for.*<.*\+` / `parseInt` / `Math\.abs`
- observability: 文件几乎无 `log\.` / `logger` / `slog` / `tracing` 调用 → 标记缺失
- config_env: 硬编码数字 / IP 字面量 / `localhost` / `getenv\(`
- data_consistency: `@Transactional` / `tx\.` / `\.lock\(\)` / `select.*for update`
- time_encoding: `LocalDateTime\.now\(\)` / `time\.Now\(\)` / `Date\(\)` / `getBytes\(\)`
- api_compat: `@Deprecated` / API 字段定义文件（含 controller / endpoint / proto / schema）

匹配命中**视为可疑**而非确诊；最终由阶段 4 审视 subagent 判定。一个文件可命中多个维度。

【落盘文件结构】
1. 总览（仓根目录、语言分布、文件总数、各状态计数、当前 wave、补发轮次、生成时间、风险 hint 分布）
2. 待审文件索引表（FileID、相对路径、语言、loc、模块、批次、状态、风险维度命中、轮次、备注）
3. 文件详细说明（每 FileID 一节：路径、模块归属、风险 hint 列表、扫描时命中的关键字示例 ≤ 3 条）
4. 批次计划表（批次号、并行文件数、FileID 列表、模块聚类、备注）
5. 排除清单（被默认或用户规则排除的文件，分类汇总）
6/7. 阻塞项汇总 / 批次执行日志（初始留空占位）

完整模板见附件 1.4。

【硬性要求】
1. Read `references/dimensions.md` 的"风险关键字速查"段
2. Glob/find 枚举源文件
3. 对每个文件用 grep 做风险 hint（不全文 Read）
4. Write 一次性落盘清单
5. 不省略任何文件的字段
6. 不要把清单全文粘到返回消息中
7. 不要做最终问题判定

【返回格式】仅返回如下 YAML（可附一句话确认）：

```yaml
inventory_output:
  review_file: [落盘绝对路径]
  language_distribution:
    java: X
    python: Y
    [...仅列存在的语言]
  total_files: N
  excluded_files: M
  risk_hint_distribution:
    null_safety: X
    resource_leak: Y
    [...各维度命中数]
  batches:
    - batch_id: batch-1
      wave: 1
      file_ids: [F-001, F-002, ...]   # 5~10 个
      module: src/service/order
      summary: "[一句话本批文件主题]"
    - batch_id: batch-2
      wave: 1
      file_ids: [...]
      module: src/api/user
      summary: ...
  unresolved_questions:
    - "[阻塞性问题：仓根目录无源码 / 多语言但用户未指明优先 / 文件数过万需用户限定范围]"
  notes: "[可选]"
```
````

### 1.4 清单文件模板（附 prompt）

````markdown
# 代码问题检视 待审文件清单

> 状态约定：`pending` / `in_progress` / `done` / `blocked`。
> 写入约定：盘点 subagent 初次落盘后，**只由主上下文写入**；审视 subagent 仅通过结构化"进度回执"上报。

## 总览
- 仓根目录 / 主语言 / 多语言分布
- 待审文件总数：N；done 0；in_progress 0；pending N；blocked 0
- 当前 wave：— ；补发轮次：0
- 生成时间：YYYY-MM-DD HH:MM
- 风险 hint 分布（盘点估计）：null_safety X / resource_leak Y / ...

## 待审文件索引表

| FileID | 相对路径 | 语言 | loc | 模块 | 批次 | 状态 | 风险维度命中 | 轮次 | 备注 |

## 文件详细说明（审视 subagent 只读自己 batch 的段）

### F-001: src/service/order/OrderService.java
- **语言**：java　**loc**：~480　**模块**：service.order
- **批次**：batch-1　**状态**：pending　**轮次**：0

**风险维度命中**：null_safety, resource_leak, concurrency, error_handling, observability

**扫描时命中的关键字示例**（≤ 3 条，仅作 hint）：
- `Optional<User> user = userRepo.findById(id); user.get()` 行 92
- `synchronized(this) { ... }` 行 156
- `} catch (SQLException e) { logger.warn(e.getMessage()); }` 行 220

---

### F-002 ...（每个 FileID 独立成节）

## 批次计划

| 批次 | 并行文件数 | FileIDs | 模块聚类 | 备注 |

## 排除清单

### 默认规则排除
| 路径 | 原因 |

### 用户规则排除
| 路径 | 原因 |

## 阻塞项汇总 / 批次执行日志
_暂无_
````

### 1.5 扫描范围细则

**仓根识别**：
1. 用户传入显式路径 → 用之
2. 否则 `git rev-parse --show-toplevel` → 用之
3. 否则当前工作目录

**默认排除**：见 1.3 prompt 中清单。**不要**把这些目录或文件纳入审视——它们要么是依赖 / 构建产物，要么是测试，要么是生成代码，分别由不同的检视手段管理。

**特殊处理**：
- monorepo（含多个独立子项目）：盘点时按一级子目录分组，每组独立形成"模块"
- 单文件 > 2000 行：按"超大文件"标记，分到独立 batch（防止单个 subagent 吃满上下文）
- 总文件数 > 800：在 `unresolved_questions` 中提示用户"当前规模较大，建议指定子目录或排除规则"

### 1.6 批次划分原则

| 文件特性 | 每 batch 推荐数量 | 备注 |
|---------|------------------|------|
| 普通业务代码（loc < 300） | 8~10 | 默认 |
| 中等复杂度（loc 300~800） | 5~7 | 给 subagent 留充足分析时间 |
| 超大文件（loc > 800） | 1~3 | 单文件即可吃满预算 |
| 高风险（命中 ≥ 5 个维度） | 5~6 | 复杂度高，少装 |
| 低风险（命中 ≤ 1 个维度） | 8~10 | 可以塞满 |

**wave 组织**：同模块优先 wave 1（subagent 复用上下文）；高风险模块优先 wave 1；每 wave 5~8 batch（超出拆多 wave）。

### 1.7 盘点 subagent 返回收窄

**只能**返回：一句话确认 + `inventory_output` YAML。**禁止**返回：清单正文、各文件详细 hint、扫描过程的中间笔记。

---

## 阶段 2：自动校验与推进

### 2.1 解析与校验

主上下文收到 `inventory_output` 后：
1. 提取 `review_file`、`total_files`、`batches`、`risk_hint_distribution`、`unresolved_questions`
2. 按需 Read 进度文件：总览段（确认计数）+ 1~2 个代表 FileID 段（确认字段齐备）+ 批次计划表
3. 字段齐备且无硬约束违规 → 输出一行摘要进入阶段 3
4. 字段省略或计数错乱 → 跳到 2.2 自动修订

**摘要示例**：
```
[盘点完成] 待审清单已落盘 → [绝对路径]
  共 N 个源文件（java X / py Y / go Z / ...）
  打包为 M 个 batch，分 K 波；高风险文件 H 个；超大文件 G 个
  自动进入语言检测与批次审视
```

### 2.2 自动修订

清单字段缺失或计数错乱时主上下文派发"盘点修订 subagent"，prompt 列出问题、要求 Edit 就地修复、保持字段齐备、更新计数；返回更新后的 `inventory_output`。回到 2.1 重校；连续 2 轮失败则进入 2.3。

### 2.3 硬阻塞（仅此时询问用户）

仅以下情况暂停：
1. `unresolved_questions` 含阻塞性问题（仓根目录无源码 / 文件数 > 800 / 语言无法识别）
2. 自动修订连续 2 轮仍不达标
3. 多语言混合且用户未指明优先级（盘点 subagent 不应自作主张选边）

---

## 阶段 3：语言检测与加载参考资料

### 3.1 语言检测

1. 优先用 `inventory_output.language_distribution`
2. 多语言时取占比最大者为"主语言"，其他为"副语言"
3. 仍无法确定 → 询问用户

### 3.2 参考目录结构

```
references/
├── dimensions.md         # 13 大维度核对要点 + 风险关键字速查（盘点 & 审视 subagent 必读）
├── severity.md           # 严重程度判定矩阵（审视 subagent 必读）
├── report-templates.md   # 交付报告模板（阶段 5 必读）
├── java.md / cpp.md / scala.md / python.md / go.md / rust.md / javascript.md / typescript.md
                          # 语言专属盲点：每语言最容易踩的具体形态
```

主上下文用 Edit 把进度文件总览区"参考文件"字段更新为绝对路径，**不**把 references 全文加载进自己。

---

## 阶段 4：批次派发并行审视

### 4.1 审视规范（所有审视 subagent 必须遵守）

**每条发现**必须包含：
- `finding_id`：本 batch 内顺序编号（如 `batch-1-finding-3`）
- `file_id`：来自清单的 FileID
- `dimension`：13 维度之一
- `severity`：`blocker` / `critical` / `major` / `minor` / `info`（按 `references/severity.md` 判定）
- `file`：相对路径
- `lines`：行号或区间
- `code_snippet`：≤ 8 行代码片段（更长用 `...` 截断）
- `risk_description`：一句话讲清"为什么是问题、什么场景会爆"
- `recommendation`：可执行修复建议（具体改成什么、用什么 API / 模式；如需切到别的 skill 也明示）
- `confidence`：`high` / `medium` / `low`（low 时建议人工复核）

**禁止**：
- 不给代码证据就下结论（必须降级为 `info` + `confidence=low`）
- 把"代码风格 / 命名习惯"问题列为 finding（除非直接造成稳定性风险）
- 把超出本 batch 的文件也写进回执
- 修改任何源码

**finding 收紧策略**：每个 finding 都要可被独立修复。同一文件的同类问题（如多个 NPE 风险点）若位置紧邻，可合并为一条多 lines 的 finding；位置分散则拆开。

### 4.2 调度规则

1. **按 wave 派发**：Read 进度文件"批次计划"表（只读这一段），一次派发整 wave 全部 batch（5~8 并行）
2. **同消息内并行**：同 wave 全部 subagent 在同一条消息中发起多个 Agent 工具调用块
3. **每 subagent 自包含**：subagent 看不到会话历史，prompt 自带全部信息
4. **一个 subagent = 一个 batch = 5~10 文件**
5. **wave 屏障**：本 wave 全部返回前不派发下一 wave；返回后立即回写

### 4.3 按需读取本 batch 的详细说明

派发前主上下文从清单文件 Read 出**本 batch 全部 FileID** 的详细说明段（每段从 `### F-XXX:` 到下一个 `### F-` 之前），按顺序粘到 prompt 的"待审文件详细说明"区。

**允许**：一次 Read 本 batch 的 5~10 段（约 10~30 KB）。
**禁止**：把整份清单加载进主上下文；粘贴非本 batch 的 FileID。

### 4.4 审视 subagent prompt 模板

````
批次 ID：batch-N（wave-K，模块=<module>）
任务：对以下 5~10 个源代码文件做"SRE 视角代码问题检视"。**只输出发现，不修改任何代码**。

【本批次 FileID 清单】
- F-XXX: <相对路径> (语言=<lang>, 风险维度=[...])
[...]

【每个 FileID 的详细说明】（主上下文从清单 Read 后按顺序粘贴）

#### F-XXX: <路径>
**语言**：<lang>　**loc**：<size>　**模块**：<module>
**风险维度命中**：[...]
**扫描时命中的关键字示例**：[...]

[...每个 FileID 都完整粘贴，不得"同上"]

【参考文件（必读一次）】
- `<skill>/references/dimensions.md`（13 维度核对要点 + 风险关键字）
- `<skill>/references/severity.md`（严重度判定矩阵）
- `<skill>/references/<lang>.md`（本批主语言专属盲点；多语言时分别读）

【硬性要求】
1. 用 Read 工具完整读取本 batch 每个文件（每个文件只读一次，分析完再下一个）
2. 对每个文件**逐一**走 13 维度 checklist；不得跳过维度，即使该维度看似无关也要在 notes 标注"无相关问题"
3. 对每条发现严格按 4.1 规范产出（dimension / severity / file / lines / code_snippet / risk_description / recommendation / confidence）
4. 严重度按 severity.md 判定，不得感性给分；分歧时按"现网真实风险"侧
5. recommendation 必须可执行（指明改哪几行、用什么 API、是否需要新建配置项）
6. 不修改任何源码
7. 不创建新文件（除非必要时写 /tmp 临时 grep 结果，避免污染仓库）
8. 处理完一个文件再下一个

【进度回执（必须，YAML，每个 file 一条 + 该 file 下若干 finding）】
```yaml
batch_review:
  batch_id: batch-N
  files:
    - file_id: F-XXX
      file: "[相对路径]"
      lang: <lang>
      loc: <num>
      dimensions_checked: [null_safety, resource_leak, concurrency, performance, memory,
                            error_handling, external_call, boundary, observability,
                            config_env, data_consistency, time_encoding, api_compat]
      findings:
        - finding_id: batch-N-finding-1
          dimension: null_safety
          severity: critical
          lines: "92"
          code_snippet: |
            Optional<User> user = userRepo.findById(id);
            return user.get().getName();   // unconditional .get()
          risk_description: "Optional.get() 未做 isPresent 判定，id 不存在时抛 NoSuchElementException 击穿到调用方"
          recommendation: "改用 user.orElseThrow(() -> new UserNotFoundException(id)) 或返回 Optional 给上层显式处理"
          confidence: high
        [...每条独立]
      notes: "[可选；可写'#13 api_compat 维度无相关代码，跳过']"
    [...本 batch 每个文件一条]
```

某文件完全无法分析时（如二进制 / 损坏），将 dimensions_checked 留空、findings 留空、notes 写明原因；并在 file_id 上把状态视为 blocked（主上下文据 notes 判定）。
````

### 4.5 每 wave 完成后的回写

本 wave 全部 subagent 返回后，主上下文**立即**：

1. 解析每个 batch 的 `batch_review.files`
2. 用 Edit 就地更新进度文件：
   - 索引表"状态"列按返回结果改为 done / blocked / 仍 pending
   - 总览区计数
   - 阻塞项汇总区追加所有 blocked 文件 + 原因
   - 批次执行日志区追加本 wave 情况
3. **不**在进度文件里写每条 finding 的全文（避免膨胀）；finding 明细另外保存到 **`<repo-name>-code-review-findings.jsonl`**（每行一条 finding，带 file_id / dimension / severity / lines / risk / rec / confidence），便于阶段 5 聚合

**为什么主上下文写**：避免并发 Edit 冲突；唯一仲裁点保证反思读取可信状态；窄接口（结构化 YAML）比直改 markdown 稳定。

### 4.6 派发下一 wave

仍有未开始 wave → 回到 4.2。全部派发完 → 阶段 5。

---

## 阶段 5：反思补发循环 + 交付报告

强制循环：读总览 → 完整性反思 → 补发漏审 → 回写 → 再反思，直到 `pending = 0`。

### 5.1 完整性反思

只 Read 总览区与索引表，统计：

```
[反思] 待审文件共 N：done X，blocked Y，pending Z
       pending 归属：F-005, F-012
       blocked 归属：F-009 (reason=...)
       finding 总数 K（blocker B0 / critical C0 / major M0 / minor m0 / info I0）
       维度分布：null_safety A / resource_leak B / ...
       判定：[未收敛 / 已收敛]
```

**收敛**：`pending = 0`。**未收敛**：进入 5.2。

### 5.2 补发循环（强制执行）

对所有 pending：
1. 按相同打包规则重新打包（5~10/subagent，pending ≤ 4 时不强求凑满）
2. 派发补发 wave（5~8 batch 并行）
3. 补发 prompt 必须：
   - 标注"补发任务（轮次 = 当前 + 1）"
   - 用 4.4 多文件模板列出全部 FileID
   - 附前一轮失败原因（按 FileID 分别列）
4. 返回后回到 4.5 回写 → 5.1 反思
5. 循环直到 pending = 0

**硬性**：不可跳过补发；同一 FileID 连续 2 轮 pending 且原因不同则暂停询问用户。

### 5.3 跨文件综合校验（收敛后一次）

由主上下文做或派发"综合校验 subagent"：
- **横向去重**：findings.jsonl 中"同维度 + 同 risk_description 模式 + 多文件命中"的项合并为"模式级 finding"（例如全仓有 17 处 `Optional.get()` 无判定 → 合并为一条 critical 的"Optional 误用模式"，附 17 个具体定位）
- **维度覆盖率**：每个维度命中文件数 / 总文件数；若某维度命中率 = 0 但仓中存在相关代码（如有 `goroutine` 关键字但 `concurrency` 维度无 finding），抽样核查是否漏审
- **严重度分桶**：blocker / critical 必须列全；major 列前 30；minor / info 给计数与抽样
- **疑似安全问题汇总**：把 `recommendation` 中提到 SQL/XSS/secret/auth 的 finding 单独汇总，提示用户走 `/security-review`

### 5.4 交付：问题矩阵 + 修复 TODO 报告

主上下文读取 `<repo-name>-code-review-findings.jsonl`，聚合后用 Write 生成 `<repo-name>-code-review-report.md`，结构如下（详细模板见 `references/report-templates.md`）：

````markdown
# SRE 代码检视报告

## 摘要
- 仓根目录：[路径]
- 审视范围：N 个源文件（java X / py Y / go Z / ...）
- 排除文件：M（默认规则 + 用户规则）
- 发现问题：K 条
- 严重度分布：blocker B0 / critical C0 / major M0 / minor m0 / info I0
- 维度分布：null_safety A / resource_leak B / concurrency C / ...
- 综合判定：**[就绪 / 需修复后再上线 / 严重不一致建议返工]**

## 关键缺陷清单（blocker / critical 必列全；major 列前 30；按维度内严重度排序）

### [BLOCKER] F-XXX <file>:<lines> (dimension=null_safety)
- **代码**：
  ```
  [snippet ≤ 8 行]
  ```
- **风险**：[一句话]
- **修复**：[具体到行 / API / 模式]
- **置信度**：high

[...]

## 模式级问题（横向去重后命中 ≥ 3 处）

### [CRITICAL] Optional.get() 无判定（共 17 处，java）
- 修复模式：统一改用 `orElseThrow` 或显式 isPresent
- 命中位置：F-003 (line 92), F-007 (line 145), ...

[...]

## 各维度问题汇总

### 维度 1：null_safety
| FileID | file:lines | severity | risk | recommendation |

### 维度 2：resource_leak
...

[共 13 个小节，命中数为 0 的维度也列出，写"本次未发现该维度问题（覆盖率 X%）"]

## 疑似安全问题（提示项，请进一步走 /security-review）
[列出 recommendation 中提及 SQL/XSS/secret/auth 的 finding，不在本 skill 范围深入]

## 阻塞文件
[扫描中标记 blocked 的文件 + 原因]

## 修复 TODO（按优先级排序）

### P0（blocker / critical，必修）
- [ ] [TODO-1] 修复 F-003 line 92 NPE 风险（Optional.get() → orElseThrow）；建议执行 `tdd-impl-runner`
- [ ] [TODO-2] 修复"Optional.get() 模式"全 17 处
- [ ] [TODO-3] 资源泄漏：补全 F-008 line 200 数据库连接 close（try-with-resources）
- [...]

### P1（major，建议修）
- [...]

### P2（minor / info，按需修）
- [...]

## 进度文件
- 清单：`<repo-name>-code-review-issues.md`
- finding 明细：`<repo-name>-code-review-findings.jsonl`
- 本报告：`<repo-name>-code-review-report.md`

## 下一步建议
1. P0 项尽快修复，建议切到 `tdd-impl-runner` 按 TODO 逐项处理
2. 修复后重新触发本 skill 做回归审视；本进度文件可作为续作基线
3. 疑似安全问题请走 `/security-review` 二次确认
````

---

## 附：小规模简化流程

| 文件数 | 简化策略 |
|------|---------|
| 1~10 | 主上下文直接审视（仍写完整 issues.md 供审计），不派发盘点 subagent；按维度逐个 checklist |
| 11~80 | 派发盘点 subagent；批次 1~5 个；其他阶段照常 |
| > 80 | 完整六阶段：盘点 subagent → 清单落盘 → 5~10 文件/subagent → 5~8 batch/wave → 每 wave 回写 → 反思至 pending = 0 |

全规模均"全程自动化"——仅硬阻塞下询问用户。

---

## 与其他 skill 的边界

| 场景 | 切到 |
|------|------|
| 想修代码 | `tdd-impl-runner` 或手工 |
| 想补单测 | `unit-test-runner` |
| 想补日志 | `business-logging` |
| 想审安全（SQL 注入 / XSS / 硬编码密钥 / 鉴权 / 加密 / 反序列化） | `/security-review` |
| 想核对设计与代码一致性 | `design-code-consistency-checker` |
| 想总结本次提交风险 | `commit-change-summarizer` |

本 skill **不**自动调用以上 agent / skill —— 仅在交付报告"修复 TODO"中提示用户切换。
