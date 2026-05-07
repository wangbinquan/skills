/**
 * subagent-resumer —— opencode 插件
 *
 * 目的
 * ─────
 * 在 opencode 父 agent 通过 task 工具调起一个 subagent 之后，subagent 可能因为模型
 * 幻觉、上下文截断、tool 失败、错误地宣称"已完成"等原因，在任务尚未真正做完的
 * 情况下提前结束。本插件做的事：
 *   1. 监听 task 工具的 tool.execute.after 钩子，捕获子 session 完成的瞬间。
 *   2. 收集子 session 全部消息、文件改动、最终输出、finish/error 等关键信息。
 *   3. 通过 `opencode run --agent task-completion-checker` 拉起一个**独立的** opencode
 *      子进程，让审查员 agent 给出 JSON 判决。
 *   4. 若审查员判 incomplete，通过 SDK 的 client.session.prompt 在**同一**子 session
 *      上发送续跑话术（包含审查员给出的 reasons / missing / next_steps），让 subagent
 *      接着干。最多重试 MAX_RETRIES 次。
 *   5. 把最终结果改写回 task 工具的 output.output，对父 agent 完全透明。
 *
 * 设计要点
 * ─────────
 * - **零侵入**：不改 opencode 源码，仅依赖 plugin 钩子和 SDK 客户端。
 * - **防递归**：审查员子进程的环境变量里注入 RECURSION_GUARD=1；插件入口检测到该
 *   变量则立即 no-op，避免审查员自己再次激活本插件造成无限派生。
 * - **失败安全**：审查员超时 / 子进程崩溃 / JSON 解析失败 都会得到 verdict=null，
 *   循环立刻退出而不是盲目重试。
 *
 * 配置（环境变量，全部可选）
 * ─────────────────────────
 * - SUBAGENT_RESUMER_MAX_RETRIES        续跑次数上限，默认 3
 * - SUBAGENT_RESUMER_REVIEWER_AGENT     审查员 agent 名，默认 task-completion-checker
 * - SUBAGENT_RESUMER_OPENCODE_BIN       opencode 可执行文件路径，默认从 PATH 解析
 * - SUBAGENT_RESUMER_TIMEOUT_MS         单次审查超时，默认 180000 (3 分钟)
 * - SUBAGENT_RESUMER_TAIL_MESSAGES      传给审查员的会话尾部 assistant 消息条数，默认 6
 */

import type { Plugin } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"

// ─────────────────────────────────────────────────────────────────────────
// 配置常量：从环境变量读取，给出安全默认值
// ─────────────────────────────────────────────────────────────────────────

/** 续跑循环的最大次数。达到上限后即使审查员仍判 incomplete 也会退出。 */
const MAX_RETRIES = Number(process.env.SUBAGENT_RESUMER_MAX_RETRIES ?? 3)

/** 审查员 agent 的名字，必须能被 `opencode run --agent <name>` 找到。 */
const REVIEWER_AGENT = process.env.SUBAGENT_RESUMER_REVIEWER_AGENT ?? "task-completion-checker"

/** opencode 可执行文件，默认 PATH 里的 `opencode`。 */
const OPENCODE_BIN = process.env.SUBAGENT_RESUMER_OPENCODE_BIN ?? "opencode"

/** 一次审查最长等待时间，超过则 SIGKILL，verdict 视为 null。 */
const REVIEWER_TIMEOUT_MS = Number(process.env.SUBAGENT_RESUMER_TIMEOUT_MS ?? 180_000)

/** 传给审查员的会话尾部 assistant 消息条数（越多 token 消耗越大）。 */
const TAIL_MESSAGES = Number(process.env.SUBAGENT_RESUMER_TAIL_MESSAGES ?? 6)

/** CONVERSATION_TAIL 整体字符数上限，防止 prompt 过大。 */
const MAX_TAIL_TEXT = 4_000

