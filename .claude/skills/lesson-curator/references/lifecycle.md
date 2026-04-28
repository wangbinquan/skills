# Lifecycle（生命周期管理）

经验不是写完就完。本文件定义状态流转、复核节奏、归档规则。

---

## 1. 状态机

```
[active] ──二次复现──▶ [validated] ──写入团队规范/评审清单/自动化──▶ [stable]
   │                          │                                              │
   │                          └────────出现矛盾建议─────────────────────┐    │
   │                                                                     ▼    ▼
   ├──────────────────出现矛盾建议──────────────────────────▶ [superseded]
   │
   └────上下文失效（代码已删 / 框架已换 / 平台已迁）────▶ [deprecated]
```

---

## 2. 状态定义

| 状态 | 含义 | 是否参与日常检索 | 物理位置 |
|------|------|------------------|----------|
| `active` | 首次记录，未被独立验证 | ✅ | `categories/<x>.md` |
| `validated` | 在 ≥2 个独立上下文复现 | ✅（高优先） | `categories/<x>.md` |
| `stable` | 已固化为团队规范 / 自动化规则 | ✅（高优先） | `categories/<x>.md` |
| `superseded` | 被新条目替代 | ❌ | `archive/<x>.md`（DEPRECATED.md 索引） |
| `deprecated` | 上下文失效 | ❌ | `archive/<x>.md`（DEPRECATED.md 索引） |

---

## 3. 复核节奏（建议）

| 状态 | 复核频率 | 触发动作 |
|------|----------|----------|
| `active` | 30 天内 | 若无二次验证，复核一次：要么补 evidence 升 validated，要么 deprecate / 合并到上位条目 |
| `validated` | 每季度 | 跑一遍 evidence 指向的代码路径，确认仍然有效 |
| `stable` | 每半年 | 确认 evidence 指向的代码仍存在；确认相关 lint / 评审清单仍在使用 |
| `superseded` / `deprecated` | 不主动复核 | 但被引用时应显示 "archive" 提示 |

复核 = 重新读 evidence 指向的代码 + 看 commit 是否依然存在。所有复核**必须更新** `Last reviewed` 字段。

---

## 4. 升格 / 降格的触发条件

### `active` → `validated`
- 在不同模块 / 不同语言 / 不同时间被独立触发 ≥1 次
- 或被代码评审反复引用 ≥3 次
- 或被某位工程师明确"我以前也踩过"
- 升格时：`Last reviewed` 更新；可在 Notes 段补一行"Validated by L-X 的合并 / @handle 的 review"

### `validated` → `stable`
已沉淀为以下任一形式：
- lint / format / 静态分析规则
- 单元测试模板 / mock 模板
- PR 模板里的评审清单条目
- 设计文档强制章节
- 上线 checklist
- IDE inspection rule

升格时：在 Notes 段写明固化形式（"已固化为 .eslint.json 的 no-floating-promises rule"）

### 任意状态 → `superseded`
- 出现一条新经验给出与本条**冲突**的修复或预防建议
- **必须**写明 `Supersedes` 链与原因
- 必须用户确认（不允许 Claude 静默 supersede）

### 任意状态 → `deprecated`
- 经验所指向的代码 / 框架 / 平台已不存在
- 必须写明 Deprecated reason
- 比 supersede 弱：表示"这条经验在我们当下的语境里不再适用"，而不是"这条经验是错的"

---

## 5. 谁来做状态变更

| 触发源 | 谁判断 | 是否需用户确认 |
|--------|--------|----------------|
| Claude 检测到 evidence 路径已不存在（grep 返回空） | Claude 提议降为 deprecated | **是** |
| Claude 检测到新 lesson 与旧 lesson 矛盾 | Claude 提议 supersede | **是** |
| 用户主动说"这条已经过时了" | 用户决定 | 直接执行 |
| 用户主动说"这条已经写进我们 PR 模板了" | 用户决定 | 直接升 stable |
| Claude 看到候选条目状态过期信号（如 `Last reviewed` > 1 年） | Claude 提议复核 | **是**（用户决定降级 / 维持） |

---

## 6. 物理布局规则

- `active / validated / stable` → `categories/<x>.md`
- `superseded / deprecated` → `archive/<x>.md`
- 全部"已离开 active 流"的 ID 在 `DEPRECATED.md` 留一行检索记录
- **永不物理删除**——历史是最有价值的部分

---

## 7. ID 永不复用

即使一条经验被 deprecate 或合并，其 ID 也不会被新条目重新分配。

**理由**：
- 历史 PR / commit message / 代码评论中可能引用了这个 ID（"这次的修改对应 L-007 的教训"）
- 如果复用，未来读到这些引用的人会被误导
- ID 的成本几乎为零；浪费 ID 无害

---

## 8. 复核流水线（手动 + Claude 辅助）

每季度，团队可以让 Claude 跑一次"经验仓体检"：

1. 列出所有 `Last reviewed` > 90 天的 lesson
2. 对每条 lesson，让 Claude：
   - 跑 grep 看 evidence 指向的代码是否还在
   - 看 commit 是否还在
   - 报告"似乎仍有效 / 似乎已过时 / 需要人工判断"
3. 用户根据报告做状态变更

> 这是 lesson-curator 的**辅助任务**，不是核心；只有用户主动要求时才做。

---

## 9. 反模式

❌ 没人维护，所有 lesson 都停在 `active` → 至少每季度抽查一次
❌ Claude 自动 supersede 而不问用户 → 永远禁止
❌ 删除历史条目"以减小文件大小" → 永远禁止；用 archive
❌ 复用 ID → 永远禁止
❌ 不更新 `Last reviewed` 字段 → 复核失去意义
