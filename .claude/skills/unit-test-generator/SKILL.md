---
name: unit-test-generator
description: 为各种编程语言生成高质量单元测试（UT）。触发关键词：「单元测试」「UT」「测试用例」「test cases」「写测试」「为函数/类写UT」「提升测试覆盖率」。支持 Java、C++、Python、Golang、Rust、Scala、JavaScript、TypeScript 八种语言，按检测结果只加载对应 references。**支持断点续作**：启动时先在目标目录查找 `*-ut-design.md` 设计文档；若存在且结构完整则按进度续作（仅对 pending 场景重新派发），不重新走 UT 设计阶段。**主流程**：UT 设计阶段由独立 subagent 完成（分析源码、识别被测类、按"测试类"组织场景表并落盘），主上下文只收批次列表以保留窗口；每个代码生成 subagent 承担 5~10 个测试类（按场景数缩放：场景少偏 10、场景多偏 5；单测试类场景 ≥ 20 时独占），每 wave 5~8 batch 并行；每 subagent 返回后回写设计文档"状态"列，对照设计做完整性反思，对 pending 循环补发直到收敛。**测试代码规范**：测试类顶部中文类级注释（被测类、策略、场景汇总、覆盖率目标）；每方法中文方法级注释（场景编号、类型、前置条件、步骤、预期、关注点）；覆盖正常/异常/边界/性能/安全五类场景。**全流程自动化**：设计落盘后自动推进，仅硬冲突（源码与需求矛盾、关键分支无法 Mock、安全阀触发）时暂停。
---

# 单元测试生成

## 概述

为代码编写**高质量、覆盖全面**的单元测试。流程五阶段：

0. 续作检查（首选）
1. UT 设计 subagent → 落盘设计文档（按测试类组织、5~10 测试类/batch）
2. 语言检测 + 加载参考
3. 代码生成 subagent 按 batch 并行（5~8 batch/wave）
4. 回写 + 反思 + 补发循环直到收敛 + 自动一致性检查 + 交付

**核心原则**：
- **主上下文精简**：UT 设计的细节（读源码、枚举场景、组织表格）由独立 subagent 完成，主上下文只接批次列表
- **完整落盘**：每个被测类的场景表必须列全（场景编号、被测方法、类型、描述、输入、预期、关注点、状态），不得以"类似/可参考"省略
- **就近落盘**：设计文档落盘到**用户原始设计文档（若有）或被测源码主目录**，命名 `<关键词>-ut-design.md`
- **批次打包**：每代码生成 subagent 承担 5~10 个测试类（按场景数缩放），每 wave 5~8 batch
- **测试代码全程中文注释**：类级 + 方法级 + AAA 行注释
- **全流程自动化**：仅硬阻塞下询问用户

---

## 阶段 0：断点续作检查（入口闸门）

**进入技能后的第一件事**就是本阶段。

**检测**：
1. 优先目录 = 用户软件设计文档目录；无则被测源码主目录下 `docs/`/`design/`；最后落到源码目录
2. 用 `ls`/`find` 查找匹配 `*-ut-design*.md`
3. 多候选取最近修改时间；用户显式指定路径优先

**校验**（只 Read 总览段约 60 行 + 每测试类节的场景表段）：
- 总览中"被测类清单 / 对应测试类 / 总场景数"齐备
- 每测试类节存在场景表，每行场景含编号（带前缀如 `UserServiceTest-TC-01`）、被测方法、类型、状态列
- 状态列至少识别出 1 个 done/pending/blocked
- done 场景对应测试源文件应存在，且文件内能 grep 到该场景编号的中文注释；缺失 > 30% 视为不可复用回退第一阶段

校验失败则回退第一阶段，不做就地修补。

**分支**（**最小调度单元是"测试场景"，同测试类内可部分 done 部分 pending**）：
1. `pending = blocked = 0`（已收敛）→ 跳到第四阶段一致性检查与交付
2. `pending > 0` → 跳过第一阶段；进入第二阶段（语言检测）；第三阶段仅对含 pending 场景的测试类按 1.3 规则重新打包，prompt 必须明确"本测试类只生成以下场景：[pending 编号清单]，已 done 不要重写"
3. 仅剩 `blocked` → 询问用户放弃或给新方向

