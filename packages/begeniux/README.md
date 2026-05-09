# begeniux

**Behaviorally-adaptive UI through LLM agents and the AG-UI protocol.**

Most generative UI today reacts to *prompts*. **BeGeniux reacts to behavioral traces** — clicks, scrolls, hovers, dwells — and re-renders the UI to match observed user behavior, in real time, at session granularity.

You wrap a region of UI in `<BeGenSurface>`, pass in a set of variant components and a `classify` function. The library handles behavior tracking, summarization, and variant swapping. Bring your own LLM — Gemini, Claude, OpenAI, a heuristic, anything that satisfies `ClassifyFn`.

> Our contribution is the combination of three ideas that have not been combined before: **interaction traces as the input modality** (not text prompts), **LLM agents as the policy** (not hand-coded rules or shallow classifiers), and **session-granularity adaptation** (not population-level A/B tests) — under developer-declared invariants that keep the policy honest.

---

## Install

```bash
npm install begeniux
```

Peer dependencies: `react@>=18`, `react-dom@>=18`. The library has zero runtime dependencies and works without CopilotKit, AG-UI, or any specific LLM SDK.

## Quick start

```tsx
import {
  BeGenProvider,
  BeGenSurface,
  createGeminiClassifier,
} from "begeniux";

const classify = createGeminiClassifier({
  apiKey: process.env.NEXT_PUBLIC_GEMINI_KEY!,
});

export default function App({ products }) {
  return (
    <BeGenProvider>
      <BeGenSurface
        variants={{
          decisive: DenseGrid,
          deliberate: DeliberateGrid,
          neutral: NeutralGrid,
        }}
        variantProps={{ products }}
        classify={classify}
        pageContext={{
          route: "/products",
          visible_product_ids: products.map((p) => p.id),
        }}
      />
    </BeGenProvider>
  );
}
```

That's the whole integration. The surface tracks behavior in its DOM region, calls `classify` on a debounce, and swaps the rendered variant component when the directive changes.

## API

| Export | What it does |
|---|---|
| `<BeGenProvider>` | Context provider for surface state. Required if you want to call `useBeGenContext()` from a child. |
| `<BeGenSurface>` | The main component. Tracks behavior, calls `classify`, renders the active variant. |
| `useBehaviorTracker(opts)` | Low-level hook for custom integrations — same engine the surface uses. |
| `useBeGenContext()` | Reads the current `variant`, `directive`, and `summary` from context. |
| `createGeminiClassifier(opts)` | Returns a `ClassifyFn` that calls Google's Gemini API directly. |
| `createHeuristicClassifier()` | Zero-dependency heuristic fallback. Useful for offline dev and demos. |
| `PERSONAS` | Pre-canned behavior traces (`decisive`, `deliberate`) for deterministic demos via `seedPersona`. |

Full type signatures live in [`src/types.ts`](./src/types.ts) — that file is the contract between the library and the consumer.

## The contract

Everything the consumer needs to know fits in one type:

```ts
type ClassifyFn = (summary: BehaviorSummary) => Promise<AgentDirective>;

type BehaviorSummary = {
  clicks_per_min: number;
  avg_dwell_ms: number;
  scroll_depth: number;        // 0–1
  hover_count: number;
  events_seen: number;         // saturates at 50
  page_context: { route: string; visible_product_ids: string[] };
};

type AgentDirective = {
  variant: "decisive" | "deliberate" | "neutral";
  confidence: number;          // 0–1
  reasoning: string;           // one-sentence English
};
```

Whatever you put behind `ClassifyFn` — Gemini, Claude, OpenAI, a CopilotKit/AG-UI route, a hand-tuned regex — it's the policy that decides which variant the user sees.

## Wiring AG-UI / CopilotKit

The library is intentionally agnostic to the agent backend. To route through CopilotKit/AG-UI, write a thin `ClassifyFn`:

```tsx
const classify: ClassifyFn = async (summary) => {
  const res = await fetch("/api/copilotkit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool: "classify_behavior", summary }),
  });
  return res.json();
};
```

Your route is responsible for invoking the agent and returning a JSON body that matches `AgentDirective`. The library never imports CopilotKit directly — keeping the package install-anywhere.

## Determinism for demos

Pass `seedPersona="decisive"` or `seedPersona="deliberate"` to `<BeGenSurface>` and the surface will pre-seed its tracker with a canned trace. Within a couple of seconds of mount you'll get a stable directive — useful for split-screen demos, screenshots, and judges.

```tsx
<BeGenSurface
  variants={variants}
  classify={classify}
  pageContext={pageContext}
  seedPersona="decisive"
/>
```

The traces live in [`src/personas.ts`](./src/personas.ts) — feel free to tune them.

## Reading state from children

Wrap with `<BeGenProvider>` (or place provider above the surface) and call `useBeGenContext()`:

```tsx
function TelemetryStrip() {
  const { variant, directive, summary } = useBeGenContext();
  return (
    <div>
      Mode: {variant}
      {directive && ` · ${directive.reasoning}`}
      {summary && ` · ${summary.events_seen} events`}
    </div>
  );
}
```

Nice for debugging, demo overlays, or analytics.

## Local development

```bash
git clone <this repo>
cd packages/begeniux
npm install
npm run build           # one-shot build to dist/
npm run dev             # tsup --watch

cd examples/basic
npm install
npm run dev             # http://localhost:5180
```

The example imports from `../../src/index.ts` via a Vite alias, so source changes hot-reload. Two seeded surfaces render side-by-side using the heuristic classifier — no API keys required.

## Research lineages

This library combines four threads of prior work that have rarely been combined in production UI:

- **Adaptive User Interfaces** — Gajos & Weld, *SUPPLE: Automatically Generating User Interfaces* (IUI 2004).
- **Contextual bandits** — Li et al., *A Contextual-Bandit Approach to Personalized News Article Recommendation* (WWW 2010).
- **Implicit feedback / behavior modeling** — Joachims et al., *Accurately Interpreting Clickthrough Data as Implicit Feedback* (SIGIR 2005).
- **In-context learning as policy** — Brown et al., *Language Models are Few-Shot Learners* (NeurIPS 2020).

The novel contribution is the combination: behavioral traces as input, LLM agents as policy, session-granularity adaptation, with developer-declared invariants.

## Roadmap

- Multi-armed bandit policies (Thompson sampling) for variant selection.
- **Invariant DSL** — declare UI properties that must hold across variants (e.g., "cancel button always reachable", "checkout step never re-ordered").
- Behavior embeddings for open-ended UI generation beyond a fixed variant set.
- Eval harness with replay traces and counterfactual scoring.
- First-class adapters for CopilotKit, LangGraph, Mastra, and the Anthropic SDK.

## Contributing

PRs welcome. Keep the public surface small — anything not exported from `src/index.ts` is private. Don't bundle React; don't add heavy dependencies; don't assume Next.js. The library should drop into Vite, CRA, Remix, Next, or anywhere React 18+ runs.

## License

MIT — see [LICENSE](./LICENSE).
