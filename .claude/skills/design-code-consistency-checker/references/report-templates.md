# 一致性矩阵 / 交付报告 / 修复 TODO 模板

> 阶段 5.5 必读。主上下文聚合 `*-design-code-review-findings.jsonl` 后用 Write 一次性产出 `<关键词>-design-code-review-report.md`。

---

## 报告完整模板

````markdown
# 设计-代码一致性审计报告

> 生成时间：YYYY-MM-DD HH:MM
> 审计 skill：design-code-consistency-checker
> 进度文件：[<关键词>-design-code-review.md](./<关键词>-design-code-review.md)
> 发现明细 JSONL：[<关键词>-design-code-review-findings.jsonl](./<关键词>-design-code-review-findings.jsonl)

---

## 1. 摘要

| 项 | 值 |
|----|----|
| 设计文档 | <相对路径> |
| 代码根目录 | <相对路径> |
| 项目语言 | <Java / Go / ...> |
| 待验证项总数 | N |
| 一致 (consistent) | A |
| 缺失 (missing) | B |
| 偏离 (divergent) | C |
| 超出 (extra) | D |
| 推断 (inferred) | E |
| **综合判定** | **就绪 / 需修复后再上线 / 严重不一致建议返工** |

### 严重度分布
| blocker | critical | major | minor | info |
|---------|----------|-------|-------|------|
| B0 | C0 | M0 | m0 | I0 |

### 维度覆盖率
| 维度 | 应核对 | 已核对 | 一致率 | 备注 |
|------|--------|--------|--------|------|
| structure | X | Y | Y/X | |
| behavior | ... | ... | ... | |
| api | ... | ... | ... | |
| data | ... | ... | ... | |
| config | ... | ... | ... | |
| dependency | ... | ... | ... | |
| nfr | ... | ... | ... | |
| test | ... | ... | ... | |
| doc | ... | ... | ... | |

> 一致率 = consistent 占该维度已核对项的比例。<60% 标 ⚠ 提醒。

---

## 2. 关键缺陷清单（按严重度排序）

### 2.1 BLOCKER（必须上线前修复）

#### V-XXX: <item 简称> [dimension=<dim>, status=<status>]
- **设计来源**：`<file>` § <章节> 行 <range>
  > "<设计原文，≤ 4 行>"
- **代码证据**：
  - `<file>:<lines>`
    ```<lang>
    <≤ 8 行 snippet>
    ```
- **差异（gap）**：<一句话>
- **严重度依据**：`level=blocker`，<rationale 引用 severity.md 因子>，影响范围：<...>
- **修复建议**：<可执行；指明 agent / 文件 / 改动概要>

[...每个 BLOCKER 一节...]

### 2.2 CRITICAL（上线前修复）

[...同上格式，全列...]

### 2.3 MAJOR（本 sprint 修复）

[全列前 20，剩余在附录中合并表格列出]

### 2.4 MINOR（视精力）

[合并为表格：VerifyID | item | gap | 建议 | 设计来源 | 代码证据]

### 2.5 INFO（仅记录）

[合并为表格]

---

## 3. 一致性矩阵（按维度分桶）

> 阅读建议：从最关心的维度切入；每维度内按严重度从高到低排列。

### 3.1 结构（structure）
| VerifyID | item | 状态 | 严重度 | 设计来源 | 代码证据 | gap | 建议 |
|----------|------|------|--------|----------|----------|-----|------|

### 3.2 行为（behavior）
[同上]

### 3.3 接口契约（api）
[同上]

### 3.4 数据模型（data）
[同上]

### 3.5 配置（config）
[同上]

### 3.6 依赖（dependency）
[同上]

### 3.7 非功能（nfr）
[同上，注明子维度：security/logging/metrics/perf/availability]

### 3.8 测试（test）
[同上]

### 3.9 文档（doc）
[同上]

---

## 4. 代码超出设计（extra 项专栏）

> 这一节单独列出，因为容易被忽视。**特别留意 nfr-security 维度的 extra 项**：代码里多出的接口、actuator、调试端点、放开的 CORS、未声明的依赖等，常常是被悄悄引入的。

| VerifyID | 维度 | item | 严重度 | 代码证据 | 处置建议 |
|----------|------|------|--------|----------|----------|
| ... | ... | ... | ... | ... | 补设计 / 移除 / 标记已知偏差 |

---

## 5. 推断项清单（证据不足，待补设计或人工复核）

| VerifyID | 维度 | item | 缺什么信息 | 当前推断 | 严重度 |
|----------|------|------|------------|---------|--------|

---

## 6. 维度跳过说明

| 维度 | 理由 | 风险声明 |
|------|------|----------|

> 风险声明示例："设计未涉及缓存策略，本次审计不核对缓存维度；用户已确认知晓如代码实际使用了缓存，可能存在不一致。"

---

## 7. Blocked 项（未能完成核对）

| VerifyID | 维度 | item | 失败原因 | 建议 |
|----------|------|------|---------|------|

---

## 8. 关联矛盾（跨 VerifyID 综合校验）

> 例如：V-014 在 data 维度判定字段 `email` 缺失，但 V-021 在 api 维度判定 controller 接收了 `email` —— 这种矛盾会被合并为更高严重度的发现。

| 矛盾组 | 涉及 VerifyID | 现象 | 综合判定 | 建议 |
|--------|---------------|------|----------|------|

