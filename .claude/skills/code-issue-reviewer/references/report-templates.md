# 交付报告模板

阶段 5 交付时，主上下文用 Write 生成 `<repo-name>-code-review-report.md`，结构严格遵循本模板。模板中的 `[...]` 是占位符，实际填写时替换为聚合数据。

---

## 完整模板

````markdown
# SRE 代码检视报告

**仓**：[绝对路径或 repo 名]
**检视范围**：[N] 个源文件（[语言分布]）
**生成时间**：[YYYY-MM-DD HH:MM]
**对应进度文件**：[<repo-name>-code-review-issues.md]

---

## 摘要

| 项 | 数值 |
|---|------|
| 待审文件总数 | [N] |
| 排除文件 | [M]（默认规则 [X] / 用户规则 [Y] / 生成代码 [Z]） |
| 已审文件 | [N] |
| 阻塞文件 | [B]（详见"阻塞文件"段） |
| 发现问题总数 | [K] |
| 严重度分布 | blocker [B0] · critical [C0] · major [M0] · minor [m0] · info [I0] |
| 维度分布 | [按维度逐一列出，命中数为 0 的维度也标注"0"] |

**综合判定**：☐ 就绪 / ☐ 修复 P0 后再上线 / ☐ 严重不一致建议返工

判定理由：[一段话解释为什么]

---

## 关键缺陷清单

> 排序规则：blocker → critical → major（前 30 条）。同档位内按维度聚合。
> 每条 finding 包含：定位、代码片段、风险、修复建议、置信度。

### [BLOCKER]

#### B-1 · null_safety · src/service/order/OrderService.java:92
```java
Optional<User> user = userRepo.findById(id);
return user.get().getName();
```
**风险**：`Optional.get()` 未做 isPresent 判定。当传入不存在的 id 时抛 `NoSuchElementException`，未被业务异常包装，会击穿到调用方造成 5xx。订单查询接口 QPS ~3k，每发生一次空查询都失败。
**修复**：
```java
return userRepo.findById(id)
    .orElseThrow(() -> new UserNotFoundException(id))
    .getName();
```
建议执行 `tdd-impl-runner` 处理本文件 line 90-95。
**置信度**：high

#### B-2 · ...

### [CRITICAL]

#### C-1 · ...

[...]

### [MAJOR] (前 30 条)

#### M-1 · ...

[...]

> [+ X 条 major 未列出，详见各维度小节与 findings.jsonl]

---

## 模式级问题（横向去重后命中 ≥ 3 处）

> 当多个文件出现同一类问题，合并为一条"模式 finding"，附完整命中位置清单。
> 修复时建议批量处理（一个 PR / 一次切换）。

### P-1 · [CRITICAL] Optional.get() 未判存在 — 共 [17] 处（java）
**模式**：调用 `Optional<T>.get()` 前未做 `isPresent()` 判定，空时抛 `NoSuchElementException`。
**修复模式**：统一改为 `orElseThrow` 抛业务异常，或 `orElseGet` 提供默认值，或返回 `Optional<T>` 给上层显式处理。
**命中位置**：
- F-003 src/service/order/OrderService.java:92
- F-007 src/service/user/UserService.java:145
- F-011 src/service/payment/PaymentService.java:201
- [...其余 14 处]

### P-2 · [MAJOR] catch (Exception e) 后只 log.error(e.getMessage()) — 共 [9] 处
[...]

---

## 各维度问题汇总

> 13 个维度全列出。命中数为 0 的维度写"本次未发现该维度问题"。

### 维度 1：null_safety（[N] 条）

| FileID | file:lines | severity | risk | recommendation |
|--------|-----------|----------|------|----------------|
| F-003 | OrderService.java:92 | blocker | Optional.get() 未判定 | orElseThrow → UserNotFoundException |
| [...] |

### 维度 2：resource_leak（[N] 条）

[...]

### 维度 3：concurrency

[...]

### 维度 4：performance

[...]

### 维度 5：memory

[...]

### 维度 6：error_handling

[...]

### 维度 7：external_call

[...]

### 维度 8：boundary

[...]

### 维度 9：observability

[...]

### 维度 10：config_env

[...]

