---
description: Address engineering review comments for a feature
agent: engineering
---

Read `docs/features/$ARGUMENTS/feature.yaml` and its `engineering.reviewPr`.
Load unresolved review comments for that PR with GitHub CLI. If the PR number is
missing or GitHub CLI cannot access it, ask the user to provide the comments.
Classify each comment as an implementation correction or a new rule, then run
the appropriate correction loop. Preserve accepted E2E tests.
