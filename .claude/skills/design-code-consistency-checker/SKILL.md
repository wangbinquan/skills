---
name: design-code-consistency-checker
description: 用来**审视设计文档与实际代码是否一致**的专业技能。当用户提到「设计与代码对比 / 设计 vs 代码 / 一致性检查 / 一致性审计 / consistency check / design-code review / 设计落地核查 / 评审实现是否符合设计 / 看下代码是不是按设计写的 / 实现偏离设计 / 漂移检测 / drift detection / 设计回归 / spec compliance / 接口契约核对 / 状态机落地核查 / 配置项落地核查」等意图，或在评审、上线前、合并 PR 前、交付前希望系统性核对「设计文档说要做的，是否在代码里都做了；代码里做的，是否设计文档里都写了」时，**主动触发**本技能。覆盖九大一致性维度——(1) 结构（类/接口/继承/字段/方法签名/可见性/包路径/泛型）；(2) 行为（业务规则、状态机转移、算法分支、异常 & 回滚 & 补偿、调用顺序与时序图、并发 & 幂等 & 重试 & 超时）；(3) 接口契约（HTTP/RPC URL & method、请求/返回字段、错误码、鉴权、版本兼容）；(4) 数据模型（实体/DTO/PO 字段、表结构、索引、约束、枚举值、迁移脚本）；(5) 配置（配置项、默认值、特性开关、环境变量）；(6) 依赖（库/服务/中间件/版本/未声明额外依赖）；(7) 非功能（日志埋点、监控指标、安全脱敏 & 鉴权 & 加密、性能 & 缓存）；(8) 测试（关键分支 UT、集成测试关键流程）；(9) 文档（Javadoc/docstring/README/API 文档与设计同步）。每条发现给出：维度、状态（一致 / 缺失 / 偏离 / 超出 / 推断）、严重程度（blocker / critical / major / minor / info）、设计来源（章节 + 行号）、代码证据（文件:行号）、修复建议。**双向核对**：设计 → 代码（漏实现）与 代码 → 设计（隐式扩展 / 设计未规定的"附加品"）。**只审计、不修改代码、不修改设计文档**——发现的偏差会引导用户切换到对应专职 agent（`tdd-impl-runner` 修代码、`software-design-doc-generator` 改设计）。支持 Java、C++、Scala、Python、Go、Rust、JavaScript、TypeScript 八种语言，按检测结果只加载对应 references。**支持断点续作**：启动时先在原始设计文档同级目录查找 `*-design-code-review.md` 进度文件；存在且结构完整则按 pending 项续作。**主流程**：盘点 subagent 解析设计 → 落盘"待验证项清单（Inventory）"+ 代码索引 → 主上下文校验/推进 → 语言检测 → 批次派发核对 subagent（每 batch 5~10 个待验证项，每 wave 5~8 batch 并行）→ 每 wave 回写状态并反思 → pending 收敛后产出一致性矩阵 + 严重程度分桶 + 可操作修复清单。**全流程自动化**——仅在硬阻塞（设计文档与代码大面积冲突、待验证项 > 30% 无法定位证据、用户未指定路径等）时暂停。
---

# 设计 ↔ 代码一致性审计技能

## 概述

本技能围绕一件事：**给我一份设计文档 + 一份代码仓，告诉我"设计说的"和"代码做的"是不是一回事**。

**职责边界**：
- **只审计、不改代码、不改设计文档**。任何"应当修改"的建议都以可执行 TODO 形式写入交付报告，由用户自行决定调用 `tdd-impl-runner` 修代码 / `software-design-doc-generator` 改设计 / `tdd-skeleton-runner` 重生成骨架。
- **不写新单测**（如果发现 UT 缺失，列入"测试一致性"维度的发现，但不调用 unit-test-generator 自动补）。
- **不画图**（如需可视化偏差结构，告知用户切到 `software-diagram` skill）。

