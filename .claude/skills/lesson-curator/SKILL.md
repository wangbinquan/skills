---
name: lesson-curator
description: 在任务执行出错、调试结束、代码评审反复发现同类反模式、压测/线上事故、迭代/季度复盘之后，把"这次踩到的坑"沉淀为代码仓内可被未来 Claude 会话与团队复用的工程经验资产，并按知识治理标准（分类 / 合并 / 查重 / 生命周期 / 脱敏）维护知识库不冲突、不重复、不退化的专业 skill。当用户提到「总结经验 / 把教训记下来 / 积累到代码仓 / 建立知识库 / 经验沉淀 / 经验归档 / 沉淀文档 / 形成规范 / 复盘 / 事故复盘 / 错误总结 / 把这次踩的坑记下来 / 让下次别再踩 / lessons learned / post-mortem / postmortem / save the lesson / file this gotcha / archive this insight / capture for the team / 把这个反模式记下来 / 把这次的修复教训写进文档」等意图，或在 bug 修复合入后、调试结束后、代码评审反复发现同类问题后、事故复盘会后、迭代/季度回顾时希望"把这次的发现固化下来"——**主动触发**本 skill。核心职责：(1) 规划并维护 `.claude/lessons/` 经验仓（INDEX、taxonomy、按主题分类的 categories/、postmortems/、archive/、DEPRECATED.md），按主题/语言/层次/严重度/来源等多维度组织；(2) 用统一模板（症状/根因/修复/可推广教训/检测预防/证据/标签/生命周期）持久化每条经验；(3) 写入前**必读已有 INDEX 与候选分类文件**，按 MERGE / CROSS-LINK / SUPERSEDE / NEW 四态决策树消解冲突，**严禁静默覆盖、严禁重复条目、严禁物理删除**；(4) 强制最低质量门槛（可推广教训 + 证据 + 标签 + 已脱敏）与价值三问，过滤掉一次性、无推广价值的"流水账"；(5) 维护生命周期（active / validated / stable / superseded / deprecated）与变更审计（首次发现、上次复核、来源 commit/任务、reviewer），ID 永不复用；(6) 在合适时机建议把新经验固化为自动化审计规则、代码规范或设计契约，但**只建议、不依赖任何外部工具**。**不修改业务代码、不自动 commit**——所有改动以可审阅 diff 形式呈现给用户确认；当本次问题没有推广价值时，明确告诉用户"这条不值得归档"而非硬塞进知识库。
---

# Lesson Curator — 工程经验沉淀与知识治理 skill

> 一句话：把"这次踩到的坑"按知识治理的标准（分类 / 合并 / 查重 / 生命周期 / 脱敏）沉淀为代码仓内**可被未来复用**的工程经验资产。

---

## 1. 核心定位（What）

任务执行过程中的失败、调试、评审、压测、事故、复盘——这些场景每天都在发生，而其中的"教训"如果不被结构化沉淀，就只能以零散口口相传或埋在 commit message 里的形式存在，下次有人遇到类似情境只能再踩一次。

`lesson-curator` 不是一个写流水账的工具。它的目标是建立一个**自治、自洽、可复用、可审计**的工程经验知识库：

- **自治**：有自己的目录、模板、索引、生命周期
- **自洽**：经验之间不冲突，重复条目会被合并而不是并存
- **可复用**：未来任何 Claude 会话或工程师都能 grep / 翻 INDEX / 按主题翻分类找到相关教训
- **可审计**：每条经验都有出处（commit / PR / 任务）、首次发现日期、复核日期、reviewer

它的产出是仓内 markdown 文件——**不动业务代码、不自动 commit**（只在合适处提后续固化建议）。

---

## 2. 何时触发（When）

主动触发场景：
- bug 修复合入后；线上事故复盘后；调试持续较久后用户感叹"这次坑很大"
- 代码评审里发现"这是第 N 次踩同样的坑"
- 压测 / 混沌演练 / 安全审计后发现新短板
- 迭代回顾、季度回顾、技术债盘点
- 用户显式说出 frontmatter 里列举的触发词

**不要触发**的场景：
- 普通编码、纯 how-to、写算法题
- 单纯修 typo、修 lint
- 一次性配置错误（密码错了、文件路径敲错）
- 没有可推广价值的"流水账"

判断要点：能否回答"这条经验对未来 ≥2 个不同场景有用吗？"——能就触发，不能就别。

---

## 3. 知识治理的核心原则（Why）

