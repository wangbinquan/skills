# Claude Code 软件工程技能与 Agent 集

> 一套面向 **Claude Code** 与 **OpenCode** 的"需求 → 设计 → 骨架 → 单测 → 实现 → 一致性审计 → 提交总结"端到端软件工程流水线技能（Skills）与子代理（Sub-agents）。

本仓库**不是应用代码**，而是一组可复用的 AI 工程化资产：

- 8 个 Skill（`.claude/skills/`）：每个 Skill 自带按语言加载的参考资料（references），覆盖 Java / C++ / Scala / Python / Go / Rust / JavaScript / TypeScript 八种语言。
- 6 个 Sub-agent（`.claude/agents/` 与 `.opencode/agents/` 双份同步）：每个 agent 是一个 Skill 的"专职壳"，负责把用户意图路由到对应 Skill。
- 1 份 OpenCode 插件 Hook 完整参考文档（`wiki/opencode_plugin.md`）。

---

## 1. 设计哲学

### 1.1 主上下文精简 + Subagent 分布式执行
大型代码生成任务（几十甚至几百个文件）若塞进一个上下文，会出现"上下文腐化"——后半程生成质量直线下降。本仓内所有重型 Skill 都遵循同一个执行形态：

```
设计 subagent → 落盘批次清单 → 5~8 batch/wave 并行派发 → 回写状态 → 反思补发 → pending=0 收敛
```

主上下文只接"批次清单"，不接源码细节；每个生成 subagent 只承担 5~10 个任务，全程在干净上下文里完成。

### 1.2 就近落盘 + 文件名即续作标记
所有阶段产物落在**原始需求/设计文档同级目录**，命名一律为 `<关键词>-<角色>.md`：

| 文件名后缀 | 产出阶段 |
|------------|----------|
| `*-requirements-refined.md` | 需求细化 |
| `*-software-design.md` | 软件设计文档 |
| `*-tdd-skeleton-tasks.md` | TDD 骨架任务清单 |
| `*-tdd-impl-tasks.md` | TDD 实现任务清单 |
| `*-ut-design.md` | 单测设计文档 |
| `*-design-code-review.md` | 设计-代码一致性审计 |
| `*-commit-summary-<short-hash>.md` | 提交变更总结 |

每个 Skill 启动时先扫描目标目录的同名文件，存在则**按 pending 项续作**而不是重做设计阶段。中断后重启零成本。

### 1.3 双向流水线 + 单一职责
每个 runner agent **只调用一个 skill**，不会越权。要生成骨架就用 `tdd-skeleton-runner`，要补单测就切 `unit-test-runner`，跨阶段编排由用户（或上层流程）决定。

---

## 2. 流水线总览

```
┌─────────────────────────────┐
│ software-design-doc-generator│  需求 → 设计 + 细化需求
│   (only calls software-diagram)│
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│   tdd-skeleton-runner       │  设计 → 含 TODO 占位的骨架
│   (calls tdd-code-skeleton) │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│     unit-test-runner        │  骨架/源码 → UT
│ (calls unit-test-generator) │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│      tdd-impl-runner        │  填 TODO + TODO 零残留终检
│  (calls tdd-impl-generator) │
└──────────────┬──────────────┘
               ▼
┌────────────────────────────────────┐
│  design-code-consistency-runner    │  设计 ↔ 代码 九维度审计
│ (calls design-code-consistency-…)  │
└──────────────┬─────────────────────┘
               ▼
┌─────────────────────────────┐
│  commit-change-summarizer   │  HEAD diff → 评审级中文总结
│   (calls software-diagram)  │
└─────────────────────────────┘
```

横切能力：

- **business-logging**：审视/补全/新增商业系统业务日志，**严禁引入新日志框架**，日志一律英文、无 emoji。
- **software-diagram**：Mermaid / PlantUML 多种图形，PlantUML 强制中文 note，输出前自动跑校验脚本。
- **plan-and-execute-by-subagent**：通用大规模代码生成的 5-task subagent 模板。
- **skill-creator**：本仓自身的元工具——创建/优化/评测 Skill。

---

## 3. 仓库结构

```
.
├── .claude/
│   ├── skills/                       # Skill 源（Claude Code 与 OpenCode 共用）
│   │   ├── business-logging/
│   │   │   ├── SKILL.md              # 触发契约（frontmatter description）+ 工作流
│   │   │   ├── references/{java,cpp,python,go,rust,scala,javascript,typescript}.md
│   │   │   └── evals/                # 触发准确率与质量评测样本
│   │   ├── design-code-consistency-checker/
│   │   │   └── references/{...,severity.md, dimensions.md, report-templates.md}
│   │   ├── plan-and-execute-by-subagent/
│   │   ├── skill-creator/            # 元工具：含评测脚本
│   │   │   ├── scripts/{run_eval.py, generate_report.py, aggregate_benchmark.py, …}
│   │   │   └── eval-viewer/
│   │   ├── software-diagram/
│   │   │   └── scripts/validate_diagram.{sh,py}
│   │   ├── tdd-code-skeleton/
│   │   ├── tdd-impl-generator/
│   │   └── unit-test-generator/
│   └── agents/*.md                   # 6 个 Claude Code 专职 agent
├── .opencode/
│   ├── agents/*.md                   # 与 .claude/agents 字节级一致的镜像
│   ├── package.json                  # 仅依赖 @opencode-ai/plugin
│   └── node_modules/
├── wiki/
│   └── opencode_plugin.md            # OpenCode 全部 Hook 的权威参考
├── CLAUDE.md                         # 给未来 Claude 实例的导航文档
└── README.md
```

