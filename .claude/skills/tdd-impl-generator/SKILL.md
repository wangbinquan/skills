---
name: tdd-impl-generator
description: TDD 实现阶段：读取代码骨架（含 TODO 注释）+ 需求/设计文档，生成带详细业务注释的完整业务逻辑实现。触发关键词：「实现业务逻辑」「填充TODO」「补全代码」「generate implementation」「implement skeleton」「实现接口」「TDD实现阶段」「骨架实现」「把 TODO 填完」「按需求实现代码」，或在已有骨架/单测时要求生成业务代码。支持 Java、C++、Scala、Python、Go、Rust、JavaScript、TypeScript 八种语言，按检测结果只加载对应 references。严格保留骨架中所有方法签名、类型定义、注解。**支持断点续作**：启动时先在目标目录查找 `*-tdd-impl-tasks.md` 实现计划文档；若存在且结构完整则按进度续作，不重新走设计阶段。**TODO 零残留硬约束**：实现业务代码时必须**同步替换/删除**骨架对应方法的所有 TODO 注释（替换为解释 WHY 的实现决策注释，或归入 blocked 后用合规占位注释）；实现 subagent 返回前必须自检，主上下文每批回写与交付前必须用 grep 二次校验 `TODO/FIXME/XXX/HACK/unimplemented` 零残留，发现"假 done"立即回滚为 pending 强制补发。**主流程**：实现计划阶段由独立 subagent 完成（读骨架、提取 TODO 清单、建立约束索引、规划 batch 并落盘到原始设计文档同级目录），主上下文只收批次列表；每个实现 subagent 承担 5~10 个待实现方法（按复杂度缩放，简单偏 10、复杂偏 5），**文件锁**约束：同源文件全部方法必须由同一 subagent 处理；每 wave 5~8 batch 并行；每 wave 回写后反思补发循环直到 pending=0 + TODO 零残留终检通过才交付。**全流程自动化**：仅硬冲突（文档矛盾、测试与骨架严重不一致、推断高风险、连续补发失败）时暂停。
---

# TDD 业务逻辑实现

## 概述

读取代码骨架（通常由 `tdd-code-skeleton` 生成），结合需求与设计文档，**生成符合测试契约的完整业务实现**。

**核心原则**：
- **主上下文精简**：实现计划阶段（读骨架、提取 TODO、建立约束索引、规划 batch、落盘）由独立 subagent 完成
- **完整落盘**：计划文档每个 TaskID 必须齐备：骨架文件、方法签名、骨架 TODO 原文（逐字粘贴）、关联约束（C-XXX 含来源）、实现决策备注。不得省略
- **就近落盘**：计划文档落盘到**原始设计文档（或骨架文件）同级目录**，命名 `<关键词>-tdd-impl-tasks.md`
- **批次打包**：每实现 subagent 承担 5~10 方法（按复杂度缩放）；**文件锁**：同源文件全部方法必须同一 subagent；每 wave 5~8 batch 并行
- **测试优先**：不得改变方法签名、访问修饰符、返回类型；实现必须使现有 UT 通过
- **注释即决策**：每个有业务含义的代码块都要解释 WHY（业务依据、设计约束来源），而非 WHAT
- **严格遵从文档**：业务规则来自需求，架构/模式来自设计，不得自行发明业务逻辑
- **TODO 零残留**（硬约束）：实现的同时必须删除/替换对应 TODO；实现完成后源文件中**不得**再出现 `TODO`/`FIXME`/`XXX`/`HACK`/`unimplemented`（含大小写变体）；blocked 方法用合规占位（不含 TODO 字样）。subagent 自检 + 主上下文 grep 二次校验缺一不可
- **全流程自动化**：设计落盘后自动推进，仅硬冲突时询问用户

> ⚠️ **强制顺序**：0 续作检查 → 1 设计 subagent 落盘计划 → 2 自动校验/推进 → 3 语言检测 → 4 wave 派发并行实现 + 回写 → 5 反思补发循环 + 签名检查 + TODO 零残留终检 + 交付。每 wave 不回写不得派发下一 wave。

---

## 阶段 0：断点续作检查（入口闸门）

**进入技能后的第一件事**就是本阶段。

**检测**：
1. 优先目录 = 用户原始设计文档（或骨架文件）所在目录
2. 用 `ls`/`find` 查找 `*-tdd-impl-tasks*.md`（**不要**误把上一阶段的 `*-tdd-skeleton-tasks.md` 当作本技能计划）
3. 多候选取最近修改时间；用户显式指定路径优先

