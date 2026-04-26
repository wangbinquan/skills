# JavaScript 一致性核对盲点

> 不带 TS 的纯 JS 项目专用。若项目同时使用 TS（存在 tsconfig.json），优先 Read `typescript.md`。

## 1. 结构维度

- **CommonJS vs ESM**：`require` / `module.exports` 与 `import` / `export` 混用是漂移高发点；`type: "module"` 与 `.cjs` 扩展。
- **导出形态**：default export 与 named export 在调用方使用形态不同；设计要求"具名" → 不能 default。
- **class vs prototype**：设计的"OOP" → 用 class；"函数式" → 不能引入 class。
- **私有字段 `#field`**：设计要求"封装" → 必须用 `#`，否则 `_field` 仅约定。
- **getter / setter**：行为"看似字段"实为函数，设计如要求"零成本访问" → 留意。

## 2. 行为维度

- **类型隐式转换**：`==` 漏写 `===` 致 `0 == false` / `'' == 0` 触发。
- **`undefined` vs `null`**：API 设计应统一选择其一表示"无值"。
- **数组 / 对象的 in-place 修改**：`Array.prototype.sort` / `splice` / `Object.assign` 默认改原对象。
- **Promise 错误未捕获**：unhandledRejection；漂浮 promise。
- **`for...in` vs `for...of`**：`for...in` 遍历枚举属性（含原型链），常出 bug。
- **闭包陷阱**：`var` 在循环中共享；设计未声明意图但因 var 出现共享变量。
- **`this` 绑定**：箭头函数 vs 普通函数；class 方法未 bind 作为回调时丢失 this。

## 3. 接口契约维度

- **express / koa / fastify**：路由路径、中间件顺序与设计一致。
- **JSON 序列化**：`JSON.stringify` 的字段顺序非确定；BigInt 不可序列化。
- **响应包装**：`{ data, code, message }` 与设计统一。
- **HTTP 状态码 vs 业务错误码** 对应。

## 4. 数据模型维度

- **mongoose / sequelize / knex**：schema 与实际 DB 一致。
- **`Number` 精度**：超过 2^53 的 ID 必须用 BigInt 或字符串。
- **Date 时区**：JS Date 默认本地。

## 5. 配置维度

- **`process.env.X`** 总是字符串；解析 / 校验缺失。
- **`.env` / `.env.local` / `.env.production`** 优先级。
- **`config` / `nconf` / `dotenv-flow`** 选择与设计一致。

## 6. 依赖维度

- **package.json dependencies 区分**：dev vs prod。
- **lock 文件**：必须提交 `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`。
- **Node 版本**：`engines.node` 与 CI / 生产环境一致。
- **CommonJS vs ESM 包**：错误使用导致运行时崩。

## 7. 非功能维度

- **日志**：`console.log` 是绕过 winston/pino/bunyan 的直接信号；生产代码中应清零。
- **trace_id**：`AsyncLocalStorage` 在异步链中是否传递。
- **CORS**：`*` 与设计白名单冲突。
- **rate limit / helmet** 等中间件启用情况。
- **PII 脱敏**：日志输出整个 user 对象。
- **未关闭资源**：DB 连接、文件句柄、HTTP keepalive。

## 8. 测试维度

- **jest / mocha / vitest**：测试框架与设计声明一致。
- **`done` 回调 vs Promise**：异步测试两种风格混用易漂移。
- **mock 时序**：`jest.mock` 顶层提升与 ESM 行为差异。
- **fake timer**：`jest.useFakeTimers()` 配置。

## 9. 文档维度

- **JSDoc** 注释与签名同步；`@param` / `@returns` / `@throws`。
- **README `npm run` 命令** 是否仍可用。

## 推荐 grep 模式

| 用途 | 模式 |
|------|------|
| 绕过日志 | `console\.(log\|info\|warn\|error\|debug)` |
| 弱比较 | `==[^=]\|!=[^=]` |
| 漂浮 promise | 静态难抓，建议 ESLint `no-floating-promises` |
| 路由 | `(app\|router)\.(get\|post\|put\|delete\|patch)\(` |
| 模块系统 | `\brequire\(\|^import\s\|module\.exports\|export\s` |
| 配置 | `process\.env\.\|require\(['"]config['"]` |
