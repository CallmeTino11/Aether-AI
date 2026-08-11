#!/usr/bin/env python3
"""
Aether AI — Decision Register Validation

Enforces the governance rules in docs/Decision-Register.md that matter most:
IDs are unique and ordered, required fields are present, statuses are valid,
supersession references resolve, and every DEC-XXXX referenced anywhere in the
repo actually exists.

Extracted from inline workflow YAML so it can be run and negatively tested
locally (see scripts/test_validators.sh).

Usage:
    python3 scripts/validate_decisions.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTER_PATH = REPO_ROOT / "docs" / "Decision-Register.md"

VALID_STATUSES = {"Approved", "Rejected", "Superseded"}
REQUIRED_FIELDS = ["**Department:**", "**Status:**", "**Date:**", "**Approved By:**"]

DECISION_HEADING = re.compile(r"^##\s+(DEC-\d{4})\b", re.MULTILINE)
DECISION_REFERENCE = re.compile(r"\bDEC-\d{4}\b")

# Directories scanned for references to decisions.
REFERENCE_SCAN_DIRS = ["docs", "specs", "departments", "sessions", "src", "supabase"]


def parse_register(text: str) -> tuple[list[str], dict[str, str]]:
    """Return (ordered ids, id -> block text)."""
    headings = list(DECISION_HEADING.finditer(text))
    ids: list[str] = []
    blocks: dict[str, str] = {}
    for index, match in enumerate(headings):
        dec_id = match.group(1)
        start = match.start()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(text)
        ids.append(dec_id)
        blocks[dec_id] = text[start:end]
    return ids, blocks


def validate_register(text: str) -> list[str]:
    errors: list[str] = []
    ids, blocks = parse_register(text)

    if not ids:
        return ["Decision Register contains no decisions — expected at least DEC-0001."]

    seen: set[str] = set()
    for dec_id in ids:
        if dec_id in seen:
            errors.append(f"Duplicate Decision ID: {dec_id} (IDs are permanent and must never be reused)")
        seen.add(dec_id)

    numbers = [int(dec_id.split("-")[1]) for dec_id in ids]
    if numbers != sorted(numbers):
        errors.append(f"Decision IDs are not in ascending order: {ids}")

    for dec_id, block in blocks.items():
        for field in REQUIRED_FIELDS:
            if field not in block:
                errors.append(f"{dec_id} missing required field: {field}")

        status_match = re.search(r"\*\*Status:\*\*\s*(\S+)", block)
        if status_match and status_match.group(1) not in VALID_STATUSES:
            errors.append(f"{dec_id} has invalid Status '{status_match.group(1)}' "
                          f"(expected one of {sorted(VALID_STATUSES)})")

        supersedes_match = re.search(r"###\s+Supersedes\s*\n+\s*(\S+)", block)
        if supersedes_match:
            target = supersedes_match.group(1).rstrip(".,")
            if target != "None" and target not in seen:
                errors.append(f"{dec_id} Supersedes references unknown decision: {target}")

    return errors


def validate_references(valid_ids: set[str]) -> list[str]:
    errors: list[str] = []
    for directory in REFERENCE_SCAN_DIRS:
        base = REPO_ROOT / directory
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix not in {".md", ".ts", ".sql", ".py"}:
                continue
            if path == REGISTER_PATH:
                continue
            content = path.read_text(encoding="utf-8", errors="replace")
            for referenced in sorted(set(DECISION_REFERENCE.findall(content))):
                # The template placeholder DEC-XXXX is excluded by the \d{4} pattern.
                if referenced not in valid_ids:
                    rel = path.relative_to(REPO_ROOT)
                    errors.append(f"{rel} references unknown decision {referenced}")
    return errors


def main() -> int:
    if not REGISTER_PATH.exists():
        print("::error::docs/Decision-Register.md not found.")
        return 1

    text = REGISTER_PATH.read_text(encoding="utf-8")
    errors = validate_register(text)

    ids, _ = parse_register(text)
    valid_ids = set(ids)
    errors.extend(validate_references(valid_ids))

    if errors:
        for error in errors:
            print(f"::error::{error}")
        print(f"\nDecision validation FAILED with {len(errors)} problem(s).")
        return 1

    print(f"Decision validation passed: {len(valid_ids)} decisions "
          f"({', '.join(sorted(valid_ids))}); no duplicates, all references resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
