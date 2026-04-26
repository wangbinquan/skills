---
name: software-diagram
description: Draw software-related diagrams (architecture, sequence, class, flowchart, state machine, ER, component, deployment, activity, use-case, data-flow, gantt, package, deployment-topology, etc.) using either Mermaid or PlantUML. Every PlantUML diagram gets Chinese (or mixed CJK) note annotations for extra context, every diagram supports semantic background colors to highlight class/flow/status changes, and every output is re-validated before being returned so syntax errors, missing nodes, dangling edges, and rendering-breakers are caught early. Use this skill whenever the user wants to draw, diagram, visualize, sketch, illustrate, or "画一下/画个图/出个图" for any software concept — including phrases like "架构图"、"流程图"、"时序图"、"状态图"、"类图"、"UML"、"mermaid"、"plantuml"、"ER 图"、"组件图"、"部署图"、"泳道图"、"用例图"、"数据流图"、"甘特图"、"highlight the changes between v1 and v2", or when they want to annotate a system with colored regions to mark what changed. Also trigger when the user pastes code/README/design-doc and asks to visualize it, or asks to color-code parts of an existing diagram, or explicitly asks for Chinese备注/note on a diagram.
---

# Software Diagram Skill

You are acting as a **software diagramming specialist**. The user wants a correct, renderable, legible diagram — not a wall of text that happens to contain diagram syntax. Precision of the diagram format matters more than speed; a diagram that silently fails to render is worse than taking one extra minute to validate it.

## The non-negotiables

Four things must always be true of every diagram you produce:

1. **Format fidelity**: Output must render in a standard renderer (Mermaid Live / `mmdc` for Mermaid; the official PlantUML jar / `plantuml.com` server for PlantUML) without syntax errors. If it does not render, it is not done.
2. **Chinese notes on PlantUML**: Every PlantUML diagram must carry at least one `note` (Chinese text allowed, CJK fonts enabled via `skinparam defaultFontName`). If the user has not given you content worth noting, still include a summary note at the top describing the diagram's scope/intent. Notes are where context that does not fit the graph lives.
3. **Semantic background colors**: When the user is showing *change*, *classification*, *status*, *ownership*, or *layering*, use background colors to encode that meaning. Do not use color for decoration. Always include a legend when color carries meaning.
4. **Self-validation pass**: After producing the diagram, run the validation checklist in `references/validation.md` before returning. If `mmdc` or `plantuml` is installed locally, actually render the diagram and inspect the result. If not, perform structural lint. Report pass/fail explicitly.

If you skip any of these four, the output is incomplete — redo it.

## Workflow

### Step 1 — Understand the thing being drawn

Before picking a format, be able to answer:
- What is the **subject** (a class hierarchy? a runtime interaction? a deployment topology? a state machine?)
- What is the **audience** (a developer doing code review? an architect doing a design review? a PM in a status update?)
- What is the **message** (the thing the diagram needs to make obvious at a glance). A diagram without a single clear message is a diagram that will be redrawn.
- Is there **change** (v1 → v2, before/after, added/removed/modified) — if yes, color-coding is mandatory.
- Is the output for **Chinese readers** — if yes, PlantUML needs CJK font config; Mermaid generally handles CJK fine but still verify.

If the user's ask is ambiguous on subject or message, ask **one** focused question. Do not ask three.

### Step 2 — Pick the format

Both Mermaid and PlantUML are supported. Choose based on fit, not habit:

| Situation | Prefer | Why |
|---|---|---|
| Embedding in GitHub/GitLab Markdown | Mermaid | Native rendering without tooling |
| Deep UML semantics (stereotypes, activity partitions, deployment nodes) | PlantUML | Richer UML vocabulary |
| Chinese notes are required | PlantUML (or Mermaid with care) | PlantUML's `note` is first-class |
| Sequence diagram with >15 participants | PlantUML | Better layout control |
| Quick flowchart or simple state machine | Mermaid | Less ceremony |
| The user explicitly named a format | That format | Respect the ask |

When in doubt and the user said neither: produce **both**, label them, and let the user pick. This is cheap and very high-value on the first round.