**核心原则**：
- **双向核对**：每个一致性维度都要做"设计 → 代码"与"代码 → 设计"两个方向。前者抓"漏实现"；后者抓"隐式扩展、未声明依赖、设计未提到的附加品"。
- **证据闭环**：每条发现必须同时给出**设计来源**（文档相对路径 + 章节标题 + 行号或锚点）与**代码证据**（仓内相对路径 + 行号），缺一不可，否则降级为推断项。
- **严格分级**：blocker / critical / major / minor / info 五档，由 `references/severity.md` 给定判定矩阵，避免"什么都标 critical"。
- **主上下文精简**：盘点（解析设计 + 建代码索引）由独立 subagent 完成，主上下文只收"待验证项清单 + 批次列表"。
- **就近落盘**：进度与交付文件落盘到**原始设计文档同级目录**，命名 `<关键词>-design-code-review.md`、`<关键词>-design-code-review-report.md`。
- **全流程自动化**：盘点完成后自动推进到批次派发与反思收敛，仅硬阻塞时询问用户。

**九大一致性维度**：见 `references/dimensions.md`。本 SKILL.md 只走流程，维度的具体核对要点不在主上下文加载，由核对 subagent 按需读取。

**流程六阶段**：0 续作检查 → 1 盘点 subagent 落盘"待验证项清单" → 2 自动校验/推进 → 3 语言检测 → 4 批次派发并行核对 → 5 反思补发循环 + 交付一致性矩阵报告。

---

## 阶段 0：断点续作检查（入口闸门）

**进入技能后的第一件事**就是本阶段，不直接派发盘点 subagent。

**检测**：
1. 优先目录 = 用户指定的设计文档所在目录
2. 用 `ls`/`find` 查找匹配 `*-design-code-review.md`（**注意**：不是 `*-design-code-review-report.md`，那是最终交付件，不是进度文件）
3. 多个候选时取最近修改时间那份；用户显式指定路径则优先

**校验**（只 Read 总览段约 50 行 + 索引表段，不读全文）：
- 总览计数齐备（总数 / done / pending / blocked / 进行中）
- 索引表行数与总数一致
- 设计文档路径前缀匹配项目根目录或用户输入
- 抽查 1~2 条 done 的"代码证据"路径仍存在（命中率 < 70% 视为代码已大幅变动，回退第一阶段重新盘点）

**分支**：
1. `pending = blocked = 0`（已收敛）→ 跳到第五阶段，仅做最终一致性报告生成
2. `pending > 0` → 跳过阶段 1、2，从阶段 3 起对 pending 待验证项重新打包派发；不重做盘点
3. 仅剩 `blocked` → 询问用户是放弃还是给新方向；放弃则进入第五阶段交付

**续作摘要**（一次性告知）：
```
[续作] 检测到一致性审计进度文件 → [绝对路径]
  待验证项总数：N，done X / blocked Y / pending Z（更新于 YYYY-MM-DD HH:MM）
  续作策略：跳过盘点阶段，对 pending 项重新打包派发
  即将自动进入语言检测与批次核对
```

**硬约束**：续作时不重新派发盘点 subagent；不修改已 done 项的发现记录；新增推断/阻塞追加到原文件。若用户提供与已有清单矛盾的新设计版本，**停下询问**：是按新设计重盘点还是续作旧的。

---

## 阶段 1：派发盘点 subagent 落盘"待验证项清单"

**为什么必须独立 subagent**：设计文档（含图表）+ 代码仓体量大，主上下文解析必爆窗口；subagent 落盘的清单文件可审计、可团队复核；窄接口返回（YAML 批次列表）让主上下文只做调度。

### 1.1 盘点 subagent 职责

**必做**：
1. **解析设计文档**：抽取九大维度的"应当存在"项。每一项给出 `dimension`、`item`、`design_anchor`（章节 + 行号）、`expected`（应当如何）。
2. **建立代码索引**：在用户给定的代码根目录下用 `glob`/`grep` 建立类清单、方法清单、接口路由清单（仅按文件级粒度索引，避免读全文）。这一步只产出"哪类东西在哪些文件可能存在"的索引表，不深入读全文（深入读由阶段 4 各 subagent 在自己负责的项上做）。
3. **划分批次**：每 batch 5~10 个待验证项，按维度聚类（同维度同 batch，便于核对 subagent 复用上下文）。
4. **为每个待验证项写完整四字段**：`item` / `expected`（设计要求）/ `evidence_hint`（代码索引猜测的可能位置）/ `verification_strategy`（建议如何核对，例如 grep 关键字、对比方法签名、对比配置 key 等）。
5. 用 Write **一次性**落盘清单文件。
6. 按 1.7 格式回传 YAML 批次列表。

