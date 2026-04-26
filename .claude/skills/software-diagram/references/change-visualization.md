# Change Visualization — diagrams whose job is to show "what changed"

This reference applies when the diagram's **primary message** is *what changed* between two snapshots — typically v1→v2, before/after, baseline→branch, or "what this commit/PR/migration modifies". When that is the message, the rules below extend (and in a few places override) the generic palette in `color-palette.md`.

## When to read this file

You are producing a diagram and the user said one of:
- "show what changed between …"
- "highlight added / removed / modified …"
- "visualize this commit / PR / branch / migration"
- "把变更画一下" / "这次提交有哪些改动" / "v1 vs v2" / "提交变更总结"

If the diagram's job is *not* to show change (e.g., a regular architecture diagram), use the standard `color-palette.md` and skip this file.

## The five-state palette (extends `color-palette.md`)

Strictly five buckets — beyond five, the reader stops reading colors as signals.

| State    | Fill      | Stroke    | Stroke style          | Text marker (CN/EN) | Use it for |
|----------|-----------|-----------|-----------------------|---------------------|------------|
| Added    | `#D4EDDA` | `#28A745` | solid                 | `[新增]` / `[NEW]`  | newly created files / classes / methods / fields / config keys / endpoints |
| Modified | `#FFF3CD` | `#FFC107` | solid                 | `[修改]` / `[Δ]`    | existing entity whose contents changed |
| Removed  | `#F8D7DA` | `#DC3545` | **dashed** (`5 5`)    | `[删除]` / `[DEL]`  | files / methods / fields removed |
| Renamed  | `#D1ECF1` | `#17A2B8` | solid                 | `[改名]` / `→ NewName` | rename without behavior change (annotate if behavior also changed) |
| Baseline | `#F5F5F5` | `#868E96` | solid                 | (none)              | unchanged context — present so the reader sees the surroundings |

Notes:
- Always pair color **with** a text marker. Color alone fails for color-blind readers and grayscale prints.
- "Renamed" is optional. If a rename also changed behavior, prefer **Modified** + a note "(原名 XxxOld)".
- "Moved" (file path changed, contents identical) is rendered as **Baseline** + a note `→ <new path>`. It is not a sixth color — moves rarely deserve their own slot.

## Two-dimensional coloring (state × category)

When the diagram shows changes across **multiple file categories** (code / config / docs / schema / scripts) — the typical case for commit overview diagrams — and you need to convey *both* "what changed" and "which kind of file", encode the two dimensions on **different visual channels**:

- **Fill = change state** (Added / Modified / Removed / Renamed / Baseline — the five-state palette above).
- **Stroke = file category**:

| Category | Stroke color | Notes |
|---|---|---|
| code     | `#1976D2` (blue)   | source files |
| config   | `#F57C00` (orange) | yaml/toml/json/Dockerfile/build files |
| docs     | `#7B1FA2` (purple) | md/rst/adoc, design docs |
| schema   | `#388E3C` (green)  | sql/proto/graphql/migrations |
| script   | `#455A64` (slate)  | shell, CI workflows, hooks |
| assets   | `#C2185B` (pink)   | images, fonts, fixtures |
| test     | `#00897B` (teal)   | unit/integration/e2e tests |

Rationale: two fills on one node always fight; one fill + one stroke does not.

When using two-dimensional coloring, the legend MUST have **two row-groups** so readers know what each channel means (template at the bottom of this file).

### Mermaid pattern

```mermaid
flowchart LR
    %% --- state classes (fill) ---
    classDef sAdded    fill:#D4EDDA,color:#155724
    classDef sModified fill:#FFF3CD,color:#856404
    classDef sRemoved  fill:#F8D7DA,color:#721C24,stroke-dasharray: 5 5
    classDef sRenamed  fill:#D1ECF1,color:#0C5460
    classDef sBaseline fill:#F5F5F5,color:#495057

    %% --- category classes (stroke) ---
    classDef cCode   stroke:#1976D2,stroke-width:2px
    classDef cConfig stroke:#F57C00,stroke-width:2px
    classDef cDocs   stroke:#7B1FA2,stroke-width:2px
    classDef cSchema stroke:#388E3C,stroke-width:2px

    OS["OrderService.java [Δ]"]
    PC["PaymentClient.java [新增]"]
    YML["application.yaml [Δ]"]
    DOC["order-refund.md [新增]"]
    SQL["V42__add_refund.sql [新增]"]

    class OS  sModified,cCode
    class PC  sAdded,cCode
    class YML sModified,cConfig
    class DOC sAdded,cDocs
    class SQL sAdded,cSchema
```