**校验**（只 Read 总览段约 60 行 + 索引表 + 文件锁段，不读全文）：
- 总览计数齐备
- 索引表行数与总数一致
- 索引表"骨架文件"列指向当前项目，文件存在；缺失 > 30% 视为路径不匹配，回退第一阶段
- 文件锁段存在且与索引表"批次"列一致（同一文件 TaskID 必须同 batch）
- done 任务对应骨架源文件**不应**含 TODO/FIXME/XXX/unimplemented（grep 抽查若干 done 文件）；大量残留视为"假 done"，**强制回滚**为 pending 后再续作

校验失败则回退第一阶段，不做就地修补。

**分支**：
1. `pending = blocked = 0` → 跳到第五阶段做 TODO 零残留终检 + 交付报告（**仍要做 grep 兜底**）
2. `pending > 0` → 跳过阶段 1、2；进入阶段 3（语言检测）；阶段 4 仅对 pending 按 1.6 规则（含文件锁）由主上下文重新打包派发；不重做设计 subagent
3. 仅剩 `blocked` → 询问用户放弃或给新方向
4. **检测到"假 done"** → 批量回滚为 pending（更新计划文档状态列与计数），输出 `[续作] 检测到 N 项假 done，已回滚为 pending`，按分支 2 续作

**续作摘要**：
```
[续作] 检测到已有实现计划文档 → [绝对路径]
  总任务数 N，done X / blocked Y / pending Z（更新于 YYYY-MM-DD HH:MM）
  TODO 残留抽检：[通过 / 已回滚 K 项假 done]
  续作策略：跳过设计阶段，直接对 pending 重新打包派发（遵循文件锁）
  自动进入语言检测与批次实现
```

**硬约束**：续作不重做设计；不重写已 done 且通过零残留校验的任务；不修改已有"任务详细说明"段；新增冲突/阻塞追加原文件；**文件锁严格执行**（同文件部分 pending 须分配到同一 subagent，禁止拆给两 subagent 并行 Edit 同文件）；新需求矛盾则停下询问。

---

## 阶段 1：派发设计 subagent 落盘实现计划文档

**为什么独立 subagent**：骨架 + 需求 + 设计 + UT 文件可能很长易撑爆主上下文；落盘可审计；窄接口返回让主上下文只做调度。

### 1.1 设计 subagent 职责

**必做**：Read 所有输入；逐文件逐方法提取 TODO 清单（含 TODO 原文、实现步骤注释、方法签名）；建立业务约束索引（C-001、C-002...，每条挂到具体方法）；按 1.6 规则做文件-subagent 分配；划分批次；为每个 TaskID 写完整详细说明；按 1.4 模板 Write **一次性**落盘；按 1.7 格式回传 YAML。

**禁做**：生成任何业务实现代码；修改骨架文件；回传计划文档全文或大段摘录；以"内容重复"为由省略任何 TaskID 的详细说明。

### 1.2 落盘位置与命名

- **目录**：与**原始设计文档同级**（优先）；无设计文档则与骨架文件同级；通过 `tdd-code-skeleton` 链式触发则沿用上一阶段任务清单的目录；多骨架分散无设计文档时派发前询问
- **命名**：`<关键词>-tdd-impl-tasks.md`
- **冲突**：同名已存在 → 追加 `-YYYYMMDD-HHMM`，**禁止覆盖**

### 1.3 设计 subagent prompt 模板

主上下文用 `Agent`（subagent_type=`general-purpose`）派发 1 个：

````
任务：作为 TDD 业务逻辑实现的"设计 subagent"，独立完成骨架解析、TODO 清单提取、约束索引建立、批次规划，并将完整实现计划文档落盘。

【原始输入】
- 骨架代码文件（必须）：[绝对路径列表]
- 需求文档（强烈推荐）：[路径]
- 软件设计文档（强烈推荐）：[路径]
- 单元测试（推荐）：[路径列表]
- 上一阶段 tdd-skeleton-tasks.md（若有）：[路径]

【项目语言（若已知）】[语言名 或 "待检测"]

【计划文档落盘绝对路径】[由主上下文按 1.2 给出]

【落盘文件结构要求】必须完整包含：
1. 总览（项目、语言、参考文件、骨架来源、各计数、当前批次、补发轮次）
2. 任务明细索引表（TaskID、类名、方法名、TODO 数、约束数、骨架文件、批次、状态、轮次、备注）
3. 任务详细说明区（每 TaskID 一节，齐备：骨架文件、方法签名、骨架 TODO 清单原文、关联约束、实现决策备注）
4. 批次计划与状态
5. 文件锁（哪些 TaskID 共享同一源文件）
6/7/8. 签名冲突 / 阻塞项 / 批次执行日志（初始留空）

