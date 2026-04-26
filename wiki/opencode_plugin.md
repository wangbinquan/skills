# OpenCode Plugin Hook 完整参考

> 基于源码 `packages/plugin/src/index.ts:189-282` 整理，涵盖 opencode 所有 Hook 钩子。

---

## 核心机制

`trigger(hookName, input, output)` 会依次调用所有插件注册的同名 hook 函数。**`output` 是可变对象**，插件直接修改 `output` 上的属性即可，无需返回值。多个插件会链式修改同一个 output。

源码位于 `packages/opencode/src/plugin/index.ts:251-264`：

```ts
const trigger = Effect.fn("Plugin.trigger")(function* <
  Name extends TriggerName,
  Input = Parameters<Required<Hooks>[Name]>[0],
  Output = Parameters<Required<Hooks>[Name]>[1],
>(name: Name, input: Input, output: Output) {
  if (!name) return output
  const s = yield* InstanceState.get(state)
  for (const hook of s.hooks) {
    const fn = hook[name] as any
    if (!fn) continue
    yield* Effect.promise(async () => fn(input, output))
  }
  return output
})
```

插件写法统一为：

```ts
import { plugin } from "@opencode-ai/plugin"

export default plugin({
  name: "my-plugin",
  hooks: {
    "hook.name": async (input, output) => {
      // 读 input（只读上下文）
      // 改 output（直接赋值修改）
      output.someField = newValue
    }
  }
})
```

---

## Hook 总览

| 分类 | Hook 名称 | 触发时机 |
|------|-----------|----------|
| 非触发型 | `event` | 系统总线任意事件 |
| 非触发型 | `config` | 插件初始化 |
| 非触发型 | `tool` | 注册自定义工具（容器） |
| 非触发型 | `auth` | 提供自定义认证 |
| 非触发型 | `provider` | 扩展 provider |
| 触发型 | `chat.message` | 收到用户消息时 |
| 触发型 | `chat.params` | LLM 请求发送前 |
| 触发型 | `chat.headers` | LLM 请求发送前 |
| 触发型 | `permission.ask` | 权限请求时（未实际触发） |
| 触发型 | `command.execute.before` | 斜杠命令执行前 |
| 触发型 | `tool.execute.before` | 工具执行前 |
| 触发型 | `tool.execute.after` | 工具执行后 |
| 触发型 | `tool.definition` | 构建工具定义时 |
| 触发型 | `shell.env` | 执行 shell 命令前 |
| 实验性 | `experimental.chat.messages.transform` | 消息发给 LLM 前 |
| 实验性 | `experimental.chat.system.transform` | 构建 system prompt 时 |
| 实验性 | `experimental.session.compacting` | 上下文压缩前 |
| 实验性 | `experimental.text.complete` | LLM 文本流结束时 |

---

## 一、`event` — 全局事件监听

```ts
event: async ({ event }) => { }
```

| 参数 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `event` | input | `Event` | 系统总线上的任意事件对象 |

**无 output**。纯监听用途，适合做日志/审计/metrics 上报。

**触发位置**：`packages/opencode/src/plugin/index.ts:240` — 订阅所有 bus 事件流。

---

## 二、`config` — 配置初始化

```ts
config: async (config) => { }
```

| 参数 | 方向 | 类型 | 说明 |
|------|------|------|------|
| `config` | input | `Config` | 完整的 opencode 配置对象 |

**无 output**。插件加载时调用一次，用于读取配置做内部初始化。

**触发位置**：`packages/opencode/src/plugin/index.ts:228`

---

## 三、`tool` — 注册自定义工具

```ts
tool: {
  myTool: {
    description: "...",
    parameters: z.object({ ... }),
    execute: async (args) => { ... }
  }
}
```

不是事件钩子，而是工具注册容器。键名为工具 ID，值为 `ToolDefinition`。

---

## 四、`auth` — 自定义认证

```ts
auth: { /* AuthHook 类型 */ }
```

用于 provider 认证扩展，非事件钩子。

---

## 五、`provider` — 扩展 Provider