**续作摘要**：
```
[续作] 检测到已有 UT 设计文档 → [绝对路径]
  测试类 M，场景 N，done X / blocked Y / pending Z（更新于 YYYY-MM-DD HH:MM）
  续作策略：跳过设计阶段，仅对 pending 场景重新打包派发，已 done 不重写
  自动进入语言检测与代码生成
```

**硬约束**：续作不重做设计；不重写已 done 测试方法（prompt 明确"只追加 pending 场景的方法，不覆盖已有方法"）；不修改已有"被测类概述/Mock 策略/场景表"内容；新增条目追加原文件；用户提供与设计文档矛盾的新需求则停下询问。

---

## 阶段 1：派发 UT 设计 subagent 落盘设计文档

**为什么独立 subagent**：源码体量大易撑爆主上下文；落盘可审计供团队评审；窄接口返回让主上下文只做调度。

### 1.1 设计 subagent 职责

**必做**：Read 所有源码与相关设计文档；识别被测类（"一个被测类 ↔ 一个测试类"）；为每个被测类设计覆盖**正常/异常/边界/性能/安全**五类的场景表；为每个场景生成全局唯一带前缀编号（如 `UserServiceTest-TC-01`）；按 1.4 模板 Write **一次性**落盘；按 1.7 格式回传 YAML 批次列表。

**禁做**：生成任何测试代码；回传设计文档全文或大段摘录；以"类似/显而易见"为由省略任何测试类的场景表。

### 1.2 落盘位置与命名

- **目录**：用户提供软件设计文档则用其目录；否则被测源码主目录下最合适位置（优先 `docs/`、`design/`，没有则源码目录）；多源目录分散时派发前询问
- **命名**：`<关键词>-ut-design.md`
- **冲突**：同名已存在 → 追加 `-YYYYMMDD-HHMM`，**禁止覆盖**

### 1.3 设计 subagent prompt 模板

主上下文用 `Agent`（subagent_type=`general-purpose`）派发 1 个：

````
任务：作为单元测试的"UT 设计 subagent"，独立完成源码分析、被测类识别、场景枚举、总体设计文档落盘。

【原始输入】
- 被测源代码（必须）：[绝对路径列表]
- 软件设计文档（若有）：[路径]
- 需求文档（若有）：[路径]
- 既有测试文件（若需保留/补齐）：[路径列表]

【项目语言（若已知）】[语言名 或 "待检测"]

【设计文档落盘绝对路径】[由主上下文按 1.2 给出]

【落盘文件结构要求】必须完整包含：
1. 总览（被测类清单、对应测试类、场景数、关键依赖、覆盖率目标）
2. 公共约定（公共 fixture、测试数据构造、Mock 策略）
3. 每个测试类一节：被测类概述（职责、关键方法）/ 依赖与 Mock 策略 / 测试场景表（场景编号、被测方法、类型、描述、输入、预期、关注点/风险、状态）/ 覆盖率目标

完整模板见附件 1.4。

【场景分析框架】见附件 1.5（正常/异常/边界/性能/安全 五类）。

【场景编号规范】**必须**带测试类前缀（如 `UserServiceTest-TC-01`），全局唯一，便于双向追踪。

【硬性要求】
1. Read 所有源码以提取真实方法签名、依赖、分支
2. Write 一次性落盘完整设计文档
3. 不得省略任何测试类的场景表
4. 每场景"关注点/风险"列必须明确**本场景意在捕获的 bug 类型**，不得写"确保正确工作"等泛泛内容
5. 不要把设计文档全文粘到返回消息
6. 不要生成任何测试代码、不修改源码

【返回格式】仅返回如下 YAML（可附一句话确认）：

```yaml
design_output:
  design_file: [落盘绝对路径]
  language: [检测或沿用]
  total_test_classes: M
  total_scenarios: N
  test_classes:
    - test_class: UserServiceTest
      target_class: UserService
      source_file: [绝对路径]
      scenario_count: 12
      scenario_id_range: "UserServiceTest-TC-01 ~ UserServiceTest-TC-12"
      key_dependencies: [UserRepository, EmailService]
      coverage_target: "行≥90% / 分支≥85%"
    [...]
  batches:
    - batch_id: batch-1
      wave: 1
      test_classes: [TestA, TestB, TestC, TestD, TestE, TestF, TestG]
      total_scenarios_in_batch: 62  # 推荐 30~80
      size_class: small | medium | large | extra_large
      summary: "..."
    [...]
  unresolved_questions:
    - "[仅填写阻塞性问题：源码与需求矛盾、关键分支无法 Mock、Mock vs 真实实现架构冲突]"
  notes: "[可选]"
```