完整模板见附件 1.4。

【约束来源优先级】见附件 1.5。
【文件锁与批次划分】见附件 1.6。

【硬性要求】
1. Read 所有输入（骨架每个文件都要读以提取完整 TODO）
2. Write 一次性落盘完整计划文档
3. 不得省略任何 TaskID 的详细说明
4. 骨架 TODO 清单原文必须**逐字粘贴**，不得改写或简化
5. 每条约束 C-XXX 必须标注来源（需求章节 / 设计章节 / 测试行号）
6. 不要把计划文档全文粘到返回消息
7. 不要修改骨架文件
8. 不要生成任何实现代码

【返回格式】仅返回如下 YAML（可附一句话确认）：

```yaml
design_output:
  plan_file: [落盘绝对路径]
  language: [检测或沿用]
  total_tasks: N
  total_todos: X
  total_constraints: Y
  batches:
    - batch_id: batch-1
      wave: 1
      task_ids: [IMPL-001, IMPL-002, ...]   # 5~10 方法，遵循文件锁
      files: [UserService.java]
      method_count: 6
      complexity: simple | medium | complex
      summary: "..."
    - batch_id: batch-2
      wave: 1
      task_ids: [...]
      files: [DTOMapper.java, Validators.java]   # 多个小文件合并
      method_count: 8
      complexity: simple
      summary: "DTO 映射器与校验器合并"
  file_locks:
    - file: UserService.java
      batch_id: batch-1
    - file: DTOMapper.java
      batch_id: batch-2
    - file: Validators.java
      batch_id: batch-2
  unresolved_questions:
    - "[仅填写阻塞性问题：测试与骨架 TODO 严重冲突、约束无法解析、关键文档缺失]"
  conflicts_detected: 0
  notes: "[可选]"
```

batch = 5~10 方法，遵循文件锁；wave = 5~8 batch 并行；单文件方法 > 10 时拆为多 batch 但**必须分到不同 wave**（文件锁禁止并发 Edit 同文件）。
````

### 1.4 实现计划文档模板（附 prompt）

````markdown
# TDD 业务逻辑实现任务清单

> 状态约定：`pending`/`in_progress`/`done`/`blocked`。
> 写入约定：设计 subagent 初次落盘后，**只由主上下文写入**；实现 subagent 仅通过结构化"进度回执"上报。

## 总览
- 项目 / 语言 / 参考文件 / 原始需求文档 / 原始设计文档 / 骨架来源
- 总任务数 N、总 TODO X、总约束 Y
- done 0、in_progress 0、pending N、blocked 0
- 当前批次：—　补发轮次：0

## 任务明细（索引表）

| TaskID | 类名 | 方法名 | TODO 数 | 约束数 | 骨架文件 | 批次 | 状态 | 轮次 | 备注 |

## 任务详细说明（人工审核关键区，禁止省略）

### IMPL-001: UserService.createUser
- **骨架文件**：`src/main/java/.../UserService.java`
- **方法签名（禁止修改）**：`public UserId createUser(String name, String email, String rawPassword)`
- **批次**：batch-1　**状态**：pending　**轮次**：0

**骨架 TODO 清单**（逐字粘贴骨架方法内的所有 TODO，不得改写）：
```
// TODO: Step 1 - 参数校验：邮箱 RFC 5322、密码 ≥8 含大小写数字、name 长度 [2,50]
// TODO: Step 2 - 邮箱唯一性：existsByEmail 检查，已存在抛 EmailAlreadyExistsException
// TODO: Step 3 - 密码哈希与持久化：bcrypt 强度 ≥12，构建 User 后 save
// TODO: Step 4 - 异步发送欢迎邮件：失败仅记 warn 不回滚事务
```

**关联约束**（每条标注来源）：
- C-001：邮箱全局唯一（需求 FR-003）
- C-002：密码 bcrypt 强度 ≥ 12（SEC-001）
- C-003：欢迎邮件异步、失败不回滚（设计 4.2.3）
- C-004：方法在同一事务内（设计 4.3）

**实现决策备注**：
- 邮箱唯一性写入前先行检查（友好业务错误），而非依赖数据库唯一索引异常
- 密码哈希在持久化前完成，rawPassword 不落库
- 事务注解：本方法标 @Transactional（已在设计 4.3 确认）

---

### IMPL-002: UserService.getUserById
[同上结构，禁止省略或引用]