/** 单条工具调用 detail 字段的字符数上限。 */
const MAX_TOOL_DETAIL = 400

/**
 * 防递归哨兵环境变量。
 *
 * 审查员是用 `spawn(opencode run ...)` 起的一个独立 opencode 进程，那个进程内部
 * 会再次加载本插件。如果审查员 agent 内部又调用了 task 工具（理论上它的权限被
 * deny 了，但保险起见），会再次进入 tool.execute.after，然后再 spawn 一个 opencode
 * 进程……无限递归。
 *
 * 解决方案：spawn 子进程时给它注入 RECURSION_GUARD=1；插件入口第一行就检查这个
 * 变量，看到就直接 return，让审查员进程里的本插件变成"哑巴"。
 */
const RECURSION_GUARD = "SUBAGENT_RESUMER_REVIEWING"

// ─────────────────────────────────────────────────────────────────────────
// 类型与领域常量
// ─────────────────────────────────────────────────────────────────────────

/**
 * SDK 返回的消息/parts 结构在不同 opencode 版本里嵌套字段会变（有的是 data
 * 包一层，有的直接对象）。统一用 LooseRecord 宽松取值，避免每次 SDK 升级都
 * 要改插件。
 */
type LooseRecord = Record<string, any>

/** 一次文件改动的归一化记录，供审查员阅读。 */
type FileChange = {
  /** 触发改动的工具名（write/edit/multiedit/patch/bash） */
  tool: string
  /** 被改动的文件路径，bash 类型可能没有具体路径 */
  path?: string
  /** 工具输出或 bash 命令本身的摘要（已截断） */
  detail?: string
}

/**
 * 已知的"直接修改文件"类工具集合。命中即认为产生了文件改动。
 *
 * 注意：未来 opencode 新增其他文件写工具，需要在这里同步扩展。
 */
const FILE_MOD_TOOLS = new Set(["write", "edit", "multiedit", "patch"])

/**
 * 用来识别 bash 命令是否在写文件 / 修改 git 状态的正则。
 *
 * 涵盖：
 *   - rm/mv/cp/touch/mkdir/chmod/chown/ln：直接的文件操作
 *   - tee/sed -i/重定向 >>?: 通过管道写入
 *   - git add/rm/mv/reset/checkout/commit/push/stash/apply：仓库状态变更
 *
 * 只读命令（ls/find/grep/git status/git diff/...）不会命中，避免噪音。
 */
const SHELL_WRITE_RE =
  /\b(rm|mv|cp|touch|mkdir|chmod|chown|ln|tee|sed\s+-i|>>?|git\s+(add|rm|mv|reset|checkout|commit|push|stash|apply))\b/

// ─────────────────────────────────────────────────────────────────────────
// 消息解析辅助函数
// ─────────────────────────────────────────────────────────────────────────

/**
 * 从消息列表里反向找到最后一条 assistant 消息。
 *
 * 子 session 的最后一条 assistant 消息就是 subagent 的"最终回复"，是判定完成度
 * 时最关键的依据。
 */
function lastAssistant(messages: LooseRecord[]): LooseRecord | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.info?.role === "assistant") return messages[i]
  }
  return undefined
}

/**
 * 从一条消息的 parts 里反向找到最后一段非空 text。
 *
 * 一条 assistant 消息可能含多种 parts（reasoning / tool / text 等），最终回复
 * 文本通常是 parts 数组里最后一个 type==='text' 且 text 非空的项。
 */
function lastTextOf(message: LooseRecord | undefined): string {
  if (!message) return ""
  const parts: LooseRecord[] = message.parts ?? []
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (p?.type === "text" && typeof p.text === "string" && p.text.trim().length > 0) return p.text
  }
  return ""
}

/**
 * 字符串截断工具：超过 max 字符则切掉，并附一行 "...(N chars truncated)" 提示。
 *
 * 用于控制传给审查员的 prompt 总大小，以及限制 banner 的长度。
 */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + `\n…(${text.length - max} chars truncated)`
}

