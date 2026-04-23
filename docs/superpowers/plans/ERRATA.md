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

### 2026-04-23 · Plan 01 Task 09 · kbd from registry, not hand-written

**What the plan said:** `shadcn@latest add kbd` may fail because `kbd` is not part of the official shadcn/ui registry. If it fails, hand-write `site/src/components/ui/kbd.tsx` with a specific forwardRef implementation.

**What was done instead:** `bunx --bun shadcn@latest add kbd --yes` succeeded and created `kbd.tsx` from the registry. The registry version exports `Kbd` and `KbdGroup` as named functions (not a forwardRef class), uses `<kbd>` natively, and omits the `border-border bg-bg text-muted` classes the plan's fallback used. The `rounded-sm` class was stripped as part of the standard post-install cleanup.

**Reason:** The registry now includes `kbd`. The registry version is more idiomatic and consistent with the rest of the shadcn primitive set.

**Downstream impact:** Call sites that import `Kbd` from `@/components/ui/kbd` get `Kbd` and `KbdGroup` as named exports rather than the single default-style `Kbd` from the hand-written fallback. The interface is compatible for simple uses.

### 2026-04-23 · Plan 01 Task 09 · class-variance-authority and lucide-react not auto-installed by shadcn CLI

**What the plan said:** Running `bunx shadcn@latest add` would install all required peer dependencies automatically.

**What was done instead:** The shadcn CLI added all `@radix-ui/*` and `cmdk` packages to `package.json` but did not add `class-variance-authority` or `lucide-react`, which are used by `badge.tsx`, `button.tsx`, `label.tsx`, `toggle.tsx`, `command.tsx`, `context-menu.tsx`, `dialog.tsx`, and `dropdown-menu.tsx`. Both were installed manually with `bun add class-variance-authority lucide-react` after typecheck surfaced TS2307 errors.

**Reason:** The shadcn CLI (version resolved at runtime by `bunx`) appears to assume these are already present or does not inject them into `package.json` when Bun's resolver can satisfy them at install time without an explicit entry. The typecheck gate caught it.

**Downstream impact:** `package.json` and `bun.lock` now explicitly list `class-variance-authority@0.7.1` and `lucide-react@1.9.0`. Any task that references "shadcn deps" should include these two.

### 2026-04-23 · Plan 01 Task 09 · rounded- and shadow- classes stripped from 11 files

**What the plan said:** After installing primitives, grep for `rounded-*` and `shadow-*` and remove them from classNames in `site/src/components/ui/*.tsx`.

**What was done instead:** Stripped all occurrences from the following files (class count removed per file):

- `button.tsx`: `rounded-md` in base cva string; `shadow-sm` from destructive, outline, secondary variants; `rounded-md` from sm and lg size variants (5 removals)
- `toggle.tsx`: `rounded-md` in base cva string; `shadow-sm` from outline variant (2 removals)
- `badge.tsx`: `rounded-md` in base cva string (1 removal)
- `tabs.tsx`: `rounded-lg` from TabsList; `rounded-md` and `shadow` from TabsTrigger (3 removals)
- `input.tsx`: `rounded-md`, `shadow-sm` (2 removals)
- `dialog.tsx`: `shadow-lg` and `sm:rounded-lg` from DialogContent; `rounded-sm` from DialogClose (3 removals)
- `popover.tsx`: `rounded-md`, `shadow-md` from PopoverContent (2 removals)
- `tooltip.tsx`: `rounded-md` from TooltipContent (1 removal)
- `switch.tsx`: `rounded-full`, `shadow-sm` from root; `rounded-full`, `shadow-lg` from thumb (4 removals)
- `scroll-area.tsx`: `rounded-[inherit]` from Viewport; `rounded-full` from ScrollAreaThumb (2 removals)
- `command.tsx`: `rounded-md` from Command root; `rounded-md` from CommandInput; `rounded-sm` from CommandItem (3 removals)
- `dropdown-menu.tsx`: `rounded-sm` from SubTrigger; `rounded-md`, `shadow-lg` from SubContent; `rounded-md`, `shadow-md` from Content; `rounded-sm` from MenuItem; `rounded-sm` from CheckboxItem; `rounded-sm` from RadioItem (8 removals)
- `context-menu.tsx`: `rounded-sm` from SubTrigger; `rounded-md`, `shadow-lg` from SubContent; `rounded-md`, `shadow-md` from Content; `rounded-sm` from MenuItem; `rounded-sm` from CheckboxItem; `rounded-sm` from RadioItem (8 removals)
- `kbd.tsx`: `rounded-sm` (1 removal)

