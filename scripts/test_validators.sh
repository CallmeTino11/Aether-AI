#!/usr/bin/env bash
#
# Aether AI — Validator Self-Tests
#
# Proves the validators FAIL when they should. This exists because the original
# inline-shell link checker printed errors but exited 0 (its failure flag was
# set inside a pipeline subshell), so CI stayed green on a broken repository.
# A validator that cannot fail is worse than no validator: it manufactures
# confidence. Every check below deliberately breaks something and asserts a
# non-zero exit.
#
# Usage: bash scripts/test_validators.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0

report_pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
report_fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# Runs a validator against a temporary copy of the repo with a mutation applied.
# Asserts the expected exit code.
assert_exit() {
  local description="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    report_pass "$description (exit $actual)"
  else
    report_fail "$description — expected exit $expected, got $actual"
  fi
}

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

fresh_copy() {
  rm -rf "$SANDBOX/repo"
  mkdir -p "$SANDBOX/repo"
  # Copy only what the validators read, keeping the sandbox cheap.
  cp -r README.md docs specs departments sessions scripts "$SANDBOX/repo/" 2>/dev/null
  [ -d supabase ] && cp -r supabase "$SANDBOX/repo/"
  [ -d src ] && cp -r src "$SANDBOX/repo/"
}

echo "=== Positive cases: the real repository must pass ==="
python3 scripts/validate_repo.py > /dev/null 2>&1
assert_exit "validate_repo passes on clean repo" 0 $?
python3 scripts/validate_decisions.py > /dev/null 2>&1
assert_exit "validate_decisions passes on clean repo" 0 $?

echo ""
echo "=== Negative cases: each must be DETECTED (non-zero exit) ==="

# 1. Broken relative link — the bug that previously escaped detection.
fresh_copy
sed -i 's|(docs/Aether-AI-Bible.md)|(docs/Nope-Missing.md)|g' "$SANDBOX/repo/README.md"
(cd "$SANDBOX/repo" && python3 scripts/validate_repo.py > /dev/null 2>&1)
assert_exit "broken relative link detected" 1 $?

# 2. Missing required document.
fresh_copy
rm "$SANDBOX/repo/docs/Architecture.md"
(cd "$SANDBOX/repo" && python3 scripts/validate_repo.py > /dev/null 2>&1)
assert_exit "missing required doc detected" 1 $?

# 3. Duplicate Decision ID — governance rule: IDs are never reused.
fresh_copy
cat >> "$SANDBOX/repo/docs/Decision-Register.md" << 'INNER'

## DEC-0001 — Illegal duplicate

**Department:** Engineering
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Nobody
INNER
(cd "$SANDBOX/repo" && python3 scripts/validate_decisions.py > /dev/null 2>&1)
assert_exit "duplicate Decision ID detected" 1 $?

# 4. Missing required decision field.
fresh_copy
cat >> "$SANDBOX/repo/docs/Decision-Register.md" << 'INNER'

## DEC-9001 — Missing fields

**Status:** Approved
INNER
(cd "$SANDBOX/repo" && python3 scripts/validate_decisions.py > /dev/null 2>&1)
assert_exit "missing decision field detected" 1 $?

# 5. Invalid status value.
fresh_copy
cat >> "$SANDBOX/repo/docs/Decision-Register.md" << 'INNER'

## DEC-9002 — Bad status

**Department:** Engineering
**Status:** Maybe
**Date:** 2026-08-11
**Approved By:** Claude
INNER
(cd "$SANDBOX/repo" && python3 scripts/validate_decisions.py > /dev/null 2>&1)
assert_exit "invalid Status detected" 1 $?

# 6. Supersedes pointing at a decision that does not exist.
fresh_copy
cat >> "$SANDBOX/repo/docs/Decision-Register.md" << 'INNER'

## DEC-9003 — Dangling supersession

**Department:** Engineering
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude

### Supersedes

DEC-7777
INNER
(cd "$SANDBOX/repo" && python3 scripts/validate_decisions.py > /dev/null 2>&1)
assert_exit "dangling Supersedes reference detected" 1 $?

# 7. A document citing a decision that was never recorded — guards against
#    fabricated Decision IDs (a governance rule in the register).
fresh_copy
echo "This work was approved under DEC-4242." >> "$SANDBOX/repo/docs/Roadmap.md"
(cd "$SANDBOX/repo" && python3 scripts/validate_decisions.py > /dev/null 2>&1)
assert_exit "reference to non-existent decision detected" 1 $?

echo ""
echo "================================"
echo "Validator self-tests: $PASS passed, $FAIL failed"
echo "================================"
[ "$FAIL" -eq 0 ] || exit 1