/**
 * 从 tool part 的 state 里取参数对象。
 *
 * opencode SDK 不同版本里参数字段名不一致：可能叫 input、args 或 parameters，
 * 这里依次尝试。
 */
function pickToolArgs(state: LooseRecord): LooseRecord {
  return state.input ?? state.args ?? state.parameters ?? {}
}

/**
 * 从 tool part 的 state 里取输出文本。
 *
 * 同样兼容多种字段名（output / result）。非字符串结果（对象/数组）尝试
 * JSON.stringify，再不行就 String() 兜底。
 */
function pickToolOutput(state: LooseRecord): string {
  const out = state.output ?? state.result
  if (typeof out === "string") return out
  if (out == null) return ""
  try {
    return JSON.stringify(out)
  } catch {
    return String(out)
  }
}

/**
 * 扫描整个子 session 的全部消息，提取所有"产生文件改动"的工具调用。
 *
 * 工作步骤：
 *   1. 仅看 assistant 消息（user 消息里没有 tool part）。
 *   2. 遍历 parts，挑 type === 'tool' 的项。
 *   3. 工具名命中 FILE_MOD_TOOLS → 直接计为文件改动，记录 path 和 output 摘要。
 *   4. 工具名是 bash → 用 SHELL_WRITE_RE 匹配命令文本，命中才计入。
 *
 * 输出会作为 reviewer prompt 的 FILE_CHANGES 章节，让审查员对照
 * "subagent 声称改了什么" vs "实际真改了什么"。
 */
function extractFileChanges(messages: LooseRecord[]): FileChange[] {
  const changes: FileChange[] = []
  for (const m of messages) {
    if (m?.info?.role !== "assistant") continue
    for (const p of (m.parts ?? []) as LooseRecord[]) {
      if (p?.type !== "tool") continue
      const tool: string = p.tool ?? ""
      const state: LooseRecord = p.state ?? {}
      const args = pickToolArgs(state)

      if (FILE_MOD_TOOLS.has(tool)) {
        // 直接写文件类工具：把路径与输出（截断后）记下来
        changes.push({
          tool,
          path: args.filePath ?? args.file_path ?? args.path,
          detail: clip(pickToolOutput(state), MAX_TOOL_DETAIL),
        })
      } else if (tool === "bash") {
        // bash 工具：只在命令疑似在写东西时才记入
        const cmd: string = args.command ?? ""
        if (SHELL_WRITE_RE.test(cmd)) {
          changes.push({ tool: "bash", detail: clip(cmd, MAX_TOOL_DETAIL) })
        }
      }
    }
  }
  return changes
}

/**
 * 取最近若干条 assistant 消息，构造一段紧凑的"会话尾部摘要"文本。
 *
 * 给审查员看的不只是最终回复，还要让它能看到 subagent 临结束前几轮的行为：
 *   - 工具反复失败？
 *   - 输出在哪个步骤截断？
 *   - 是否在认输前出现错误？
 *
 * 输出格式（每条 assistant 消息一段）：
 *   ---- assistant msg <id> (finish=<reason>) ----
 *   [text] <文本前 600 字符>
 *   [tool <name> status=<status>] args=<截断后 JSON>
 *   ...
 *
 * 整段再用 MAX_TAIL_TEXT 二次截断，避免 prompt 爆炸。
 */