### 维度 11：data_consistency

[...]

### 维度 12：time_encoding

[...]

### 维度 13：api_compat

[...]

---

## 疑似安全问题（提示项，请走 `/security-review`）

> 本 skill 不在安全维度做深度分析。以下为 finding 中 recommendation 提及 SQL/XSS/secret/auth/encryption/deserialization 关键字的项，列出供用户走专业安全审查。

| FileID | file:lines | 模式 | 摘要 |
|--------|-----------|------|------|
| [...] |

如果列表非空，建议在合并前执行：

```
/security-review
```

或人工评审下列文件。

---

## 阻塞文件

> 扫描或分析中无法完成审视的文件 + 原因。建议用户给指引或确认是否排除。

| FileID | file | 原因 |
|--------|------|------|
| F-009 | src/legacy/Old.java | 文件 > 3000 行，已超出单 subagent 上下文；建议拆分或显式排除 |
| [...] |

---

## 修复 TODO（按优先级排序）

> 可直接喂给后续 agent / 工程师执行的清单。每条独立、可单独修复。

### P0（blocker / critical，必修）

- [ ] **TODO-1** [BLOCKER] 修复 F-003 src/service/order/OrderService.java:92 Optional.get() NPE 风险（→ orElseThrow）
- [ ] **TODO-2** [PATTERN-CRITICAL] 批量修复"Optional.get() 模式" 共 17 处（见模式 P-1 命中位置清单）
- [ ] **TODO-3** [BLOCKER] 修复 F-008 src/service/payment/PaymentService.java:200 数据库连接未关闭（→ try-with-resources）
- [...]

修复方式建议：可调用 `tdd-impl-runner` 按 TODO 逐项处理，或人工修。

### P1（major，建议修）

- [ ] **TODO-N** [MAJOR] 补全 F-XXX:Y 业务事件 INFO 日志（建议执行 `business-logging` skill）
- [ ] **TODO-N** [MAJOR] 修复 F-XXX:Y 缺超时的 HTTP 调用
- [...]

### P2（minor / info，按需修）

- [ ] **TODO-N** [MINOR] 测试代码硬编码 IP 改为常量
- [...]

---

## 维度覆盖率分析

> 揭示"是否漏审了某些维度"。命中率 = 命中文件数 / 涉及文件数。

| 维度 | 命中文件 | 涉及文件 | 命中率 | 备注 |
|------|---------|---------|-------|------|
| null_safety | [X] | [Y] | [X/Y%] | |
| resource_leak | [X] | [Y] | [X/Y%] | |
| [... 13 行] | | | | |

**异常信号**：
- [若某维度涉及文件 > 0 但命中 = 0，列出可疑列表]
- [若覆盖率 < 80% 的维度，列出原因或建议补审]

---

## 进度文件

- 清单：`<repo-name>-code-review-issues.md`
- finding 明细：`<repo-name>-code-review-findings.jsonl`
- 本报告：`<repo-name>-code-review-report.md`

---

## 下一步建议

1. 优先修复 P0 项（建议切到 `tdd-impl-runner` 按 TODO 处理）
2. 修复后重新触发本 skill 做回归审视；本进度文件可作为续作基线
3. 疑似安全问题请走 `/security-review` 二次确认
4. 若发现 observability 维度问题较多，建议同时执行 `business-logging` skill 系统补日志
````

---

## 写报告时的硬约束

- **blocker / critical 必须列全**——不得"截断"或"前 N 条"
- **每条 finding 必须含 file:lines + 代码片段（≤ 8 行）**
- **修复建议必须可执行**——不写"建议优化"这种空话
- **置信度必须标注**
- **疑似安全段不得为"安全问题已修复"——本 skill 没修，只是列出引导用户走专业审查**
- **不得在报告中出现 emoji、装饰横幅、全大写标题装饰**

---

## 报告体量控制

- 整份报告控制在 **5 万字以内**
- 单条 finding 描述 ≤ 200 字
- 单条代码片段 ≤ 8 行
- 横向去重后，模式级命中清单 > 50 条时折叠为"前 50 + 计数"
- minor / info 不在主报告中逐条列出，仅给计数 + 抽样
