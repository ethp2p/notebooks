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

### 2026-04-23 · Plan 01 Task 14 · branch created at start instead of end

**What the plan said:** Task 14 Step 3 creates `plan-01-foundation` branch at the very end, after 13 prior tasks have committed to whatever branch was current (i.e. `main`).

**What was done instead:** Created `plan-01-foundation` off `main` before starting Task 01, so all commits for Plan 01 land on the branch.

**Reason:** Committing 13 tasks' worth of foundational scaffolding directly to `main` and then branching at the end orphans nothing: the branch would start at the tip of `main` with all the work already merged. The skill guidance (`superpowers:subagent-driven-development`) also prohibits starting implementation on `main` without explicit user consent, which was not given for `main` commits specifically.

**Downstream impact:** Task 14 Step 3 should now omit the `git checkout -b plan-01-foundation` line (already on the branch). The remaining Step 3 work (push, open PR) still applies.

### 2026-04-23 · Plan 01 Task 07 · Xray Mono substituted with Iosevka

**What the plan said:** Obtain Xray Mono (the font used by the wiretap dashboard) and place it at `site/public/fonts/XrayMono-Regular.woff2`. If not findable, fall back to JetBrains Mono and record it here.

**What was done instead:** Copied `iosevka-400.woff2` from `/Users/raul/W/ethereum/wiretap/dashboard/public/` to `site/public/fonts/XrayMono-Regular.woff2`. The filename and the `font-family: 'Xray Mono'` declaration in `site/src/styles/fonts.css` are unchanged; only the underlying glyph data differs from the notional plan font.

IBM Plex Sans (Regular 400, Medium 500, Bold 700) was downloaded from `https://github.com/IBM/plex/raw/master/packages/plex-sans/fonts/complete/woff2/` (IBM Plex repo master branch, version 3.327 per the woff2 header). All three files confirmed valid woff2 by `file(1)`.

**Reason:** Xray Mono does not exist as a findable font anywhere in the wiretap repository or on public registries. Iosevka is what wiretap actually uses (`iosevka-400.woff2` at 984 KB). The plan's suggested fallback was JetBrains Mono, but Iosevka is a closer aesthetic match to the wiretap reference design that `.impeccable.md` names. Keeping the `XrayMono-Regular.woff2` filename preserves the stable abstraction so a future font swap requires replacing only the single file.

**Downstream impact:** None. `font-family: 'Xray Mono'` remains the canonical name in `fonts.css` and Tailwind config. Any plan step referencing "Xray Mono" means the Iosevka-backed file at `site/public/fonts/XrayMono-Regular.woff2`.

### 2026-04-23 · Plan 01 Task 01 · deleted extra site tree entries beyond plan's explicit list

**What the plan said:** Task 01 Step 3 deletes `site/src site/astro.config.mjs site/package.json site/pnpm-lock.yaml site/node_modules site/tsconfig.json site/rendered site/public`. It notes `.astro`, `dist/`, `config/`, `.prettierrc` should also be deleted and asks for non-trivial removals to be recorded here.

**What was done instead:** Also deleted the following from `site/`:
- `site/.astro/` (Astro content cache, trivial)
- `site/dist/` (previous Astro build output containing `2025/`, `2026/`, `assets/`, `favicon.svg`, `index.html`, `latest/`; regenerated by future Vite builds)
- `site/components.json` (shadcn/ui component registry config, 507 bytes; Task 11 will regenerate an equivalent during shadcn init under the new stack)
- `site/config/` (empty directory, trivial)
- `site/.prettierrc` (264 bytes; superseded by `.prettierrc.json` in Task 11)
- `site/.DS_Store` (macOS metadata, trivial)
- Untracked WIP files under `site/src/components/` (`BinaryTreeLayout.tsx`, `ChartCell.tsx`, `ChartRenderer.tsx`, `ChartSelector.tsx`) and `site/src/lib/` (`chart-manifest.ts`, `workspace.ts`). These were prior exploration, explicitly authorised for deletion by the task description.

**Reason:** The plan's Important Notes section for Task 01 in this repo explicitly authorises deleting `.astro`, `dist/`, `config/`, `.prettierrc`, `.DS_Store`, and the untracked WIP components. The non-trivial entries (`dist/` build output and `components.json`) are being called out here for visibility.

**Downstream impact:** Task 11 (shadcn init) will regenerate `components.json` against the new Vite + React + Tailwind stack, so it does not need to restore the deleted one. No other downstream plans reference these files.

### 2026-04-23 · Plan 01 Task 02 · commit folds in Task 01 deletions

**What the plan said:** Step 4 `git add` lists only `site/package.json site/bun.lock bunfig.toml` (the new files from Task 02).

**What was done instead:** Also staged the 34 unstaged deletions from Task 01 via `git add -u site/` before adding the new files, so all changes land in a single commit. The task description's Context section explicitly authorises this and calls it out as the correct approach.

**Reason:** The intermediate state (Task 01 deletions committed without a package.json) would be a broken tree. Folding both into one commit keeps the branch in a working state at every commit.

**Downstream impact:** None. The commit message `chore(site): initialise Vite + React on Bun` accurately describes both actions as a single logical unit.
