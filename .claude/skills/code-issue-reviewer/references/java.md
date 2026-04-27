# Java 专属盲点

本文件是审视 Java 代码时的 cheat sheet。**与 dimensions.md 配合使用**——dimensions.md 给"看什么"，本文件给 Java 里"看到什么样的代码模式即标"。

---

## 维度 1 · null_safety

### 高频模式

```java
// BAD — Optional.get() 无判定
Optional<User> u = repo.findById(id);
return u.get().getName();

// GOOD
return repo.findById(id)
    .orElseThrow(() -> new UserNotFoundException(id))
    .getName();
```

```java
// BAD — Map 取值后链式调用
String name = userMap.get(id).getName();

// GOOD
User u = userMap.get(id);
if (u == null) { throw new UserNotFoundException(id); }
return u.getName();
```

```java
// BAD — Stream.findFirst().get()
String first = list.stream().filter(p).findFirst().get();
```

```java
// BAD — 反射 / 反序列化字段假设非空
@JsonProperty("payload") private Payload payload;  // 反序列化后可能为 null
this.payload.process();  // NPE
```

### 易漏点

- `@NotNull` / `@Nonnull` **只是注解**，不强制运行时校验（除非配 `Hibernate Validator` / SpotBugs）
- `Map.computeIfAbsent` 返回非 null，但 `compute` 可能返回 null（行为不同）
- `Optional<T>` 字段类型 → 反模式（应用 nullable 字段 + 取用时包装）

---

## 维度 2 · resource_leak

### 必查

- 所有 `Connection` / `Statement` / `ResultSet` / `InputStream` / `OutputStream` / `Reader` / `Writer` 是否在 try-with-resources 内
- 自管理 `ExecutorService` 是否调 `shutdown()` / `shutdownNow()`
- `FileChannel` / `MappedByteBuffer` 是否清理
- `ScheduledExecutorService` 任务是否随生命周期 cancel
- Spring 测试 / 工具类创建的 `EntityManagerFactory` / `SessionFactory` 是否关闭

```java
// BAD
Connection conn = ds.getConnection();
PreparedStatement ps = conn.prepareStatement(sql);
ResultSet rs = ps.executeQuery();
// 异常路径全泄漏

// GOOD
try (Connection conn = ds.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql);
     ResultSet rs = ps.executeQuery()) {
    // ...
}
```

```java
// BAD — Files.lines 未关闭流
return Files.lines(path).filter(...).collect(toList());

// GOOD
try (Stream<String> lines = Files.lines(path)) {
    return lines.filter(...).collect(toList());
}
```

---

## 维度 3 · concurrency

### 高频陷阱

- `SimpleDateFormat` 静态字段共用 → **非线程安全**，应用 `DateTimeFormatter`
- `HashMap` 多线程读写 → 死循环 / 数据丢失 → 用 `ConcurrentHashMap`
- 双重检查锁缺 `volatile`

```java
// BAD
private static Singleton instance;
public static Singleton getInstance() {
    if (instance == null) {
        synchronized (Singleton.class) {
            if (instance == null) { instance = new Singleton(); }
        }
    }
    return instance;
}
// instance 必须 volatile，否则其他线程可能看到半构造对象

// GOOD — 静态内部类持有
private static class Holder { static final Singleton INSTANCE = new Singleton(); }
public static Singleton getInstance() { return Holder.INSTANCE; }
```

- `synchronized(this)` 锁错对象（共享状态在 static 字段时锁了实例无效）
- `ConcurrentHashMap` 上链式 check-then-act `if (!map.contains(k)) map.put(k, v)` 仍非原子 → 用 `putIfAbsent` / `computeIfAbsent`
- `parallelStream()` 在 fork-join common pool 跑，不要在响应链路上依赖（共用池 → 阻塞传染）
- `ThreadLocal` 在线程池中不 `remove()` → 线程复用时携带旧上下文 → 数据串户

---

## 维度 4 · performance

```java
// BAD — N+1
for (Order o : orders) {
    User u = userRepo.findById(o.getUserId()).orElse(null);  // 每次查
}

// GOOD
Set<Long> userIds = orders.stream().map(Order::getUserId).collect(toSet());
Map<Long, User> userMap = userRepo.findByIdIn(userIds).stream()
    .collect(toMap(User::getId, identity()));
```

```java
// BAD — 每请求 new ObjectMapper / Pattern
public String handle(String req) {
    ObjectMapper m = new ObjectMapper();   // 重对象
    Pattern p = Pattern.compile("...");    // 编译开销
    ...
}

// GOOD
private static final ObjectMapper OM = new ObjectMapper();
private static final Pattern P = Pattern.compile("...");
```

- `String.format` 在热路径（比 `+` 慢得多）
- 循环内 `+=` 拼字符串 → `StringBuilder`
- `BigDecimal` 直接 `new BigDecimal(double)` 失精 → 用 `BigDecimal.valueOf(double)` 或字符串构造

---

## 维度 5 · memory

- static 字段持有的 `List` / `Map` 不 evict → 必爆
- 自建缓存（`HashMap<K, V>` 无淘汰）→ 用 Caffeine / Guava `CacheBuilder`
- `Files.readAllBytes` / `Files.readString` 大文件 → OOM
- ThreadLocal 持大对象 + 线程池不 remove
- `String.intern()` 滥用导致 PermGen / Metaspace 暴涨（旧 JVM）

