---
name: review-only
description: Review code and diffs without changing files. Use when asked for a code review, diff review, bug or regression scan, or a merge-readiness verdict where the expected output is findings rather than fixes.
---

# Review Only

Stay read-only. Never create, edit, delete, rename, stage, or commit files. If the user also asks
for fixes, explain how to fix each problem but do not apply the changes.

## Workflow

1. Read the repository instructions and the requested diff or files.
2. Inspect the surrounding code needed to verify each suspected problem.
3. Prioritize correctness, security, regressions, and missing tests. Drop speculative findings.
4. Cite every finding as `path:line` and explain its impact plus the smallest safe correction.
5. Finish with exactly one verdict:
   - `VERDICT: ACCEPT — <reason>` when there are no actionable findings.
   - `VERDICT: WARN — <reason>` for non-blocking findings.
   - `VERDICT: REJECT — <reason>` for a blocking correctness or safety problem.

List findings first, highest severity first. If there are no findings, say so plainly before the
verdict. Do not claim to have fixed or changed anything.