**禁做**：
- 在阶段 1 就做最终核对结论（核对是阶段 4 的职责）。
- 回传清单全文或大段摘录。
- 跳过任何一个维度（即使该维度看起来"无关"也要显式标记 `dimension_skipped: <reason>`）。
- 修改用户的设计文档或代码。

### 1.2 落盘位置与命名

- **目录**：与原始设计文档同级；同时存在多份设计文档时取主文档目录
- **命名**：`<关键词>-design-code-review.md`，关键词取自设计文档标题主体或用户描述
- **冲突处理**：同名已存在 → 优先视为续作（回到阶段 0 校验）；校验失败时追加 `-YYYYMMDD-HHMM` 新建，**禁止覆盖**
- 最终交付报告独立命名 `<关键词>-design-code-review-report.md`，在阶段 5.5 生成

### 1.3 盘点 subagent prompt 模板

主上下文用 `Agent` 工具（subagent_type=`general-purpose`）派发 1 个盘点 subagent，prompt 自包含：

````
任务：作为"设计-代码一致性审计"的盘点 subagent，独立完成设计文档解析、代码索引建立、待验证项清单生成与落盘。**不做核对结论**——核对由后续 subagent 完成。

【原始输入】
- 设计文档：[路径或内容]（必填）
- 需求文档：[路径或内容]（可选，作为业务规则补充来源）
- 代码根目录：[绝对路径]
- 用户额外指定的关注维度：[可选，例如"重点查接口契约 + 状态机"]

【清单文件落盘绝对路径】[由主上下文按 1.2 给出]

【九大一致性维度】（每条都必须遍历，无相关项也要显式标记跳过）：
1. structure 结构        — 类/接口/继承/字段/方法签名/可见性/包路径/泛型
2. behavior 行为          — 业务规则、状态机、算法分支、异常 & 回滚、调用顺序、并发 & 幂等
3. api 接口契约          — HTTP/RPC URL/method、请求/返回字段、错误码、鉴权、版本
4. data 数据模型         — 实体/表/索引/约束/枚举/迁移
5. config 配置           — 配置项、默认值、特性开关、环境变量
6. dependency 依赖        — 库/服务/中间件/版本，及代码中"未声明的额外依赖"
7. nfr 非功能            — 日志埋点、监控指标、安全（脱敏/鉴权/加密）、性能（缓存/批量）
8. test 测试             — 关键分支 UT、集成测试关键流程
9. doc 文档              — Javadoc/docstring/README/API 文档同步

详细维度核对要点见 `<skill 根目录>/references/dimensions.md`，**本次盘点必须先 Read 该文件**，再据此抽取待验证项。

【落盘文件结构要求】
1. 总览（设计文档路径、代码根目录、语言、各状态计数、当前批次、补发轮次、生成时间）
2. 待验证项索引表（VerifyID、维度、item 名、设计来源章节、来源行号、批次、状态、严重程度预估、轮次、备注）
3. 待验证项详细说明（每 VerifyID 一节，四字段齐备：expected、evidence_hint、verification_strategy、关联其他项）
4. 批次计划表（批次号、并行项数、VerifyID 列表、维度聚类、备注）
5. 代码索引摘要（类→文件、接口路由→文件、配置文件清单、依赖声明文件位置）
6/7/8/9. 推断项汇总 / 阻塞项汇总 / 维度跳过说明 / 批次执行日志（初始留空占位）

完整模板见附件 1.4。

【硬性要求】
1. Read 工具读取设计文档全文 + 需求文档 + dimensions.md
2. Glob/Grep 建立代码索引（不要 Read 全部源码全文，仅按需读结构性文件如 pom.xml、package.json、application.yml、路由表 等）
3. Write 一次性落盘清单
4. 不省略任何 VerifyID 的四字段
5. 不要把清单全文粘到返回消息中
6. 不要做核对结论（核对是阶段 4 的事）

【返回格式】仅返回如下 YAML（可附一句话确认）：