## 批次计划与状态

| 批次 | 并行任务数 | TaskIDs | 批次状态 | 完成时间 | 备注 |

> 批次状态：`pending`/`in_progress`/`done`/`partial`。每批回写后由主上下文更新。

## 文件锁（防止并发写冲突）

| 文件路径 | 分配给 TaskIDs |

> 同一文件方法必须分配给同一 subagent，禁止两 subagent 同时写同一文件。

## 签名冲突记录 / 阻塞项汇总 / 批次执行日志
_暂无_
````

### 1.5 约束来源优先级

```
1. 骨架代码 TODO 注释（最高，已做一次文档提炼）
2. 需求文档显式规则
3. 软件设计文档技术约束
4. 单元测试隐含的行为预期（@Test 断言）
5. 语言/框架最佳实践（最低，标注 [规范推断]）
```

### 1.6 文件锁与批次划分

**文件锁约束（硬性）**：同源文件的所有待实现方法**必须同一 subagent 处理**，禁止拆分（否则 Edit 冲突）。

**batch 打包建议**（5~10 是推荐值）：

| 复杂度 | 每 batch 推荐 | 判定 |
|--------|--------------|------|
| simple（TODO ≤ 2 步、约束 ≤ 1、纯数据变换） | 8~10 | getter/setter、简单映射、小校验 |
| medium（TODO 3~4 步、约束 2~3） | 6~8 | 常见业务方法 |
| complex（TODO ≥ 5 步、约束 ≥ 4，或事务/异步/外部依赖） | 3~5 | 业务协调层 |
| extra complex（单方法 TODO ≥ 10 步） | 1~2 | 独占 batch |

**打包策略（按序）**：
1. **先按文件聚合**：以文件为单位拿到方法数
2. **大文件独占**：方法数在 5~10 → 文件独占一 batch
3. **大文件拆分**：方法数 > 10 → 按方法组拆多 batch，**必须分到不同 wave**
4. **小文件合并**：各 < 5 → 同业务域多个小文件合 1 batch（推荐总 5~10）
5. **尾部处理**：凑不够 5 的尾部允许较小 batch（3~4），不强求

**应避免**（非硬性违规）：单 batch 仅 1~2 方法（除非 extra complex 或最后剩这么多）；单 batch > 10 方法。

**硬性禁止**（校验时强制修订）：
- 同文件方法分散在多 batch（违反文件锁）
- 同大文件拆分的多 batch 在同一 wave（Edit 冲突）
- 跨业务域任意合并小文件

**wave 组织**：无依赖优先 wave 1；每 wave 5~8 batch；同大文件多 batch 必须分不同 wave；工作量尽量均衡（method_count × complexity）。

### 1.7 设计 subagent 返回收窄

**只能**返回：一句话确认 + `design_output` YAML。**禁止**返回：计划文档正文、TODO 清单、约束索引、TaskID 详细说明。

---

## 阶段 2：自动校验与推进（不询问用户）

### 2.1 解析与校验

主上下文收到 design_output 后：
1. 提取 `plan_file`/`total_tasks`/`batches`/`file_locks`/`unresolved_questions`/`conflicts_detected`
2. 按需 Read：总览（确认计数一致）+ 1~2 个代表性 TaskID 详细说明（字段齐备、TODO 原文逐字齐全）+ 批次计划表 + 文件锁表
3. **硬约束校验**：同文件未跨 batch（文件锁）、同大文件拆的多 batch 在不同 wave
4. 字段齐备 + 硬约束满足 → 输出摘要直接进阶段 3
5. 字段缺失或硬约束违规 → 跳到 2.2 自动修订

> batch 方法数偏离 5~10 **不触发**修订（推荐值）。

**摘要**：
```
[设计完成] 实现计划已落盘 → [绝对路径]
  总任务 N（TODO X 条，约束 Y 条），打包为 M 个 batch，分 K 波
  自动进入语言检测与批次生成
```

### 2.2 自动修订

字段缺失或硬约束违规时主上下文派发"设计修订 subagent"：列出问题、要求 Edit 就地修复、重新检查文件锁与 wave 组织、更新计数；返回更新后 `design_output`。回到 2.1 重校；连续 2 轮失败进入 2.3。

### 2.3 硬阻塞条件（仅此时询问）

仅以下情况暂停：
1. `unresolved_questions` 含阻塞性问题（测试与骨架 TODO 严重冲突、关键约束无法解析、骨架文件缺失）
2. `conflicts_detected > 0` 且涉及核心业务规则（鉴权/金额/状态机）
3. 自动修订连续 2 轮仍不达标
4. 实现会覆盖用户既有代码的非骨架部分