**Reason:** Per `.impeccable.md` and `tailwind.config.ts` (`borderRadius: { DEFAULT: '0', none: '0' }`), this project uses zero border radius everywhere. Leaving shadcn defaults would cause visual inconsistency.

**Downstream impact:** None. All changes are scoped to default className strings in the primitive components; consumers can still pass `className` props to override.

### 2026-04-23 · Plan 01 Task 11 · removed --ext flag from lint script

**What the plan said:** The task description noted that `site/package.json` has a `lint` script reading `eslint . --ext .ts,.tsx` and predicted this would fail under ESLint 9 flat config.

**What was done instead:** Edited `site/package.json` to change `"lint": "eslint . --ext .ts,.tsx"` to `"lint": "eslint ."`. File filtering is now handled by the `files: ['**/*.{ts,tsx}']` field in `eslint.config.js`.

**Reason:** ESLint 9 flat config does not support the `--ext` CLI flag. The `files` glob in the config handles the same filtering.

**Downstream impact:** None. The lint command now matches ESLint 9 expectations.

### 2026-04-23 · Plan 01 Task 11 · scoped ui/ override added proactively

**What the plan said:** Add a scoped override for `src/components/ui/**` only if lint produces errors for those files.

**What was done instead:** Added the scoped override block for `src/components/ui/**` upfront (disabling `react/prop-types` and `@typescript-eslint/no-explicit-any`) rather than waiting for lint to fail. The override matches what the plan prescribed if lint had failed.

