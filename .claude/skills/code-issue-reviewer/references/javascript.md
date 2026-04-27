# JavaScript 专属盲点

> TS 项目也先读本文件，再叠加 `typescript.md`。

---

## 维度 1 · null_safety（undefined / null）

```js
// BAD
const name = user.profile.name;   // user / profile 任意为 null/undefined 即 throw

// GOOD
const name = user?.profile?.name ?? "anonymous";
```

- `??` 与 `||` 不同：`??` 仅对 `null`/`undefined` 兜底，`||` 对所有 falsy（含 `0`, `""`, `false`）
- `JSON.parse(s)` 中 s 是字符串"null" 时返回 `null` → 后续 `.field` 抛
- 解构 `const { a } = obj` 当 obj 为 undefined 时 throw（默认值 `obj = {}` 兜底）
- `Array.find` 找不到返回 `undefined`；链式 `.find().name` 易爆
- 函数参数默认值仅当 `undefined` 触发，传 `null` 不触发

---

## 维度 2 · resource_leak

- `setInterval` / `setTimeout` 启动但忘 `clearInterval` / `clearTimeout`
- `addEventListener` 不对应 `removeEventListener` → SPA 路由切换泄漏
- DOM 节点在 React useEffect 中订阅 / 引用但 cleanup 漏写
- Node.js：`req`/`res` stream 未消费（`res.end()` 必须）；`fs.createReadStream` 未关
- WebSocket 客户端断线后无 reconnect / 无 close 处理
- IntersectionObserver / ResizeObserver 未 disconnect

```js
// BAD（React）
useEffect(() => {
  window.addEventListener("resize", handler);
}, []);

// GOOD
useEffect(() => {
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
}, []);
```

---

## 维度 3 · concurrency

JS 单线程 + event loop，但仍有"逻辑并发"陷阱：

- `Promise.all([a, b])` 一个 reject 整体 reject，但 a/b 副作用已发；考虑 `Promise.allSettled`
- async 函数内 `await` 之间存在"微任务交错点"；其他 handler 可能跑
- 多个并发 setState（React）批合并不可期；用 functional updater
- worker_threads（Node）共享 SharedArrayBuffer 时需 Atomics

---

## 维度 4 · performance

- 循环内 `arr.find` / `arr.indexOf` → O(n²)；建 Set / Map
- React render 内 `new Date()` / 创建新对象 → 子组件 props 变化触发重渲染
- 在循环外重用正则
- `JSON.parse(JSON.stringify(obj))` 深拷贝慢且丢失 Date/Map/Set；用 `structuredClone` 或 lodash
- 大数组 `arr.map(...).filter(...).reduce(...)` 多趟遍历；考虑 `for-of` 一遍走
- DOM 频繁读写穿插（reflow）：先批读后批写

---

## 维度 5 · memory

- 闭包持有大对象不释放（DOM 节点 + closure）
- 全局 `window.cache = {}` 不淘汰
- `Map` / `Set` 持引用到 DOM 节点 → 节点 detached 仍存活；用 `WeakMap` / `WeakSet`
- Node.js EventEmitter 默认 maxListeners=10；超出有 warning，但不真泄漏（除非确实泄漏）
- 大 buffer 读完不及时释放（拼接到字符串）
- 长时间运行的 worker / queue 持有大对象

---

## 维度 6 · error_handling

```js
// BAD
try { await doX(); } catch (e) { console.log(e); }   // 静默
async function f() { await maybeReject(); }    // 上层不 catch → unhandledRejection
```

- async 函数未 await 返回的 Promise → fire-and-forget，error 丢
- `forEach` 中 await 不等待（forEach 不识别 Promise）；用 `for-of` 或 `Promise.all`
- `.catch(e => console.log(e))` 在生产代码 → 用项目 logger
- Node.js：`process.on('unhandledRejection')` 不应是日常处理点

---

## 维度 7 · external_call

```js
// BAD
const res = await fetch(url);   // 默认无 timeout

// GOOD
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 5000);
const res = await fetch(url, { signal: ctrl.signal });
clearTimeout(t);
```

- `axios` 创建实例时务必 `timeout`
- 缺重试 / 退避（用 `axios-retry` / `p-retry`）
- 写操作无幂等键
- WebSocket 重连无指数退避
- Node.js HTTP agent `maxSockets` 默认 Infinity → 上游被打爆

---

## 维度 8 · boundary

- `Number` 最大安全整数 `2^53 - 1`（9007199254740991）→ 大整数 ID 用 string 或 BigInt
- `parseInt("08")` 旧引擎按八进制；推荐 `parseInt(s, 10)` 显式 base
- `0.1 + 0.2 !== 0.3`；金额用整数（最小单位）或 decimal lib
- `Array(n)` 创建稀疏数组（`forEach` 跳过 hole）
- `[1,2,3].sort()` 默认按字符串排（10 < 9）
- `JSON.parse` 大数字精度丢失（`9007199254740993` → `9007199254740992`）

---

## 维度 9 · observability

- `console.log` / `console.error` 在生产代码 → 应用项目 logger（pino / winston）
- 错误路径只 `console.error(e.message)` 丢栈
- React error boundary 内 `componentDidCatch` 不上报
- async stack trace 在 Node 14+ 有改善，仍要看 logger 配置

---

## 维度 10 · config_env

- `process.env.X` 读取后无校验（dotenv 加载后仍可能空）
- 用 `zod` / `envalid` 在启动时 schema 校验
- 端口 / DB URL 写死在代码

---

## 维度 11 · data_consistency

- `Promise.all` 中含写操作，一个失败其他已提交 → 部分成功
- React 状态：基于过期 state 计算（用 functional updater）
- DB ORM (Prisma / Sequelize / TypeORM)：事务边界，关注 nested transaction 行为
- localStorage 跨标签页不一致（用 BroadcastChannel / storage event）

---

## 维度 12 · time_encoding

- `new Date()` / `Date.now()` 是 UTC 时间戳（OK）；`toString()` 走本地 → 显式 `toISOString()`
- 时区计算：原生 Date 没有时区 API；用 `date-fns-tz` / `luxon` / `moment-timezone`
- 字符串编码：Buffer 默认 utf-8（OK）；URL encoding 用 `encodeURIComponent`
- emoji / surrogate pair：`"💩".length === 2`；用 `Array.from(s).length` 取字符数

---

## 维度 13 · api_compat

- npm package `package.json` 缺 `engines` 字段 → Node 版本未约束
- 公共 ESM / CJS 双 entry 配错（exports map）→ 上游 import 失败
- TypeScript 类型导出变更（详见 typescript.md）
- React props 删除 / 重命名 → 上游编译破坏（TS）/ 静默丢失（JS）

---

## 工具与生态信号

- `package.json` 含 `pino` / `winston` / `bunyan` → logger 已有
- 含 `axios` → 检查每个 client 是否设 timeout
- 含 `next` / `react` → SSR 中关注 hydration 与全局状态
- 含 `eslint` + `eslint-plugin-promise` → 已有部分检查
- Node 版本（`engines.node`）影响许多 API 可用性（如 `structuredClone` 17+）
