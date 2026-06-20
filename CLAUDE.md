# CLAUDE.md

Guidance for AI agents working in this repository. Keep it current when architecture or
conventions change.

## What this is

A client-only React + TypeScript (Vite) app: the **Azure OpenAI Budget Estimator**. It
converts real prompt/message samples into an annual Azure OpenAI token + cost estimate.
There is no backend — all computation runs in the browser.

## Commands

- `bun run dev` — dev server (Vite, usually `http://localhost:5173`)
- `bun run test` — run Vitest once (use this to verify changes)
- `bun run test:watch` — watch mode
- `bun run build` — `tsc -b` type-check + production build
- `bun run lint` — ESLint

`npm run …` works too. Prefer `bun` (a `bun.lock` is committed). Always run
`bun run test` and `bun run lint` after changing anything in `src/lib/` or `src/flow/`.
Note: `bun run build` currently fails on a pre-existing `@types/node` issue in
`messageTokenCalculation.test.ts` (unrelated to app code) — use `bun run test` +
`bunx tsc --noEmit -p tsconfig.app.json` to verify the app type-checks.

## Architecture

The domain logic lives in `src/lib/` as small, pure, individually tested modules. Data
flows in one direction:

```
samples (text/JSON)
  └─ tokenization.ts        count tokens via js-tiktoken (o200k_base)
  └─ sampleText.ts          parse messages → per-message token averages
       └─ conversationWorkflow.ts   combineFlowStages: fold an ordered stage list → tokens/conversation
            └─ calculator.ts        scale across engagement distribution → annual cost
```

Supporting data: `models.ts` (Azure prices), `distributions.ts` (user-engagement
presets), `frequency.ts` (per-day/week/month/year → annual), `types.ts` (shared types).

The UI is split into three layers, none of which live in `App.tsx` anymore:

- `src/lib/` — pure, tested domain (no React). The flow engine is `combineFlowStages`.
- `src/flow/` — the flow-designer model (plain TS): `stageCatalog.ts` (the stage palette
  — icons, knobs, sample slots), `flowModel.ts` (flow/stage types, presets, `deriveFlow`,
  `toWorkload`), and `useFlows.ts` (the hook owning flows state + every handler, returned
  as a `FlowActions` bundle).
- `src/components/` — one component per card (`CoreAssumptionsCard`,
  `EngagementDistributionCard` + `DistributionSparkline`, `WorkflowDefinitionsCard` →
  `FlowCard` → `StageBlock`, `ResultsPanel`). `App.tsx` is now a ~140-line orchestrator:
  it owns the top-level assumptions state, calls `useFlows()`, and composes the cards.
  `src/format.ts` holds the shared Intl formatters.

A **flow is an ordered list of stages** (`opening | gate | answerJudge | call`). The engine
folds over them tracking a running *reach probability* — a `gate` multiplies it, the rest
pass it through. The two presets (`[gate, answerJudge]`, `[opening, gate, answerJudge]`)
are just default stage lists and reproduce the old fixed-pipeline numbers exactly
(equivalence tests in `conversationWorkflow.test.ts` enforce this).

## Conventions (match the existing code)

- **Pure functions, dependency-injected token counter.** `sampleText.ts` and
  `conversationWorkflow.ts` take `countTokens` as a parameter rather than importing it.
  Keep it that way — tests pass a `text.length` stub for determinism; only the real
  encoder tests in `messageTokenCalculation.test.ts` import the actual tokenizer.
- **Validate inputs at the boundary.** Functions throw `Error` with human-readable
  messages for invalid rates/counts (see `assertRate`, `assertNonNegativeFinite`,
  `assertDistributionIsValid`). The `useFlows` hook surfaces those messages as flow feedback.
- **No comments unless they explain non-obvious math.** The codebase is intentionally
  comment-light; existing comments are reserved for formulas and modeling assumptions.
- **TypeScript is strict** (`verbatimModuleSyntax`, `noUnusedLocals`,
  `erasableSyntaxOnly`). Use `import type` for type-only imports and `.ts`/`.tsx`
  extensions are allowed in imports.
- **Functional style**: `const` arrow functions, immutable updates (`map`/`reduce`/
  spread), no classes.
- Tests are colocated as `*.test.ts` next to the module, using Vitest
  (`describe`/`it`/`expect`).

## Things that are easy to get wrong

- **Encoding is hardcoded.** `tokenization.ts` always uses `o200k_base`. That is correct
  for every current OpenAI model (GPT-4o → GPT-5, o1/o3/o4), but it is **not** model-aware
  — non-OpenAI models would be approximate. Don't assume a per-model lookup exists.
- **The retry model is a truncated geometric**, not a simple multiply:
  `E[attempts] = (1 − (1 − passRate)^maxAttempts) / passRate`. Don't "simplify" it.
- **Input tokens are an upper bound by design** — the flow-level shared user message is
  recounted on every gate/answer/judge call; cached-input pricing is intentionally
  excluded. Prompt sample fields are template-only (the message is added separately), so
  don't fold the message into them. Preserve this unless explicitly asked to model caching.
- **A global API-reliability overhead** (`apiInputOverheadFrom`) multiplies **input tokens
  only** by a truncated-geometric retry factor for transport-level failures. Default 99% /
  3 attempts ≈ 1.01×. Don't apply it to output (failed calls rarely bill for output).
- **The legacy fixed-pipeline engine is intentionally retained.** `combineWorkflowTokens` /
  `summarizeFlowAverages` / `estimateConversationWorkflow` are no longer used by the app but
  are kept as the tested reference that the `combineFlowStages` equivalence tests check
  against. Don't delete them without removing those tests.
- **Demo `samples/` files are tested.** `messageTokenCalculation.test.ts` loads them and
  asserts parsed entry counts. If you edit a file in `samples/`, update that test.
- Engagement-distribution `share` values must sum to 1 (enforced at runtime); user
  allocation uses a largest-remainder method to stay integer-exact.

## Docs to keep in sync

- `README.md` — user-facing overview and modeling assumptions.
- `docs/tutorial.html` + `docs/img/` — visual walkthrough and screenshots. If the UI
  layout changes materially, the screenshots are stale.
- `samples/README.md` — field-to-file mapping for the demo files.
