# Validation — the reflection pass

Every diagram this skill produces is validated before being returned. The goal is to catch the failure modes that silently make a diagram useless:

- Syntax errors the renderer rejects outright
- Nodes referenced by edges but never declared
- Entities the user mentioned that did not make it into the diagram
- Missing CJK font config when Chinese text is present
- Missing legend when color is used semantically
- Missing PlantUML `note` (this skill's non-negotiable)

Validation is a **deliberate step**, not a glance. Run through the checklist every time.

## The reflection checklist

Run this list in order. Fix anything that fails, then re-run from the top. Do not ship a diagram where any item is "warn" or "fail" without a `scripts/validate_diagram.sh` report backing it up.

### 1. Syntax invariants (both formats)
- [ ] **Fences balanced**: every `subgraph`/`package`/`node`/`rectangle`/`group`/`alt`/`loop`/`opt` has a matching `end`/`}`.
- [ ] **Quotes balanced**: every `"` has a partner on the same line.
- [ ] **Brackets balanced**: `[`, `(`, `{`, `<<`, `((` have matching closers.
- [ ] **No forbidden identifiers**: Mermaid nodes are not named `end`/`class`/`style` (reserved); PlantUML elements with spaces or CJK are quoted and given Latin aliases.

### 2. Mermaid-specific
- [ ] Diagram type declaration is the first non-frontmatter line (`flowchart LR`, `sequenceDiagram`, `classDiagram`, etc.).
- [ ] If title frontmatter is used, it is the very first lines (`---\ntitle: …\n---`), before the diagram type.
- [ ] Node IDs contain no spaces; spaces only appear inside `[ ]`/`( )` label text.
- [ ] `<br/>` (self-closing) is used for line breaks, not bare `<br>`.
- [ ] All `classDef` classes referenced by `:::name` are defined somewhere in the diagram.
- [ ] Edge labels use `|label|` (flowchart) or `: label` (sequence) syntax, not mixed.
- [ ] Comments are on their own line, prefixed `%%`.

### 3. PlantUML-specific
- [ ] `@startuml` at the top, `@enduml` at the bottom — exactly one each.
- [ ] `skinparam defaultFontName` is set (required in this skill for CJK safety even when the current diagram has no CJK — future edits may add Chinese).
- [ ] Activity diagrams use the **new** syntax (`start` / `:...;` / `stop`), not the deprecated `(*)`.
- [ ] Every participant/actor/class/node with a CJK or space-containing name has a quoted label AND a Latin `as` alias; arrows reference the alias, not the label.
- [ ] **At least one `note` exists** (this skill's non-negotiable). A top-of-diagram summary note counts.
- [ ] `note ... end note` blocks have matching terminators.
- [ ] `legend ... endlegend` is present whenever color carries semantic meaning.

### 4. Completeness (against the user's ask)
- [ ] Every entity the user named appears in the diagram with the user's spelling.
- [ ] Every edge has both endpoints declared as nodes (no "ghost" references).
- [ ] Every arrow has a label if the diagram type uses labeled edges (sequence, flowchart with branching). Unlabeled arrows are fine only for class associations or pure "connected to" links.
- [ ] The message of the diagram is legible in <10 seconds. If you can't state it in one sentence, split or simplify.

### 5. Color & legend
- [ ] If any node has a non-default fill, color is encoding something semantic (not decorative).
- [ ] A legend is present whenever color carries meaning.
- [ ] The "Removed" / "Deprecated" color also uses a secondary signal (dashed stroke, text suffix).
- [ ] Number of distinct semantic colors is ≤ 5.

### 6. CJK readiness (PlantUML with Chinese text)
- [ ] `skinparam defaultFontName "Microsoft YaHei"` (or equivalent CJK font) is present.
- [ ] Notes containing Chinese are wrapped in `note ... end note` (multi-line) or single-line `note right of X : 中文`, with no stray colons/backslashes that break parsing.

### 7. Rendering
- [ ] Ran `scripts/validate_diagram.sh` and it reported success.
- [ ] **Or** if the local renderer is unavailable, stated so in the delivery envelope ("validated by structural lint; recommend pasting into mermaid.live / plantuml.com to confirm render").

## How to actually run the check

Use the bundled script:

```bash
bash scripts/validate_diagram.sh <path-to-diagram-file>
# or pipe:
cat my-diagram.puml | bash scripts/validate_diagram.sh -
```

What the script does:
1. Detects format by extension (`.mmd`, `.mermaid`, `.puml`, `.plantuml`, `.uml`) or by a shebang-like first line (`@startuml` ⇒ PlantUML; `flowchart`/`sequenceDiagram`/etc. ⇒ Mermaid).
2. Runs structural lint (bracket/fence/quote balance, forbidden identifiers, `@startuml`/`@enduml` presence, `skinparam` font for PlantUML, note presence for PlantUML).
3. If `plantuml` (jar wrapper) is on `PATH` and the file is PlantUML: renders to PNG in a temp dir, reports warnings/errors from stderr.
4. If `mmdc` is on `PATH` and the file is Mermaid: renders to SVG in a temp dir, reports warnings/errors.
5. Prints a concise PASS / WARN / FAIL report.

If the script returns non-zero, fix the diagram and re-run. Do not "explain away" failures.

## Self-report template

When returning the diagram, include a short validation line so the user knows what was and wasn't checked:

- "Structural lint: PASS (brackets, fences, quotes, note presence). Renderer: PlantUML jar on PATH, rendered to 540×620 PNG, no warnings."
- "Structural lint: PASS. Renderer: `mmdc` not installed; recommend pasting into https://mermaid.live to confirm."
- "Structural lint: FAIL → fixed (missing `end` for `subgraph Backend`, added CJK-safe `defaultFontName`). Re-ran, now PASS."

Be precise about what you actually ran. Do not claim a render if you did not run one.