1. **可推广胜过可记录**：一条经验如果只能用在被修复的那一行，不是经验，是 commit message。每条入库经验必须有"未来在不同模块/不同语言/不同业务也适用"的判断。
2. **单源存储 + 多维索引**：每条经验只在一个 `categories/<x>.md` 文件中存在；多维度（语言、层次、严重度、来源）通过 INDEX.md 反向索引访问，避免一条经验在多文件副本之间漂移。
3. **不静默覆盖**：合并、取代、归档都要走显式流程；尤其 SUPERSEDE 必须用户确认。
4. **证据 + 出处**：没有 file:line + commit 的"经验"是空话。
5. **显式生命周期**：active → validated → stable / superseded / deprecated。状态变更触发归档与索引更新。
6. **ID 永不复用**：即便条目被废弃，其 ID 也不会被新条目重新分配——保证历史 PR 引用永久有效。
7. **脱敏先行**：写入前必跑正则扫描（密码 / token / api key / 邮箱 / 内网 IP / Bearer），命中即提示。
8. **抑制膨胀**：不达质量门槛的"经验"明确告诉用户"这条不入库"，而不是硬塞。
9. **固化建议**：只在合适处建议把新经验固化为自动化规则 / 代码规范 / 设计契约；不依赖任何外部工具完成知识沉淀。
10. **审计可回溯**：每条经验都有 Discovered / Last reviewed / Reviewer 字段，配合 git 历史构成完整审计链。

---

## 4. 经验仓目录布局（Where & How）

**默认位置**：`.claude/lessons/`，位于目标仓 git 内。

如果项目把 `.claude/` 放进了 `.gitignore`，**先停下来问用户**改用哪个位置（如 `docs/lessons/`、`lessons/`），不要擅自决定——经验库是**团队共享资产**，必须可被纳入版本控制。

```
.claude/lessons/
├── INDEX.md                      # 总入口；含 next-id、按分类/标签/时间三视图索引
├── taxonomy.md                   # 主分类与标签的 controlled vocabulary
├── DEPRECATED.md                 # 离开 active 流的所有条目的索引
├── categories/                   # 每主分类一个文件，承载经验本体
│   ├── null-safety.md
│   ├── resource-leak.md
│   ├── concurrency.md
│   ├── performance.md
│   ├── memory.md
│   ├── error-handling.md
│   ├── external-resilience.md
│   ├── api-contract.md
│   ├── data-consistency.md
│   ├── boundary.md
│   ├── observability.md
│   ├── config-environment.md
│   ├── time-encoding.md
│   ├── security.md
│   ├── testing.md
│   ├── build-tooling.md
│   └── process-collab.md
├── archive/                      # 与 categories/ 一一对应的归档区
│   └── ... (镜像结构)
└── postmortems/                  # 长篇事故复盘（事件记录，区别于 categories/ 的"教训"）
    └── YYYY-MM-DD-<slug>.md
```

**文件角色一句话**：
- `INDEX.md`：always-loaded 入口，唯一记录 Next ID 的地方
- `taxonomy.md`：分类法，受变更控制；新增主分类必同时更新 INDEX、taxonomy、对应目录文件
- `categories/<x>.md`：经验本体；条目按 ID 倒序排列
- `archive/<x>.md`：被 supersede / deprecate 的历史条目（**永不物理删除**）
- `DEPRECATED.md`：归档索引
- `postmortems/`：事件记录（与 lessons 不同）

**lessons / postmortems / ADR 三者的差别**（重要）：

| 文档类型 | 视角 | 包含 | 本 skill 是否维护 |
|----------|------|------|-------------------|
| postmortem | 事件叙述 | 时间线 / 影响 / Action items | ✅（postmortems/） |
| lesson | 教学规则 | 一条可推广教训 + 检测预防 | ✅（categories/） |
| ADR | 决策记录 | 问题 / 选项 / 决定 / 后果 | ❌（不替代 ADR） |

**一个 postmortem 可以派生 0 ~ N 条 lessons**——通过 lesson 的 Related 字段反向引用 postmortem 文件。

---

## 5. 完整工作流（11 步）

每次触发，按以下顺序执行。**任一步遇到不确定 / 缺信息，就先问用户**，不要臆造。

### 5.1 — Bootstrap 检查
读 `.claude/lessons/INDEX.md`：
- 不存在 → 进入 bootstrap 子流程：列出将创建的文件清单 → 用户确认 → 用 `assets/*.template` 生成 → **不**自动 commit
- 存在但缺关键文件（如 `taxonomy.md` 或某些 `categories/<x>.md`）→ 提示并补全
- 存在 → 直接进入下一步

### 5.2 — 意图确认
向用户复述："你刚才描述的是 X 问题，我打算把它沉淀为一条 lesson。对吗？"
如果用户其实只想修 bug，礼貌停下，不强行入库。