```yaml
inventory_output:
  review_file: [落盘绝对路径]
  language: [检测或"待确认"]
  total_items: N
  by_dimension:
    structure: X
    behavior: X
    api: X
    data: X
    config: X
    dependency: X
    nfr: X
    test: X
    doc: X
  dimensions_skipped:
    - dimension: <name>
      reason: "[设计文档未涉及/用户明确不关注]"
  batches:
    - batch_id: batch-1
      wave: 1
      verify_ids: [V-001, V-002, ...]   # 5~10 个，同维度优先
      dimension_focus: structure
      summary: "[一句话本批核查范围]"
    - batch_id: batch-2
      wave: 1
      verify_ids: [...]
      dimension_focus: api
      summary: ...
  unresolved_questions:
    - "[仅填写阻塞性问题：设计文档关键章节缺失/代码根目录定位失败/语言无法识别]"
  inferred_items_count: N
  notes: "[可选，一两句]"
```
````

### 1.4 清单文件模板（附 prompt）

````markdown
# 设计-代码一致性审计 待验证项清单

> 状态约定：`pending` / `in_progress` / `done` / `blocked`。
> 写入约定：盘点 subagent 初次落盘后，**只由主上下文写入**；核对 subagent 仅通过结构化"进度回执"上报。

## 总览
- 项目 / 语言 / 设计文档路径 / 需求文档路径 / 代码根目录
- 待验证项总数：N；done 0；in_progress 0；pending N；blocked 0
- 当前批次：— ；补发轮次：0
- 生成时间：YYYY-MM-DD HH:MM

## 待验证项索引表

| VerifyID | 维度 | item | 设计来源章节 | 来源行号/锚点 | 批次 | 状态 | 严重度预估 | 轮次 | 备注 |

## 待验证项详细说明（核对 subagent 只读自己 batch 的段，主上下文不在此 Read 全文）

### V-001: [item 简称] (dimension=structure)
- **设计来源**：`<doc_path>` § 3.2.1 第 88-95 行
- **批次**：batch-1　**状态**：pending　**轮次**：0　**严重度预估**：major

**expected（设计要求是什么）**：
[设计原话或精炼复述，含必要的字段/方法签名/取值约束/状态枚举等]

**evidence_hint（代码中可能在哪里）**：
- `src/main/java/com/example/service/UserService.java`（盘点阶段 grep 命中）
- 关键字：`createUser`、`UserDto`

**verification_strategy（建议核对方法）**：
1. 比对方法签名是否与设计章节 3.2.1 一致（参数顺序、返回类型、抛出异常）
2. grep `@Transactional` 验证设计要求的事务语义
3. 检查异常分支：`UserExistsException` 是否抛出

**关联项**：V-014（同一字段在 DTO 维度的核对）

---

### V-002 ...（每个 VerifyID 独立成节，四字段齐备）

## 批次计划

| 批次 | 并行项数 | VerifyIDs | 维度聚焦 | 备注 |

## 代码索引摘要

### 类清单（来自盘点）
| 类全限定名 | 文件路径 | 维度归属 |

### 接口路由清单
| 路由 | HTTP 方法 | 文件:行号 |

### 配置文件
| 文件路径 | 类型 (yaml/properties/...) |

### 依赖声明文件
| 文件路径 | 工具 (maven/gradle/npm/...) |

## 推断项汇总 / 阻塞项汇总 / 维度跳过说明 / 批次执行日志
_暂无_
````

### 1.5 设计文档解析规则

```
解析优先级：
1. 显式编号或锚点（H2/H3 标题、表格、UML） → 直接抽取
2. 散落在叙述段中的"必须 / 应当 / 不得"句式 → 升级为待验证项
3. 图（时序图/状态机/类图）→ 把每个节点 / 转移 / 调用边都拆成独立 VerifyID
4. 配置示例代码块 → 每个 key 一个 VerifyID
5. 接口示例（JSON、curl）→ 路由 + 每个字段都拆成 VerifyID（合并相邻字段时不得超过 5 个一组）
```

**严禁**：盘点阶段做"应该一致性合理"的主观判断；这种判断只属于阶段 4 核对 subagent。

### 1.6 批次划分原则