---

## 4. 8 个 Skill 一览

| Skill | 一句话 | 主要触发关键词 |
|-------|--------|----------------|
| `software-design-doc-generator`（agent） | 需求 → 软件设计文档 + 细化需求文档 | "写设计文档"、"SDD"、"需求转设计" |
| `tdd-code-skeleton` | 按设计生成含详细注释 + TODO 的代码骨架 | "代码骨架"、"code skeleton"、"stub" |
| `unit-test-generator` | 五类场景全覆盖、含中文方法级注释的 UT | "写单测"、"UT"、"提升覆盖率" |
| `tdd-impl-generator` | 填 TODO，TODO 零残留硬约束 | "实现业务逻辑"、"填 TODO"、"补全代码" |
| `design-code-consistency-checker` | 设计 ↔ 代码九维度双向核对，五档严重度 | "设计与代码对比"、"一致性审计"、"漂移检测" |
| `business-logging` | 商业系统日志审视/补全，禁新框架、禁 emoji | "加日志"、"补日志"、"日志规范" |
| `software-diagram` | Mermaid / PlantUML 多种图形，含校验 | "画类图/时序图/流程图/UML" |
| `plan-and-execute-by-subagent` | 通用大规模代码生成子代理调度模板 | "按设计文档批量生成"、"大规模代码生成" |
| `skill-creator` | 创建/优化/评测 Skill 本身 | "创建 skill"、"优化 skill description" |

> 所有"按语言加载"的 Skill 启动时都会先做语言检测，再仅加载对应 `references/<lang>.md`，避免上下文膨胀。

---

## 5. 6 个 Sub-agent 一览

| Agent | 调用的 Skill | 何时主动触发 |
|-------|--------------|--------------|
| `software-design-doc-generator` | software-diagram | 拿到需求文档，要产出可驱动 AI 编码的设计稿 |
| `tdd-skeleton-runner` | tdd-code-skeleton | 已有需求/设计，要先生成骨架再写 UT |
| `unit-test-runner` | unit-test-generator | 已有源码/骨架，要补高质量 UT |
| `tdd-impl-runner` | tdd-impl-generator | 骨架已搭好，要把 TODO 填成真实业务实现 |
| `design-code-consistency-runner` | design-code-consistency-checker | 评审/上线前，要核对实现是否符合设计 |
| `commit-change-summarizer` | software-diagram | 完成提交后，要产出可评审、可归档的中文变更总结 |

每个 agent 的 `tools:` 列表在 frontmatter 内**故意收窄**（只放 Bash / Read / Write / Edit / Glob / Grep / Skill / Agent 这一组），不会在跨阶段扩权。

---

## 6. 怎么用

### 6.1 在 Claude Code 中
直接输入触发关键词，对应 Skill 会被 Claude 主动调起：

```
> 把 docs/payment-flow-requirements.md 转成软件设计文档
> 给 src/auth/ 这个目录补一份 UT
> 设计与代码对比一下，看看 design.md 是否落地完整
> 总结一下这次提交
```

也可以显式 `/调用`：

```
> /tdd-impl-runner
> /unit-test-runner
> /commit-change-summarizer
```

### 6.2 在 OpenCode 中
`.opencode/agents/` 与 `.claude/agents/` 内容完全一致，OpenCode 启动时自动加载。

OpenCode 插件开发请直接查阅 `wiki/opencode_plugin.md`——它是从 `@opencode-ai/plugin` 源码提取的全 Hook 字段说明（`chat.params` / `tool.execute.before` / `experimental.session.compacting` 等 18 个 hook，每个都有 input / output 字段表）。

### 6.3 评测 / 优化 Skill 本身
用 `skill-creator`（不要直接跑脚本）：

```
> /skill-creator
然后告诉它："优化 business-logging 的 description，让它在 'observability' 场景下更准触发"
```

它会调度 `scripts/run_eval.py`、`scripts/aggregate_benchmark.py`、`scripts/improve_description.py` 等工具。

---

## 7. 维护规约（贡献者请阅读）

1. **frontmatter description 即触发契约**：调整 Skill 的能力边界必须同步改 description；只改 body 不改 description 等于没改。
2. **`.claude/agents/` 与 `.opencode/agents/` 双份同步**：两边内容必须字节级一致；改一个必须同步另一个。Skill 目录不需要镜像。
3. **新增语言 reference**：在 `references/` 下加 `<lang>.md` 后，必须在 `SKILL.md` 主体里说明"何时加载该文件"，否则它就是死代码。
4. **不要削弱硬约束**：
   - `tdd-impl-generator` 的"TODO 零残留"终检
   - `business-logging` 的"禁新日志框架 + 日志一律英文"
   - `software-diagram` 的"PlantUML 必须有中文 note + 输出前自跑校验"
5. **Wave / Batch 大小**：所有 fan-out 型 Skill 维持 `5~10 项/batch、5~8 batch/wave`。改一个就要全局改，否则吞吐特性会失衡。
6. **不要在 runner agent 里堆叠多个 Skill**：每个 runner 只调一个 Skill 是设计原则，不是 bug。

---

## 8. 许可

`.claude/skills/skill-creator/` 内含 Anthropic 官方的 LICENSE.txt，遵循其条款。其他自研 Skill 与 agent 暂未声明 License；如需对外引用请先与作者确认。