### 5.3 — 信息采集（5 字段必填）
从对话上下文 + 必要追问中收集：
1. **症状**（What broke）
2. **根因**（True why）
3. **修复**（What was actually done）
4. **可推广教训**（Generalizable lesson — ⭐ 最关键）
5. **证据**（file:line + commit / PR）

任何一项缺失或含糊，**先问用户补全**——这条 skill 的产出质量完全取决于这一步。每次只问 1~2 个，不要轰炸式问 5 个。

### 5.4 — 价值判定（要不要入库）
对照 `references/quality-gates.md` 的"价值三问"。
不达标的，直接告诉用户"这条不值得入库，原因是 ___"，结束流程。**抑制膨胀比塞满更重要**。

### 5.5 — 分类与打标签
读 `references/taxonomy.md`：
- 选 **1** 个主分类（不要多选；多归属的经验通常需要拆分为多条 lesson）
- 至少打 `severity:` 与 `status:` 两个标签
- 视相关性追加 `lang:` `layer:` `source:`

### 5.6 — 候选检索（防重复）
按 `references/conflict-resolution.md` 的算法：
1. 读 INDEX.md 全文
2. 按主分类 + 标签 + 摘要关键词 找候选 ID
3. 打开候选所在的 `categories/<x>.md`
4. 比对症状/根因相似度

如有 ≥3 个难判断的候选，把候选 ID + 一句话摘要列给用户让其确认。

### 5.7 — 冲突消解（4 态决策）
- 同症状 + 同根因 → **MERGE**（追加 evidence、并入 tag、更新 last-reviewed、可拓宽教训）
- 同根因 + 不同症状 → **CROSS-LINK**（新条目 + 双向 Related）
- 修复 / 教训直接矛盾 → **SUPERSEDE**（**必须**用户确认；旧条目 → archive）
- 都不命中 → **NEW**（分配新 ID）

### 5.8 — 脱敏扫描
按 `references/redaction.md` 跑正则扫描。命中即向用户报告并要求显式确认放行或替换为占位符。**绝不静默写入未脱敏内容**。

### 5.9 — 写入与索引更新
按 `references/lesson-template.md` 写入条目。然后**必须同步更新** INDEX.md：
- "All lessons" 段加一行
- "By category" 段计数 +1
- "By tag" 段把新 ID 添加到对应 tag 行
- 顶部 Next ID + 1 与 Total 计数 +1
- 如有 SUPERSEDE：把旧条目移到 `archive/<x>.md`、在 `DEPRECATED.md` 添加索引行

**写入顺序**（事务性）：先 categories/<x>.md → 再 INDEX.md → 最后（如适用）archive + DEPRECATED。中途出错以 git 状态为准，由用户决定回滚。

### 5.10 — 终检
- 自检 quality-gates 清单
- 再跑一次脱敏正则
- 检查 cross-link 字段双向闭环（A.Related = [B] ⇔ B.Related ⊇ [A]）
- 检查 ID 唯一（grep `^## L-` 计数）

### 5.11 — 呈现 + 协同建议
- 把所有改动以 git diff 形式呈现给用户
- **不自动 commit**
- 视情况建议后续固化动作：
  > "这条适合固化为自动化 lint / 静态分析规则吗？"
  > "这条暴露了日志缺失，要不要补充到团队日志规范？"
  > "这条暴露了设计契约缺失，要不要补充到设计文档或接口规范？"

---

## 6. 经验条目 schema（简版；详见 references/lesson-template.md）

```markdown
## L-NNN: <一句话摘要，可被 grep>

- **Tags**: lang:..., layer:..., severity:..., status:..., source:...
- **Discovered**: YYYY-MM-DD（commit <short-hash> / PR #<n> / 任务 <id>）
- **Last reviewed**: YYYY-MM-DD
- **Reviewer**: <handle 或 claude-session>
- **Related**: L-aaa, L-bbb（无则写 "-"）
- **Supersedes**: L-ccc（仅在 SUPERSEDE 时填）

### 症状（Symptom）
### 根因（Root cause）
### 修复（Fix applied）
### 可推广的教训（Generalizable lesson）⭐ 灵魂字段
### 检测与预防（Detection & prevention）
### 证据（Evidence）
### 备注（Notes）
```

**最关键的字段**是"可推广的教训"。它是这条 lesson 的灵魂——必须可独立成立，不依赖原始 bug 的具体细节。`references/lesson-template.md` 给出了好/差对比与写作骨架。

---

## 7. 冲突消解决策树（高频简版）

