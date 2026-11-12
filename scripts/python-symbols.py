"""Index authored Python declarations without executing product or fixture modules.

Functions, parameters and bindings are published with exact lines in docs/code-map.md.
Fixed repository roots exclude generated dependencies, accounts and output folders.
"""

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    """Return only bounded authored-source symbol locations to the Node map formatter."""
    files = sorted(
        {
            file
            for folder in (
                ROOT / "scripts",
                ROOT / "tests",
                ROOT / "native-installer/tests",
            )
            for file in folder.glob("*.py")
        }
    )
    if len(files) > 100:
        raise ValueError("Authored Python index count exceeded")
    rows = []
    for file in files:
        if file.is_symlink() or file.stat().st_size > 512 * 1024:
            raise ValueError("Authored Python index requires bounded ordinary source")
        tree = ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                kind, name = (
                    ("class" if isinstance(node, ast.ClassDef) else "function"),
                    node.name,
                )
            elif isinstance(node, ast.arg):
                kind, name = "parameter", node.arg
            elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                kind, name = "binding", node.id
            else:
                continue
            rows.append(
                {
                    "file": file.relative_to(ROOT).as_posix(),
                    "kind": kind,
                    "name": name,
                    "line": node.lineno,
                }
            )
    print(
        json.dumps(
            sorted(
                rows,
                key=lambda item: (
                    item["file"],
                    item["line"],
                    item["kind"],
                    item["name"],
                ),
            )
        )
    )


if __name__ == "__main__":
    main()