| 维度规模 | 每 batch 推荐装多少 | 备注 |
|----------|---------------------|------|
| structure（类/方法多） | 5~8 | 单类多方法时按"类粒度"打包，避免拆碎 |
| api（路由数中等） | 6~10 | 同 controller / 同业务域聚类 |
| data（表结构） | 6~10 | 同 schema 聚类 |
| config / dependency / doc（项数较少） | 单 batch 装满或并入相邻维度 | 避免出现"1 batch 1 项" |
| behavior / nfr / test（综合性） | 3~6 | 因为每项核查需要追代码链路，吃 token |

**wave 组织**：同维度优先 wave 1（核对 subagent 复用上下文）；structure & api 优先（其他维度依赖结构是否对齐的判断）；每 wave 5~8 batch（超出拆多 wave）。

### 1.7 盘点 subagent 返回收窄

**只能**返回：一句话确认 + `inventory_output` YAML。**禁止**返回：清单正文、维度详细要点、解析过程的中间笔记。

---

## 阶段 2：自动校验与推进

### 2.1 解析与校验

主上下文收到 `inventory_output` 后：
1. 提取 `review_file`、`total_items`、`batches`、`by_dimension`、`unresolved_questions`、`dimensions_skipped`
2. 按需 Read 进度文件：总览段（确认计数一致）+ 1~2 个代表 VerifyID 段（确认四字段齐备）+ 批次计划表
3. 字段齐备且无硬约束违规 → 输出一行摘要直接进入阶段 3
4. 字段省略或硬约束违规 → 跳到 2.2 自动修订

**摘要示例**：
```
[盘点完成] 待验证项清单已落盘 → [绝对路径]
  待验证项 N（structure X / behavior Y / api Z / data … / config … / dependency … / nfr … / test … / doc …）
  打包为 M 个 batch，分 K 波；推断项 P 条；跳过维度 Q 个
  自动进入语言检测与批次核对
```

### 2.2 自动修订

清单字段缺失或计数错乱时主上下文派发"盘点修订 subagent"，prompt 列出问题、要求 Edit 就地修复、保持字段齐备、更新计数；返回更新后的 `inventory_output`。回到 2.1 重校；连续 2 轮失败则进入 2.3。

### 2.3 硬阻塞（仅此时询问用户）

仅在以下情况暂停：
1. `unresolved_questions` 含阻塞性问题（设计文档关键章节读不到、代码根目录定位失败、语言无法识别）
2. 自动修订连续 2 轮仍不达标
3. 推断项 > 30%（说明设计文档过于模糊，强行核对会输出大量"无法判定"）
4. 多个维度都被跳过（>3）—— 询问用户是否确认这些维度本就不在设计范围内

---

## 阶段 3：语言检测与加载参考资料

### 3.1 语言检测

1. 优先用 `inventory_output.language`；若"待确认"继续：
2. 看代码根目录扩展名分布（参考 tdd-code-skeleton 的检测逻辑）
3. 标志文件（pom.xml / build.gradle / package.json / tsconfig.json / Cargo.toml / go.mod / pyproject.toml / build.sbt / CMakeLists.txt）
4. 仍无法确定 → 询问用户

### 3.2 加载参考文件（按需，不全量）

参考目录结构：
```
references/
├── dimensions.md         # 九大维度核对要点（盘点 subagent 必读，核对 subagent 必读）
├── severity.md           # 严重程度判定矩阵（核对 subagent 必读）
├── report-templates.md   # 一致性矩阵 / 交付报告 / 修复 TODO 模板（阶段 5 必读）
├── java.md / cpp.md / python.md / go.md / rust.md / scala.md / javascript.md / typescript.md
                          # 语言专属：哪些一致性盲点容易被漏（注解/泛型/裸函数/接口默认实现等）
```

主上下文用 Edit 把进度文件总览区"参考文件"字段更新为绝对路径，**不**把 references 全文加载进主上下文。

---

## 阶段 4：批次派发并行核对

### 4.1 核对规范（所有核对 subagent 必须遵守）