| 情形 | 动作 | 是否需用户确认 |
|------|------|----------------|
| 症状 ≈ + 根因 ≈ | **MERGE**：追加 evidence、并入 tag、更新 last-reviewed、可拓宽教训段 | 否（但要展示 diff） |
| 根因 ≈ 但症状不同 | **CROSS-LINK**：新条目 + 双向 Related | 否 |
| 修复 / 教训直接矛盾 | **SUPERSEDE**：旧 → archive；新 → 顶替；DEPRECATED.md 留索引 | **是（强制）** |
| 都不命中 | **NEW**：分配新 ID；如有近邻条目放入 Related | 否 |

详见 `references/conflict-resolution.md`，含完整算法、禁止合并的边界、必须用户确认的场景清单。

---

## 8. 质量门槛（写入前必过）

最低门槛（任一不达即不入库）：
- 五段必填（症状 / 根因 / 修复 / 可推广教训 / 证据）齐全
- ≥1 条 evidence 含 file:line + commit
- 至少 severity + status 两个标签
- 摘要 ≤ 60 字符且可 grep
- 通过候选检索去重
- 通过脱敏扫描
- 通过价值三问

详见 `references/quality-gates.md`。

---

## 9. 生命周期管理

```
[active] ─二次复现─▶ [validated] ─固化为规范/规则─▶ [stable]
   │                     │                              │
   │                     └─出现矛盾建议─▶ [superseded] ◀┘
   │
   └────上下文失效────▶ [deprecated]
```

**复核节奏建议**：
- active：30 天内若无二次验证则复核一次（主动 deprecate 或合并到上位条目）
- validated：每季度复核
- stable：每半年复核（确认 evidence 仍指向有效代码）

详见 `references/lifecycle.md`。

---

## 10. 脱敏（Redaction）

写入前**必跑**正则扫描：
- `password=xxx` / `token=xxx` / `api_key=xxx`
- `Bearer <…>` / JWT
- 邮箱（含真实姓名格式）
- 内网 IP（10/8、172.16/12、192.168/16）
- 公司私有域名

命中即向用户报告并要求确认放行 / 替换为占位符。

详见 `references/redaction.md`。

---

## 11. 后续固化建议

`lesson-curator` 只维护经验文件，不依赖任何外部工具。但在合适时机，Claude 会根据 lesson 的类型**建议**用户进行后续固化：

| 经验类型 | 建议后续动作 |
|----------|-------------|
| 反模式（concurrency / null-safety / resource-leak / boundary / memory / time-encoding 等） | 考虑将教训固化为自动化 lint / 静态分析规则 |
| 日志与可观测性（observability、security 部分） | 考虑将教训补充到团队日志规范 / oncall handbook |
| 接口契约 / 状态机 / 配置项 | 考虑将教训补充到设计文档或接口规范 |
| 涉及流程图 / 状态机的经验 | 可以用图示补充到 lesson 的备注段，提升可读性 |
| 长篇事故 | 考虑写完整 postmortem（`postmortems/`），从中提炼 lesson |

详见 `references/integration.md`。

---

## 12. 第一次使用：bootstrap 行为

如果 `.claude/lessons/` 不存在：
1. 列出将创建的文件清单（INDEX.md / taxonomy.md / DEPRECATED.md / 17 个 categories/<x>.md / archive/ / postmortems/）
2. 用户同意后，从 `assets/*.template` 生成对应文件
3. 检查 `.gitignore`：如果 `.claude/` 在内，提示用户考虑改路径或解除忽略
4. **不自动 commit**——把改动列出来让用户检查并 commit

---

## 13. 反模式（不要做这些事）

- ❌ 复制 commit message 当 lesson 内容
- ❌ 写"以后小心点"这种废话作为可推广教训
- ❌ 同一条 lesson 存在多个 categories/ 文件（应只在一处 + Related 引用）
- ❌ 把新 lesson 塞到分类不匹配的旧条目里
- ❌ 静默覆盖 stable 条目
- ❌ 把私密信息（密码 / token / 邮箱 / 内网 IP）塞进 lesson
- ❌ 不做候选检索就 NEW
- ❌ 用 lesson 记一次性配置错误
- ❌ 物理删除 lesson 文件（应走 deprecated → archive 流程）
- ❌ 把 postmortem 的全文复制到 categories/ 里（categories 只放可推广教训）
- ❌ 给一条 lesson 同时打 ≥2 个主分类（如果真有这种需求，拆成两条 + cross-link）
- ❌ 编辑 categories/<x>.md 但不更新 INDEX.md

---

## 14. 示例

### 例 1：值得入库的 lesson

