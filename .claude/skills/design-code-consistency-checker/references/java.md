# Java 一致性核对盲点

> 核对 subagent 处理 Java 项目时按需 Read。聚焦"Java 语言/生态特有、容易在设计-代码核对时被漏掉"的点。

## 1. 结构维度

- **注解一致性**：设计要求 `@Service`、`@Repository`、`@Component`、`@Configuration` 等定型注解 → 代码必须对应；漏标会让 Spring 不扫描、漏注册 bean，业务层失踪。
- **`@Transactional` 的 propagation / isolation / rollbackFor**：默认值常与设计期望不符；`rollbackFor` 不写则受检异常不回滚。
- **`final` / `sealed` / `abstract`**：设计要求"不可继承" / "封闭族类型" → 代码漏写 `final`/`sealed` 导致出口面失控。
- **Lombok 注解**：`@Data` 自动生成 setter 可能与设计要求"不可变"冲突；`@Builder` 默认全字段可选与"必填"冲突。
- **`Optional<T>` vs `T`**：设计标"可选" → 代码用 `T` 而非 `Optional<T>` 或 `@Nullable`，文档/调用方误以为非空。
- **泛型擦除盲点**：设计声明 `List<UserDTO>` → 代码因擦除可能传入 `List<Object>`，编译能过运行时崩。
- **包私有 vs public**：跨模块时 maven multi-module 会阻断包私有；设计如把内部类设为包私有需配合模块拆分。
- **record 与 class 互换**：设计要求"不可变值对象" → 用 `record` 更精准；用 `class` + Lombok 也行，但需确认 setter 不存在。
- **接口 default 方法**：可能引入设计未声明的"内置实现"，也可能与现有实现签名冲突。

## 2. 行为维度

- **Spring AOP self-invocation**：`@Transactional`/`@Async`/`@Cacheable` 在同类内 `this.x()` 调用不生效。
- **`@Async` 的线程池**：默认 `SimpleAsyncTaskExecutor` 不复用线程，与设计"异步化"承诺不符。
- **异常吞没**：`catch (Exception e) { log.warn(...) }` —— 设计要求抛出但代码降级为日志。
- **`runtimeException` 替代 checked**：方法签名 `throws BizException` 改成 unchecked 后，调用方不再被强制处理。
- **状态机库**：Spring Statemachine、Squirrel 配置中"非法转移"是否拒绝，需要看 `transitions()` 与 `event()` 完整性。
- **Stream / 并行流**：设计未声明并行 → 代码用 `parallelStream()` 引入未受控并发。
- **`equals/hashCode/compareTo`**：JPA 实体的 `equals` 与设计期望（按 ID / 按业务键）必须一致，否则 Set/Map 行为错乱。

## 3. 接口契约维度

- **`@RestController` vs `@Controller`**：后者不自动序列化为 JSON，设计声明 REST 接口但写成 `@Controller` + 返回 String → 渲染视图。
- **`@RequestMapping` 路径与方法**：方法级与类级路径拼接出错；`/api` vs `/api/`。
- **`@RequestParam(required=true)` 默认值**：设计标"可选" → 代码漏 `required=false` 致 400。
- **`@Valid` 校验缺失**：DTO 上有 `@NotNull` 等约束但 controller 未加 `@Valid`，校验失效。
- **`Jackson` 字段命名策略**：`@JsonProperty` 缺失或 `PropertyNamingStrategy` 未对齐导致 camelCase / snake_case 漂移。
- **全局异常处理器**：`@ControllerAdvice` 没覆盖所有业务异常 → fallback 到 500，错误码失踪。

## 4. 数据模型维度

- **JPA 实体的 `@Column` 缺省**：长度 255、nullable=true 等默认值常与 DDL 不符。
- **`@GeneratedValue` 策略**：`AUTO/IDENTITY/SEQUENCE/UUID` 与数据库实际策略需对齐。
- **MyBatis ResultMap**：字段映射漏写或类型转换器缺失。
- **Liquibase / Flyway 脚本**：迁移脚本顺序、checksum 修改禁忌；rollback 段是否齐备。
- **`@Enumerated(EnumType.STRING)` vs ORDINAL**：枚举存储形式与设计/迁移脚本必须一致。
- **`LocalDateTime` vs `Timestamp` / 时区**：跨时区项目最易翻车。

## 5. 配置维度

- **`@Value("${x:default}")`**：默认值与 application.yml 不一致。
- **`@ConfigurationProperties` 前缀**：配置 key 与 prefix 不匹配则字段全为 null/0。
- **profile 命名**：`application-prod.yml` vs `application-production.yml` 不一致致配置不生效。
- **Spring Cloud Config / Nacos** 动态刷新：`@RefreshScope` 缺失则配置变更不生效。

## 6. 依赖维度

- **Spring Boot Starter 隐式传递**：例如 `spring-boot-starter-web` 隐式带来 Tomcat、Jackson —— 代码"看起来没引入"但已传递可用，设计"无 web 服务器"约束实际被违反。
- **BOM / dependencyManagement**：版本由父 POM 管控，子模块写错版本不报错。
- **Logback / Log4j2 同时存在**：导致日志无声丢失或冲突。
- **测试依赖泄漏到主 scope**：`<scope>compile</scope>` 把 mockito 带进生产。

## 7. 非功能维度

- **`@PreAuthorize` / `@Secured`**：缺失则鉴权失效。
- **CSRF 配置**：Spring Security 默认开启，REST API 常需关闭，配置不当致 403。
- **CORS**：`@CrossOrigin(origins="*")` 与设计的"允许域名清单"冲突，安全风险。
- **Actuator 端点**：`/actuator/env`、`/actuator/heapdump` 等敏感端点是否暴露。
- **`@Cacheable(key=...)`**：key 表达式错写导致缓存穿透或 key 冲突。
- **Logger**：`System.out.println` / `e.printStackTrace()` 残留 → 不进日志框架。
- **Micrometer 指标命名**：`my.app.requests` vs `myapp_requests`，与监控大盘不对齐。
- **`@Async` 的 trace 上下文**：MDC 不会自动透传，需配 TaskDecorator。

## 8. 测试维度

- **JUnit 4 vs JUnit 5 混用**：注解 `@Test` 来源不同包；`@Before` vs `@BeforeEach`。
- **Mockito 静态 mock**：`mockStatic` 用 try-with-resources 否则泄漏。
- **`@SpringBootTest` 启动慢**：被滥用导致 UT 实质上是集成测试。
- **`@Transactional` 测试方法默认回滚**：但跨线程事务不会被回滚，残留数据。

## 9. 文档维度

- **Javadoc 中的 `@param` / `@return` / `@throws`** 与签名漂移。
- **OpenAPI（springdoc / springfox）注解**：`@Operation` / `@Parameter` 与设计的接口表必须同步。
- **README 启动命令**：`mvn spring-boot:run` 等是否仍可用。

## 推荐 grep 模式（核对时常用）

| 用途 | 模式 |
|------|------|
| 找绕过日志框架 | `System\.out\.|System\.err\.|printStackTrace\(\)` |
| 找鉴权点 | `@PreAuthorize|@Secured|@RolesAllowed|SecurityContextHolder` |
| 找事务 | `@Transactional` |
| 找路由 | `@(Get\|Post\|Put\|Delete\|Patch\|Request)Mapping|@RestController|@Controller` |
| 找配置绑定 | `@Value\(|@ConfigurationProperties\(` |
| 找未捕获泛型 | `List<Object>|Map<Object,Object>` |
| 找硬编码常量 | `Duration\.ofSeconds\(|Duration\.ofMillis\(` |
