# C++ 专属盲点

C++ 的核心稳定性风险高度集中在**对象生命周期**与**未定义行为（UB）**。比其他语言更容易把人 page 起来，也更值得严格审视。

---

## 维度 1 · null_safety（含 dangling reference / UAF）

```cpp
// BAD — 返回栈对象引用
const std::string& name() { std::string n = "x"; return n; }   // dangling ref

// BAD — 容器扩容后旧引用失效
std::vector<int> v = {1,2,3};
int& r = v[0];
v.push_back(99);   // 可能重分配
r = 0;             // 未定义行为
```

- raw pointer 在多线程 / 异步路径中存活 → use-after-free
- `std::optional<T>::value()` 在 nullopt 时抛 `bad_optional_access`；`*opt` 不抛但 UB
- `std::shared_ptr<T> p; p->...` 当 p 为 nullptr → segfault
- `std::weak_ptr.lock()` 返回的 shared_ptr 可能为空
- `std::string_view` 引用临时字符串 → dangling
- C 风格 string：`strcpy` / `strncpy` 缓冲溢出（SSO 不救）

---

## 维度 2 · resource_leak（RAII 绕过）

C++ 的资源管理靠 RAII。**RAII 绕过场景**：

```cpp
// BAD
auto* p = new MyResource();   // 没 unique_ptr 包装
if (cond) return;             // 泄漏
delete p;
```

```cpp
// BAD — exception 期间手动 release 不会跑
void f() {
    Resource* r = acquire();
    do_might_throw();   // 抛了之后 r 永不释放
    release(r);
}
```

- 裸 `new` / `delete` 在生产代码 → 应用 `unique_ptr` / `make_unique`
- 自管理文件描述符（`int fd = open(...)`） → 用 RAII wrapper
- 锁：`std::mutex` 直接 `lock()` 不用 `lock_guard` / `scoped_lock` / `unique_lock` → 异常路径未释放
- `std::thread` 析构时未 join / detach → terminate
- `setjmp` / `longjmp` 跳过析构 → 泄漏

---

## 维度 3 · concurrency

```cpp
// BAD — data race
int counter = 0;
void inc() { counter++; }   // 多线程 = UB

// GOOD
std::atomic<int> counter{0};
void inc() { counter.fetch_add(1, std::memory_order_relaxed); }
```

- 共享变量无 atomic / mutex → UB（不只是错值，是 UB）
- `volatile` ≠ atomic（volatile 只对编译器优化禁忌，不保证线程同步）
- 死锁：两把锁顺序不一致 → 用 `std::scoped_lock(m1, m2)` 一次性多锁（自动避免死锁）
- 信号 + 多线程：信号处理函数中只能调 async-signal-safe 函数
- `std::shared_ptr` 引用计数原子，但所指对象**非**原子访问
- 静态局部变量初始化 C++11+ 线程安全（DCL 不再需要手写）

---

## 维度 4 · performance

- 拷贝大对象（缺 `&` 取引用）；用 `const T&` 或移动
- `std::string` 临时对象在循环里反复构造
- `std::vector` 不 `reserve` 在循环 push_back 多次重分配
- 不必要的虚函数调用（关联架构）
- shared_ptr 拷贝 → 原子计数操作开销
- 隐式类型转换（`int` ↔ `double`）在热路径
- C 风格 IO（`fopen` / `printf`）vs C++ stream（`std::cout`）：默认同步标准 IO 慢，可 `std::ios::sync_with_stdio(false)`
- `std::function` 比函数指针 / lambda 直接调用慢

---

## 维度 5 · memory

- 无界容器：`std::vector` / `std::list` 不 evict
- shared_ptr 循环引用 → 内存永不释放（用 weak_ptr 打破）
- string + 循环 += → O(n²) 内存与时间
- `mmap` 大文件不 munmap
- 自管理 buffer 不 shrink
- 多线程下 thread-local 大对象在线程池中累积
- malloc / new 失败处理：`new` 默认抛 `bad_alloc`；`new (std::nothrow)` 才返回 nullptr

---

## 维度 6 · error_handling