---

## 阶段 3：语言检测 + 加载实现规范

### 3.1 语言检测

1. 优先用 `design_output.language`；若"待检测"继续
2. 骨架文件扩展名（`.java`/`.cpp`/`.py`/`.go`/`.rs`/`.scala`/`.js`/`.mjs`/`.cjs`/`.ts`/`.tsx`）
3. 项目根标志文件（`pom.xml`/`CMakeLists.txt`/`go.mod`/`Cargo.toml`/`package.json`/`tsconfig.json` 等）
4. JS+TS 共存（含 `tsconfig.json` 或 `.ts`/`.tsx`）按 TypeScript

### 3.2 加载实现规范文件

参考文件位于 `references/<语言>.md`（java、cpp、python、go、rust、scala、javascript、typescript）。各文件含该语言的注释格式、异常/错误处理、事务/异步/上下文管理、日志规范、惯用法。

主上下文用 Edit 更新计划文档总览区"参考文件"字段为绝对路径（仅 Edit 单行）。

---

## 阶段 4：按批次派发实现 subagent 并行

### 4.1 实现代码编写规范

#### A. 方法级注释（实现版，比骨架版升级）

实现完成后方法注释升级为"实现决策记录"：

```
/**
 * [职责] 一句话方法作用
 * [实现策略] 为何选此算法/数据结构、关键性能特征/边界
 * [业务规则落地] 每条 C-XXX 如何在代码中体现（含来源章节）
 * [异常处理策略] 各失败场景的处理方式（业务异常 vs 基础设施异常 vs 降级）
 * @param ... 含约束
 * @return ... 含特殊情况
 * @throws ... 触发条件
 */
```

#### B. 内联注释（解释 WHY，不重复 WHAT）

**合格**：解释决策原因、约束来源、设计章节引用。
**不合格**：仅复述代码（如 `// 检查邮箱` 在 `if (existsByEmail)` 上方）。

示例对比：
```java
// 合格：邮箱唯一性用轻量 COUNT 前置检查，给出友好业务错误（FR-003）；
//      避免依赖 DB unique 索引异常产生 DataIntegrityViolationException
if (userRepository.existsByEmail(email)) { throw new EmailAlreadyExistsException(email); }

// 不合格：// 检查邮箱
```

#### C. 分步骤注释块（步骤 > 3 时）

按 `// === Step N: 标题 ===` 组织，每步独立解释 WHY 与依据。

#### D. 不得修改骨架的部分

- 方法签名（参数类型/顺序/名称、返回类型、throws、访问修饰符）
- 类的继承关系和字段定义（除非补必要 import 和初始化）
- 不得添加骨架与文档均未定义的公开方法
- **可以**添加：私有辅助方法（须注释说明内聚原因）、局部变量、import

#### E. TODO 同步替换 + "零残留"硬约束（核心交付契约）

**一次实现必须把对应方法所有 TODO 落地为业务代码 + 把 TODO 删除/升级为决策注释**。不允许"代码实现了但 TODO 仍在"的半成品。

**规则**：

1. **替换而非叠加**：实现某 TODO 步骤后，原 TODO 行**必须删除**（理想是重写为解释 WHY 的内联注释）。禁止保留 TODO 后追加实现代码。
2. **禁用标记**（大小写不敏感、含行内与块注释）：实现完成的文件内不得再出现 `TODO`/`FIXME`/`XXX`/`HACK`/`unimplemented!`（Rust）/`NotImplementedError`（Python，除非设计文档明确为对外占位）/`throw new UnsupportedOperationException("TODO")`/`pass # TODO`/`{ /* TODO */ }`。
3. **blocked 方法处理**：不得"保留 TODO 留待后续"。正确做法：
   - 进度回执标 `status: blocked` 并填详细 `blocker`
   - 方法体保留**可编译占位**（抛带明确业务消息的异常或返回合理默认值）
   - 占位注释写 `本方法暂无法实现，原因：XXX，已在计划文档登记 TaskID=IMPL-XXX`，**不得**含 `TODO` 字样
4. **subagent 自检（必做）**：Edit 完成后、返回回执前，用 Bash 对每个修改过的文件执行：
   ```
   grep -n -iE '\b(TODO|FIXME|XXX|HACK|unimplemented)\b' <文件>
   ```
   - 若残留属于本 subagent 应实现却漏处理的 TODO → 原地补实现并删 TODO
   - 若属于本 subagent 未修改的方法/测试文件 → 保持原样
   - 若属于 blocked 方法 → 改写为第 3 条要求的合规占位注释
   - 自检结果必须写入回执的 `todo_scan` 字段