```ts
provider: {
  id: "my-provider",
  models: async (provider, ctx) => ({ /* 自定义模型列表 */ })
}
```

用于扩展 provider 能力，如自定义 models 列表。类型为 `ProviderHook`。

---

## 六、`chat.message` — 用户消息拦截

```ts
"chat.message": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/prompt.ts:1231-1241` — 消息 parts 解析完成后、保存到数据库前。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionID` | `string` | 当前会话 ID |
| `agent` | `string?` | 代理名称，如 `"code"`、`"task"` |
| `model` | `{ providerID, modelID }?` | 用户选择的模型 |
| `messageID` | `string?` | 消息 ID |
| `variant` | `string?` | 模型变体 |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `message` | `UserMessage` | 当前用户消息对象 | 用户消息 | 可修改消息内容，如 `output.message.text = "..."` |
| `parts` | `Part[]` | 已解析的消息 parts | 消息组成部分（文本、文件、图片等） | 可增删改 parts，如 `output.parts.push({ type: "text", text: "额外上下文" })` |

**效果**：修改后的 message 和 parts 会被保存到数据库并发送给 LLM。

---

## 七、`chat.params` — 修改 LLM 调用参数

```ts
"chat.params": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/llm.ts:169-187` — 调用 `streamText()` 前。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionID` | `string` | 会话 ID |
| `agent` | `string` | 代理名称 |
| `model` | `Model` | 模型定义对象（含 providerID、modelID、能力等） |
| `provider` | `ProviderContext` | Provider 上下文 |
| `message` | `UserMessage` | 当前用户消息 |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `temperature` | `number` | 模型默认值 | 温度，控制随机性 | `output.temperature = 0` 设为确定性输出 |
| `topP` | `number` | 模型默认值 | 核采样概率 | `output.topP = 0.9` |
| `topK` | `number` | 模型默认值 | top-K 采样 | `output.topK = 40` |
| `maxOutputTokens` | `number \| undefined` | 模型默认值 | 最大输出 token 数 | `output.maxOutputTokens = 4096` |
| `options` | `Record<string, any>` | `{}` | Provider 专属参数 | `output.options.reasoning = { effort: "high" }` |

**效果**：直接传入 `streamText()` 调用，影响 LLM 推理行为。

---

## 八、`chat.headers` — 注入 HTTP 请求头

```ts
"chat.headers": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/llm.ts:189-201` — 调用 `streamText()` 前。

### input（只读）

与 `chat.params` 完全相同（sessionID, agent, model, provider, message）。

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `headers` | `Record<string, string>` | `{}` | 附加到 LLM 请求的 HTTP 头 | `output.headers["X-Custom-Auth"] = "token123"` |

**效果**：headers 会与默认头合并（`...model.headers, ...pluginHeaders`），用于代理鉴权、追踪等。

---

## 九、`permission.ask` — 权限决策干预

```ts
"permission.ask": async (input, output) => { }
```

> **注意**：当前源码中此 hook 已定义但**未实际触发**，属于预留接口。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| （整个 input） | `Permission` | 权限请求对象（包含工具名、操作类型等） |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `status` | `"ask" \| "deny" \| "allow"` | `"ask"` | 权限决策 | `output.status = "allow"` 自动放行，`"deny"` 拒绝，`"ask"` 继续询问用户 |

---

## 十、`command.execute.before` — 斜杠命令执行前

```ts
"command.execute.before": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/prompt.ts:1636-1640` — 命令模板执行前。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `command` | `string` | 命令名称，如 `"summarize"` |
| `sessionID` | `string` | 会话 ID |
| `arguments` | `string` | 用户输入的命令参数原始文本 |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `parts` | `Part[]` | `[]` | 注入到命令消息中的额外 parts | `output.parts.push({ type: "text", text: "附加上下文..." })` |

**效果**：parts 会被合并到命令发送给 LLM 的消息中，用于给命令补充上下文。

---

## 十一、`tool.execute.before` — 工具执行前