---

## 9. 修复 TODO（可直接喂给后续 agent）

> 按"目标 agent + 优先级"分组，便于一次性切到对应 skill 处理。

### 9.1 切到 `tdd-impl-runner`（业务实现）
- [ ] **[BLOCKER]** TODO-1: 修复 V-001 / V-005 / V-009（结构维度，缺方法 `cancelOrder` 实现）
  - 目标文件：`src/main/java/com/example/service/OrderService.java`
  - 预期改动：实现状态机 `PENDING → CANCELLED` 转移；处理已支付订单的退款触发
  - 设计来源：设计文档 § 4.3
- [ ] **[CRITICAL]** TODO-2: ...

### 9.2 切到 `software-design-doc-generator`（修订设计）
- [ ] **[MAJOR]** TODO-3: 把 V-018（代码超出设计的字段 `audit_log_url`）补回设计 § 5.2 数据模型
- [ ] ...

### 9.3 切到 `tdd-skeleton-runner`（先补骨架再补单测）
- [ ] **[MAJOR]** TODO-4: V-022 设计声明的 `NotificationService` 类完全缺失，建议先生成骨架

### 9.4 切到 `business-logging`
- [ ] **[MAJOR]** TODO-5: V-031 状态机迁移点缺日志埋点

### 9.5 切到 `unit-test-runner`
- [ ] **[MAJOR]** TODO-6: V-040 / V-041 关键业务规则缺单测覆盖

### 9.6 人工评审 / 决策
- [ ] TODO-7: 评审 V-014（推断项，状态机转移条件存疑），需求方给出补充
- [ ] TODO-8: ADR 化"已知偏差" V-019（接口字段命名风格差异）

---

## 10. 下一步建议

1. **先解决 blocker / critical**：按第 9 节 TODO 顺序，优先调用对应 agent。
2. **回归审计**：修复后再次触发本 skill，进度文件 `<关键词>-design-code-review.md` 可作为续作基线 —— 已 done 的项保持，仅对 pending / blocker / critical 项重核。
3. **设计同步**：第 4 节"代码超出设计"中需要补设计的项，调用 `software-design-doc-generator` 完成后，再次触发本 skill 验证补充内容。
4. **可视化**：如需要把"设计 vs 代码"差异以图形化方式呈现给评审者，调用 `software-diagram` skill 生成 class diagram + 颜色高亮（绿色 = 一致 / 红色 = 缺失 / 黄色 = 偏离 / 蓝色 = 超出）。

---

## 附录 A：审计执行元数据

- 盘点 subagent 耗时：T1
- 核对 subagent 总数：N（分 K 波）
- 补发轮次：R
- 推断项率：E/N
- 平均每个 VerifyID 代码证据数：avg

## 附录 B：MINOR / INFO 完整表格

[省略前移到这里展开]

## 附录 C：术语表

- **status=consistent**：设计与代码完全对齐。
- **status=missing**：设计明确要求但代码未实现。
- **status=extra**：代码存在但设计未规定。
- **status=divergent**：双方都有但行为 / 字段 / 签名 / 取值不一致。
- **status=inferred**：证据不足以下确定结论，仅给出推断。
- **VerifyID**：盘点阶段每条"待验证项"的唯一编号。

````

---

## 一致性矩阵（独立呈现）的精简模板

供"用户只想看一张表"时使用，可以把上述报告第 3 节单独导出为 `<关键词>-design-code-matrix.md`：

```markdown
# 设计-代码一致性矩阵

| # | 维度 | item | 状态 | 严重度 | 设计来源 | 代码证据 | gap | 建议 |
|---|------|------|------|--------|---------|---------|-----|------|
| 1 | structure | ... | missing | critical | DD §3.2 | - | 缺类 | tdd-skeleton |
| 2 | api | ... | divergent | major | DD §4.1 | UserCtrl:88 | 字段类型不符 | tdd-impl |
| ... |
```

---

## findings.jsonl 行格式（核对 subagent 回写后由主上下文按 batch 落盘）

每行一条 JSON 对象（不缩进），字段顺序：
```json
{"verify_id":"V-001","dimension":"structure","item":"OrderService.cancel","status":"missing","severity":{"level":"critical","rationale":"...","blast_radius":"...","fix_priority":"..."},"design_evidence":{"file":"design.md","anchor":"§4.3","lines":"88-95"},"code_evidence":[],"gap":"...","recommendation":"...","confidence":"high","notes":"","wave":1,"batch_id":"batch-2","timestamp":"2026-04-26T11:00:00Z"}
```

阶段 5.5 聚合时，按 dimension + severity 分组排序生成报告。

---

## 写报告时的硬性约束

1. **每条 BLOCKER / CRITICAL 必须列设计原文与代码 snippet** —— 评审者无需再翻原文档即可下决断。
2. **每条 TODO 必须可执行**：包含目标 agent + 文件路径 + 改动概要。
3. **不得用"建议优化"、"可以更好"这种含糊表述** —— 要么是缺陷要么不是。
4. **关联矛盾必须合并**：同一根因导致的多个 VerifyID 在第 8 节合并为一个矛盾组，避免在第 2 节重复出现。
5. **综合判定必须给出**，不能"留待人工判断"。
6. **报告全文中文**（除代码 snippet、文件路径、英文术语）。
