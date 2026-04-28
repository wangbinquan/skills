# 后续固化建议（Follow-up Actions）

`lesson-curator` 只维护经验文件，不依赖或调用任何外部工具。但入库完成后，Claude 会根据 lesson 的类型主动建议**后续固化动作**，帮助把知识库里的教训真正落地为团队可执行的规范。

> 核心原则：**只建议，不执行**——建议是否采纳、采纳哪个方向，由用户决定。

---

## 1. 按经验类型对应的后续固化方向

| 经验类型（主分类） | 建议后续固化方向 |
|-------------------|-----------------|
| 反模式类（concurrency / null-safety / resource-leak / boundary / memory / time-encoding / performance / error-handling / external-resilience） | 考虑将教训固化为自动化 lint / 静态分析规则；加入代码评审清单 |
| 可观测性（observability） | 考虑补充到团队日志规范；加入 on-call handbook |
| 接口契约（api-contract） | 考虑补充到接口文档或 API 设计规范；加入 PR 合并前的 checklist |
| 状态机 / 数据一致性（data-consistency） | 考虑补充到设计文档的"状态机定义"或"事务边界"章节 |
| 配置与环境（config-environment） | 考虑加入部署 checklist 或启动期校验脚本 |
| 安全（security） | 考虑补充到安全评审清单；建议做针对性的安全审计 |
| 测试（testing） | 考虑更新测试策略文档；加入 PR 模板的测试自检清单 |
| 流程与协作（process-collab） | 考虑更新上线 runbook 或 incident response 流程 |
| 长篇事故 | 建议写完整 postmortem（`postmortems/`），从中提炼 lesson；加入团队事故复盘流程 |

---

## 2. 固化方式的优先级

从最强（自动化约束）到最弱（人工提醒）：

1. **自动化规则**（最强）：lint / 静态分析 / pre-commit hook / CI 检查
2. **测试覆盖**：单测断言 / 集成测试 / 压测场景
3. **监控告警**：指标 + 告警阈值
4. **设计文档约束**：接口规范 / 状态机定义强制章节
5. **PR / 评审清单**：checklist 条目
6. **wiki / handbook 记录**（最弱）：依赖人工阅读

**建议优先推动最强的固化形式**。一条 `status:stable` 的 lesson 如果只有 wiki 记录而没有任何自动化约束，意味着仍然依赖工程师的记忆——这是一种脆弱性。

---

## 3. 图示建议

如果 lesson 描述了复杂的状态机、架构交互或数据流，在 lesson 的 **备注（Notes）** 段插入流程图或状态图能大幅提升可读性和后续使用价值。

图的生成方式（示例）：
- Mermaid stateDiagram-v2（状态机）
- Mermaid sequenceDiagram（调用时序）
- Mermaid graph（数据流 / 因果链）
- PlantUML（复杂 UML 图）

使用时：先写出图形的 mermaid / plantuml 代码块，嵌入 lesson 的备注段。

---

## 4. 反向：哪些外部产出适合触发 lesson-curator

当外部工具或流程产出以下类型的发现时，适合主动触发 lesson-curator 进行沉淀：

| 外部来源 | 触发条件 | 说明 |
|----------|----------|------|
| 代码评审 | 同类问题第 ≥2 次出现 | 说明已是模式，值得沉淀 |
| 静态分析报告 | 出现团队规则库里没有覆盖的新反模式 | 可反哺规则库 |
| 性能测试 | 发现新的性能短板 | 沉淀为 performance / memory / external-resilience 类教训 |
| 生产事故 | 任何 SEV-1/2 | 先写 postmortem，再提炼 lesson |
| 迭代回顾 | "这次又遇到 X 了" | 重复踩坑是入库的强信号 |
| 调试会话 | 定位耗时 > 2 小时 | 耗时长往往意味着教训值得记录 |

---

## 5. 协同原则

- lesson-curator **不依赖任何外部工具**完成自身任务
- 建议用户把教训固化到外部工具时，**提供清晰的行动方向**（固化成什么形式、在哪里）
- 用户**拒绝采纳**建议时，礼貌接受，不反复推
- 固化动作**完成后**，可回来更新对应 lesson 的 `Notes` 段（如"已固化为 xxx 的 rule Y"）并将状态升格为 `stable`