batches 打包规则：
- 一个 batch = 一个生成 subagent 的工作（5~10 测试类，按 scenario_count 缩放，total_scenarios_in_batch 30~80）
- 单测试类 scenario_count ≥ 20 → 独占 batch（extra_large）
- 同业务域小测试类合并到同 batch
- 一波 5~8 个 batch 并行
- 5~10 是推荐值，已合理划分可偏离
````

### 1.4 UT 总体设计文档模板（附 prompt）

````markdown
# UT 总体设计

> 状态约定：所有场景初始 `pending`；代码生成 subagent 返回后由主上下文回写为 `done`/`blocked`。第四阶段反思以本列为唯一依据。
> 写入约定：本文件由 UT 设计 subagent 初次落盘，之后**只由主上下文写入**；代码生成 subagent 仅通过结构化"进度回执"上报。

## 总览

| 被测类 | 对应测试类 | 场景数 | 关键依赖 | 覆盖率目标 |

- 原始源码路径 / 原始设计文档（若有）
- 总场景数 N，done 0，pending N，blocked 0，补发轮次 0

## 公共约定
- 公共 fixture / 辅助工具类
- 统一测试数据构造约定（Builder/Factory）
- 跨测试类共享的 Mock 策略

---

## 测试类 1：UserServiceTest（被测类：UserService）

### 被测类概述
[类职责简述、关键方法列表]

### 依赖与 Mock 策略
- [依赖项 1]：[Mock 原因 / 真实实现]
- [依赖项 2]：[...]

### 测试场景表

| 场景编号 | 被测方法 | 场景类型 | 场景描述 | 输入 | 预期输出/行为 | 关注点/风险 | 状态 |
|---------|---------|---------|---------|------|-------------|------------|------|
| UserServiceTest-TC-01 | register | 正常 | [描述] | [输入] | [预期] | [本场景捕获的 bug 类型] | pending |
| UserServiceTest-TC-02 | register | 异常 | [...] | [...] | [...] | [...] | pending |

### 覆盖率目标
- 行覆盖率 X%；分支覆盖率 Y%
- 必须覆盖的关键分支/异常路径

---

## 测试类 2：OrderServiceTest（被测类：OrderService）
[同上结构，禁止省略或引用]

## 补发日志
_暂无_
````

### 1.5 测试场景分析框架

为每个被测类的每个被测方法分析：

1. **正常（Happy Path）**：典型输入、合法参数组合、常见业务路径
2. **异常**：null/空值、无效参数、依赖项异常或不可用、权限不足、并发冲突
3. **边界**：数值边界（0/-1/最大/最小/溢出）；集合边界（空/单元素/超大）；字符串边界（空/超长/特殊字符/Unicode）；时间边界（过去/未来/时区/闰年）；浮点精度
4. **性能**：大数据量处理时间、内存占用、高频调用稳定性、缓存命中对比
5. **安全（按需）**：注入攻击、越权、敏感数据泄露

### 1.6 设计 subagent 返回收窄

**只能**返回：一句话确认 + `design_output` YAML。**禁止**返回：设计文档正文、场景表、被测类分析过程。

### 1.7 自动校验与推进（不询问）

主上下文收到 design_output 后：
1. 提取 `design_file`/`test_classes`/`batches`/`total_scenarios`/`unresolved_questions`
2. 按需 Read：总览（确认 total_test_classes/total_scenarios 一致）+ 1~2 个代表性场景表片段（关注点列非泛泛）+ batches
3. 字段齐备 → 输出摘要直接进阶段 2
4. 字段缺失或关注点空泛 → 自动派发"设计修订 subagent"修复

> batch 规模偏离 5~10 测试类、total_scenarios_in_batch 偏离 30~80 **不触发**修订。

