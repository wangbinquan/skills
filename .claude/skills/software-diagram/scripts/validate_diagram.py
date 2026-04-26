#!/usr/bin/env python3
"""
Structural + render validator for Mermaid and PlantUML diagrams.

Usage:
    python3 validate_diagram.py <path-to-diagram>
    cat diagram.puml | python3 validate_diagram.py -

Exit codes:
    0 = PASS (or PASS with WARN)
    1 = FAIL (structural)
    2 = FAIL (renderer reported error)
    3 = usage error

Notes
-----
This is a pragmatic linter, not a full grammar. It catches the classes of errors
that silently kill renders: unbalanced fences, reserved identifiers, missing
@startuml/@enduml, missing skinparam font for PlantUML, missing note for
PlantUML (this skill's non-negotiable), unbalanced note/legend blocks.

If `plantuml` (jar wrapper) or `mmdc` is on PATH and the diagram matches, we
actually render it to a temp file and surface renderer warnings/errors. If
neither is available, we report so and fall back to structural-only results.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple


# ----- Detection --------------------------------------------------------------

MERMAID_HEAD_RE = re.compile(
    r"^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|"
    r"erDiagram|gantt|journey|pie|mindmap|gitGraph|C4Context|C4Container|"
    r"C4Component|C4Deployment|timeline|quadrantChart|requirementDiagram|"
    r"sankey-beta|xychart-beta)\b",
    re.MULTILINE,
)

MERMAID_EXTS = {".mmd", ".mermaid"}
PLANTUML_EXTS = {".puml", ".plantuml", ".uml", ".iuml", ".wsd"}

MERMAID_RESERVED_IDS = {"end", "class", "style", "graph", "subgraph", "linkStyle", "classDef", "click"}


def detect_format(path: Optional[Path], body: str) -> str:
    """Return 'mermaid' or 'plantuml'. Raises ValueError if indeterminate."""
    if path is not None:
        ext = path.suffix.lower()
        if ext in MERMAID_EXTS:
            return "mermaid"
        if ext in PLANTUML_EXTS:
            return "plantuml"

    # Strip leading mermaid frontmatter (--- ... ---) before heuristics.
    stripped = body
    fm = re.match(r"\A---\n.*?\n---\n", body, flags=re.DOTALL)
    if fm:
        stripped = body[fm.end():]

    if "@startuml" in body:
        return "plantuml"
    if MERMAID_HEAD_RE.search(stripped):
        return "mermaid"
    raise ValueError(
        "Could not detect diagram format. Use .mmd/.mermaid or .puml/.plantuml "
        "file extension, or include a recognizable header line."
    )


# ----- Reporting --------------------------------------------------------------

@dataclass
class Report:
    fmt: str
    passes: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    failures: List[str] = field(default_factory=list)
    renderer_note: str = ""

    def add_pass(self, msg: str) -> None:
        self.passes.append(msg)

    def add_warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def add_fail(self, msg: str) -> None:
        self.failures.append(msg)

    def status(self) -> str:
        if self.failures:
            return "FAIL"
        if self.warnings:
            return "WARN"
        return "PASS"

    def render(self) -> str:
        lines = [f"[{self.status()}] format={self.fmt}"]
        for m in self.passes:
            lines.append(f"  pass : {m}")
        for m in self.warnings:
            lines.append(f"  warn : {m}")
        for m in self.failures:
            lines.append(f"  fail : {m}")
        if self.renderer_note:
            lines.append(f"  note : {self.renderer_note}")
        return "\n".join(lines)


# ----- Line stripping helpers -------------------------------------------------

def _strip_mermaid_comments(body: str) -> str:
    out = []
    for line in body.splitlines():
        out.append("" if line.lstrip().startswith("%%") else line)
    return "\n".join(out)


def _strip_plantuml_comments_and_strings(body: str) -> str:
    """Remove PUML line comments (' single ', /' block '/) and quoted strings.

    We strip strings so their contents don't pollute bracket/keyword counts.
    """
    # /' ... '/ block comments (non-greedy, multiline)
    body = re.sub(r"/'.*?'/", "", body, flags=re.DOTALL)
    # line comments: a leading ' at the start of a trimmed line
    lines = []
    for line in body.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("'"):
            lines.append("")
        else:
            lines.append(line)
    body = "\n".join(lines)
    # quoted strings: "..." (simple, no escape handling beyond \\")
    body = re.sub(r'"(?:\\.|[^"\\])*"', '""', body)
    return body


# ----- Mermaid lint -----------------------------------------------------------

def lint_mermaid(body: str, report: Report) -> None:
    # strip frontmatter and comments for structural checks
    work = body
    fm = re.match(r"\A---\n.*?\n---\n", work, flags=re.DOTALL)
    if fm:
        work = work[fm.end():]
    work = _strip_mermaid_comments(work)

    # 1. header present
    if not MERMAID_HEAD_RE.search(work):
        report.add_fail("no Mermaid diagram-type header (flowchart/sequenceDiagram/classDiagram/…)")
    else:
        report.add_pass("diagram-type header present")

    # 2. subgraph / end balance
    sg = len(re.findall(r"(?m)^\s*subgraph\b", work))
    en = len(re.findall(r"(?m)^\s*end\s*$", work))
    if sg != en:
        report.add_fail(f"subgraph/end mismatch: {sg} subgraph vs {en} end")
    else:
        report.add_pass(f"subgraph/end balanced ({sg})")

    # 3. quote balance (line by line)
    bad_lines = []
    for i, line in enumerate(work.splitlines(), start=1):
        # skip classDef/style lines — they have fill:"..." patterns that are rare but fine
        dq = line.count('"') - line.count('\\"')
        if dq % 2 != 0:
            bad_lines.append(i)
    if bad_lines:
        report.add_fail(f"unbalanced double-quotes on line(s): {bad_lines[:10]}")
    else:
        report.add_pass("double-quotes balanced per line")

    # 4. bracket balance (global)
    pairs = [("(", ")"), ("[", "]"), ("{", "}")]
    for o, c in pairs:
        no = work.count(o)
        nc = work.count(c)
        if no != nc:
            report.add_warn(f"bracket count mismatch '{o}{c}': {no} vs {nc} (may be benign in labels)")
    # we report as warn since Mermaid labels may include brackets in text

    # 5. reserved node id
    # crude: look for `ID[...]` where ID is a reserved word at start of line/after whitespace
    for m in re.finditer(r"(?m)(?:^|\s)(\w+)\s*[\[\(\{]", work):
        ident = m.group(1)
        if ident in MERMAID_RESERVED_IDS:
            report.add_fail(f"reserved word used as node id: '{ident}'")
            break

    # 6. classDef references resolved
    defined = set(re.findall(r"classDef\s+(\w+)\b", work))
    referenced = set(re.findall(r":::(\w+)", work))
    missing = referenced - defined
    if missing:
        report.add_fail(f"classDef referenced but not defined: {sorted(missing)}")
    elif referenced:
        report.add_pass(f"classDef references resolved ({len(referenced)})")

    # 7. `<br>` vs `<br/>`
    if re.search(r"<br(?![/>])>", work):
        report.add_warn("found bare `<br>` — prefer `<br/>` for portable renderers")

    # 8. frontmatter title placement sanity
    if fm is None and re.search(r"^---\s*$", body, re.MULTILINE):
        report.add_warn("found `---` marker not at the very top — frontmatter must be first")


# ----- PlantUML lint ----------------------------------------------------------

def lint_plantuml(body: str, report: Report) -> None:
    raw = body
    body = _strip_plantuml_comments_and_strings(body)

    # 1. @startuml / @enduml
    starts = len(re.findall(r"@startuml\b", body))
    ends = len(re.findall(r"@enduml\b", body))
    if starts == 0:
        report.add_fail("missing @startuml")
    if ends == 0:
        report.add_fail("missing @enduml")
    if starts == 1 and ends == 1:
        report.add_pass("@startuml / @enduml present")
    elif starts > 1 or ends > 1:
        report.add_warn(f"multiple @startuml/@enduml pairs: {starts}/{ends}")

    # 2. skinparam defaultFontName — required in this skill
    if re.search(r"(?im)^\s*skinparam\s+defaultFontName\b", body):
        report.add_pass("skinparam defaultFontName set (CJK-safe)")
    else:
        report.add_fail(
            'missing `skinparam defaultFontName "..."` — required by this skill '
            "so Chinese notes render. Add `skinparam defaultFontName \"Microsoft YaHei\"` "
            "(or \"Noto Sans CJK SC\" on Linux) near the top."
        )

    # 3. note presence — non-negotiable
    has_single = re.search(r"(?im)^\s*note\s+(left|right|top|bottom|over)\b", body)
    has_block = re.search(r"(?im)^\s*note\b.*\n(.*\n)*?\s*end\s*note\b", body)
    has_floating = re.search(r"(?im)^\s*note\s+as\s+\w+", body)
    if has_single or has_block or has_floating:
        report.add_pass("at least one `note` present")
    else:
        report.add_fail(
            "no `note` found — this skill requires every PlantUML diagram to carry "
            "at least one note for extra context. Add a top-of-diagram summary note "
            "if nothing else fits."
        )

    # 4. note … end note balance
    note_block_starts = len(re.findall(r"(?im)^\s*note\s+(left|right|top|bottom|over)\b[^\n:]*$", body))
    note_block_ends = len(re.findall(r"(?im)^\s*end\s*note\b", body))
    if note_block_starts != note_block_ends:
        report.add_warn(
            f"note-block start/end mismatch: {note_block_starts} vs {note_block_ends} "
            "(ok if using single-line notes, but double-check)"
        )

    # 5. legend / endlegend balance
    leg_s = len(re.findall(r"(?im)^\s*legend\b", body))
    leg_e = len(re.findall(r"(?im)^\s*endlegend\b", body))
    if leg_s != leg_e:
        report.add_fail(f"legend/endlegend mismatch: {leg_s} vs {leg_e}")

    # 6. deprecated activity syntax
    if re.search(r"\(\*\)\s*-->", body):
        report.add_warn(
            "deprecated activity syntax `(*) -->` detected — use new syntax "
            "`start` / `:step;` / `stop` instead."
        )

    # 7. bracket/brace balance (global; strings/comments already stripped)
    for o, c in [("{", "}"), ("(", ")"), ("[", "]")]:
        no = body.count(o)
        nc = body.count(c)
        if no != nc:
            report.add_warn(f"'{o}{c}' balance off: {no} vs {nc} (may be in skinparam lists)")

    # 8. CJK presence — if found, re-confirm font
    if re.search(r"[一-鿿㐀-䶿぀-ヿ]", raw):
        if not re.search(r"(?im)^\s*skinparam\s+defaultFontName\b", raw):
            # already reported above, but elevate
            report.add_fail("Chinese/CJK text present but no defaultFontName — will render as '???'")
        else:
            report.add_pass("CJK text detected and font is configured")


# ----- Renderers --------------------------------------------------------------

def try_render_plantuml(source_path: Path, report: Report) -> None:
    plantuml = shutil.which("plantuml")
    if not plantuml:
        report.renderer_note = (
            "`plantuml` not on PATH — structural lint only. "
            "Recommend pasting into https://www.plantuml.com/plantuml to confirm render."
        )
        return
    with tempfile.TemporaryDirectory() as tmp:
        out_dir = Path(tmp)
        proc = subprocess.run(
            [plantuml, "-tpng", "-o", str(out_dir), str(source_path)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            report.add_fail(f"plantuml renderer failed: {proc.stderr.strip() or proc.stdout.strip()}")
            return
        pngs = list(out_dir.glob("*.png"))
        if not pngs:
            report.add_fail("plantuml ran but produced no PNG output")
            return
        size = pngs[0].stat().st_size
        report.add_pass(f"plantuml rendered to PNG ({size} bytes)")
        if proc.stderr.strip():
            report.add_warn(f"plantuml stderr: {proc.stderr.strip()[:200]}")


def try_render_mermaid(source_path: Path, report: Report) -> None:
    mmdc = shutil.which("mmdc")
    if not mmdc:
        report.renderer_note = (
            "`mmdc` (mermaid-cli) not on PATH — structural lint only. "
            "Recommend pasting into https://mermaid.live to confirm render."
        )
        return
    with tempfile.TemporaryDirectory() as tmp:
        out_svg = Path(tmp) / "out.svg"
        proc = subprocess.run(
            [mmdc, "-i", str(source_path), "-o", str(out_svg), "-q"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            report.add_fail(f"mmdc renderer failed: {proc.stderr.strip() or proc.stdout.strip()}")
            return
        if not out_svg.exists():
            report.add_fail("mmdc ran but produced no SVG output")
            return
        size = out_svg.stat().st_size
        report.add_pass(f"mmdc rendered to SVG ({size} bytes)")
        if proc.stderr.strip():
            report.add_warn(f"mmdc stderr: {proc.stderr.strip()[:200]}")


# ----- Entry point ------------------------------------------------------------

def read_input(argv: List[str]) -> Tuple[Optional[Path], str]:
    if len(argv) != 2:
        print("usage: validate_diagram.py <path-or-->", file=sys.stderr)
        sys.exit(3)
    arg = argv[1]
    if arg == "-":
        body = sys.stdin.read()
        return None, body
    p = Path(arg)
    if not p.exists():
        print(f"error: no such file: {p}", file=sys.stderr)
        sys.exit(3)
    return p, p.read_text(encoding="utf-8")


def main(argv: List[str]) -> int:
    path, body = read_input(argv)
    try:
        fmt = detect_format(path, body)
    except ValueError as e:
        print(f"[FAIL] {e}")
        return 1

    report = Report(fmt=fmt)

    if fmt == "mermaid":
        lint_mermaid(body, report)
    else:
        lint_plantuml(body, report)

    # Run renderer if we have a file on disk. If body came from stdin, drop to a temp file.
    needs_tmp = path is None
    render_source: Path
    if needs_tmp:
        suffix = ".puml" if fmt == "plantuml" else ".mmd"
        tmp = tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=suffix, delete=False
        )
        tmp.write(body)
        tmp.close()
        render_source = Path(tmp.name)
    else:
        render_source = path  # type: ignore[assignment]

    try:
        if fmt == "plantuml":
            try_render_plantuml(render_source, report)
        else:
            try_render_mermaid(render_source, report)
    finally:
        if needs_tmp:
            try:
                os.unlink(render_source)
            except OSError:
                pass

    print(report.render())
    status = report.status()
    if status == "FAIL":
        return 1 if not any("renderer failed" in f for f in report.failures) else 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