5. **主上下文 grep 二次校验（必做）**：见 4.5 步骤 B.5。

### 4.2 实现 subagent 调度规则

1. **按 wave 派发**：Read 计划"批次计划"表（只读这段），一次发整 wave 全部 batch（5~8 并行）
2. **同消息内并行**：同 wave 全部 subagent 在同一条消息中发起多个 Agent 块
3. **每 subagent 自包含**：subagent 看不到会话历史
4. **一个 subagent = 一个 batch = 5~10 方法**（按复杂度缩放），可跨 1~N 个文件（遵循文件锁）
5. **wave 屏障**：本 wave 全返回前不派发下一 wave

### 4.3 按需读取本 batch 详细说明

主上下文从计划文档 Read 出**本 batch 全部 TaskID**详细说明段（按文件分组），按顺序粘到 prompt。

**允许**：5~10 方法段累计约 15~50 KB。
**禁止**：把整份计划载入主上下文；粘贴非本 batch 段；跨 batch 混合。
**操作**：用 Read 的 `offset`/`limit` 定位行范围。

### 4.4 实现 subagent prompt 模板

````
任务 ID：[IMPL-XXX, IMPL-YYY, ...]（本 subagent 处理同一源文件全部方法或合并后的多个小文件）
任务：为以下源文件实现业务逻辑。只修改列出的文件。

【源文件（骨架代码）】
路径：[绝对路径]
请首先用 Read 读取此文件完整内容。骨架 TODO 注释包含实现步骤指南。

【本批次待实现方法列表】
- [方法名1]（TODO 条目 N，复杂度 高/中/低）
- [方法名2]（...）
（仅实现以上方法，其他方法保持原样）

【任务详细说明】（主上下文从计划文档 Read 后按顺序粘贴）

**方法：[方法名1]**
签名（禁止修改）：[完整签名]
骨架 TODO 清单：[粘贴该方法骨架内所有 TODO 原文]
关联约束：[该方法所有 C-XXX 及来源]
实现决策备注：[计划文档中本方法的"实现决策备注"]

**方法：[方法名2]** [同上]
[...]

【需求文档摘录】（与本文件相关的业务规则段落）
【软件设计文档摘录】（架构约定、模式、事务策略等）
【单元测试文件】（若有）：[绝对路径]，请用 Read 读取，并对每方法确认：测试期望与 TODO 是否一致；如冲突以测试为准并在回执 deviations 记录

【项目语言与实现规范】
语言：[语言]　参考文件（必读）：[绝对路径 references/<语言>.md]
严格遵循：方法级注释（实现版含职责/实现策略/业务规则落地/异常策略）、内联 WHY 注释、分步骤注释（步骤 > 3）、语言惯用法（异常类型、资源管理、并发工具、日志格式）。

【实现硬性要求】
1. 不得修改任何方法签名（参数列表、返回类型、访问修饰符、throws）
2. 不得修改类的字段定义和继承关系
3. 每个实现的方法必须有"实现决策记录"格式注释
4. 每个 TODO 步骤对应实现代码前要有解释 WHY 的内联注释
5. 私有辅助方法须注释说明内聚原因
6. 文档有歧义/冲突时在回执 conflicts 标注，并选"更保守的实现"（更严格校验、更显式错误）
7. 为通过测试不得不偏离 TODO 时在回执 deviations 详细说明
8. **【TODO 零残留硬约束】** 实现的同时**必须**删除/替换本次方法内所有 TODO/FIXME/XXX/HACK/unimplemented：
   - 推荐做法：把 TODO 行重写为解释 WHY 的内联注释
   - 严禁：保留 TODO 同时追加实现代码（半成品形态）
   - 严禁：以"保留 TODO 留待后续"方式交付
   - blocked 方法：改写为带明确业务消息的占位（不含 TODO 字样）
9. **【自检义务】** Edit 完成后、回执前**必须**用 Bash 对修改过的每个文件执行：
   `grep -n -iE '\b(TODO|FIXME|XXX|HACK|unimplemented)\b' <文件绝对路径>`
   - 残留属于本 subagent 负责方法 → 补实现并删 TODO，重复自检直到 clean
   - 残留属于本 subagent 未修改方法 → 保持原样
   - 自检结果（命中行号或 "clean"）必须填入回执 `todo_scan`

