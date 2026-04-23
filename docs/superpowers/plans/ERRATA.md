# Plan errata

This file is a running log of deviations from the original plans (Plans 01 through 07 under `docs/superpowers/plans/`). Every plan executor MUST read this file in full before starting any task, and MUST append to it when deviating from a plan in any way.

## Why this exists

Plans are written before implementation contact with reality. Reality will, in places, reject the plan: a library signature will differ, a file path will already be taken, a test will expose a wrong assumption, a dependency will have been renamed. When that happens, the executor has two choices:

1. Fight reality and force the plan (usually wrong).
2. Adjust, and record the adjustment here so every downstream plan and every future session inherits the correction.

This file is how option 2 stays sustainable. Without it, downstream plans reference shapes that no longer exist, and every executor re-discovers the same mismatches.

## When to read

At the very start of every plan-executing session: read this file in full, before reading the plan itself. Treat its contents as amendments that override the written plan wherever they conflict.

## When to append

Any time you deviate from a plan. Deviation includes, but is not limited to:

- Renaming a file, function, type, variable, command, or package.
- Changing a function signature, type shape, or return value.
- Adding, removing, or reordering tasks.
- Swapping a library for a different one.
- Moving code to a different file or directory.
- Using a different version of a dependency than the plan specifies.
- Discovering a task in the plan is already done (or impossible).
- Finding a bug in a previous plan's implementation that you fix.
- Adopting a convention that contradicts the plan.

If you are not sure whether a change counts as a deviation: append. Over-recording is cheap; under-recording is expensive.

**Append BEFORE marking the step complete.** Not after. Not at the end of the task. Before.

## Entry format

Append to the end of the "Entries" section below. One entry per deviation, in this exact shape:

```markdown
### YYYY-MM-DD · Plan NN Task M · short headline

**What the plan said:** <quote or summarise>

**What was done instead:** <describe>

**Reason:** <why the plan was wrong or why this is better>

**Downstream impact:** <list of other plans / tasks that must now be read with this correction in mind; "none" if truly isolated>
```

If the deviation requires an explicit edit to a later plan, edit that plan in place and note it here:

```markdown
**Plan edits applied:** `docs/superpowers/plans/2026-04-23-05-chart-migration.md` §Task 12 renamed `FooBar` → `FooBaz` to match.
```

## Example entry (for reference; not a real deviation)

```markdown
### 2026-04-25 · Plan 02 Task 7 · rename query() helper to defineQuery()

**What the plan said:** Import `query` from `observatory/queries/registry.ts` and call `query({ id: ... })`.

**What was done instead:** The helper is named `defineQuery` to match the `defineChart` naming convention on the site side.

**Reason:** Keeping `query` as a name collided with Zod's `query` utility inside the same file; the rename is small and improves consistency with chart authoring.

**Downstream impact:** Every subsequent call site in Plans 03 and 05 must use `defineQuery`.

**Plan edits applied:** `docs/superpowers/plans/2026-04-23-03-query-consolidation.md` and `docs/superpowers/plans/2026-04-23-05-chart-migration.md` updated to `defineQuery`.
```

## Invariants

- Never delete an entry once added. If an entry becomes obsolete (e.g. the convention reverted), append a new entry saying so; leave the old one in place.
- Never rewrite a prior plan without also adding an entry here.
- Append chronologically. Latest entry goes at the bottom.

## Entries

<!-- Entries start below this line. Do not add content above this line. -->