**每条发现**必须包含：
- `verify_id`：对应清单中的 ID
- `status`：`consistent`（一致）/ `missing`（设计有代码无）/ `extra`（代码有设计无）/ `divergent`（双方都有但不一致）/ `inferred`（证据不足，仅做推断）
- `severity`：`blocker` / `critical` / `major` / `minor` / `info`（按 `references/severity.md` 判定）
- `design_evidence`：`{file, anchor, lines}`
- `code_evidence`：`[{file, lines, snippet}]`（snippet ≤ 8 行，超出用 `...` 截断）
- `gap`：用一句话精炼地说"差在哪"
- `recommendation`：可执行的修复建议（指明走 `tdd-impl-runner` / `software-design-doc-generator` / `tdd-skeleton-runner` 哪个；或"不修，标记为已知偏差"）
- `confidence`：`high` / `medium` / `low`（low 时建议人工复核）

**禁止**：
- 不给设计 / 代码证据就下结论（必须降级为 `inferred` 状态）
- 把"代码风格 / 命名习惯"问题列为不一致（除非设计文档显式约定命名规则）
- 把超出本 batch 的项也写进回执

### 4.2 调度规则

1. **按 wave 派发**：Read 进度文件"批次计划"表（只读这一段），一次派发整 wave 全部 batch（5~8 并行）
2. **同消息内并行**：同 wave 全部 subagent 在同一条消息中发起多个 Agent 工具调用块
3. **每 subagent 自包含**：subagent 看不到会话历史，prompt 自带全部信息
4. **一个 subagent = 一个 batch = 5~10 VerifyID**（按规模缩放），按维度顺序处理
5. **wave 屏障**：本 wave 全部返回前不派发下一 wave；返回后立即回写

### 4.3 按需读取本 batch 的详细说明

派发前主上下文从清单文件 Read 出**本 batch 全部 VerifyID** 的详细说明段（每段从 `### V-XXX:` 到下一个 `### V-` 之前），按顺序粘到 prompt 的"待验证项详细说明"区。

**允许**：一次 Read 本 batch 的 5~10 段（约 20~60 KB）。
**禁止**：把整份清单加载进主上下文；粘贴非本 batch 的 VerifyID。

### 4.4 核对 subagent prompt 模板

````
批次 ID：batch-N（wave-K，dimension_focus=<dim>）
任务：对以下 5~10 个待验证项做"设计-代码一致性核对"。**只输出发现，不修改任何代码或文档**。

【本批次 VerifyID 清单】
- V-XXX: [item 简称] (维度=<dim>) → 设计来源：<file>:<lines>
[...]

【每个 VerifyID 的详细说明】（主上下文从清单 Read 后按顺序粘贴）

#### V-XXX: [item]
**设计来源**：<file> § <章节> 行 <range>
**expected**：[全文]
**evidence_hint**：[全文]
**verification_strategy**：[全文]
**关联项**：[全文]
**严重度预估**：<level>

[...每个 VerifyID 都完整粘贴，不得"同上"]

【设计文档原文（仅本 batch 涉及章节）】
[主上下文按 design_evidence.lines 一次性 Read 后按顺序粘贴；每段 ≤ 60 行]

【代码索引（盘点输出）】
[贴出本 batch 涉及的类清单 / 路由清单 / 配置文件清单等]

【参考文件（必读一次，按本 batch 维度选择）】
- `<skill>/references/dimensions.md`（九维度核对要点）
- `<skill>/references/severity.md`（严重度判定矩阵）
- `<skill>/references/<lang>.md`（语言专属盲点）

【硬性要求】
1. 用 Read/Glob/Grep 在代码根目录中按 evidence_hint + verification_strategy 定位代码证据
2. 每条发现必须给出 design_evidence + code_evidence；证据不足时降级为 inferred 状态并说明缺什么
3. 严重度按 severity.md 的判定矩阵打，不得感性给分
4. recommendation 必须可执行（指明走哪个 agent / 改哪个文件 / 改成什么）
5. 不修改任何源码或设计文档；不创建新文件（除非是写本 batch 的临时 grep 结果到 /tmp，避免污染仓库）
6. 处理完一个 VerifyID 再下一个

【进度回执（必须，YAML，每个 VerifyID 一条）】
```yaml
batch_findings:
  batch_id: batch-N
  items:
    - verify_id: V-XXX
      dimension: <dim>
      item: "[item 简称]"
      status: consistent | missing | extra | divergent | inferred
      severity: blocker | critical | major | minor | info
      design_evidence:
        file: "[相对路径]"
        anchor: "[章节 / 锚点]"
        lines: "[88-95]"
      code_evidence:
        - file: "[相对路径]"
          lines: "[120-138]"
          snippet: |
            [≤ 8 行]
      gap: "[一句话差在哪；status=consistent 时填'无差异']"
      recommendation: "[可执行建议；status=consistent 时填'无需动作']"
      confidence: high | medium | low
      notes: "[可选]"
    [...本 batch 每个 VerifyID 都必须有一条，即使 inferred/blocked]
```