【输出方式】
用 Edit 工具就地修改骨架文件（原路径），不创建新文件。修改范围：填充各方法实现的同时**删除/重写其 TODO 注释行**；本 subagent 不负责的其他方法保持不变。

【进度回执（必须，YAML，每个 TaskID 单独报告）】
```yaml
progress:
  - task_id: IMPL-001
    file_path: [实际修改文件绝对路径]
    status: done   # done / blocked / partial
    method: createUser
    todos_resolved: 4
    todos_total: 4
    todos_removed_from_file: 4   # 本方法骨架原有 TODO 行已全部删除/重写
    todo_scan:                   # 必填
      command: "grep -n -iE '\\b(TODO|FIXME|XXX|HACK|unimplemented)\\b' <文件>"
      result: clean              # clean / residual
      residual_hits: []          # 若 residual 列出 "行号: 内容" 并说明为何不属于本 subagent 范围
    helper_methods_added:
      - name: [名称]
        reason: "[内聚原因]"
    deviations:
      - detail: "..."
        reason: "..."
    conflicts:
      - detail: "..."
        action: "保守处理：..."
    inferred_items:
      - kind: private_method
        name: [名称]
        reason: "..."
    notes: "..."
  - task_id: IMPL-002
    [...]
# blocked 方法：
#  - status: blocked
#  - blocker: "[详细原因]"
#  - placeholder_notes: "已保留可编译占位（抛 UnsupportedOperationException 附业务消息），不含 TODO 字样"
#  - todos_removed_from_file: N
#  - todo_scan.result: clean
```
````

### 4.5 每批回写（批次屏障，不可跳过）

> 完成以下所有回写步骤前，不得派发下一批或进入第五阶段。

本批 subagent 全部返回后主上下文**立即**：

**A. 解析所有进度回执**：提取每个回执的 task_id/status/method/deviations/conflicts/inferred_items；未返回回执的 TaskID 置 `pending`，备注"subagent 未返回回执"。

**B. 回写计划文档**（用 Edit 就地修改单行，不 Read 全文）：
- 索引表"状态"列改 `done`/`blocked`/`pending`
- 总览区计数
- 偏差记录区追加 `TaskID | 方法 | 偏差 | 原因`
- 冲突记录区追加
- 推断项汇总区追加
- 批次执行日志追加（批次号、完成时间、各计数）

**B.5. TODO 残留 grep 二次校验**（强制，**不依赖** subagent 自检）：

对本批每个回写为 done 的文件执行：
```bash
grep -n -iE '\b(TODO|FIXME|XXX|HACK|unimplemented)\b' <file>
```

处置：
- **clean** → 通过，继续 C
- **命中且属于本批 done 方法范围** → "假 done"：(1) 对应 TaskID 回滚 `pending`，轮次 +1；(2) 阻塞项汇总追加记录；(3) 自动进入下一轮补发
- **命中且属于 blocked 方法** → 核对占位是否合规（不含 TODO 字样）；不合规则回滚 pending 要求改写
- **命中且属于本批未处理方法** → 不动，待其所属 batch 处理

**C. 输出回写摘要**：
```
[批次 batch-N 回写完成]
本批派发 X 个 subagent
done A，pending B，blocked C
计划文档已更新：[plan_file]（总 done D / N）
```

**D. 进入第五阶段反思**（不论本批是否全 done 都要反思）

---

## 阶段 5：反思 + 强制补发循环 + 终检 + 交付

> **强制循环**，不可提前退出。每次 4.5 回写后必须进入。`pending = 0` 时才允许进入 5.3 签名检查与 5.5 交付。

### 5.1 完整性反思

只 Read 总览区与索引表，提取计数：
```
[反思 — 轮次 K]
读取计划文档：[plan_file]
  总任务 N，done X，pending Z（关键，必降为 0），blocked Y，in_progress 0
pending 归属：
  - IMPL-007：OrderService.calculateTotal（未收到 subagent 回执）
  - IMPL-009：OrderService.applyDiscount（partial，原因：折扣规则缺失）
判定：[未收敛，进入 5.2 补发] / [已收敛，进入 5.3]
```

### 5.2 补发循环（pending > 0 时强制执行）