```cpp
// BAD
try { ... } catch (...) { /* swallow */ }
try { ... } catch (std::exception& e) { std::cerr << e.what(); }   // 用旁路输出

// GOOD
try { ... } catch (std::exception& e) {
    LOG_ERROR("Failed to process orderId={}: {}", orderId, e.what());
    throw ServiceError{"refund failed", e};   // wrap 保留链
}
```

- 析构函数抛异常 → terminate（C++11+ 默认 noexcept）
- `noexcept` 函数抛异常 → terminate
- 信号处理：抛异常跨信号边界 = UB
- `std::error_code` vs exception：项目应一致风格
- 跨 ABI 边界（dll / so）抛异常 → 行为不可移植

---

## 维度 7 · external_call

C++ 项目通常自管理网络 / DB 客户端：

- 阻塞 IO 无超时
- 自建连接池实现错（计数错乱、归还前未 reset）
- gRPC C++ stub：`ClientContext.set_deadline(...)` 必须设
- libcurl：`CURLOPT_TIMEOUT` 必须显式
- 异步框架（asio / Folly）的 cancellation 路径

---

## 维度 8 · boundary

- 整数溢出：signed `int` 溢出是 **UB**（编译器可优化掉检查），unsigned 是 well-defined wrap
- `size_t` vs `int` 比较（`v.size() < -1` 因为 `size_t` 是无符号 → -1 提升为巨大 unsigned）
- `std::vector::operator[]` 越界 UB；`at()` 抛异常
- `string.substr(pos, n)` pos 越界抛
- 浮点 `==` 比较；NaN ≠ NaN
- `0` / `nullptr` / `NULL` 区别（`0` 可能歧义）

---

## 维度 9 · observability

- `printf` / `std::cout` / `std::cerr` 在生产代码 → 应用项目 LOG_* 宏
- 错误路径 `LOG_ERROR("failed")` 无上下文
- 高频调用路径未做日志频率控制（spdlog `set_pattern` + level 不够）
- 异常被 swallow → 现场无栈

---

## 维度 10 · config_env

- `getenv("X")` 后未判 nullptr
- 编译期常量（`#define` / `constexpr`）vs 运行时配置混淆
- 硬编码端口 / 路径
- 单例配置在多线程下初始化无锁

---

## 维度 11 · data_consistency

C++ 项目较少直接对接 DB（除嵌入式 / 高频交易），更多关心**进程内状态一致**：

- 多线程下复合状态修改无原子性（多个 atomic 字段间无关联）
- 异常半中断后状态不回滚（缺 commit/rollback 模式）
- 单例懒初始化与多线程

---

## 维度 12 · time_encoding

- `time_t` 单位是秒（精度问题）
- `std::chrono::system_clock` vs `steady_clock`：前者可调（NTP），后者单调
- `localtime` 非线程安全（用 `localtime_r` POSIX / `localtime_s` MS）
- 字符串：`std::string` 是 byte 序列，不是 char；UTF-8 处理需库
- C++20 `<format>` / `std::chrono` 时区支持（旧版本依赖 howard hinnant date lib）

---

## 维度 13 · api_compat

C++ ABI 兼容是大坑：

- 公共类加字段 → ABI 破坏
- 虚函数表加项 → ABI 破坏
- inline 函数 / template 改实现 → ODR 风险
- export class 在 dll / so 中字段顺序变化破坏 ABI
- `std::string` / `std::list` 的 ABI 在 GCC libstdc++ Dual ABI 切换时差异
- C 接口 vs C++ 接口暴露选择

---

## 工具与生态信号

- `CMakeLists.txt` / `Makefile` 含 `-fsanitize=address` / `thread` / `undefined` → 已用 sanitizer
- 项目用 `clang-tidy` / `cppcheck` → 已有静态检查；许多模式已被覆盖
- 项目有 `spdlog` / `glog` / 自建 LOG 宏 → logger 已有
- 项目用 `Boost.Asio` / `Folly` → 异步路径关注 cancellation
- 项目有 GoogleTest → 集成测试好做
- C++ 标准（11/14/17/20/23）影响可用 API：`std::optional` 17+；`std::format` 20+；coroutines 20+

**审视严重度调整**：
- 项目跑 ASan / UBSan / TSan → 大量 UB 已被 fuzz 出，仍审；但许多明显问题降级
- 嵌入式 / RTOS / 内核：抛异常往往禁用，error code 风格；按项目约定