**摘要**：
```
[设计完成] UT 设计已落盘 → [绝对路径]
  测试类 M，场景 N，打包为 K 个 batch，分 W 波并行
  自动进入语言检测与批次生成
```

**硬阻塞条件**（仅此时询问）：
1. `unresolved_questions` 含阻塞性问题（源码与需求矛盾、关键分支无法 Mock、依赖架构冲突）
2. 自动修订连续 2 轮仍不达标
3. 某测试类全部场景被标 blocked（说明无法单测）

无硬阻塞一律自动推进。

---

## 阶段 2：语言检测 + 加载参考资料

### 语言检测
1. 优先用 `design_output.language`；若"待检测"继续
2. 用户提供文件扩展名
3. 项目根目录标志文件：
   - Java：`pom.xml`/`build.gradle`/`*.java`
   - C++：`CMakeLists.txt`/`Makefile`/`*.cpp`/`*.h`
   - Python：`requirements.txt`/`setup.py`/`pyproject.toml`/`*.py`
   - Golang：`go.mod`/`go.sum`/`*.go`
   - Rust：`Cargo.toml`/`Cargo.lock`/`*.rs`
   - Scala：`build.sbt`/`*.scala`
   - JavaScript：`package.json`（无 `tsconfig.json`，源码 `*.js`/`*.mjs`/`*.cjs`）
   - TypeScript：`tsconfig.json`/`*.ts`/`*.tsx`；JS+TS 共存按 TS
4. 无法确定 → 询问用户

**只加载对应语言的参考文件**：`references/<语言>.md`（java、cpp、python、golang、rust、scala、javascript、typescript）。每文件含推荐测试/Mock/断言框架、项目配置、命名规范、断言写法、Mock 示例、性能测试写法、完整示例。

> TS 测试通用规范在 `references/javascript.md`，建议先读 JS 再读 TS。

主上下文用 Edit 更新设计文档总览区"参考文件"字段（仅 Edit 单行）。

---

## 阶段 3：按 batch 派发并行生成

### 3.1 为什么按 batch（5~10 测试类）打包

单次大规模生成会撑大 subagent 上下文，导致后半段质量下降、断言粗糙、风格漂移；"一个 subagent 一个测试类"则启动成本高、并行度浪费。**按 5~10 测试类/subagent**：上下文聚焦（30~80 场景）；同业务域聚合保持风格一致；一 wave 可并行 25~80 测试类。

### 3.2 打包决策

| 情形 | 策略 |
|------|------|
| 1 被测类（场景 ≤ 10） | 主上下文直接生成 |
| 2~4 个 | 主上下文直接生成或派发 1 个 subagent 打包全部 |
| 5~10 个 | 派发 1 个 subagent 打包全部（单 batch 单 wave） |
| > 10 个 | 按 batches 打包（5~10/batch，按 scenario_count 缩放），5~8 batch/wave |
| 单测试类 scenario_count ≥ 20 | 独占 batch（extra_large） |
| ≥ 40 或源码复杂 | 按"被测方法组"再拆 2~3 个 subagent |

### 3.3 调度规则

1. `Agent` 工具，subagent_type=`general-purpose`
2. **按 wave 派发**：一次发整 wave 的全部 batch（5~8 并行）
3. **同消息内并行**：同 wave 所有 subagent 在同一条消息中发起多个 Agent 块
4. 每 subagent 收**自包含 prompt**——subagent 看不到会话历史
5. **一个 subagent = 一个 batch = 5~10 测试类**，subagent 内**顺序**处理（不要让 subagent 自己并行）
6. **wave 屏障**：本 wave 全部返回前不派发下一 wave

### 3.4 按需读取本 batch 的设计片段

派发前主上下文从设计文档 Read **本 batch 全部 5~10 测试类**的章节（每章节从 `## 测试类 N：XxxTest` 到下一个 `## 测试类` 之前），按顺序粘到 prompt。

**允许**：一次 Read 本 batch 的多个测试类章节（场景总数 30~80）。
**禁止**：把整份设计文档载入主上下文；粘贴非本 batch 测试类；跨 batch 混合。
**操作**：用 Read 的 `offset`/`limit` 定位行范围。