function extractConversationTail(messages: LooseRecord[]): string {
  // 只保留 assistant 消息，再取最后 TAIL_MESSAGES 条
  const assistantMsgs = messages.filter((m) => m?.info?.role === "assistant").slice(-TAIL_MESSAGES)
  const out: string[] = []
  for (const m of assistantMsgs) {
    const parts: LooseRecord[] = m.parts ?? []
    const lines: string[] = [`---- assistant msg ${m.info?.id ?? ""} (finish=${m.info?.finish ?? "?"}) ----`]
    for (const p of parts) {
      if (p?.type === "text" && typeof p.text === "string") {
        const t = p.text.trim()
        if (t) lines.push(`[text] ${clip(t, 600)}`)
      } else if (p?.type === "tool") {
        // 工具 part：把工具名 + 状态 + 参数摘要拼成一行
        const state: LooseRecord = p.state ?? {}
        const args = pickToolArgs(state)
        const argSummary = clip(JSON.stringify(args), 200)
        const status = state.status ?? state.state ?? "?"
        lines.push(`[tool ${p.tool} status=${status}] args=${argSummary}`)
      }
    }
    out.push(lines.join("\n"))
  }
  return clip(out.join("\n"), MAX_TAIL_TEXT)
}

// ─────────────────────────────────────────────────────────────────────────
// 审查员调用：prompt 组装、子进程启动、判决解析
// ─────────────────────────────────────────────────────────────────────────

/**
 * 把全部上下文拼成一段 markdown 报告，作为审查员的 prompt。
 *
 * 章节标题（## ORIGINAL_REQUEST 等）必须与 task-completion-checker.md 里
 * "## 输入"段所约定的字段名严格一致 —— 审查员的 system prompt 是按这些章节
 * 标题来定位信息的。
 */
function buildReviewerPrompt(input: {
  description: string
  subagentType: string
  request: string
  finalOutput: string
  finishReason: string
  errorInfo: string
  fileChanges: FileChange[]
  conversationTail: string
}): string {
  // FILE_CHANGES 渲染：空就给一句中文占位；否则编号列出每条改动
  const fc =
    input.fileChanges.length === 0
      ? "（无文件改动记录）"
      : input.fileChanges
          .map((c, i) => {
            const head = `${i + 1}. tool=${c.tool}` + (c.path ? ` path=${c.path}` : "")
            return c.detail ? `${head}\n   detail: ${c.detail}` : head
          })
          .join("\n")

  return [
    "你正在审查上一个 subagent 的任务完成度。请按你的 system prompt 所定义的清单严格审查，并以最后一个 ```json 代码块输出判决。",
    "",
    "## ORIGINAL_REQUEST",
    input.request || "(empty)",
    "",
    "## SUBAGENT_DESCRIPTION",
    input.description || "(empty)",
    "",
    "## SUBAGENT_TYPE",
    input.subagentType || "(empty)",
    "",
    "## FINISH_REASON",
    input.finishReason || "(unknown)",
    "",
    "## ERROR_INFO",
    input.errorInfo || "(none)",
    "",
    "## FINAL_OUTPUT",
    input.finalOutput || "(empty)",
    "",
    "## FILE_CHANGES",
    fc,
    "",
    "## CONVERSATION_TAIL",
    input.conversationTail || "(empty)",
  ].join("\n")
}

/**
 * 审查员的判决结构。字段含义见 task-completion-checker.md 的"输出协议"段。
 */
type Verdict = {
  verdict: "complete" | "incomplete"
  confidence: "high" | "medium" | "low"
  reasons: string[]
  missing: string[]
  evidence: string[]
  next_steps: string
}

/**
 * 从审查员的 stdout 文本里抽取 JSON 判决。
 *
 * 解析策略（从严到宽）：
 *   1. 先抓所有 ```json ... ``` 围栏块，从最后一个开始尝试 JSON.parse。
 *      —— 这是审查员被指示的标准输出格式，应当总是命中。
 *   2. 若没有围栏块或都解析失败，退化为扫描所有 `{...}` balanced 片段，
 *      仍从最后一个开始尝试。这是一道兜底，应付审查员偶尔不按格式输出的情况。
 *
 * 只返回 verdict 字段为 "complete" / "incomplete" 的对象，其它视为非法判决。
 */