```
WHILE pending > 0:
  1. 聚合所有 pending，按首轮规则重新打包：
     - 同文件任务必同 batch（文件锁）
     - 每 batch 5~10 方法，按复杂度缩放
     - pending 总数 ≤ 4 允许较小 batch
  2. 在计划文档把本轮 pending 状态改 in_progress，补发轮次 +1
  3. 组成一 wave 并行派发（5~8 batch）
     补发 prompt 必含：
       - "第 K 轮补发，前一轮状态：[按 TaskID 列原因]"
       - 4.4 多 TaskID 模板
       - 主上下文按需 Read 各 TaskID 详细说明并粘贴
       - 已完成方法/类型字典最新版
  4. 等待本 wave 全部返回
  5. 执行 4.5 完整回写流程（A → D）
  6. 重读总览区更新 pending 计数
  ─────────────────────────────────────
  [安全阀] 同一 TaskID 连续 2 轮仍 pending 且原因不同：
    → 暂停补发，向用户报告，请求指示
    → 不得默默跳过、不得无限重试
  ─────────────────────────────────────
END WHILE

[收敛确认] 重读总览：✅ pending = 0，共 K 轮补发，自动进 5.3
```

### 5.3 签名一致性检查（收敛后）

对全部已实现文件：
1. 提取所有公开方法签名
2. 对比骨架原始签名（名称、参数、返回类型）
3. 发现签名变更立即派发修复 subagent 恢复原始签名（保留实现逻辑只改签名）

存在 UT 文件时对每个公开方法确认：测试调用点能与当前签名编译通过、Mock 设置与实现行为匹配。

### 5.3.5 TODO 零残留终检（强制，不可跳过）

进入 5.4/5.5 前**必须**对本次实现涉及的**全部**源文件做最终扫描：
```bash
grep -rn -iE '\b(TODO|FIXME|XXX|HACK|unimplemented)\b' <骨架来源文件集合>
```

处置：
- **clean** → 记 "✅ TODO 零残留终检通过"，进 5.4/5.5
- **命中**：
  - 所属 TaskID 为 `done` → 严重缺陷，回滚 `pending`，回 5.2 补发循环，**不得交付**
  - 所属为 `blocked` → 核对占位合规性；不合规则派发修复 subagent
  - 属于测试文件或非本次实现范围文件 → 记入交付报告"范围外残留"，不阻断

终检命令与结果**必须**在对话中以简短摘要输出，作为交付前显式证据。

### 5.4 代码质量检查（可选）

- 实现方法是否都有"实现决策记录"注释（抽样 20%）
- 内联注释是否解释 WHY（抽 5 条判断是否仅复述代码）
- 私有辅助方法是否有内聚说明
- 日志是否遵循参考文件规范（级别、不记录敏感字段）

### 5.5 交付报告

```
## 业务逻辑实现交付报告

### 收敛情况
- 任务总数 N，done X，blocked Y，pending 0（必须 0），补发 K 轮
- 签名一致性：✅ 通过 / ⚠️ 发现 M 处签名变更（已修复）
- **TODO 零残留终检**：✅ 通过 / ⚠️ 范围外残留 M 处
- 终检命令：`grep -rn -iE '\b(TODO|FIXME|XXX|HACK|unimplemented)\b' <骨架来源>`
- 终检摘要：[实际命中条数与处置]

### 实现概览
| TaskID | 文件 | 方法 | TODO 数 | 偏差数 | 冲突数 | 推断项数 |

### 偏差记录（需人工审核）
> 偏差 = 实现偏离 TODO 注释的指导，通常为通过测试

### 冲突记录（需人工解决）
> 冲突 = 需求与设计对同一行为描述不一致

### 推断项（需人工确认）
[列出所有 [规范推断]]

### Blocked 项及建议
- [TaskID]：[reason] → [建议：补充文档/手工实现/跳过]

### 实现计划文档
- 路径：[plan_file 绝对路径]

### 下一步
1. 审核偏差记录
2. 解决冲突标注的文档不一致
3. 运行 UT 验证全部通过
4. Code Review 重点查"业务规则落地"注释与需求一致
5. 新需求 → 回 tdd-code-skeleton 补骨架，再用本技能继续
```

---

## 附：小规模简化流程

| 方法数 | 简化策略 |
|--------|---------|
| ≤ 4（通常 1 小文件） | 主上下文直接实现；仍需 TODO 清单/约束确认、决策注释、内联 WHY、签名检查、TODO 零残留终检、自动化 |
| 5~10 | 仍派发设计 subagent 落盘计划；全部方法打包到同一 1 batch 1 wave；其他阶段照常 |
| > 10 | 必须走完整五阶段：设计 subagent 独立派发、计划落盘、5~10 方法/subagent（按复杂度缩放、遵循文件锁）、5~8 batch/wave、每 wave 回写、反思循环至 pending = 0 + 终检通过 |

全规模均"全程自动化"——仅硬阻塞下询问用户。
