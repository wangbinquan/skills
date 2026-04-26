# PlantUML Guide

Reference for producing PlantUML diagrams that render cleanly via the official `plantuml` jar or the `plantuml.com` server.

## Table of contents
- [Required header for Chinese text](#required-header-for-chinese-text)
- [Picking a diagram type](#picking-a-diagram-type)
- [Sequence diagram](#sequence-diagram)
- [Class diagram](#class-diagram)
- [Activity / flowchart](#activity--flowchart)
- [State diagram](#state-diagram)
- [Component diagram](#component-diagram)
- [Deployment diagram](#deployment-diagram)
- [Use-case diagram](#use-case-diagram)
- [ER diagram (Information Engineering)](#er-diagram-information-engineering)
- [C4 model (via stdlib)](#c4-model-via-stdlib)
- [Notes — the mandatory piece](#notes--the-mandatory-piece)
- [Background colors](#background-colors)
- [Skinparam cheatsheet](#skinparam-cheatsheet)
- [Common pitfalls](#common-pitfalls)

## Required header for Chinese text

Every PlantUML diagram this skill produces should start with the CJK-friendly header so Chinese notes render correctly in the jar/server:

```plantuml
@startuml
' CJK font + rendering defaults
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 13
skinparam dpi 120
skinparam backgroundColor #FFFFFF
skinparam shadowing false
skinparam roundCorner 8
skinparam ArrowThickness 1.2
skinparam NoteBackgroundColor #FFF8E1
skinparam NoteBorderColor #FBC02D
' fall back through common CJK fonts — the first one available wins
' ("Microsoft YaHei" on Windows, "PingFang SC" / "Hiragino Sans GB" on macOS,
' "Noto Sans CJK SC" / "WenQuanYi Micro Hei" on Linux)
```

If the render environment is Linux and `Microsoft YaHei` is unavailable, switch `defaultFontName` to `"Noto Sans CJK SC"` or install a CJK font. The PlantUML server at `plantuml.com` has CJK fonts installed.

## Picking a diagram type

| Subject | Use |
|---|---|
| Runtime message passing, async flows | sequence |
| Static type structure, inheritance | class |
| Procedural flow, decision tree | activity (new syntax `start`/`stop`) |
| Lifecycle | state |
| Logical components + interfaces | component |
| Physical topology (nodes, artifacts) | deployment |
| Actors vs system functions | use-case |
| Data model | ER (IE notation) via `entity` |
| Architecture @ system / container / component level | C4 (stdlib) |

## Sequence diagram

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
title 订单创建时序图

actor 用户 as U
participant "API Gateway" as GW
participant "OrderService" as OS
database "OrderDB" as DB
queue "Kafka" as MQ

U -> GW : POST /orders
activate GW
GW -> OS : createOrder(payload)
activate OS
OS -> DB : INSERT
DB --> OS : order_id
OS -> MQ : publish order.created
OS --> GW : 201 {order_id}
deactivate OS
GW --> U : 201 {order_id}
deactivate GW

note over OS, DB
    该写入须在同一事务中完成；
    幂等键：request_id + customer_id。
    超时策略：200ms，读路径不重试。
end note

note right of MQ
    事件消费方：
    - inventory-svc
    - notification-svc
    - analytics-etl
end note
@enduml
```

Arrow flavors: `->` sync, `-->` response, `->>` async, `-\` lost, `/-` found, `-[#red]->` colored.

Groupings: `group`, `alt/else/end`, `opt/end`, `loop/end`, `par/else/end`, `break/end`, `critical/end`.

## Class diagram

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
title 订单领域模型

package "订单上下文" as ORDER {
    class Order {
        +id: UUID
        +status: OrderStatus
        +place()
        +cancel()
    }
    class OrderItem {
        +id: UUID
        +qty: int
        +price: Money
    }
    enum OrderStatus {
        PENDING
        PAID
        SHIPPED
        CANCELLED
    }
}

package "客户上下文" as CUSTOMER {
    class Customer {
        +id: UUID
        +email: String
    }
}

Customer "1" --> "*" Order : places
Order "1" *-- "1..*" OrderItem : contains
Order --> OrderStatus

note right of Order
    **不变量**：
    一旦进入 PAID，金额与商品项不可变更；
    取消需走独立的 refund() 流程。
end note
@enduml
```

Relation notation: `<|--` inheritance, `<|..` realization, `*--` composition, `o--` aggregation, `-->` association, `..>` dependency, `--` link.

## Activity / flowchart

Use the **new** activity syntax (`start` / `stop` / `if (...) then (yes)` / `endif`). The legacy `(*)` syntax is deprecated — do not produce it.

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
title 下单处理流程

start
:接收下单请求;
if (参数校验通过?) then (yes)
    :锁定库存;
    if (库存充足?) then (yes)
        :创建订单;
        :调用支付;
        if (支付成功?) then (yes)
            #D4EDDA:发送订单创建事件;
            stop
        else (no)
            #F8D7DA:释放库存;
            stop
        endif
    else (no)
        #F8D7DA:返回库存不足;
        stop
    endif
else (no)
    #F8D7DA:返回参数错误;
    stop
endif

note right
    关键不变量：
    - 库存锁定与订单创建在同一事务；
    - 支付失败必须释放库存（补偿事务）。
end note
@enduml
```

Swimlanes via `|Lane|`:
```
|用户|
:下单;
|#E3F2FD|订单服务|
:校验;
|#FFF3E0|支付服务|
:扣款;
```

## State diagram

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
title 订单状态机

[*] --> Pending
Pending --> Paid : pay()
Pending --> Cancelled : cancel()
Paid --> Shipped : ship()
Shipped --> Delivered : deliver()
Delivered --> [*]
Cancelled --> [*]

state Paid #FFF3CD {
    [*] --> Authorized
    Authorized --> Captured : capture
}

note right of Paid : 进入该状态后金额锁定\n退款须走独立流程
@enduml
```

## Component diagram

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
title 订单平台组件图

package "Edge" {
    [CDN]
    [WAF]
}
package "Application" {
    [API Gateway] as GW
    [OrderService] as OS
    [PaymentService] as PS
}
package "Data" {
    database "OrderDB" as ODB
    database "PaymentDB" as PDB
    queue "Kafka" as MQ
}

[CDN] --> [WAF]
[WAF] --> GW
GW --> OS : REST
GW --> PS : REST
OS --> ODB
PS --> PDB
OS --> MQ : order.created
PS --> MQ : payment.captured

note bottom of MQ : 所有领域事件都通过此 Kafka 集群分发\n保留 7 天，供重放。
@enduml
```

## Deployment diagram

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
title 生产环境部署拓扑

node "AWS us-east-1" {
    node "EKS Cluster" as EKS {
        node "order-svc Pod (x3)" as POD
    }
    database "RDS MySQL\n(Multi-AZ)" as RDS
    queue "MSK (Kafka)" as MSK
}

node "CloudFront" as CF
actor 用户

用户 --> CF
CF --> EKS
POD --> RDS
POD --> MSK

note right of RDS : Multi-AZ 主备，RPO≈0，RTO<60s
note bottom of POD : HPA: 3..20 副本\nCPU 阈值 70%
@enduml
```

## Use-case diagram

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
left to right direction
actor 顾客 as C
actor 管理员 as A

rectangle "订单系统" {
    usecase (浏览商品) as UC1
    usecase (下单) as UC2
    usecase (支付) as UC3
    usecase (发货) as UC4
    usecase (退款) as UC5
}

C --> UC1
C --> UC2
C --> UC3
A --> UC4
A --> UC5

UC2 ..> UC3 : <<include>>
UC2 .up.> UC5 : <<extend>>

note right of UC3 : 支持信用卡 / 第三方钱包\n默认 3 秒超时，失败回滚订单。
@enduml
```

## ER diagram (Information Engineering)

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"
title 订单数据模型

entity Customer {
    * id : UUID <<PK>>
    --
    * email : String <<UK>>
    name : String
}

entity "Order" as O {
    * id : UUID <<PK>>
    --
    * customer_id : UUID <<FK>>
    * status : String
    created_at : Timestamp
}

entity OrderItem {
    * id : UUID <<PK>>
    --
    * order_id : UUID <<FK>>
    * product_id : UUID <<FK>>
    qty : int
    price : Money
}

Customer ||--o{ O
O ||--|{ OrderItem

note right of O
    order.status ∈ {PENDING, PAID, SHIPPED, DELIVERED, CANCELLED}
    一旦进入 SHIPPED，不可 cancel，只能 refund。
end note
@enduml
```

## C4 model (via stdlib)

```plantuml
@startuml
!include <C4/C4_Container>
skinparam defaultFontName "Microsoft YaHei"
title 容器图 — 订单平台

Person(customer, "顾客", "使用 App 下单")
System_Boundary(s1, "订单平台") {
    Container(web, "Web App", "React", "顾客前端")
    Container(api, "API", "Spring Boot", "订单相关 REST API")
    ContainerDb(db, "OrderDB", "MySQL", "订单持久化")
    Container(worker, "Event Worker", "Go", "消费领域事件")
}
System_Ext(pay, "支付网关", "第三方")

Rel(customer, web, "使用", "HTTPS")
Rel(web, api, "调用", "HTTPS/JSON")
Rel(api, db, "读写", "JDBC")
Rel(api, pay, "发起支付", "HTTPS")
Rel(api, worker, "发送事件", "Kafka")

note right of api
    峰值 QPS 约 1.2k，P99 目标 < 150ms。
    幂等键：request_id。
end note
@enduml
```

## Notes — the mandatory piece

**Every PlantUML diagram this skill produces must carry at least one `note`**. Chinese notes are explicitly supported. Use whichever form fits:

| Form | When |
|---|---|
| `note left of X` / `note right of X` / `note top of X` / `note bottom of X` | Anchored to a specific element |
| `note over A, B` (sequence only) | Spans multiple participants |
| `note as N1` ... `X .. N1` | Floating note connected by a dashed line |
| Multi-line `note ... end note` | Longer context, markdown-lite supported |

Multi-line example:
```
note right of OrderService
    **设计决策**：
    - 选用 outbox pattern 保证事件与订单在同一事务；
    - 不使用 2PC，避免跨服务锁。
    **已知风险**：
    - outbox 积压时事件延迟可能达秒级。
end note
```

Inline styling inside notes: `**bold**`, `//italic//`, lists with `-` or `*`, line breaks with real newlines.

Coloring notes: `note right of X #LightYellow` or via `skinparam NoteBackgroundColor`.

Guideline: one **top-of-diagram summary note** describing scope/intent is a good default when no other note is obviously needed. It keeps the non-negotiable satisfied and actually helps the reader.

## Background colors

Three layers of color control:

**1. Per-element inline color** — the simplest and most common for highlighting:
```
class OrderService #D4EDDA
participant "NewService" as NS #D4EDDA
node "NewNode" #D4EDDA
rectangle "Added Region" #D4EDDA
state Paid #FFF3CD
```

For activity nodes:
```
#D4EDDA:新增步骤;
#F8D7DA:待移除步骤;
#FFF3CD:修改后的步骤;
```

**2. Per-element `<<stereotype>>` + skinparam** — when a semantic group is used many times:
```
skinparam class {
    BackgroundColor<<Added>>    #D4EDDA
    BorderColor<<Added>>        #28A745
    BackgroundColor<<Removed>>  #F8D7DA
    BorderColor<<Removed>>      #DC3545
    BackgroundColor<<Modified>> #FFF3CD
    BorderColor<<Modified>>     #FFC107
}

class PaymentService <<Added>>
class LegacyFraud  <<Removed>>
class RiskService  <<Modified>>
```

**3. Container/package tint** for entire regions:
```
package "新增边界上下文" <<Added>> #D4EDDA {
    class NewEntity
}
```

Legend pattern — always include one when color carries meaning:
```
legend right
    | 颜色 | 含义 |
    | <#D4EDDA> | Added / 新增 |
    | <#F8D7DA> | Removed / 移除 |
    | <#FFF3CD> | Modified / 修改 |
    | <#F5F5F5> | Unchanged / 未变 |
endlegend
```

## Skinparam cheatsheet

```
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 13
skinparam dpi 120
skinparam backgroundColor #FFFFFF
skinparam shadowing false
skinparam roundCorner 8
skinparam ArrowColor #424242
skinparam ArrowThickness 1.2
skinparam NoteBackgroundColor #FFF8E1
skinparam NoteBorderColor #FBC02D
skinparam sequence {
    ArrowColor #424242
    ActorBorderColor #424242
    LifeLineBorderColor #888888
    ParticipantBorderColor #424242
    ParticipantBackgroundColor #FAFAFA
}
```

## Common pitfalls

- **Missing `@startuml` / `@enduml`** — the most common rendering failure.
- **Using deprecated activity syntax** `(*) --> "foo"` — use new syntax (`start` / `:...;` / `stop`).
- **Chinese box garbled as `???`** — `skinparam defaultFontName` not set, or font missing on the rendering host. On `plantuml.com`, CJK fonts are installed; on a local jar, install a CJK font and reference it.
- **Quoted vs unquoted identifiers** — names with spaces or Chinese need quotes: `participant "订单服务" as OS`.
- **Arrow direction in class diagrams** — `<|--` vs `--|>` is the opposite of what many people expect. Parent is always on the `<|` side.
- **`as` aliases with Chinese** — quote the label, use a Latin alias: `participant "订单服务" as OS`. Then use `OS` in arrows.
- **Implicit element creation** — sequence/use-case diagrams will silently create a participant on first use. Declare participants up front to control layout.
- **Note on arrow** — to attach a note *to an arrow*, use the inline form `A -> B : call\nnote right: 说明`, or use a floating note with a dashed link.
- **Dueling skinparam** — if you declare skinparam per-subsystem (e.g., `skinparam class` block), later global settings may override them. Put global skinparam at the top.
- **Theme collisions** — `!theme` can override your skinparam. If you use a theme, layer skinparam *after* the `!theme` line.