function extractVerdictJson(text: string): Verdict | null {
  // 优先级 1：fenced code block ```json ... ```
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
  for (let i = fences.length - 1; i >= 0; i--) {
    try {
      const v = JSON.parse(fences[i][1])
      if (v && (v.verdict === "complete" || v.verdict === "incomplete")) return v as Verdict
    } catch {}
  }
  // 优先级 2：任意 {...} 片段
  const candidates = [...text.matchAll(/\{[\s\S]*?\}/g)]
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const v = JSON.parse(candidates[i][0])
      if (v && (v.verdict === "complete" || v.verdict === "incomplete")) return v as Verdict
    } catch {}
  }
  return null
}

/**
 * 启动一个独立 opencode 进程跑审查员 agent，等结束并解析判决。
 *
 * 命令形如：
 *   opencode run --agent task-completion-checker "<promptText>"
 *
 * 关键参数：
 *   - cwd: 必须是宿主项目目录（PluginInput.directory），这样子进程能在 .opencode/agents/
 *     里找到 task-completion-checker agent 文件。
 *   - env: 注入 RECURSION_GUARD=1，让子进程内的本插件不再激活。
 *   - stdio: stdin 关掉（"ignore"），stdout/stderr 我们捕获后做解析与日志。
 *   - timer: REVIEWER_TIMEOUT_MS 后 SIGKILL，避免审查员卡住父进程。
 *
 * 返回：成功解析出 verdict 则返回 Verdict，否则返回 null（调用方应据此停止循环）。
 */
