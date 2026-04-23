# ERRATA

This file records known gaps, deferred items, and intentional deviations from the plan.

## Plan 06, Task 10: cmd-k palette

### Shift+Enter and Alt+Enter not wired

The plan notes that Shift+Enter (split below) and Alt+Enter (split right) require custom
keydown handling on CommandInput. This was not implemented. Only the default Enter action
(replace chart in focused pane) is wired via `CommandItem.onSelect`.

Deferred until a follow-up task adds keydown interception to the palette.

### ufuzzy type shim not needed

The plan anticipated that `@leeoniya/ufuzzy` might lack bundled types and suggested using
`@ts-expect-error` or a `declare module` shim. The package ships types at
`dist/uFuzzy.d.ts`, so no shim was required.
