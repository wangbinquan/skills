# C++ 一致性核对盲点

## 1. 结构维度

- **头文件 vs 实现文件签名漂移**：`.h` 与 `.cpp` 函数签名不一致是 C++ 漂移高发点；尤其 `const` / `noexcept` / 引用与值。
- **三/五法则**（Rule of 3/5）：设计要求 RAII / 不可拷贝 → 必须显式 `=delete` 拷贝 / 移动；漏写则编译器自动生成可能违反语义。
- **`virtual` / `override` / `final`**：设计声明虚函数 → 必须 `virtual`；派生类必须 `override`，否则签名细微不同时静默失效（隐式产生新方法而非覆盖）。
- **构造函数 `explicit`**：单参构造缺 `explicit` 触发隐式转换，违反设计的"严格类型"。
- **命名空间**：嵌套命名空间被改写（`namespace a::b`），可能与设计的"扁平命名"不一致。
- **`inline` / `constexpr` / `consteval`**：编译期约束差异；模板 vs 普通函数 inline 行为差异。
- **模板特化与 SFINAE**：设计仅声明主模板 → 代码加了特化版本，行为分裂。
- **PIMPL idiom**：设计要求 ABI 稳定 → 必须 PIMPL；漏则升级时二进制不兼容。

## 2. 行为维度

- **异常安全等级**：basic / strong / nothrow —— 设计要求 strong 但代码因中途状态修改无法回滚。
- **`noexcept` 的"反向影响"**：`noexcept` 函数抛异常 → `std::terminate`；与设计"上抛"冲突。
- **未定义行为（UB）**：use-after-free、悬空指针、未初始化读、有符号溢出、严格别名违例。设计要求"安全" → 任意一处 UB 即 critical。
- **数据竞争**：设计声明"线程安全" → 代码无 mutex / atomic 保护共享状态。
- **生命周期**：`std::string_view` / `std::span` 引用临时对象；lambda 捕获引用悬空。
- **智能指针选择**：unique_ptr / shared_ptr / weak_ptr 与设计的所有权模型一致。
- **`std::move` 后访问已 moved 对象**：未定义行为，但语法上不报错。

## 3. 接口契约维度

- **gRPC / protobuf**：proto 字段编号变更（破坏性）；`bytes` vs `string` 字段；`oneof` 处理。
- **REST 框架**（Pistache / Crow / Drogon）：路由签名与设计一致。
- **ABI 稳定**：设计要求保持 ABI → 不能在 public class 添加虚函数（vtable 改变）、不能改字段顺序与 padding。

## 4. 数据模型维度

- **POD vs non-POD**：设计要求"trivially copyable" → 不能加虚函数 / 非平凡构造。
- **字节对齐 / packing**：与跨语言 / 跨平台二进制协议交换时必须 `#pragma pack` 或 `alignas` 一致。
- **endianness**：序列化跨平台时网络字节序与设计协议一致。
- **整数宽度**：`int` 在不同平台 16/32/64 位；设计要求 `int32_t` / `int64_t` 必须显式。

## 5. 配置维度

- **编译期开关**：`#define FEATURE_X`、`#ifdef`；设计要求"feature 默认关" → 构建系统默认值与设计一致。
- **CMake `option()`**：默认值是否对齐设计。
- **运行时配置**：使用 nlohmann/json、yaml-cpp、boost::program_options 解析，字段名 / 默认值核对。

## 6. 依赖维度

- **CMakeLists.txt / vcpkg.json / conanfile.txt**：声明的依赖与实际 `find_package` / `target_link_libraries` 一致。
- **C++ 标准版本**：`CMAKE_CXX_STANDARD 17/20/23` 与设计要求一致；不同平台编译器对标准支持差异。
- **静态 vs 动态链接**：设计要求"独立部署" → 必须静态链接特定库。
- **第三方版本号**：CVE 修复版本下限。

## 7. 非功能维度

- **日志框架**：spdlog / glog / log4cpp 选择与设计一致；`std::cout` / `printf` 残留是绕过日志。
- **性能**：内存分配点（hot path 中的 `new` / `make_shared`）；STL 容器选择（`map` 红黑树 vs `unordered_map` 哈希）。
- **MISRA / AUTOSAR**：嵌入式 / 安全关键系统的合规性要求。
- **address sanitizer / thread sanitizer / UBSan**：CI 是否启用与设计要求一致。
- **栈大小 / 递归深度**：与设计 SLA 一致。

## 8. 测试维度

- **GoogleTest / Catch2 / Boost.Test**：测试框架与设计声明一致。
- **`EXPECT_*` vs `ASSERT_*`** 选择影响后续断言执行。
- **测试覆盖率**：gcov / llvm-cov 配置。

## 9. 文档维度

- **Doxygen 注释**：`@param` / `@return` / `@throw` 与签名同步。
- **README CMake 命令**：`cmake -B build && cmake --build build` 是否仍可用。

## 推荐 grep 模式

| 用途 | 模式 |
|------|------|
| 绕过日志 | `\bstd::cout\b\|\bprintf\(\|\bfprintf\(\bstderr\|\bstd::cerr\b` |
| 缺 override | 派生类方法对比基类（需 LSP 或 clang-tidy） |
| 不安全 cast | `\b(?:reinterpret_cast\|const_cast)\b` |
| 裸 new | `\bnew\s+\w+` |
| 异常吞没 | `catch\s*\(\.\.\.\)\s*\{\s*\}` |
| `noexcept` 标注 | `\)\s*noexcept` |
