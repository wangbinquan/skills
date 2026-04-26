# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is a **skill/agent authoring repo**, not an application. It defines a coordinated set of Claude Code skills and sub-agents that drive an end-to-end software-engineering pipeline (requirement → design → skeleton → UT → impl → consistency audit → commit summary), with mirrored definitions for the OpenCode tool.

There is no build, lint, or test command for the repo itself. "Running" anything here means invoking a skill via `/<skill-name>` inside Claude Code, or spawning the matching agent.

## Top-level layout

- `.claude/skills/<skill>/` — the canonical skill source. Each skill has:
  - `SKILL.md` with YAML frontmatter (`name`, `description`); the `description` is the trigger contract — keep it dense and behavior-specific because Claude reads it to decide whether to fire the skill.
  - `references/<lang>.md` — per-language guidance, **loaded on demand** by the skill after detecting project language. Languages covered across skills: `java`, `cpp`, `scala`, `python`, `go`, `rust`, `javascript`, `typescript` (UT/skeleton/impl/logging/consistency); `software-diagram` and `skill-creator` use a different reference set.
  - Optional: `evals/`, `scripts/`, `assets/`.
- `.claude/agents/*.md` — sub-agent definitions used by Claude Code. Each agent is a thin role wrapper that delegates to **exactly one** skill (e.g., `tdd-impl-runner` → `tdd-impl-generator`). Tools list in the frontmatter is intentionally narrow.
- `.opencode/agents/*.md` — **byte-equivalent mirrors** of `.claude/agents/`, consumed by the OpenCode tool. When you edit an agent, edit both copies. (Skills are not mirrored — only agents.)
- `.opencode/package.json` — single dep `@opencode-ai/plugin`. Used only if writing/testing an OpenCode plugin; not part of the skill pipeline.
- `wiki/opencode_plugin.md` — authoritative reference for the OpenCode plugin hook API (extracted from upstream source). Cite this when answering OpenCode plugin questions; do not infer hook signatures from memory.

## The skill/agent pipeline (how the pieces compose)

```
software-design-doc-generator   (requirements → design + refined-requirements)
        │   only calls: software-diagram
        ▼
tdd-skeleton-runner             (design → code skeleton with TODO stubs)
        │   only calls: tdd-code-skeleton
        ▼
unit-test-runner                (skeleton/source → UT)
        │   only calls: unit-test-generator
        ▼
tdd-impl-runner                 (skeleton + design → fill TODOs, zero-TODO terminal check)
        │   only calls: tdd-impl-generator
        ▼
design-code-consistency-runner  (design ↔ code audit, 9 dimensions, 5 severities)
        │   only calls: design-code-consistency-checker
        ▼
commit-change-summarizer        (HEAD diff + design → review-grade Chinese summary)
            calls: software-diagram
```

Cross-cutting skills: `business-logging` (audit/instrument logs in 8 langs without introducing a new logging framework), `software-diagram` (Mermaid/PlantUML with self-validation), `plan-and-execute-by-subagent` (generic large-scale codegen via 5-task subagent fan-out), `skill-creator` (this repo's meta-tool — also see `evals/` workflow below).

**Hard rule of the pipeline**: each runner agent invokes only the one skill named in its frontmatter. Do not extend a runner to call additional skills — that responsibility belongs to a different runner, or to the user composing them.

## Naming convention for generated artifacts

All pipeline-stage outputs land **next to the originating design/requirement document** (not in a central `output/` dir) and follow `<keyword>-<role>.md`:

- `<keyword>-requirements-refined.md`
- `<keyword>-software-design.md`
- `<keyword>-tdd-skeleton-tasks.md`
- `<keyword>-tdd-impl-tasks.md`
- `<keyword>-ut-design.md`
- `<keyword>-design-code-review.md`
- `<keyword>-commit-summary-<short-hash>.md`

These filenames are also the **resume markers**: every skill checks for its own `*-tasks.md` / `*-design.md` / `*-review.md` in the target directory and continues from `pending` rows instead of redoing the design phase. Preserve the suffix exactly when editing skill prompts — the resume detection is filename-pattern based.

## Conventions when editing skills

- **Frontmatter `description` is the trigger.** It is the only thing Claude sees when deciding to fire the skill. Edits that broaden/narrow scope must be reflected here, not just in the body.
- **References load on demand.** Skills enumerate which `references/<lang>.md` to read *after* language detection. When adding a new reference file, also update the body of `SKILL.md` to teach the skill when to load it; otherwise it will be dead weight.
- **Subagent fan-out is the standard execution shape.** TDD-skeleton/impl, UT, and consistency skills all run a "design subagent → batch list → 5–8 batches/wave fan-out → reflect → resume until pending=0" loop. When modifying these, keep the wave/batch sizing knobs (5–10 items/batch, 5–8 batches/wave) consistent across them — the pipeline relies on similar throughput characteristics.
- **`tdd-impl-generator` enforces a TODO-zero-residue terminal grep** for `TODO|FIXME|XXX|HACK|unimplemented`. Do not weaken this; subagent self-check + main-context grep are both required.
- **`business-logging` forbids introducing a new logging framework**. The skill must locate the project's existing logger first; log messages must be English with no emoji/decorative banners. Preserve both rules verbatim if rewording.
- **`software-diagram` requires a self-validation pass** (`scripts/validate_diagram.sh`) and Chinese `note` annotations on every PlantUML output. Both are non-negotiable in the skill body.

## Keeping `.claude/agents/` and `.opencode/agents/` in sync

The two directories must contain the same six agents with the same content. The OpenCode runtime reads `.opencode/agents/<name>.md`; Claude Code reads `.claude/agents/<name>.md`. After editing one, copy to the other (no transformation needed). If the agent's `tools:` frontmatter changes, both copies must reflect it.

## skill-creator workflow (when modifying or evaluating a skill)

`.claude/skills/skill-creator/scripts/` contains the eval harness:

- `run_eval.py` — runs Claude with access to a target skill against a prompt set
- `generate_report.py` / `eval-viewer/generate_review.py` — render qualitative review HTML
- `aggregate_benchmark.py` — variance-aware quantitative metrics
- `improve_description.py` — optimize a skill's frontmatter `description` for trigger accuracy
- `package_skill.py`, `quick_validate.py` — packaging/lint helpers

These are invoked from inside the skill-creator skill rather than directly from a shell prompt — start with `/skill-creator` and let it orchestrate.

## OpenCode plugin work

If a task involves writing an OpenCode plugin (signaled by anything under `.opencode/` or a request mentioning `chat.params`, `tool.execute.before`, etc.), `wiki/opencode_plugin.md` is the source of truth for hook names, input/output shapes, and trigger sites. The `.opencode/node_modules/@opencode-ai/plugin` types are also locally available for type-checking. Treat `output` objects as mutable; do not return values from hooks.