async function consultReviewer(promptText: string, cwd: string): Promise<Verdict | null> {
  return await new Promise<Verdict | null>((resolve) => {
    // 复制父进程环境变量，叠加哨兵变量
    const env = { ...process.env, [RECURSION_GUARD]: "1" }
    const child = spawn(OPENCODE_BIN, ["run", "--agent", REVIEWER_AGENT, promptText], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    // 超时定时器：到点强杀子进程
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {}
    }, REVIEWER_TIMEOUT_MS)
    // 实时累积 stdout / stderr
    child.stdout?.on("data", (d) => (stdout += d.toString()))
    child.stderr?.on("data", (d) => (stderr += d.toString()))
    // spawn 本身失败（比如 opencode 不在 PATH）：返回 null
    child.on("error", (err) => {
      clearTimeout(timer)
      console.error("[subagent-resumer] reviewer spawn error:", err)
      resolve(null)
    })
    // 正常退出 / 被超时 SIGKILL：尝试解析 stdout
    child.on("close", (code) => {
      clearTimeout(timer)
      const verdict = extractVerdictJson(stdout)
      if (!verdict) {
        // 没拿到判决就把 stdout/stderr 末尾打到错误日志，方便排障
        console.error(
          `[subagent-resumer] reviewer exit=${code}, no parseable JSON verdict\n  stdout tail: ${stdout.slice(-500)}\n  stderr tail: ${stderr.slice(-500)}`,
        )
      }
      resolve(verdict)
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────
// 续跑话术与最终输出改写
// ─────────────────────────────────────────────────────────────────────────

/**
 * 把审查员的判决转换成发回 subagent 的"续跑指令"文本。
 *
 * 发送时机：通过 client.session.prompt 把这段文本作为新的 user message 灌进
 * 同一个子 session，subagent 就会基于已有上下文 + 这段指令再跑一轮。
 *
 * 关键措辞：
 *   - "你尚未完成任务" —— 直接定性，不给模型留模糊空间。
 *   - 结尾"不要重新开始、不要总结之前的内容、不要再问问题" —— 明确禁止三种
 *     常见的偷懒模式（重复劳动 / 用总结代替执行 / 用提问拖延）。
 */
function buildContinuation(verdict: Verdict): string {
  return [
    "[task-completion-checker] 审核员判定你尚未完成任务。请认真处理：",
    "",
    "## 判定理由",
    ...verdict.reasons.map((r) => `- ${r}`),
    "",
    "## 缺失/未完成项",
    ...(verdict.missing.length > 0 ? verdict.missing.map((m) => `- ${m}`) : ["- (审核员未明确列出，但判定未完成)"]),
    "",
    "## 续跑指令",
    verdict.next_steps?.trim() || "请从你停下的地方继续，把上面缺失项逐条做完，并在最终回复中明确指出每一项的完成情况。",
    "",
    "请直接继续执行，不要重新开始、不要总结之前的内容、不要再问问题。",
  ].join("\n")
}

/**
 * 把 task 工具原始的 output.output 中的 <task_result> 块替换为续跑后的最终文本，
 * 并附加一段 banner 描述插件做了什么。
 *
 * task 工具的原 output 形如（见 packages/opencode/src/tool/task.ts:153-159）：
 *   task_id: <子 session id> (for resuming...)
 *
 *   <task_result>
 *   <子 session 最后一条 text>
 *   </task_result>
 *
 * 这里只替换 <task_result>...</task_result>，task_id 行保持不变，方便父 agent
 * 仍可基于它做后续行为。如果原文里恰好没有 <task_result> 标记（异常情况），
 * 则把新块追加到末尾。
 */
function rewriteTaskResult(original: string, finalText: string, attempts: number, lastVerdict: Verdict | null): string {
  // banner：固定告知重试次数；若有最终 verdict 也一并打印
  const banner = [
    `[subagent-resumer] resumed ${attempts} time(s) under reviewer "${REVIEWER_AGENT}"`,
    lastVerdict ? `[subagent-resumer] final verdict: ${lastVerdict.verdict} (${lastVerdict.confidence})` : "",
  ]
    .filter(Boolean)
    .join("\n")
  const block = `<task_result>\n${finalText.trim()}\n</task_result>`
  if (original.includes("<task_result>") && original.includes("</task_result>")) {
    return original.replace(/<task_result>[\s\S]*?<\/task_result>/, block) + "\n" + banner
  }
  return original + "\n" + block + "\n" + banner
}

// ─────────────────────────────────────────────────────────────────────────
// 插件入口
// ─────────────────────────────────────────────────────────────────────────

/**
 * 插件主体。opencode 加载时调用一次，返回的对象就是 Hooks 配置。
 *
 * 这里只挂了一个钩子：tool.execute.after。它在每次工具调用结束后触发，我们只
 * 关心 tool === "task" 的情况——也就是父 agent 的 task 调用刚刚返回、子 session
 * 已停止的那一瞬间。
 *
 * 入参 ctx 解构：
 *   - client: opencode SDK 客户端，给我们提供读消息、向子 session 发 prompt 的能力。
 *   - directory: 当前项目目录，用作 spawn 子进程的 cwd（确保 agent 文件可被发现）。
 */
export const SubagentResumerPlugin: Plugin = async ({ client, directory }) => {
  return {
    "tool.execute.after": async (input, output) => {
      // ── 早退 1：自身递归保护
      // 当前进程是审查员子进程的话，立刻 no-op，避免 spawn 风暴。
      if (process.env[RECURSION_GUARD]) return

      // ── 早退 2：只处理 task 工具
      // tool.execute.after 对所有工具都会触发，本插件只关心 task。
      if (input.tool !== "task") return

      // ── 早退 3：必须能拿到子 session id
      // task 工具会在 metadata.sessionId 写入子 session 的 id（见 task.ts:107-113）。
      // 拿不到说明 task 调用异常，没法操作，直接放手。
      const sessionId: string | undefined = output.metadata?.sessionId
      if (!sessionId) return

      // 从 task 工具的入参里取出原始任务描述，作为审查员的 ORIGINAL_REQUEST。
      // input.args 的类型是 any（见 plugin/index.ts 的 Hooks 定义），我们按 task 工具
      // 的 schema 直接读三个字段。
      const args = (input as any).args ?? {}
      const originalRequest: string = args.prompt ?? ""
      const description: string = args.description ?? ""
      const subagentType: string = args.subagent_type ?? ""

      // 续跑循环状态
      let attempts = 0 // 已经发起的"续跑"次数（不含首次审查）
      let lastVerdict: Verdict | null = null // 最近一次拿到的判决，用于 banner

      // ─────────────────────────────────────────────────────────────────
      // 主循环：审查 → 若 incomplete 续跑 → 再审查 ……
      // ─────────────────────────────────────────────────────────────────
      while (attempts < MAX_RETRIES) {
        // 第一步：把子 session 全部消息拉下来，重新计算上下文。
        // 即便这是第二轮，也要重新 fetch，因为上一轮 client.session.prompt 让
        // subagent 又跑了一段，需要看新结果。
        const list = await client.session.messages({ path: { id: sessionId } })
        const messages: LooseRecord[] = ((list as any)?.data ?? []) as LooseRecord[]
        const last = lastAssistant(messages)
        const finalOutput = lastTextOf(last)
        const fileChanges = extractFileChanges(messages)
        const conversationTail = extractConversationTail(messages)

        // 第二步：把所有上下文打包成审查员看的 markdown 报告
        const reviewerPrompt = buildReviewerPrompt({
          description,
          subagentType,
          request: originalRequest,
          finalOutput,
          finishReason: last?.info?.finish ?? "",
          errorInfo: last?.info?.error ? clip(JSON.stringify(last.info.error), 800) : "",
          fileChanges,
          conversationTail,
        })

        // 第三步：spawn 一个独立 opencode 进程跑审查员，等它给判决
        const verdict = await consultReviewer(reviewerPrompt, directory)
        lastVerdict = verdict

        // 第四步：根据判决决定下一步
        if (!verdict) {
          // 解析失败 / 超时 / spawn 出错。不要盲目重试——我们也不知道现状。
          console.warn(`[subagent-resumer] session=${sessionId}: no verdict, stopping resume loop`)
          break
        }

        if (verdict.verdict === "complete") {
          // 审查通过，结束循环。
          console.log(
            `[subagent-resumer] session=${sessionId}: reviewer says complete (${verdict.confidence}) after ${attempts} resume(s)`,
          )
          break
        }

        // verdict === "incomplete"：发起一次续跑
        attempts++
        console.warn(
          `[subagent-resumer] session=${sessionId} attempt=${attempts}/${MAX_RETRIES} reasons: ${verdict.reasons.join(" | ")}`,
        )

        try {
          // 关键：把续跑话术作为新 user message 发到**同一个**子 session。
          // 这相当于父 agent 没动、只是子 session 又被多戳了一下，subagent 会
          // 在原有上下文里继续推进任务。
          await client.session.prompt({
            path: { id: sessionId },
            body: { parts: [{ type: "text", text: buildContinuation(verdict) }] },
          })
        } catch (err) {
          // SDK 调用失败（网络 / 鉴权 / 子 session 已死）：放弃，保留已获得的结果。
          console.error(`[subagent-resumer] resume prompt failed for session=${sessionId}:`, err)
          break
        }
        // 循环回顶部，重新拉取消息并再次审查
      }

      // ── 收尾：如果一次续跑都没发起，原样返回，不动 output
      if (attempts === 0) return

      // 否则重新拉一次最终消息，把最新 final text 写回 task 工具的 output.output。
      // 这一步对父 agent 透明 —— 它看到的 <task_result> 已是续跑后的产物。
      const list = await client.session.messages({ path: { id: sessionId } })
      const messages: LooseRecord[] = ((list as any)?.data ?? []) as LooseRecord[]
      const finalText = lastTextOf(lastAssistant(messages))
      output.output = rewriteTaskResult(output.output, finalText, attempts, lastVerdict)
    },
  }
}

export default SubagentResumerPlugin