某 VerifyID 完全无法判定时，将 status 设为 `inferred`、confidence=`low`，并在 notes 写清楚缺哪些信息，**继续处理其他 VerifyID**。
````

### 4.5 每 wave 完成后的回写

本 wave 全部 subagent 返回后，主上下文**立即**：

1. 解析每个 batch 的 `batch_findings.items`
2. 用 Edit 就地更新进度文件：
   - 索引表"状态"列按 `status` 改为 done（含 inferred）/ blocked / 仍 pending
   - 索引表"严重度预估"列改为实际打分
   - 总览区计数
   - 推断项汇总区追加所有 status=inferred 的项
   - 阻塞项汇总区追加所有 status=blocked 的项
   - 批次执行日志区追加本 wave 情况
3. **不**在进度文件里写每条发现的全文（避免文件膨胀）；发现的明细另外保存到 **`<同目录>/<关键词>-design-code-review-findings.jsonl`**（每行一条 finding，便于阶段 5 聚合）

**为什么主上下文写**：避免并发 Edit 冲突；唯一仲裁点保证反思读取可信状态；窄接口（结构化 YAML）比直改 markdown 稳定。

### 4.6 派发下一 wave

仍有未开始 wave → 回到 4.2。全部派发完 → 阶段 5。

---

## 阶段 5：反思补发循环 + 交付一致性矩阵

强制循环：读总览 → 完整性反思 → 补发漏核对 → 回写 → 再反思，直到 `pending = 0`。

### 5.1 完整性反思

只 Read 总览区与索引表，统计：

```
[反思] 待验证项共 N：done X（含 inferred I），blocked Y，pending Z
       pending 归属：V-005, V-012
       blocked 归属：V-009 (reason=...)
       严重度分布（基于 done）：blocker A / critical B / major C / minor D / info E
       判定：[未收敛 / 已收敛]
```

**收敛**：`pending = 0`。**未收敛**：进入 5.2。

### 5.2 补发循环（强制执行）

对所有 pending：
1. 按相同打包规则重新打包（5~10/subagent，pending ≤ 4 时不强求凑满）
2. 派发补发 wave（5~8 batch 并行）
3. 补发 prompt 必须：
   - 标注"补发任务（轮次 = 当前 + 1）"
   - 用 4.4 多 VerifyID 模板列出全部 VerifyID
   - 附前一轮失败原因（按 VerifyID 分别列）
   - 提示可适当放宽 evidence 检索半径（例如默认在主源码目录找不到时扩展到 generated / build / vendor 目录）
4. 返回后回到 4.5 回写 → 5.1 反思
5. 循环直到 pending = 0

**硬性**：不可跳过补发；同一 VerifyID 连续 2 轮 pending 且原因不同则暂停询问用户。

### 5.3 跨 batch 综合校验（收敛后一次）

由主上下文做或派发"综合校验 subagent"：
- **关联项一致性**：清单中标了"关联项"的多个 VerifyID 之间结论是否相互矛盾（例如 V-014 说字段 `email` 在 DTO 缺失，V-021 又说 controller 接受了 `email` —— 这种矛盾要标注并合并为一条更高严重度的发现）
- **维度盲区扫描**：用 grep 抽样检查 references/<lang>.md 列出的语言盲点（如 Java 的 `@Transactional` 是否覆盖所有事务方法；TypeScript 的 strict 是否开启）
- **覆盖率统计**：每个维度的"已核对项 / 设计声明项"占比，低于 80% 时在报告中加红色提示

### 5.4 推断项处理（不阻塞交付）

把所有 status=inferred 的发现按维度分组列入交付报告"推断项清单"。**不请求用户逐条确认**；用户可在交付后按需触发深查。

仅以下情况主动暂停（与 2.3 一致）：推断项 > 30%；某推断涉及核心业务规则、鉴权、金额、状态机；多推断相互依赖致结论不可靠。