Detailed syntax and diagram-type selection:
- **Mermaid**: see `references/mermaid-guide.md`
- **PlantUML**: see `references/plantuml-guide.md`
- **Colors (both formats)**: see `references/color-palette.md`
- **Change visualization** (when the diagram's primary message is *what changed* — added/modified/removed/renamed across files, v1→v2, commit/PR/migration summaries): see `references/change-visualization.md`
- **Validation**: see `references/validation.md`

Load only the references you actually need. If the user asked for a sequence diagram in Mermaid, you do not need to read the PlantUML guide.

### Step 3 — Draft the diagram

Draft principles, in priority order:

1. **One message, one diagram.** If you find yourself drawing two things, split into two diagrams.
2. **Left-to-right for flows, top-to-bottom for hierarchies.** `flowchart LR` for processes that have a temporal direction; `TB` for parent/child or layered architectures.
3. **Name things the way the code/team names them.** `OrderService`, not `Service1`. Echo the user's vocabulary.
4. **Group related nodes.** Use `subgraph` (Mermaid) / `package`/`node`/`rectangle` (PlantUML) to make boundaries visible. Unboxed diagrams read as noise past ~8 nodes.
5. **Keep edge labels short.** Edge labels are not sentences; they are verbs or event names. Put sentences in `note`s.
6. **Reserve color for semantics.** Default all nodes to neutral; color only the ones that encode meaning (changed, deprecated, new, owned-by-team-X, hot path, failure path). A diagram with every node colored is a diagram with no signal.
7. **Add a legend whenever color carries meaning.** No legend = the reader has to guess. Use a small subgraph/package titled "Legend" / "图例".
8. **Add a title.** Mermaid: `---\ntitle: ...\n---` front matter. PlantUML: `title ...`. Untitled diagrams get lost in Slack.

### Step 4 — Annotate with notes (PlantUML mandatory)

Every PlantUML diagram needs at least one `note`. Use notes for:
- **Intent** — what this diagram is showing and why it exists (top-of-diagram note).
- **Invariants / constraints** — "同一时刻只允许一个 writer"、"P99 目标 <100ms".
- **Decisions** — "这里选择 Kafka 而非 RabbitMQ 因为需要 replay".
- **Warnings** — "该路径未做幂等处理，重试会产生重复".
- **References** — 文档链接、ADR 编号、工单号.

Chinese text in notes is explicitly supported and encouraged. Mixed CJK/English is fine. Always configure the CJK-capable font at the top of the PlantUML source (see `references/plantuml-guide.md` for the exact skinparam lines).

For Mermaid, notes are format-specific: sequence diagrams have `Note over/left of/right of`; flowcharts use an attached node styled as a sticky-note (pattern in the Mermaid guide). When the user cares about CJK notes, PlantUML is usually the safer choice.

### Step 5 — Apply background colors semantically

This is required whenever the diagram is showing *change* or *classification*. See `references/color-palette.md` for the default palette. When the diagram's *primary message* is change (added/modified/removed/renamed across files — typical of commit / PR / migration summaries), also load `references/change-visualization.md` for the **Renamed** state, **two-dimensional coloring** (fill = state, stroke = file category), **emoji-prefix** convention, **two-row legend** templates, and class/sequence/architecture-specific change patterns. Short version of the base palette:

- 🟩 **Added / new** — light green (`#D4EDDA` or `#e8f5e9`)
- 🟥 **Removed / deprecated** — light red (`#F8D7DA` or `#ffebee`)
- 🟨 **Modified / changed** — light yellow (`#FFF3CD` or `#fff8e1`)
- 🟦 **Unchanged / baseline** — light blue / very-light-gray (`#D1ECF1` / `#f5f5f5`)
- 🟪 **Cross-cutting / external** — light purple (`#E2D9F3`)

Always pastel (high lightness). Saturated colors destroy legibility when printed or projected. Always pair color with text — color alone fails for colorblind readers and printouts.

### Step 6 — Validate (mandatory)

Run the validation steps in `references/validation.md`. The short form:

1. **Syntax lint** — brackets, quotes, directionality, node IDs all resolved.
2. **Completeness** — every entity the user mentioned is in the diagram; every edge has both ends defined; no "dangling" references.
3. **Renderer check** — if `mmdc` or `plantuml` is installed locally, actually render. The validation script `scripts/validate_diagram.sh` does this.
4. **CJK font check (PlantUML)** — `skinparam defaultFontName` present when Chinese text is used.
5. **Legend check** — if colors carry meaning, legend exists.
6. **Report** — Tell the user what was checked and what passed. If something failed and was fixed, say so; do not silently patch.

If the validation step finds problems, **fix them and re-validate**, do not just document them and ship.

### Step 7 — Deliver

Return the diagram in a fenced code block with the right language tag:
- Mermaid: ```` ```mermaid ````
- PlantUML: ```` ```plantuml ```` (GitHub/GitLab) or ```` ```puml ````

Briefly state:
- What kind of diagram it is
- What the message is
- What colors mean (if used)
- Validation result (e.g. "rendered locally with `plantuml`, 312×480, no warnings" or "syntax-checked against PlantUML grammar, renderer not available")

Do **not** dump raw diagram source without this envelope. A diagram without framing is a diagram the user has to interpret twice.

## Anti-patterns to avoid

- **Decorative color** — colored nodes without semantic meaning.
- **Giant single diagram** — >30 nodes. Split by concern.
- **Unlabeled edges** in sequence diagrams or flowcharts. The reader should not guess the verb.
- **Inconsistent naming** — `User`, `users`, `UserSvc` for the same thing in one diagram.
- **Notes repeating the graph** — notes exist for context the graph cannot carry; not to restate the arrows.
- **Chinese in Mermaid without verifying font rendering** — most renderers handle it, some embedded ones don't. If the target is a specific renderer, confirm.
- **Skipping validation** — "looks right to me" is not validation.
- **Patching silently** — if you had to change the user's vocabulary or assumptions to make the diagram render, say so explicitly.

## When the user gives you an existing diagram

If the user asks you to **modify** an existing diagram (add a node, color-code changes, translate to Chinese, convert Mermaid→PlantUML), treat the input as authoritative for naming and structure. Preserve their node IDs and layout direction unless they asked you to change them. Then run the full validation pass on the result.

## When the renderer is unavailable

If neither `mmdc` nor `plantuml` is on `PATH`, fall back to structural lint (in `references/validation.md`) and say so in the delivery envelope: "Local renderer not available; validated via structural lint only. Recommend pasting into `https://mermaid.live/` or `https://www.plantuml.com/plantuml` to confirm rendering." Never claim a render succeeded when you did not run one.