---

## 维度 6 · error_handling

```java
// BAD — 吞异常
try { ... } catch (Exception e) { /* ignored */ }
try { ... } catch (Exception e) { logger.error(e.getMessage()); }   // 栈丢
try { ... } catch (Exception e) { throw new ServiceException("xx"); }  // cause 丢

// GOOD
try { ... } catch (Exception e) {
    logger.error("Failed to process refund orderId={}", orderId, e);
    throw new ServiceException("refund failed", e);
}
```

- `catch (Throwable t)` 一般是反模式（吃 OutOfMemoryError）
- `Future.get()` 不带 timeout → 永等
- `CompletableFuture` 的 `exceptionally` / `handle` 漏写 → 异常沉默
- `try { ... } catch (InterruptedException e) { /* swallow */ }` → 必须 `Thread.currentThread().interrupt()`

---

## 维度 7 · external_call

```java
// BAD — RestTemplate 默认无超时
RestTemplate rt = new RestTemplate();

// GOOD
HttpComponentsClientHttpRequestFactory f = new HttpComponentsClientHttpRequestFactory();
f.setConnectTimeout(2_000);
f.setReadTimeout(5_000);
RestTemplate rt = new RestTemplate(f);
```

- `OkHttpClient` 默认无 callTimeout（仅 connect/read/write）
- `HikariCP` 默认 connectionTimeout 30s 在某些场景过长
- DB `@Transactional` 内调外部 HTTP → 长事务，连接池耗尽
- `CompletableFuture.supplyAsync(() -> ...)` 默认走 `ForkJoinPool.commonPool()`，不应放阻塞 IO

---

## 维度 8 · boundary

- `Integer` 加法溢出（`int` overflows silently）→ `Math.addExact` 或 `long`
- `Math.abs(Integer.MIN_VALUE)` 仍负
- `Long` / `Integer` 自动装箱到 `==` 比较 → 用 `.equals` 或 `Long.compare`
- `String.substring(i, j)` 越界抛 `StringIndexOutOfBoundsException`
- `Integer.parseInt(null)` 抛 NPE 而非 NumberFormatException
- 集合 `subList` 非快照（视图 + 原集合修改 = ConcurrentModificationException）

---

## 维度 9 · observability

- `System.out.println` / `e.printStackTrace()` → 应用项目 logger（参见 `business-logging` skill）
- ERROR 日志不传 exception 对象 → 只有 message 没栈
- 循环内 `log.info(...)` per-iteration 在高 QPS 路径
- `@Slf4j` lombok 注解需要项目已用 Lombok（否则编译失败）
- MDC `clear()` 漏写 → 跨请求污染

---

## 维度 10 · config_env

- `@Value("${x}")` 没默认值且 prop 缺失 → 启动 fail-fast（OK）；但单测可能依赖于此
- `Integer.getInteger("foo")` 不是读 env，是读 system property
- `System.getenv` / `System.getProperty` 后未判空
- 硬编码端口 / IP / 路径在业务代码（应注入 `@ConfigurationProperties`）

---

## 维度 11 · data_consistency

- `@Transactional` 默认只对 RuntimeException 回滚 → checked exception 不回滚（需 `rollbackFor`）
- `@Transactional` 自调用（同类内）→ AOP 失效
- `@Transactional` propagation `REQUIRES_NEW` 嵌套时连接池占用 ×2
- JPA `EntityManager.flush()` 时机决定是否在事务内可见
- 乐观锁：`@Version` 字段必须自增，否则不生效
- DB isolation 默认 `READ_COMMITTED`（PostgreSQL/Oracle）或 `REPEATABLE_READ`（MySQL InnoDB）

---

## 维度 12 · time_encoding

```java
// BAD
String s = "Hello".getBytes();  // 默认 charset 不确定
SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd");  // 非线程安全 + 用本地时区

// GOOD
byte[] b = "Hello".getBytes(StandardCharsets.UTF_8);
DateTimeFormatter f = DateTimeFormatter.ISO_LOCAL_DATE;   // 线程安全
```

- `LocalDateTime` 不带时区，跨时区存储务必用 `Instant` / `OffsetDateTime` / `ZonedDateTime`
- `Calendar.MONTH` 是 0-based（1 月 = 0）
- `String.toLowerCase()` 不传 Locale → 土耳其 i 问题
- `Locale.getDefault()` 跟随容器 locale → 显式传

---

## 维度 13 · api_compat

- `@RestController` / `@RequestMapping` 字段重命名要给旧名 alias
- DTO 加 `@JsonIgnoreProperties(ignoreUnknown = true)` → 旧字段被默默忽略（双刃）
- enum 序列化为 name → 重命名破坏；序列化为 ordinal → 重排破坏
- `@Deprecated(since = "...", forRemoval = true)` 是契约信号，应配双向兼容期

---

## 工具与生态信号

- `pom.xml` / `build.gradle` 含 `spring-cloud-starter-resilience4j` / `Hystrix` → 项目已有熔断设施，缺超时是 bug
- 含 `lombok` → 注意 `@Data` 暴露字段是否带 `@JsonIgnore`
- 含 `mapstruct` → 字段映射变更可能编译期暴露
- 项目用 `JUnit 5` + `Testcontainers` → 集成测试容易，鼓励补 IT