### 5.5 交付：一致性矩阵 + 交付报告

主上下文读取 `<关键词>-design-code-review-findings.jsonl`，聚合后用 Write 生成 `<关键词>-design-code-review-report.md`，结构如下（详细模板见 `references/report-templates.md`）：

````markdown
# 设计-代码一致性审计报告

## 摘要
- 设计文档：[路径]
- 代码根目录：[路径]
- 待验证项总数：N（结构 X / 行为 Y / 接口 Z / ...）
- 一致：A 项；缺失：B 项；偏离：C 项；超出：D 项；推断：E 项
- 严重度分布：blocker B0 / critical C0 / major M0 / minor m0 / info I0
- 综合判定：**[就绪 / 需修复后再上线 / 严重不一致建议返工]**

## 一致性矩阵（按维度分桶）

### 维度 1：结构（structure）
| VerifyID | item | 状态 | 严重度 | 设计来源 | 代码证据 | gap | 建议 |

### 维度 2：行为（behavior）
...

### 维度 9：文档（doc）
...

## 关键缺陷清单（按严重度排序，blocker / critical 全列，major 列前 20）

### [BLOCKER] V-XXX: ...
- **设计来源**：...
- **代码证据**：...
- **差异**：...
- **修复建议**：建议执行 `tdd-impl-runner`，目标文件 `xxx`，预期改动概要：……

## 代码超出设计（设计未规定但代码存在）

[这部分容易被漏，但一旦影响安全 / 合规则升级到 critical]

## 推断项清单
[需要更多信息才能判定的项，附"缺什么"]

## 维度跳过说明
[盘点阶段标注的跳过维度及理由]

## Blocked 项 & 建议
[最终仍 blocked 的项，及"是补设计 / 补代码 / 标为已知偏差"建议]

## 修复 TODO（可直接喂给后续 agent）
- [ ] [TODO-1] 调用 `tdd-impl-runner` 修复 V-001、V-005、V-009（结构维度，blocker）
- [ ] [TODO-2] 调用 `software-design-doc-generator` 把 V-018（代码超出设计的字段 `audit_log`）补回设计 § 5.2
- [ ] [TODO-3] 人工评审 V-014（推断项，状态机转移条件存疑）

## 进度文件
- 清单：`<关键词>-design-code-review.md`
- 发现明细：`<关键词>-design-code-review-findings.jsonl`
- 本报告：`<关键词>-design-code-review-report.md`

## 下一步建议（衔接其他 skill）
1. 修复 TODO 中标记 `tdd-impl-runner` 的项 → 切换到 `tdd-impl-runner`
2. 标记 `software-design-doc-generator` 的项 → 切换到该 agent 修订设计
3. 修复后**重新触发本 skill** 做一次回归审计；本进度文件可作为续作基线
````

---

## 附：小规模简化流程

| 待验证项数量 | 简化策略 |
|----------|---------|
| 1~10 | 主上下文直接核对（仍写完整 review.md 供审计），不派发盘点 subagent；维度可仅覆盖设计文档实际涉及的部分 |
| 11~50 | 派发盘点 subagent；批次 1~3 个；其他阶段照常 |
| > 50 | 走完整六阶段：盘点 subagent 独立派发、清单落盘、5~10 项/subagent、5~8 batch/wave、每 wave 回写、反思循环至 pending = 0 |

全规模均"全程自动化"——仅硬阻塞下询问用户。

---

## 与其他 skill / agent 的协同

| 场景 | 切到 |
|------|------|
| 发现"设计要求但代码缺失" → 想修代码 | `tdd-impl-runner`（业务实现）或 `tdd-skeleton-runner`（先补骨架） |
| 发现"代码做了但设计漏写" → 想补设计 | `software-design-doc-generator` |
| 发现"日志埋点不齐"且想补 | `business-logging` |
| 发现"关键 UT 缺失"且想补 | `unit-test-runner` |
| 想可视化结构差异 | `software-diagram` |
| 仅想看本次提交对一致性的影响 | `commit-change-summarizer`（关注变更） + 本 skill（关注全量） 二者互补 |

本 skill **不**自动调用以上 agent —— 仅在交付报告"修复 TODO"中提示用户切换。