(Mermaid's `class A x,y` syntax stacks multiple classDefs on one node. This is the cleanest way to express "fill + stroke on different channels".)

### PlantUML pattern

```plantuml
@startuml
skinparam defaultFontName "Microsoft YaHei"

skinparam class {
    BackgroundColor<<Added>>    #D4EDDA
    BackgroundColor<<Modified>> #FFF3CD
    BackgroundColor<<Removed>>  #F8D7DA
    BackgroundColor<<Renamed>>  #D1ECF1
    BackgroundColor<<Baseline>> #F5F5F5
}

' Stroke per category — inline form, since stereotype + per-edge color collides badly
class "OrderService.java"  as OS  <<Modified>> #line:#1976D2;line.bold
class "PaymentClient.java" as PC  <<Added>>    #line:#1976D2;line.bold
class "application.yaml"   as YML <<Modified>> #line:#F57C00;line.bold
class "order-refund.md"    as DOC <<Added>>    #line:#7B1FA2;line.bold
class "V42__add_refund.sql" as SQL <<Added>>   #line:#388E3C;line.bold

note top of OS : 进入退款流程的核心入口；新增 refund() 方法
@enduml
```

## Emoji-prefix convention (recommended for dense overviews)

For overview / mind-map diagrams where many leaves are colored, **prepend a status emoji** to each label. The emoji is a third visual channel — color survives projection, emoji survives grayscale photocopy.

```
🟩 PaymentClient.java        (Added)
🟨 OrderService.java         (Modified)
🟥 LegacyFraud.java          (Removed)
🟦 OrderItem.java            (Baseline)
🟦 RefundDTO.java   → refund/RefundDTO.java   (Renamed/Moved)
🟪 stripe-sdk                (External)
```

Use the emoji prefix **on overview / mind-map / checklist diagrams**. Skip it on detailed class/sequence diagrams where the symbols crowd the layout.

The same emoji palette must be used in any **change tables** that accompany the diagrams, so figure↔table cross-referencing is one glance.

## Two-row legend templates

Single-row legends are misleading when two channels carry meaning. Use:

### Mermaid

```
subgraph LegendState["图例 · 变更状态 (Fill)"]
    direction LR
    LS1["未变 / Baseline"]:::sBaseline
    LS2["新增 / Added"]:::sAdded
    LS3["修改 / Modified"]:::sModified
    LS4["删除 / Removed"]:::sRemoved
    LS5["改名 / Renamed"]:::sRenamed
end
subgraph LegendCat["图例 · 文件类别 (Stroke)"]
    direction LR
    LC1["代码 Code"]:::cCode
    LC2["配置 Config"]:::cConfig
    LC3["文档 Docs"]:::cDocs
    LC4["Schema"]:::cSchema
end
```

### PlantUML

```
legend right
    | **图例 · 变更状态 (Fill)** | |
    | <#D4EDDA> | 新增 / Added |
    | <#FFF3CD> | 修改 / Modified |
    | <#F8D7DA> | 删除 / Removed |
    | <#D1ECF1> | 改名 / Renamed |
    | <#F5F5F5> | 未变 / Baseline |
    | **图例 · 文件类别 (Stroke)** | |
    | <#1976D2> | 代码 Code |
    | <#F57C00> | 配置 Config |
    | <#7B1FA2> | 文档 Docs |
    | <#388E3C> | Schema |
endlegend
```

If only the fill channel carries meaning (no category dimension in this diagram), drop the second row-group — do not pad the legend with rows that don't appear in the diagram.

## Before / after layout patterns

Three patterns work for "v1 vs v2" diagrams. Pick by the structural distance between the two snapshots:

### A. Single overlay diagram (use this 80% of the time, ≤30 nodes)
One diagram contains both the unchanged baseline and the changed deltas, deltas color-coded. Best when topology is mostly preserved — readers see the relationship between changed and unchanged at a glance.

### B. Side-by-side (two diagrams labeled "变更前 / Before" and "变更后 / After")
Use when the topology itself is restructured (rebalancing, splits, merges). When possible, **lock identical layout direction and node positions** in both — otherwise readers waste energy re-orienting between panels.

### C. Three diagrams (Before / After / Diff)
Reserve for risky migrations where the diff itself is the deliverable (DB schema, public API contracts). Most commits do not need this.

## Diagram-type-specific change conventions

### Class diagrams
- **Class-level state** goes on the class itself (fill + `<<stereotype>>`).
- **Method-level state** goes inside the class body using a text marker:
  ```
  + refund(order, reason)        [新增]
  + cancel(order)                [Δ payload]
  + legacyRefund()               [删除]
  ```
- **Field-level state** same pattern, inside the field block.
- If **>50% of methods/fields** changed, color the whole class **Modified** and skip per-member markers — the noise drowns the signal.
- Renamed class: keep the **new** name as the class identifier, and add a top note: `note top of NewName : 原名 OldName`.

### Sequence diagrams
Sequence diagrams are tricky because *temporal order* matters as much as *participants*.
- **New interaction** — green stroked arrow with label suffix `[新增]`. PlantUML: `A -[#28A745]> B : payRefund() [新增]`.
- **Removed interaction** — keep it on the diagram (this is the message), use a **dashed red** arrow with label suffix `[已删除]`. PlantUML: `A -[#DC3545,dashed]-> B : oldFlow() [已删除]`.
- **Modified payload/response** — keep the original arrow color, add a `note` pointing at the arrow with the delta: `note over A,B : 响应字段新增 refund_id`.
- **Reordered steps** — number the *new* order with `autonumber`, and add a note explaining the reorder; do not draw arrows in two directions of time.

### Flowcharts / activity diagrams
- A new branch: green-filled node + `[新增]` suffix.
- A removed branch: keep it but dashed-red, suffix `[已删除]`.
- A modified condition: yellow-filled diamond, with the **before/after** of the predicate in an attached note.
- One flowchart, one flow. Do not jam two reworked flows into one diagram — split.

### State diagrams
- New transition → green arrow + `[新增]` label.
- Removed transition → dashed red arrow + `[已删除]` label.
- New state → green-filled state with `[新增]`.
- Renamed state → keep new name as the state, note: `note right of NewState : 原名 OldState`.

### Architecture / component diagrams
- **Use two-dimensional coloring**: fill = change state, stroke = layer (Frontend / Application / Data / Platform — see `color-palette.md` ownership palette).
- New service: green fill + layer stroke.
- Removed service: dashed-red fill + layer stroke + `[已删除]` label, kept on the diagram.
- Modified configuration of an existing service: yellow fill + a note enumerating the config keys that changed (do not list config in the node label).

## Anti-patterns (do not do)

- Coloring **every** node — defeats color as signal.
- Saturated red/green/yellow — destroys legibility under projection / printing.
- Mixing the **change** palette with an **ownership** palette in the same channel — they cancel out. Put one on fill, the other on stroke.
- "Removed" as a thin grey line that disappears on small renderers — always pair with the dashed pattern from the table.
- Forgetting the legend — without it, the reader has to guess.
- Padding the diagram with baseline nodes that aren't directly related to the deltas — baseline exists to anchor change, not to show off.
- Drawing **before/after** as two diagrams with different layouts — readers waste energy re-orienting; lock layouts.

## Validation extras for change diagrams

In addition to the standard `validation.md` checklist:

- [ ] Every colored node has both a color **and** a text marker (`[新增]` / `[Δ]` / `[删除]` / `[改名]`).
- [ ] Removed nodes use dashed stroke (or equivalent).
- [ ] Legend has separate row-groups for each channel used (fill alone → one group; fill + stroke → two groups).
- [ ] No "ghost" deltas — every Added/Modified/Removed corresponds to an actual change in the source diff/PR/migration. Cross-check against `git show` (or whatever the source-of-truth artifact is) before delivering.
- [ ] If a Renamed state is used, the **new** name is the canonical identifier and the **old** name appears in a note.
- [ ] Side-by-side / three-panel layouts use locked node positions where possible.