```ts
"tool.execute.before": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/prompt.ts:410-413, 451-454, 572-575` — 内置工具、MCP 工具、task 工具执行前均触发。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `tool` | `string` | 工具 ID，如 `"file_edit"`、`"bash"` |
| `sessionID` | `string` | 会话 ID |
| `callID` | `string` | 本次工具调用的唯一 ID |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `args` | `any` | 原始工具参数 | 工具的调用参数 | `output.args.path = "/safe/path"` 修改参数；或仅读取用于日志记录 |

**效果**：修改后的 args 会传给工具执行。可用于参数校验、重写、审计。

---

## 十二、`tool.execute.after` — 工具执行后

```ts
"tool.execute.after": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/prompt.ts:425-429, 460-463, 651-655` — 工具执行完成后触发。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `tool` | `string` | 工具 ID |
| `sessionID` | `string` | 会话 ID |
| `callID` | `string` | 工具调用 ID |
| `args` | `any` | 工具的调用参数 |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `title` | `string` | 工具返回的标题 | 展示给用户的工具执行标题 | `output.title = "已完成文件编辑"` |
| `output` | `string` | 工具返回的文本输出 | 工具执行结果文本 | `output.output = filteredResult` 过滤敏感信息 |
| `metadata` | `any` | 工具返回的元数据 | 结构化元数据 | `output.metadata.duration = 120` |

**效果**：修改后的结果会保存到会话中并返回给 LLM。适合做结果过滤、脱敏、enrichment。

---

## 十三、`tool.definition` — 修改工具定义

```ts
"tool.definition": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/tool/registry.ts:297` — 构建发给 LLM 的工具列表时。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `toolID` | `string` | 工具 ID |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `description` | `string` | 工具原始描述 | 发送给 LLM 的工具描述 | `output.description = "自定义描述..."` 让 LLM 更好理解何时该用此工具 |
| `parameters` | `any` | 工具原始 JSON Schema | 工具参数的 schema 定义 | 可增删改参数 schema |

**效果**：LLM 看到的工具列表会使用修改后的 description 和 parameters，影响 LLM 的工具选择行为。

---

## 十四、`shell.env` — Shell 环境变量注入

```ts
"shell.env": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/prompt.ts:818-822` 和 `packages/opencode/src/tool/bash.ts:361-365` — 执行 shell 命令前。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `cwd` | `string` | 当前工作目录 |
| `sessionID` | `string?` | 会话 ID |
| `callID` | `string?` | 调用 ID |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `env` | `Record<string, string>` | `{}` | 注入的环境变量 | `output.env.NODE_ENV = "test"` 或 `output.env.API_KEY = "xxx"` |

**效果**：与 `process.env` 合并后传给子进程（`{ ...process.env, ...shellEnv.env, TERM: "dumb" }`）。用于给 bash 工具注入凭据、配置项等。

---

## 十五、`experimental.chat.messages.transform` — 消息历史变换

```ts
"experimental.chat.messages.transform": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/prompt.ts:1467` 和 `packages/opencode/src/session/compaction.ts:221` — 消息发给 LLM 前以及会话压缩时。

### input

空对象 `{}`

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `messages` | `{ info: Message, parts: Part[] }[]` | 完整消息历史 | 即将发给 LLM 的全部消息 | 可过滤、重排、修改任意消息。如 `output.messages = output.messages.filter(m => ...)` |

**效果**：变换后的消息直接发给 LLM。极其强大，可实现消息裁剪、注入、重排等。

---

## 十六、`experimental.chat.system.transform` — System Prompt 变换

