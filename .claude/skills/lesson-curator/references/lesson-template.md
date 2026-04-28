# Lesson Entry Template（条目模板与字段语义）

每条 lesson 在 `categories/<category>.md` 中以独立小节呈现。

---

## 1. 完整模板

```markdown
## L-NNN: <一句话经验摘要，可被 grep 定位>

- **Tags**: lang:<x>, layer:<y>, severity:<z>, status:<w>, source:<s>
- **Discovered**: YYYY-MM-DD（commit <short-hash> / PR #<n> / 任务 <id>）
- **Last reviewed**: YYYY-MM-DD
- **Reviewer**: <handle 或 "claude-session">
- **Related**: L-aaa, L-bbb（无则写 "-"）
- **Supersedes**: L-ccc（仅在本条 SUPERSEDE 旧条目时填，否则省略）

### 症状（Symptom）
表象、报错、用户感知到的问题。客观描述，不带情绪。包含：
- 何时触发（高峰 / 启动 / 长跑后 / 特定数据规模）
- 现象（报错 / 性能恶化 / 数据错误 / 静默失败）
- 影响面（用户多少、流量多少、持续多久）

### 根因（Root cause）
真正的原因。如果是多因素叠加，区分主因与触发条件。
**避免**写"代码 bug" / "漏改了" / "粗心" 这类无诊断价值的词。
**鼓励**写"在 X 条件下 Y 模块的 Z 行为与 W 假设不一致"。

### 修复（Fix applied）
本次实际采用的修复方案。可粘贴关键 diff 片段（脱敏后），但优先描述思路而非堆代码。
如果有未采用的备选方案及其权衡，简述。

### 可推广的教训（Generalizable lesson）
> ⭐ 本条经验的灵魂。要求详见下文第 4 节。

### 检测与预防（Detection & prevention）
按可固化程度从强到弱：
- 静态检查 / lint / 自动化规则：<具体规则>
- 单元测试 / 集成测试断言：<具体断言>
- 监控指标 / 日志告警：<具体指标 + 阈值>
- 代码评审清单条目：<具体条目>
- 设计文档 / 接口契约约束：<具体章节>

至少给出 1 项；空话（如"以后小心"）不算。

### 证据（Evidence）
- 代码：<file_path>:<line>（多个就列多个）
- Commit：<short-hash> 或 PR 链接
- 监控/日志：<截图描述 / Grafana 链接 / log id>（脱敏后）
- 任务：<工单 / Jira / Linear ticket id>（脱敏后）

### 备注（Notes）
- 边界条件：本经验**不**适用的场景
- 与其它经验的差异
- 已知反例
- 未来需要复核的触发条件（如"如果框架升级到 X 版本，要重看本条"）
```

---

## 2. 字段强约束

| 字段 | 必填 | 约束 |
|------|------|------|
| `L-NNN` | ✅ | 全局递增；从 INDEX.md 的 Next ID 取值，写入后 +1；**ID 永不复用** |
| 摘要 | ✅ | ≤ 60 字符；可被 grep 定位；不要用 emoji；尽量包含问题类别关键词 |
| `Tags` | ✅ | 至少 `severity:` + `status:`；其它按相关性 |
| `Discovered` | ✅ | ISO 日期 + 至少一个出处标识（commit / PR / ticket / 任务名） |
| `Last reviewed` | ✅ | 首次创建时 = `Discovered`；每次复核更新 |
| `Reviewer` | ✅ | 写出谁；`claude-session` 也算 |
| `Related` | ⬜ | 没有就写 "-"；若是新建条目而旧条目近邻，主动写上 |
| `Supersedes` | ⬜ | 仅 SUPERSEDE 时填；同时旧条目要写"Superseded by L-NNN" |
| 症状 / 根因 / 修复 / 教训 / 证据 | ✅ | 五段必填 |
| 检测预防 | ✅ | 至少 1 项 |
| 备注 | ⬜ | 通常推荐写，特别是关于"不适用场景" |

---

## 3. 字段建议长度

- 摘要：≤ 60 字符
- 症状：3~5 句
- 根因：3~7 句
- 修复：3~6 句（含 diff 时可放宽）
- 可推广教训：2~4 句
- 检测预防：1~5 项，每项 1 句
- 证据：列表，每项 1 行
- 备注：0~5 句

总长度建议 ≤ 60 行。如果远超过，可能这条 lesson 该被**拆为多条**。

---