### 3.5 生成 subagent prompt 模板

````
批次 ID：batch-N（wave-K）
任务：为以下 5~10 个被测类生成单元测试代码，**按清单顺序逐个处理**。本 subagent 只处理列出的测试类。

【本批次测试类清单】
- UserServiceTest（被测类 UserService，场景数 12）→ 输出：[测试文件路径]
- EmailServiceTest（被测类 EmailService，场景数 8）→ 输出：[路径]
[...]

执行策略：按清单顺序，每测试类独立完成"读源码 → 按设计生成测试 → Write 到输出路径 → 进入下一个"。每测试类一独立文件。

【每个测试类的 UT 设计】（主上下文从设计文档 Read 后按顺序粘贴）

#### UserServiceTest
**被测类源码**：[绝对路径]，请用 Read 工具读取完整源码。
[被测类概述 / 依赖与 Mock 策略 / 测试场景表（保留场景编号）/ 覆盖率目标]
**输出路径**：[如 src/test/java/.../UserServiceTest.java]

#### EmailServiceTest
[同上，每测试类完整粘贴，不得"同上"]

【语言与框架】
语言：[语言]　测试/Mock/断言框架：[按 references/<语言>.md 推荐]
参考资料（必读一次）：[绝对路径 references/<语言>.md]

【代码编写规范】
- 文件顶部必须有"类级中文注释块"：被测类、测试策略（Mock 哪些依赖及原因）、覆盖场景汇总（按类型分段并带编号区间）、覆盖率目标、对应设计文档章节
- 每测试方法上方必须有"方法级中文注释块"：场景编号（与设计一致）、场景类型（正常/异常/边界/性能/安全）、场景描述、前置条件（含 Mock 行为设定）、测试步骤（AAA 关键步骤）、预期结果（返回值/异常/交互/副作用）、关注点/风险（**本场景意在捕获的 bug 类型**）
- 方法体内用中文行注释标注 AAA 三段（准备/执行/验证）
- 断言精确：一个 Assert 一个关注点，避免笼统
- 测试隔离：不依赖其他测试顺序，不依赖外部状态
- 测试数据在测试内部构造

【输出要求】
1. 每测试类一个完整可运行的测试文件（含 import/using、类声明、所有测试方法）
2. 按清单输出路径用 Write 写入，不合并
3. **进度回执**（必须，YAML，覆盖本 batch 所有测试类的每一个场景编号，一个不能漏；状态枚举仅 done/blocked/pending；blocked/pending 必须附 reason）：

```yaml
batch_progress:
  batch_id: batch-N
  test_classes:
    - test_class: UserServiceTest
      output_file: [绝对路径]
      scenarios:
        - id: UserServiceTest-TC-01
          status: done
        - id: UserServiceTest-TC-07
          status: blocked
          reason: "必须通过集成测试覆盖数据库事务，单测无法模拟"
        - id: UserServiceTest-TC-12
          status: pending
          reason: "源码分支需先重构以便 Mock，本轮未处理"
    [...本 batch 每个测试类必须各一条]
```

4. 报告：新增依赖配置；新增公共 fixture/helper 的抽取建议
5. 不生成其他 batch 的测试类
6. 某测试类无法完成时所有场景标 blocked 并继续处理其他类，不放弃整 batch
7. 不输出大段解释性文字，聚焦代码、回执与必要说明
````

### 3.6 共享编写规范（所有 subagent + 主上下文须遵守）

**类级中文注释**（文件顶部，必须）：被测类全限定名、测试策略、覆盖场景汇总（按类型分段并带编号区间）、覆盖率目标、对应设计文档章节。

**方法级中文注释**（每测试方法前，必须）：场景编号（与设计文档一致便于双向追踪）、场景类型、场景描述、前置条件、测试步骤、预期结果、关注点/风险。

**AAA 行注释**：在代码块内用 `// 准备 Arrange` `// 执行 Act` `// 验证 Assert` 明确分段。

**质量要求**：测试隔离、命名清晰、Mock 外部依赖、断言精确（一断言一关注点）、数据独立。

详细模板见 `references/<语言>.md`。

---

## 阶段 4：汇总反思 + 自动交付

