# Conflict Resolution（冲突消解决策树）

向经验仓写入新条目前，**必须**先做候选检索；找到候选后按下列决策树处理。

> 设计原则：**永不静默覆盖**、**永不物理删除**、**永不重复条目**。
> SUPERSEDE 必须用户确认；MERGE 与 CROSS-LINK 也要把 diff 给用户看。

---

## 1. 决策树（4 态）

```
新条目 N，候选条目集合 C
│
├─ C 为空？
│   └─ → NEW：分配新 ID，正常追加；INDEX 中记录
│
├─ 存在 c ∈ C 满足：症状 ≈ N.症状 且 根因 ≈ N.根因？
│   └─ → MERGE：
│        - 不创建新 ID
│        - 将 N 的 evidence 追加到 c.Evidence
│        - 将 N 的 source/tag 并入 c.Tags（去重）
│        - 更新 c.Last reviewed 为今天，并在 Reviewer 后追加 / 替换为本次
│        - 如果 N 的 "可推广教训" 比 c 的更宽 / 更准 → 替换；否则保留旧
│        - 如果 N 提出了新的 Detection & prevention 项 → 追加（不替换）
│        - 在 c 末尾增加一行 "Merged updates" 标注：YYYY-MM-DD 加入 X 维度
│
├─ 存在 c ∈ C 满足：根因 ≈ N.根因 但 症状不同？
│   └─ → CROSS-LINK：
│        - 创建新 ID
│        - N.Related 写入 c.id；c.Related 追加 N.id（双向）
│        - 在主分类文件中两条同时存在，但相互可达
│        - 在 N 的 Notes 段写明"与 L-c 的差异"（一句话）
│
├─ 存在 c ∈ C 满足：N 的 Fix / 教训 与 c 的 Fix / 教训直接矛盾？
│   └─ → SUPERSEDE：
│        ! 必须先把矛盾点呈现给用户确认，而后才执行；不允许静默替代
│        - 创建新 ID（N）
│        - c 的 status 改为 "superseded"，末尾追加：
│            > Superseded by L-N on YYYY-MM-DD. Reason: <原因一句话>
│        - 将 c 整体从 categories/<x>.md 移动到 archive/<x>.md（保持 ID 不复用）
│        - 在 DEPRECATED.md 追加一行：
│            | c.id | YYYY-MM-DD | superseded | <原因> | L-N |
│        - INDEX.md 更新两条状态计数
│        - N 的 Supersedes 字段填上 c.id
│
└─ 都不命中？
    └─ → NEW：分配新 ID，正常追加；如果只是"语义近邻"，在 Related 字段引用近邻条目
```

---

## 2. 候选检索算法（写入前必做）

### Step 1：读 INDEX.md 全文
- INDEX.md 是 always-loaded 的；读全文做候选检索几乎零成本。

### Step 2：基于元数据的初筛
- 用 N 的**主分类** 在 "By category" 段拿到对应分类下的所有 ID
- 用 N 的 **每个标签**（severity / status / lang / layer / source）在 "By tag" 段拿到 ID 集合
- 取这些集合的**并集**作为候选池 C₀

### Step 3：基于摘要关键词的过滤
- 从 N 的摘要中提取 2~3 个领域关键词（如 "timeout / retry / cascade"）
- 在 INDEX.md "All lessons" 段做关键词命中
- 命中的 ID 加入 C₀，得 C₁

### Step 4：打开候选所在的 categories/<x>.md
- 对 C₁ 中的每个 ID，定位到对应小节
- 读"症状 / 根因"两段，判断与 N 的相似度

### Step 5：决定 4 态
- 按第 1 节决策树
- 如果 C₁ 中有 ≥3 个条目都难以判断（既像又不像），**列给用户**让其确认

---

## 3. 何时**禁止** MERGE

即使症状 + 根因看起来很像，下列情况**禁止合并**，应改走 CROSS-LINK 或 NEW：

| 边界情况 | 处理 |
|----------|------|
| 候选 c 的 status 是 `stable` 或 `validated`，而 N 是 `active`（首次发现） | CROSS-LINK；新人不应直接改老经验。reviewer 后续可手动升格 |
| 候选 c 与 N 来自不同 layer（如 c 是 framework 层，N 是 business 层） | CROSS-LINK；两层的最佳实践与例外条件常常不同 |
| 候选 c 与 N 来自不同 lang，且经验本质上是语言特性相关（如 GIL、defer、RAII） | CROSS-LINK；不要硬把跨语言经验合到一处 |
| 候选 c 已有 4 条以上 evidence，长度接近 60 行 | NEW + Related；c 已经"满"了，再合会变成大杂烩 |

---

## 4. 何时**必须**用户确认

- **SUPERSEDE**：永远要确认
- 修改 `status:stable` 条目（任何字段）
- 跨主分类移动条目
- 新增主分类（taxonomy 变更）
- 物理移动条目到 archive/
- 删除 / 修改 INDEX.md 中已有的 ID 行（除追加外）

---

## 5. 写入顺序（事务感）

由于 markdown 文件不支持原子事务，按以下顺序最大化"中途出错也能恢复"：

### NEW
1. 编辑 `categories/<x>.md`：在文件顶部（按 ID 倒序）追加新条目
2. 编辑 `INDEX.md`：
   - "All lessons" 段加一行
   - "By category" 计数 +1
   - "By tag" 把新 ID 加入对应行
   - 顶部 `Total lessons` 与 `Next ID` +1

### MERGE
1. 编辑 `categories/<x>.md`：原条目就地修改（追加 evidence、更新 tags、改 last-reviewed、可能改教训段）
2. 编辑 `INDEX.md`：仅更新 "By tag" 段（如果有新增 tag）；其余不动

### CROSS-LINK
1. 编辑 `categories/<x>.md`：追加新条目；同时改旧条目的 Related 字段
2. 编辑 `INDEX.md`：同 NEW 流程

### SUPERSEDE
1. 编辑 `categories/<x>.md`：在底部 / 倒序位置追加新条目（带 Supersedes 字段）；从同文件中**移除**旧条目
2. 编辑 `archive/<x>.md`：追加旧条目（含状态改为 superseded、末尾追加 Superseded by 一行）
3. 编辑 `DEPRECATED.md`：追加索引行
4. 编辑 `INDEX.md`：
   - "All lessons" 加新条目行；从原条目所在分类的 active 计数 -1
   - "By category" / "By tag" 更新计数
   - 顶部 `Total lessons.superseded` +1，`Total lessons.active`（或对应状态）-1，`Next ID` +1

---

## 6. 反模式

❌ 看到关键词命中就 MERGE → 必须比对症状 + 根因再决定
❌ 静默把旧条目改写 → 永远新增或显式 supersede
❌ 把新经验"塞"到分类不匹配的旧条目里 → 宁可新建
❌ 在多个 category 文件里同时保留同一条经验 → 只能存在一处，其它处用 Related 引用
❌ SUPERSEDE 时把旧条目物理删除 → 必须移到 archive，DEPRECATED.md 留索引
❌ 不读 INDEX 就直接 NEW → 容易造重复
❌ 候选检索时只看 tag 不看症状 → 噪声很大；务必打开 category 文件比对