> **触发**：花了 4 小时定位为什么 Kafka consumer 偶发卡死。
> **根因**：consumer 单线程在 commit 前遇到长 GC，被 broker 判定离线触发 rebalance；rebalance 期间又收到上一轮 partition 的消息引发 IllegalStateException。

入库为：
- 主分类：concurrency
- 摘要："Kafka consumer 在长 GC 后被判离线 + rebalance 期间消费旧 partition 引发异常"
- Tags：`lang:java`, `layer:framework`, `severity:critical`, `status:active`, `source:debug`
- 可推广教训：**任何"心跳/会话"驱动的客户端，在长 stop-the-world 后必须重新校验会话；rebalance / leader-change 期间收到的消息必须按 generation/epoch 校验，不能假定连续。**
- 检测预防：JVM GC 监控 P99 < 会话超时；consumer 包装层在 poll 前校验 generation
- 证据：`src/.../KafkaConsumerWrapper.java:142`, commit `a1b2c3d`

### 例 2：不值得入库

> **触发**：忘了在 `application.yml` 里改 db port，本地连不上。
> **价值三问**：能否推广到不同场景？否——一次性配置错误。能否被既有 skill 覆盖？是——任何启动期校验都会捕获。

→ **不入库**。Claude 解释清楚原因，并可顺势提醒"启动期 fail-fast 校验"反而可能是值得入库的方向（但属于另一条）。

### 例 3：MERGE 案例

> 已有 L-007："HTTP 客户端默认无超时导致级联挂死"（status:validated）。
> 新发现：另一处 gRPC 客户端也是默认无超时，同样导致级联挂死。

→ MERGE 到 L-007：
- evidence 追加 gRPC 客户端的 `file:line + commit`
- tags 并入 `lang:go`（如果原条目是 `lang:java`）
- 教训段从"HTTP"拓宽为"任何外部调用"
- last-reviewed 更新为今天

### 例 4：SUPERSEDE 案例

> 已有 L-012：建议用 `time.After(d)` 做超时（status:active）
> 新发现：`time.After` 在 Go 中即使外部 channel 早返回，timer 也不会回收，长循环会泄漏。新建议：用 `context.WithTimeout` 的 `Done()` channel。

→ SUPERSEDE 流程：
- 必须先呈现矛盾点给用户确认
- 创建 L-NNN（新建议）
- L-012 status 改为 superseded，末尾追加："Superseded by L-NNN，原因：time.After 在长循环中存在 timer 泄漏"
- L-012 整段移动到 `archive/concurrency.md`
- DEPRECATED.md 添加一行
- INDEX.md 更新两条状态

---

## 15. 何时必须停下来问用户（硬性）

- bootstrap 时
- SUPERSEDE 旧条目前
- 修改 `status:stable` 条目前
- 五个必填段任一缺失或含糊
- 脱敏扫描命中
- 主分类需要新增（taxonomy 变更）
- "这条值不值得入库"判定时
- ≥3 个候选难以判断时
- `.claude/` 在 `.gitignore` 时

---

## 16. 引用文件清单（progressive disclosure）

| 文件 | 何时加载 |
|------|----------|
| `references/taxonomy.md` | 5.5 分类与打标签 |
| `references/lesson-template.md` | 5.9 写入与索引更新 |
| `references/conflict-resolution.md` | 5.6/5.7 候选检索与冲突消解 |
| `references/quality-gates.md` | 5.4/5.10 价值判定与终检 |
| `references/redaction.md` | 5.8 脱敏扫描 |
| `references/lifecycle.md` | 状态变更（升格 / 降格 / archive） |
| `references/integration.md` | 5.11 协同建议 |
| `assets/INDEX.md.template` | 5.1 bootstrap |
| `assets/category.md.template` | 5.1 bootstrap |
| `assets/DEPRECATED.md.template` | 5.1 bootstrap |
| `assets/postmortem.md.template` | 当用户希望写完整 postmortem 时 |

---

## 17. Voice / 对话风格（meta）

这个 skill 在跟用户对话时：
- 主动追问缺失字段，但**每次只问 1~2 个**，不要轰炸
- 在做"判定"（值不值得入库 / 走哪条决策树分支）前先把判定依据说清楚
- 把 diff 给用户看，再问"要这样写入吗？"——不要写完了才说
- 用户拒绝 SUPERSEDE 时，温和接受，不强行二次推
- 每次完成入库或合并后，简短总结：
  > "已入库 L-042（concurrency / critical / active），INDEX 已更新；这条适合固化为自动化 lint 规则吗？"

---

> 本 skill 不写代码、不自动 commit、不调用其它 skill；只维护知识资产。
> 这是治理层（governance），不是执行层（execution）。