循环：回写 → 反思 → 漏生成补发 → 收敛后一致性检查 + 交付。**禁止**在存在 pending 时跳过补发直接交付。

### 4.1 回写设计文档（每个 subagent 返回后立即执行）

1. 解析"进度回执"
2. 在设计文档对应场景行更新"状态"列为 done/blocked/pending；blocked/pending 同时写入 reason
3. 用 Edit 就地修改（按场景编号定位行，不加载全文）

**硬性**：绝不跳过回写。后续反思以"状态"列为唯一依据。
**兜底**：未在任何 subagent 回执中出现的设计场景视为隐式 pending，原因"subagent 未报告，需补发核对"。

**为什么主上下文回写而非 subagent**：避免并发 Edit 冲突；统一仲裁点（反思/补发循环必读全量状态）；subagent 是不可靠 writer（可能误改表头/打破对齐/遗漏 reason），结构化回执是受约束的窄接口。

### 4.2 完整性反思（所有本轮 subagent 回写完成后）

只 Read 设计文档总览区与每测试类的"测试场景表"状态列。汇总 done/blocked/pending 各多少、归属哪些测试类。

```
[反思] 设计场景共 27 项：done 23，blocked 2，pending 2
       pending 归属：UserServiceTest（TC-12）、OrderServiceTest（TC-08）
       判定：未收敛，进入 4.3 补发
```

**收敛**：状态列无 pending（只剩 done 或已解释的 blocked）。

### 4.3 漏生成补发循环（强制执行）

未收敛时：
1. 按"所属测试类"分组 pending 场景，按 5~10 测试类/batch 打包（pending 测试类 ≤ 10 则一个 batch；否则拆多 batch 组成一 wave）
2. 同消息并行派发本 wave 全部补发 subagent（5~8 并行）
3. 补发 prompt 必须：
   - 标注"第 K 轮补发，不要重写已存在的测试方法"
   - 用 3.5 多测试类 batch 模板列出全部测试类
   - 主上下文按需 Read 测试类章节并粘贴
   - 只列每测试类的 pending 场景编号
   - 附前一轮已生成的测试文件路径，要求**追加**（append）而非重写
   - 仍要求返回覆盖每场景的 batch_progress 回执
4. 返回后回到 4.1 回写 → 4.2 反思
5. 循环直到状态列无 pending

**强制**：不可以"绝大多数已完成"为由跳过。同一场景连续 2 轮 pending 且原因不同则暂停询问用户（防死循环）。收敛后**自动**进入 4.4/4.5。

### 4.4 一致性检查（收敛后一次）

- 命名风格统一（测试方法、fixture）
- 公共 fixture/helper 是否有重复可抽取
- 依赖版本无冲突（多 subagent 可能各自提议不同版本，取最稳定）
- 类级/方法级中文注释齐备（缺失则派发对应 subagent 补齐）
- 场景编号与设计状态列一一对应，无重复无遗漏

### 4.5 交付

````
## UT 交付汇总

### 反思收敛情况
- 设计场景总数 N，done X，blocked Y，pending 0（必须 0），补发 K 轮

### 设计文档
- 路径：[design_file 绝对路径]

### 测试文件清单
| 测试类 | 文件路径 | 用例数 | done 编号 | blocked 编号 |

### 使用框架与版本
[最终选定；冲突时说明取舍]

### 依赖配置
[合并后的依赖代码块]

### Blocked 场景 & 后续动作
- [编号]：[reason] → [建议：集成测试/手工验证/需重构才能单测]

### 运行方式
[全部测试 / 单测试类 / 覆盖率报告]
````

---

## 附：小规模简化流程

| 被测类数量 | 简化策略 |
|------------|---------|
| 1（场景 ≤ 10）| 主上下文直接生成；仍需五类场景枚举、注释齐备、场景编号一致、自动化 |
| 2~10 | 仍派发设计 subagent 落盘设计文档（生成可审核文档）；全部测试类打包到同一 1 batch 1 wave；其他阶段照常 |
| > 10 | 必须走完整四阶段：设计 subagent 独立派发、设计文档落盘、5~10 测试类/subagent、5~8 batch/wave、每 subagent 回写、反思循环至 pending = 0 |

全规模均"全程自动化"——仅硬阻塞下询问用户。
