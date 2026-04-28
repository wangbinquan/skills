# Redaction & Privacy（脱敏与隐私保护）

经验库会随仓库提交、被 Claude 反复读取、可能被分享出去（开源、跨团队评审）。**写入前必须脱敏**。

> 一条原则：**绝不静默写入未脱敏内容**。命中即停下来问用户。

---

## 1. 必须脱敏的内容

| 类别 | 例子 | 处理方式 |
|------|------|----------|
| 凭据 | 密码、API Key、Token、Session、JWT、SSH 私钥 | 一律删除，写为 `<REDACTED:credential>` |
| 用户 PII | 真实姓名、邮箱、手机号、身份证、银行卡号、地址 | 替换为占位符（`<user@example.com>` / `<phone>` / `<id>`） |
| 内网信息 | 内网 IP、内部域名、机房名、生产 hostname | 替换为 `10.0.0.X` / `internal.example.com` |
| 数据库标识 | 真实表名敏感时、生产库连接串 | 抽象为 `<db>.<table>` |
| 用户业务数据 | 实际订单号、交易号、用户内容、医疗信息 | 替换或截断 |
| 内部链接 | 内部 wiki / Jira / Confluence 链接含敏感路径 | 替换为 `<internal-ticket-id>` |
| 加密密钥指纹 | KMS key ID、AWS access key、GCP service account | 替换为 `<REDACTED:key>` |

---

## 2. 可保留的内容

- **公开仓**的 file path
- commit short hash（公司公开仓 OK；私有仓视组织策略）
- 开源库版本号、错误码
- 通用的报错消息文本（如 `NullPointerException`、`connection refused`、`context deadline exceeded`）
- 公开的 RFC / 标准引用

---

## 3. 堆栈与日志的脱敏

- **保留**：异常类名、关键调用链、行号
- **删除 / 替换**：
  - 包名中的公司前缀（如 `com.acme.product` → `<pkg>.product` 视组织策略）
  - 用户数据
  - token / cookie / session 头
  - 完整 URL 中的查询参数（保留 path）

例：
```
原文： Caused by: java.lang.IllegalStateException at com.acme.payment.OrderProcessor.charge(OrderProcessor.java:142)
                  with token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx user_email=alice@acme.com

脱敏： Caused by: java.lang.IllegalStateException at <pkg>.payment.OrderProcessor.charge(OrderProcessor.java:142)
                  with token=<REDACTED:credential> user_email=<user@example.com>
```

---

## 4. 自动检查（写入前必跑）

skill 在写入前用以下正则做最低限度的扫描，**命中即提示用户**：

```
凭据：
  (?i)password\s*[=:]\s*\S+
  (?i)passwd\s*[=:]\s*\S+
  (?i)token\s*[=:]\s*\S+
  (?i)api[_-]?key\s*[=:]\s*\S+
  (?i)secret\s*[=:]\s*\S+
  (?i)access[_-]?key[_-]?id\s*[=:]\s*\S+
  Bearer\s+[A-Za-z0-9\-._~+/]+=*
  eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+    # JWT 形态
  -----BEGIN (RSA |OPENSSH |EC |PGP )?PRIVATE KEY-----  # 私钥块

PII：
  [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}        # 邮箱
  (?<!\d)\b\d{11}\b(?!\d)                                # 11 位手机号（中国）
  \b\d{15}|\d{18}\b                                      # 身份证号长度

内网：
  \b10(?:\.\d{1,3}){3}\b                                 # 10.x.x.x
  \b172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}\b          # 172.16-31.x.x
  \b192\.168(?:\.\d{1,3}){2}\b                           # 192.168.x.x
```

匹配命中**不一定是真泄漏**，但必须由用户**显式确认**放行（"这是公开仓的样例邮箱，可以写入"）或替换。

---

## 5. 处理流程

写入前：
1. 用上述正则扫所有要写入的字段（症状 / 根因 / 修复 / evidence / 备注 / 摘要）
2. 命中时列出每条命中：`<file>:<line>: <pattern>: <matched-text>`
3. 询问用户每一项："放行 / 替换为占位符 / 整段重写"
4. 用户处理完，再扫一遍确认无残留
5. 才允许写入

写入后：
6. 在终检阶段（5.10）再跑一次，作为最后保险

---

## 6. 项目级覆盖：`LESSONS_REDACTION.md`

如果项目根目录存在 `LESSONS_REDACTION.md`，**先按其规则**做脱敏。可以在该文件里：
- 添加项目特有的敏感词列表（产品代号、内部名称）
- 调整正则（如不同国家的手机号格式）
- 声明"本仓为完全公开仓"以放宽 `commit hash` / `file path` 限制
- 声明"本仓为完全内部仓"以收紧 PII 检测

---

## 7. 反模式

❌ 看到正则没命中就以为安全 → 正则只是最低保险，仍要人工通读
❌ 把整段日志原文粘进 lesson → 必须先脱敏再粘
❌ 把内部 Jira 链接当 evidence → 替换为 ticket id 占位符
❌ 用户姓名 / 真实邮箱出现在 lesson 评论 / Reviewer 字段 → Reviewer 写"claude-session"或公开 handle
❌ 真实生产 hostname 写进 evidence 段 → 脱敏成 `<host-A>` / `<region>-<env>-<role>`
