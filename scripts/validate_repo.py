#!/usr/bin/env python3
"""
Aether AI — Repository Validation

Checks repository structure and internal Markdown links.

Lives here as a script rather than inline YAML for a concrete reason: the
original inline-shell version set its failure flag inside a pipeline subshell,
so the flag never reached the parent shell and the job exited green while
printing errors. A check that cannot fail is worse than no check. Scripts can
be run and negatively tested locally; YAML shell cannot.

Usage:
    python3 scripts/validate_repo.py          # validate, exit 1 on failure
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_PATHS = [
    "README.md",
    "docs/Aether-AI-Bible.md",
    "docs/Architecture.md",
    "docs/Decision-Register.md",
    "docs/Decision-Log.md",
    "docs/Roadmap.md",
    "docs/Coding-Standards.md",
    "docs/Folder-Structure.md",
]

# Directories searched for Markdown files whose relative links get verified.
LINK_SCAN_DIRS = ["docs", "specs", "departments", "sessions", "supabase"]

# Matches [text](target) where target is a relative path (not a URL, not an anchor).
MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def is_relative_link(target: str) -> bool:
    if target.startswith(("http://", "https://", "mailto:", "#")):
        return False
    return True


def markdown_files() -> list[Path]:
    files: list[Path] = []
    readme = REPO_ROOT / "README.md"
    if readme.exists():
        files.append(readme)
    for directory in LINK_SCAN_DIRS:
        base = REPO_ROOT / directory
        if base.is_dir():
            files.extend(sorted(base.rglob("*.md")))
    return files


def check_required_paths() -> list[str]:
    return [f"Missing required file: {rel}" for rel in REQUIRED_PATHS if not (REPO_ROOT / rel).exists()]


def check_links() -> list[str]:
    errors: list[str] = []
    for path in markdown_files():
        # Skip fenced code blocks: they contain illustrative paths, not real links.
        in_fence = False
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if line.lstrip().startswith("```"):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            for target in MARKDOWN_LINK.findall(line):
                if not is_relative_link(target):
                    continue
                clean = target.split("#", 1)[0].strip()
                if not clean:
                    continue
                resolved = (path.parent / clean).resolve()
                if not resolved.exists():
                    rel = path.relative_to(REPO_ROOT)
                    errors.append(f"{rel}:{line_number} broken relative link: {target}")
    return errors


def main() -> int:
    errors = check_required_paths() + check_links()
    if errors:
        for error in errors:
            print(f"::error::{error}")
        print(f"\nRepository validation FAILED with {len(errors)} problem(s).")
        return 1
    scanned = len(markdown_files())
    print(f"Repository validation passed: {len(REQUIRED_PATHS)} required paths present, "
          f"{scanned} Markdown files scanned, all relative links resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