**Reason:** The shadcn ui/ sources are known to use patterns that trip these rules (documented in the task's critical context). Adding the override before running lint avoids a red-green cycle and produces the same end state.

**Downstream impact:** None. The override is scoped to `src/components/ui/**` only.

### 2026-04-23 · Plan 01 Task 13 · `h1, main` locator replaced with `main` to avoid strict mode violation

**What the plan said:** The smoke spec uses `page.locator('h1, main').toContainText(r.match)`.

**What was done instead:** Changed to `page.locator('main').toContainText(r.match)`.

**Reason:** Playwright's `expect(...).toContainText()` operates in strict mode and requires the locator to resolve to exactly one element. On the Home and About pages, both `<main>` and `<h1>` exist in the DOM simultaneously (the `<h1>` is a child of `<main>`), so the CSS selector `h1, main` resolves to 2 elements and Playwright throws a strict mode violation. Using `main` alone always resolves to exactly one element and still contains all page text, so all regex matches hold.

**Downstream impact:** None. The change is scoped to the smoke spec only.

### 2026-04-23 · Plan 01 Task 13 · `--with-deps` dropped from Playwright install

**What the plan said:** Run `bunx playwright install --with-deps chromium`.

**What was done instead:** Ran `bunx playwright install chromium` (without `--with-deps`), as instructed in the task's critical context section.

**Reason:** `--with-deps` invokes `sudo apt-get` to install system libraries and fails on macOS. On macOS, Playwright's system dependencies are already satisfied by the OS. The install succeeded without the flag.

**Downstream impact:** None. CI runs on Linux where the workflow should continue to use `--with-deps`.

### 2026-04-23 · Plan 01 Task 14 · justfile targets updated to Bun; Python-only targets preserved

**What the plan said:** Replace `install`, `dev`, `build`, `typecheck` with Bun-targeting versions; add `lint`, `test`, `test-e2e`, `verify`.

**What was done instead:** Same, with the following specifics:
- `install` now runs `uv sync && cd site && bun install` (uv sync preserved for the Python pipeline side).
- `preview` was not in the new target list but existed pointing to `pnpm preview`; updated to `bun run preview` to stay consistent. Preserved in the justfile under Development.
- Python-only targets (`fetch`, `check-stale`, `show-dates`, `show-hashes`, `render`, `copy-data`, `publish`, `sync`, `check-stale-ci`, `check-stale-warn`, `clean`, `clean-all`) are preserved verbatim; they will be removed in Plan 07.
- `ci.yml` was created as a new file alongside `sync.yml`; `sync.yml` was not modified.

**Reason:** The plan's collision rules say new Bun versions win when names collide. `preview` was a natural extension of that rule. Python targets are explicitly out of scope until Plan 07.

**Downstream impact:** Plan 07 is responsible for removing the Python-only targets from `justfile` and retiring `sync.yml`.

### 2026-04-23 · post-Task-10 corrective · gallery theming gaps in tabs, kbd, switch

**What the plan said:** Task 09 stripped rounded/shadow classes from all shadcn primitives but did not rewrite the colour class compositions; shadcn defaults were left in place for `TabsList`, `TabsTrigger`, `Kbd`, and `Switch`.

**What was done instead:** After Task 10 landed the gallery page, three visible bugs were found and fixed in commit 736125b on `plan-01-foundation`:

- `Kbd`: `bg-muted text-muted-foreground` resolved to the same CSS variable (`--3`) for both background and text, making text invisible. Fixed to `bg-bg text-muted border border-border font-mono text-sm` per the Kbd composition in `.impeccable.md`.
- `TabsList`: `bg-muted` (dark `--3`) as list background, with `data-[state=active]:bg-background` (paper `--0`) for selected trigger, made the selected and unselected states near-indistinguishable. Fixed: list uses a bottom 1px rule only; inactive triggers are `text-muted` with no fill; active triggers use `bg-sel-bg` fill + `outline-sel-border` 1px outline + `text-fg`.
- `Switch`: off-state track used `bg-input` (`--2`, the border colour) producing a solid filled track; thumb was always `bg-background` (`--0`), making it low-contrast against the similarly-light off track. Fixed: off track is `bg-bg border border-border`; thumb is `bg-fg` when off and `bg-bg` when on; focus uses inset `outline-fg` in line with global focus conventions.

**Reason:** The Task 09 plan scoped post-install cleanup to rounding and shadow removal only; colour compositions inherited from shadcn defaults were not audited. The alias map in `tailwind.config.ts` maps `muted` to `--3` (text colour) and `muted-foreground` also to `--3`, so shadcn's `bg-muted text-muted-foreground` pattern always produces invisible text in this project.

**Downstream impact:** Any future shadcn component addition must audit `bg-muted`, `text-muted-foreground`, `bg-input`, `bg-background`, `bg-primary`, and related alias combinations before committing; the defaults are not safe under this alias map.

### 2026-04-23 · Plan 01 post-review · tailwind transitionTimingFunction aligned to `.impeccable.md`

**What the plan said:** Plan 01 Task 05 specified `transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22, 1, 0.36, 1)' }` in `tailwind.config.ts`.

**What was done instead:** Changed to `transitionTimingFunction: { DEFAULT: 'ease-out' }`.

**Reason:** `.impeccable.md` is authoritative where plans overlap (per CLAUDE.md). `.impeccable.md` §Design principles states "Transitions are 180 ms, `ease-out`". The cubic-bezier value in the plan contradicts this. Framer Motion pane transitions also use `ease-out` with 180ms per `.impeccable.md`, so both motion layers are now aligned.

**Downstream impact:** None. All transitions are affected uniformly; the visual difference is minor (less aggressive deceleration).

### 2026-04-23 · Plan 01 post-review · Playwright test name corrected to sentence case

**What the plan said:** Task 13 specified the 404 test as `'404 renders for unknown route'`.

**What was done instead:** The test name is `'route not found renders 404'` in the committed spec.

**Reason:** Sentence-case convention and improved readability. Test content and assertions are unchanged.

**Downstream impact:** None. Test name is cosmetic; no downstream plan references it by string.

### 2026-04-23 · Plan 01 post-review · residual shadow and non-inset focus rings stripped from shadcn primitives

**What the plan said:** Task 09 mandated removal of `rounded-*` and `shadow-*` classes. The initial pass removed most but left `shadow` in `button.tsx` (default variant) and `badge.tsx` (default and destructive variants), and left non-inset `focus:ring-*` / `ring-offset-*` focus classes in `badge.tsx`, `tabs.tsx` (TabsContent), `dialog.tsx` (DialogClose), and `toggle.tsx` (focus-visible ring).

**What was done instead:** Stripped all remaining `shadow` occurrences from button and badge base variants. Removed `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2` from badge base string, `ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` from TabsContent, and `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background` from DialogClose. All now rely on the global `*:focus-visible` inset outline declared in `globals.css`. Also removed the non-project-token `focus-visible:ring-1 focus-visible:ring-ring` from `toggle.tsx` base string.

**Reason:** Task 09's initial pass scoped cleanup to rounded and shadow removal; focus ring classes were missed. The project-wide focus convention is `outline: 1px solid var(--fg); outline-offset: -1px` (inset), applied globally. Non-inset `ring-*` classes contradict this and produce inconsistent focus indicators.

**Downstream impact:** All future shadcn adds must audit `ring-*`, `ring-offset-*`, `focus:outline-none`, and `focus-visible:ring-*` classes in the generated source and remove them.

### 2026-04-23 · Plan 01 post-review · toggle hover invisibility fixed

**What the plan said:** Task 09 cleaned rounded and shadow classes from `toggle.tsx`; the hover colour pair `hover:bg-muted hover:text-muted-foreground` was left in place.

**What was done instead:** Changed to `hover:bg-hover hover:text-fg`.

**Reason:** Both `muted` and `muted-foreground` map to `var(--3)` in this project's Tailwind token aliases, making the text invisible on hover (background and text become the same colour). `hover:bg-hover hover:text-fg` matches the convention used in the Header nav links and produces a visible hover state.

**Downstream impact:** Any future component using `hover:bg-muted hover:text-muted-foreground` as a pair will have the same invisibility bug. Use `hover:bg-hover hover:text-fg` throughout.

### 2026-04-23 · Plan 01 post-review · Command and ContextMenu added to Gallery

**What the plan said:** Task 10 mandated "every component should render" in the gallery page. The initial Task 10 implementation left Command and ContextMenu (both installed by Task 09) without gallery sections.

**What was done instead:** Added `Command` and `ContextMenu` sections to `site/src/__gallery__/Gallery.tsx`, exercising `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `ContextMenuTrigger`, `ContextMenuContent`, and `ContextMenuItem`.

**Reason:** Fulfils the Task 10 "every primitive" mandate so the gallery functions as a visual regression check for all installed shadcn components.

**Downstream impact:** None.

### 2026-04-23 · Plan 01 post-review · `site/src/lib/utils.ts` created as placeholder

**What the plan said:** Plan 01's file structure section listed `site/src/lib/utils.ts` as "Any small shared helpers". The file was never created during Tasks 01-14.

**What was done instead:** Created `site/src/lib/utils.ts` as a minimal placeholder with an export stub and an inline rationale comment.

**Reason:** The plan's file structure is a contract; missing the file leaves an implied gap that could cause confusion for downstream plans that need to add shared helpers.

**Downstream impact:** Future plans that need shared site-level helpers should add them to `site/src/lib/utils.ts`.

### 2026-04-23 · Plan 02 Task 02 · config test `length` expectation corrected from 365 to 364

**What the plan said:** `expect(dates.length).toBe(365)` for the rolling-dates test with `window: 365`, `start: "2025-04-24"`, and `today = new Date('2026-04-23')`.

**What was done instead:** Changed the assertion to `expect(dates.length).toBe(364)`.

**Reason:** The date range `2025-04-24` to `2026-04-22` inclusive is 364 days, not 365. With `today = 2026-04-23`, yesterday = `2026-04-22`. The natural window start is `2026-04-22 - 364 = 2025-04-23`. The `start` floor `2025-04-24` is one day later, so `begin = 2025-04-24`. The resulting range is 364 dates. The plan's `expect(dates[0]).toBe('2025-04-24')` and `expect(dates[dates.length - 1]).toBe('2026-04-22')` are self-consistent with 364; the length assertion of 365 was an off-by-one error in the plan (window - floor_clamp = 365 - 1 = 364).

**Downstream impact:** None. The `resolveDates` implementation is unchanged. Any plan referencing this test should expect length 364 for this fixture.

### 2026-04-23 · Plan 02 Task 03 · tsconfig `types` entry changed from `bun-types` to `bun`

**What the plan said:** Plan 01 scaffolded `observatory/tsconfig.json` with `"types": ["bun-types"]`.

**What was done instead:** Changed to `"types": ["bun"]` which resolves to `node_modules/@types/bun`.

**Reason:** The `bun-types` package does not exist in the node_modules (Plan 01 installed `@types/bun` as the dev dependency). TypeScript's `types` array resolves entries via `@types/<name>`, so `"bun"` finds `@types/bun`. Using `"bun-types"` caused TS2688 ("cannot find type definition file for 'bun-types'").

**Downstream impact:** None. All downstream plans that reference the `types` array should use `"bun"` not `"bun-types"`.

### 2026-04-23 · Plan 02 Task 06 · staleness hashSource must also strip File-level comment/location fields

**What the plan said:** Use `traverse(ast, { enter(p) { delete n.loc; ... } })` to strip position and comment data from all AST nodes before hashing.

**What was done instead:** Added explicit stripping of the `File` root node's own fields (`comments`, `loc`, `start`, `end`) before the traverse call, because `@babel/traverse` does not visit the root `File` node itself. Also introduced a `STRIP_KEYS` set and a `stripNode()` helper to avoid duplicating the delete calls for both the root and the traverse callback.

**Reason:** Babel's `parse()` returns a `File` node that carries a top-level `comments` array containing all comment tokens. This array differs between `// a` and `/* hi */` even after traverse strips `leadingComments` from the `ExportNamedDeclaration` body node. Since `traverse` starts from the `File`'s children (not the `File` itself), the root's `comments`, `loc`, `start`, and `end` survived and caused the hash to differ between comment-only edits.

**Downstream impact:** None. The fix is internal to `hashSource`. The public contract (hash changes when code changes, stable across comment edits) is upheld.

### 2026-04-23 · Plan 02 Task 08 · pipeline.v2.yaml placed in observatory/ not repo root

**What the plan said:** Create `pipeline.v2.yaml` at the repo root and have `fetch.ts` default to loading it from there.

**What was done instead:** Created `pipeline.v2.yaml` at `observatory/pipeline.v2.yaml`. The default `configPath` in `parseArgs` remains `'pipeline.v2.yaml'` (a relative path), which resolves correctly when `bun run fetch` or `just fetch` is invoked with CWD set to `observatory/`. The Python pipeline at repo root continues reading `pipeline.yaml` unchanged.

**Reason:** When `bun run fetch` is executed from inside `observatory/` (as the task's dry-run mandates), the CWD is `observatory/`. A relative path `'pipeline.v2.yaml'` resolves to `observatory/pipeline.v2.yaml`. Placing it at the repo root and referencing it as `'../pipeline.v2.yaml'` would be brittle and break if invoked from a different CWD. Co-locating the config with the CLI is the natural structure for a self-contained package.

**Downstream impact:** Any `just` target or CI step that invokes the observatory fetch CLI must either `cd observatory` first or pass `--config <path>` explicitly. The task description's commit command stages `pipeline.v2.yaml` from the repo root; adjust the git add path to `observatory/pipeline.v2.yaml`.

### 2026-04-23 · Plan 02 Task 08 · argv parsing guarded for noUncheckedIndexedAccess

**What the plan said:** Use `argv[++i]` directly when consuming flag values in `parseArgs`.

**What was done instead:** Introduced a `nextArg(argv, i, flag)` helper that bounds-checks before returning `argv[i + 1]`, throwing a typed `Error` if the value is missing. All flag parsing calls `nextArg` instead of direct index access.

**Reason:** `tsconfig.json` has `"noUncheckedIndexedAccess": true`, which makes `argv[n]` return `string | undefined`. Assigning `string | undefined` to a `string` field fails typechecking. The helper narrows the type at one call site and gives a clear error message if a flag is passed without a value.

**Downstream impact:** None. The public CLI interface is unchanged.
