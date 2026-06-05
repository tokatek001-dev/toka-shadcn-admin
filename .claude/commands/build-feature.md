---
name: build-feature
description: Run the full-stack feature harness (design → frontend → QA) for this repo. Pass a feature brief or a Figma URL as args.
---

The user invoked `/build-feature` with the following input:

```
$ARGUMENTS
```

Run the harness workflow now:

1. Call the `Workflow` tool with `{ name: 'build-feature', args: '<the input above>' }`.
2. When it completes, summarize for the user: spec title, route, attempts taken, whether QA passed, and the screenshot paths.
3. If `passed: false` after 3 attempts, surface the final `qa.failureReport` and recommend next steps (review the diff, run `pnpm dev` manually, or refine the brief and retry).

Do NOT do the design/frontend/QA work in the main loop — delegate everything to the workflow.