## 4. "可推广教训"段的写作要求（最重要）

这是 lesson 的灵魂。一条 lesson 价值的 80% 在这一段。

### 4.1 五条要求

1. **可独立成立**——把本段单独贴出来，读者不读上面三段也能 take away 一条规则
2. **抽象到模式而非具体细节**——不提具体类名 / 服务名（除非该名字本身就是该模式的代名词，如 actor / sidecar）
3. **包含适用条件**——避免"任何情况都……"这种过度泛化
4. **可作为评审 / 设计 review 时的检查项**——一句话能转化为问题：「这里有没有 X？」
5. **诚实承认例外**——若有，写在备注里

### 4.2 写作骨架

> "在 [条件] 下，[组件类型] 必须 [动作]，否则 [后果]。"

### 4.3 好与坏对比

**❌ 不可推广**：
> "AddressService.lookup 在地址缺省时返回 null，应该返回 Optional.empty()。"

**✅ 可推广**：
> "查询型方法在'查不到'与'出错'两种语义共存时，必须显式区分（Optional + 异常 / Result 类型 / 错误码 + nullable），不能用 null 一种返回值兼任两职——下游会按概率分布处理而不是按语义处理。"

---

**❌ 不可推广**：
> "这次 GC 调优把 Old Gen 调到了 4G。"

**✅ 可推广**：
> "JVM 内存预算应当按'workload 工作集 + headroom'算出而不是按'看着够用'的经验值定；尤其是 Old Gen 不应卡着工作集设——会触发持续 Major GC 但不 OOM 的最坏场景，毫秒级延迟会被 GC 吃掉但 alarm 不响。"

---

**❌ 不可推广**：
> "记得用 try-with-resources。"

**✅ 可推广**：
> "任何持有外部资源（fd / socket / lock / cursor）的对象，其作用域必须由语言提供的 RAII / try-with-resources / `defer` / `with` 等结构性绑定来管理；用'记得 close'的人为约定保证资源释放，会在异常路径与早返回路径必然出 bug。"

---

**❌ 不可推广**：
> "时间一定要带时区。"

**✅ 可推广**：
> "跨进程 / 跨存储 / 跨时区可能存在的时间值，必须用带时区的类型（OffsetDateTime / aware datetime / time.Time / Instant），并在序列化边界统一为 UTC + 显式时区。LocalDateTime / naive datetime 仅适用于明确的'墙钟时间'语义（如闹钟、日历）。"

---

## 5. 反例（不要这么写）

❌ `## L-007: 数据库连接出问题了` ← 摘要无信息
❌ Symptom: "查询慢" ← 缺失数据规模、业务上下文、阈值
❌ Root cause: "代码 bug" ← 等于没说
❌ Generalizable lesson: "以后小心点" ← 不可推广
❌ Evidence: "src/foo/bar.java" ← 缺行号、commit
❌ Tags: 只写 `lang:java` ← 缺 severity / status
❌ Related: 全空 ← 检索时显然有近邻条目却不写

---

## 6. SUPERSEDE / DEPRECATE 时的格式

**被 SUPERSEDE 的旧条目**（在 archive/<x>.md 中保留）：
- 状态改为 `status:superseded`
- 在 lesson 末尾追加：
  ```
  > Superseded by L-NNN on YYYY-MM-DD. Reason: <一句话>
  ```
- 整个条目从 `categories/<x>.md` 移到 `archive/<x>.md`
- DEPRECATED.md 添加索引行

**SUPERSEDE 它的新条目**：
- `Supersedes:` 字段填上旧 ID

**被 DEPRECATE 的条目**（上下文失效，无替代者）：
- 状态改为 `status:deprecated`
- 末尾追加：
  ```
  > Deprecated on YYYY-MM-DD. Reason: <一句话；常见原因：代码已删 / 框架已换 / 平台已迁>
  ```
- 同样从 categories/ 移到 archive/
- DEPRECATED.md 加索引行

---

## 7. ID 分配规则

- ID 格式：`L-NNN`，三位起步，从 `L-001` 开始
- 超过 999 自动扩位为 `L-1000` `L-1001` …
- ID 来源：`INDEX.md` 顶部的 `Next ID` 字段
- 写入新条目后，**必须**把 `Next ID` +1
- ID **永不复用**——即便条目被废弃 / 物理移到 archive，它的 ID 也不会被新条目重新分配
- 这保证历史 PR / 评论 / commit message 中对 ID 的引用永久有效