```ts
"experimental.chat.system.transform": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/llm.ts:121-125` — system prompt 组装完成后。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionID` | `string?` | 会话 ID |
| `model` | `Model` | 模型对象 |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `system` | `string[]` | 当前 system prompt 各段 | 系统提示词数组（最终 `join("\n")` 合并） | `output.system.push("你必须用中文回答")` 追加指令，或 `output.system = ["完全替换"]` |

**效果**：直接修改 LLM 收到的 system prompt。

---

## 十七、`experimental.session.compacting` — 会话压缩定制

```ts
"experimental.session.compacting": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/compaction.ts:184-188` — 上下文超限触发压缩前。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionID` | `string` | 会话 ID |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `context` | `string[]` | `[]` | 追加到默认压缩 prompt 后面的额外上下文 | `output.context.push("请保留所有代码片段")` |
| `prompt` | `string?` | `undefined` | 如果设置，**完全替换**默认压缩 prompt | `output.prompt = "请用100字总结以上对话"` |

**效果**：控制上下文压缩时的 summarization 行为。最终 prompt 的逻辑为：

```ts
const prompt = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
```

`context` 是追加模式，`prompt` 是替换模式，二者互斥优先 `prompt`。

---

## 十八、`experimental.text.complete` — 文本后处理

```ts
"experimental.text.complete": async (input, output) => { }
```

**触发位置**：`packages/opencode/src/session/processor.ts:430-438` — LLM 文本流结束时。

### input（只读）

| 字段 | 类型 | 说明 |
|------|------|------|
| `sessionID` | `string` | 会话 ID |
| `messageID` | `string` | 助手消息 ID |
| `partID` | `string` | 文本段 ID |

### output（可修改）

| 字段 | 类型 | 默认值 | 说明 | 如何填写 |
|------|------|--------|------|----------|
| `text` | `string` | LLM 生成的完整文本 | 最终保存的文本内容 | `output.text = output.text.replace(/敏感词/g, "***")` |

**效果**：修改后的文本会替代原文保存到会话（`ctx.currentText.text = result.text`，然后 `session.updatePart()`）。适合做后处理、格式化、脱敏。

---

## 完整插件示例

```ts
import { plugin } from "@opencode-ai/plugin"

export default plugin({
  name: "my-plugin",
  hooks: {
    // 初始化时读配置
    config: async (config) => {
      console.log("loaded with config:", config)
    },

    // 监听所有事件
    event: async ({ event }) => {
      console.log("[event]", event)
    },

    // 强制低温度
    "chat.params": async (input, output) => {
      output.temperature = 0
    },

    // 注入自定义请求头
    "chat.headers": async (input, output) => {
      output.headers["X-Request-ID"] = crypto.randomUUID()
    },

    // 给所有 shell 命令注入环境变量
    "shell.env": async (input, output) => {
      output.env.MY_TOKEN = "abc123"
    },

    // 追加 system prompt
    "experimental.chat.system.transform": async (input, output) => {
      output.system.push("Always respond in Chinese.")
    },

    // 用户消息中注入额外上下文
    "chat.message": async (input, output) => {
      output.parts.push({ type: "text", text: "项目背景：这是一个电商系统" })
    },

    // 斜杠命令前注入上下文
    "command.execute.before": async (input, output) => {
      if (input.command === "review") {
        output.parts.push({ type: "text", text: "请关注安全性问题" })
      }
    },

    // 工具执行前记录日志
    "tool.execute.before": async (input, output) => {
      console.log(`[audit] tool=${input.tool} args=`, output.args)
    },

    // 工具执行后脱敏
    "tool.execute.after": async (input, output) => {
      output.output = output.output.replace(/sk-[a-zA-Z0-9]+/g, "sk-***")
    },

    // 修改工具描述
    "tool.definition": async (input, output) => {
      if (input.toolID === "bash") {
        output.description += "\n注意：禁止执行 rm -rf 命令"
      }
    },

    // 消息历史过滤（实验性）
    "experimental.chat.messages.transform": async (input, output) => {
      // 只保留最近 20 条消息
      if (output.messages.length > 20) {
        output.messages = output.messages.slice(-20)
      }
    },

    // 自定义压缩提示词（实验性）
    "experimental.session.compacting": async (input, output) => {
      output.context.push("请保留所有代码片段和文件路径")
    },

    // LLM 输出后处理（实验性）
    "experimental.text.complete": async (input, output) => {
      output.text = output.text.replace(/敏感词/g, "***")
    },
  },
})
```
