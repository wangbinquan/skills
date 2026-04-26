# 严重程度判定矩阵

> 核对 subagent 必读。打分时**先按本表对照**，再人工微调；切忌"凭感觉打分"导致整份报告全是 critical 或全是 minor。

## 五档定义

| 等级 | 一句话 | 上线影响 | 用户感知 | 修复时机 |
|------|--------|---------|---------|---------|
| **blocker** | 不修则功能根本不能用 / 必出严重事故 | 系统不可用、数据丢失、严重安全漏洞 | 立刻 | 必须上线前修复，**否则禁止发布** |
| **critical** | 不修则核心场景失败 / 合规风险 / 性能崩塌 | 主流程失败率 > 5%、合规审查不通过 | 多数用户 | 上线前修复 |
| **major** | 不修则部分场景行为错误或可观测性缺失 | 边缘场景错、监控缺、运维成本上升 | 少数用户 | 同 sprint 修复 |
| **minor** | 不修不影响功能，主要是规范 / 一致性 / 可读性 | 几乎无 | 几乎无 | 下个 sprint / 视精力 |
| **info** | 设计与代码完全一致或仅有风格性偏离 | 无 | 无 | 仅记录 |

---

## 状态 × 维度 默认严重度（首次定级）

> 单元格给的是**默认值**；具体打分按"调升 / 调降因子"修正。

| 维度 | missing（设计有代码无） | divergent（双方都有但不一致） | extra（代码有设计无） | inferred（证据不足） |
|------|------------------------|------------------------------|----------------------|---------------------|
| structure | major | major | major | minor |
| behavior  | critical | critical | critical | major |
| api       | critical | critical | major（多余接口）| major |
| data      | critical | critical | major | major |
| config    | major | major | minor | minor |
| dependency| major | major | major | minor |
| nfr (security) | **blocker** | **blocker** | critical | critical |
| nfr (logging/metrics) | major | minor | minor | minor |
| nfr (performance) | major | major | minor | minor |
| test      | major | minor | info | minor |
| doc       | minor | minor | info | info |

> "代码有设计无"在 nfr-security 列定为 critical：例如代码里多了一个未鉴权的 actuator 端点 —— 设计虽未声明，但属于真实安全风险，不能因"设计没说"就忽略。

---

## 调升因子（任意一条命中即上调一档；多条命中可上调多档至上限 blocker）

1. **金额 / 计费 / 计费规则** 相关 → +1 档
2. **鉴权 / 授权 / 加密 / 密钥** 相关 → +1 档
3. **PII / 健康数据 / 金融账户 / 身份证** 相关 → +1 档
4. **合规要求**（GDPR / HIPAA / 等保 / 三级 / 二级）显式涉及 → +1 档
5. **状态机的非法转移未拒绝** → +1 档（容易制造脏数据）
6. **数据迁移脚本与 ORM 不同步** → +1 档（上线即崩）
7. **生产配置仍指向测试环境** → 直接 blocker
8. **传播面广**：同一缺陷影响 ≥ 5 个 VerifyID 或 ≥ 3 个文件 → +1 档
9. **不可逆**：例如已上线后才发现的存量数据迁移问题 → +1 档
10. **设计文档明确标注 P0 / Must Have** → +1 档

## 调降因子（任意一条命中即下调一档；多条命中累计至下限 info）

1. **设计与代码差异是显式 ADR 已记录的"已知偏差"** → -1 档
2. **代码偏差有合理临时原因**（如等待外部依赖、灰度切流中），且有跟踪 issue 链接 → -1 档
3. **仅命名风格 / 注释格式差异**，不影响语义 → -1 档
4. **测试维度的差异且代码已上线 ≥ 6 个月稳定运行**（说明覆盖率虽低但风险已被时间检验） → -1 档（不适用于 security 维度）
5. **doc 维度的滞后**且代码本身正确 → -1 档（最低 info）

> 调升与调降可同时存在；优先按"安全 / 合规"调升因子裁决。

---

## 综合判定（交付报告"综合判定"字段）

| 综合判定 | 触发条件 |
|---------|---------|
| **就绪（ready）** | blocker = 0 AND critical = 0 AND major ≤ 5 |
| **需修复后再上线（needs fixes）** | blocker = 0 AND critical ≤ 3 AND 不属于"严重不一致" |
| **严重不一致建议返工（severe drift）** | blocker > 0 OR critical > 3 OR 多个维度（≥ 4）的覆盖率 < 60% |

**警示性附加**：
- inferred 项 > 30%（无论严重度） → 在判定后追加 "推断项过多，结论不稳定，建议补充设计细节"
- 任意 status=extra 的 nfr-security 项 → 即便综合判定是 ready 也强制追加 "代码暴露面超出设计，需做暴露面审视"

---

## 写在每条发现里的 severity 必须包括 4 件事

1. **等级**（blocker / critical / major / minor / info）
2. **依据**（命中了哪条调升 / 调降因子；引用本文件章节号）
3. **影响范围**（单文件 / 单模块 / 单用户场景 / 全用户）
4. **修复优先级建议**（立刻 / 上线前 / 本 sprint / 下 sprint / 仅记录）

例：
```yaml
severity:
  level: critical
  rationale: "默认 major (api/divergent)，命中调升因子 #2（鉴权）+1 → critical"
  blast_radius: "单租户全量请求"
  fix_priority: "上线前修复"
```

---

## 反例（避免这样打分）

| 反例 | 问题 |
|------|------|
| 把所有"missing"都打 blocker | 失去区分度，报告失去导向价值 |
| 把所有"doc"差异打 info | 当文档是 API doc 且面向第三方时，doc 漂移可能直接导致集成失败，应至少 major |
| 同一缺陷在不同 VerifyID 中打不同等级 | 综合校验阶段会矛盾；通过"关联项"合并到同一最高级别 |
| 不写 rationale | 报告无法追溯，下次回归审计无法对齐 |
