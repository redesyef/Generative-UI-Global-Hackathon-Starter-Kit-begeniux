# begeniux

**Drop-in adaptive UI engine. Tracks user behavior, asks an agent for a CSS-level adaptation plan, mutates the live DOM in real time.**

Today's UX cycle is slow: research → mock → ship → iterate. begeniux short-circuits it: install the library on an existing app, the agent observes how each user actually behaves, and the UI re-shapes itself live to match — accent colors, density, emphasis, microcopy. No variants pre-baked. No design committee. Personalization happens *during the session*.

```bash
npm install begeniux
```

```tsx
<CopilotKitProvider runtimeUrl="/api/copilotkit">
  <BeGenProvider designSystem={designSystem} pageContext={{ route: "/" }}>
    <CopilotKitAdapter />
    <App />              {/* unmodified existing app */}
  </BeGenProvider>
</CopilotKitProvider>
```

That's the whole integration. The library tracks behavior universally, hands a behavior summary + your design system + a DOM snapshot to your LangGraph (or any) agent, and applies the agent's `apply_adaptations` tool calls to the live DOM with full reversibility.

---

## Why this exists

```mermaid
flowchart LR
  subgraph Trad["Today's generative UI"]
    direction LR
    P["💬 Prompt"] --> M1["LLM"] --> U1["Generated UI"]
  end
  subgraph Be["BeGeniux"]
    direction LR
    B["🖱️ Behavioral trace<br/>clicks · dwell · scroll · hover<br/>focus · input · errors · rage clicks"] --> M2["Agent<br/>(your LangGraph)"] --> U2["Live DOM mutation<br/>session-granular"]
  end
  Trad ~~~ Be
```

> Most generative UI today reacts to *prompts*. begeniux reacts to *behavioral traces*. The contribution is the combination: **interaction traces as the input modality**, **LLM agents as the policy** (not hand-coded rules), **session-granularity adaptation** (not population A/B tests), and **mutation of the existing UI** (not replacement of pre-built variants) — under developer-declared design-system invariants that keep the agent honest.

The first three are 2024+ technology that finally make 30 years of adaptive UI research tractable. The fourth is what makes it *drop-in*.

---

## How it works

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant T as Behavior tracker
  participant P as BeGenProvider
  participant A as Agent (your LangGraph)
  participant E as AdaptationEngine
  participant D as Live DOM

  U->>T: clicks · scrolls · hovers · dwells · focuses · inputs · errors
  Note over T: Ring buffer · 12 event kinds · plug-in extension API
  T->>T: every N events / M ms → BehaviorSummary
  T->>P: summary
  P->>P: rate-limit gate (≥5s default) + change detection
  P->>A: { summary, designSystem, dom: visibleSelectors }
  Note over A: Agent reasons over signal,<br/>your design system tokens,<br/>and what's visible on the page
  A-->>E: apply_adaptations(plan)
  Note over E: Validates against scope.allow / deny.<br/>Reverts previous plan first.<br/>Tracks every mutation for clean rollback.
  E->>D: set CSS var · add class · set style · set attribute
  D->>U: UI shifts in real time
```

Three things keep this honest:

1. **Listeners scoped to the provider's container** (default `document.body`). Universal coverage, opt-in narrower scope via `containerRef`.
2. **CSS-only mutations.** No `display`, no `position`, no structural reshuffles in v0.2 — the engine refuses them. Layout cannot break.
3. **Plan-level reversibility.** Every new plan reverts the previous one before applying. Mutations never accumulate. Provider unmount restores the page completely.

---

## Where it fits in your stack

```mermaid
flowchart TB
  subgraph YourApp["Your application (drop-in)"]
    Page["Pages / Components"]
    Provider["BeGenProvider"]
    Adapter["CopilotKitAdapter<br/>(or HTTP adapter)"]
    Page --> Provider
    Provider -.contains.-> Tracker["useBehaviorTracker"]
    Provider -.contains.-> Engine["AdaptationEngine"]
    Provider -.contains.-> Snapshot["domSnapshot"]
    Adapter --> Provider
  end

  subgraph Stack["Agent layer (your choice)"]
    direction TB
    CK["CopilotKit Runtime<br/>+ LangGraph"]
    HTTP["Custom HTTP route<br/>(any framework)"]
    Other["Anything that satisfies<br/>ClassifyFn"]
  end

  Adapter -.canonical.-> CK
  Adapter -.escape hatch.-> HTTP
  Adapter -.also fine.-> Other
```

The library has **zero opinions** about your agent backend. CopilotKit + LangGraph + Gemini is the canonical hackathon stack and the easiest path; the HTTP adapter and the `useBehaviorTracker` / `AdaptationEngine` escape hatches let you wire anything else.

Peer-deps: `react`, `react-dom` (>=18). `@copilotkit/react-core` and `zod` are **optional** peers, only needed if you import the CopilotKit adapter.

---

## The contract

Three types are the entire boundary between your code and the library:

```ts
type ClassifyFn<TContext = { route: string }> =
  (input: AdaptInput<TContext>) => Promise<AdaptationPlan>;

type AdaptInput<TContext> = {
  summary: BehaviorSummary<TContext>;     // 12 event kinds, aggregated
  designSystem: DesignSystem;             // your vocabulary (CSS vars + classes)
  dom: { visibleSelectors: string[]; route: string };  // what's on screen
};

type AdaptationPlan = {
  adaptations: Adaptation[];
  confidence: number;     // 0..1; engine skips below threshold
  reasoning: string;
};

type Adaptation =
  | { kind: "set-css-var"; selector: string; name: string; value: string }
  | { kind: "add-class"; selector: string; className: string }
  | { kind: "remove-class"; selector: string; className: string }
  | { kind: "set-style"; selector: string; property: string; value: string }
  | { kind: "set-attribute"; selector: string; name: string; value: string }
  | { kind: "set-aria-label"; selector: string; value: string };
```

The full type contract — including `BehaviorSummary`, `DesignSystem`, `BeGenProviderProps` — lives in [`src/types.ts`](./src/types.ts).

---

## Quick start (CopilotKit + LangGraph)

The canonical wiring. See [`examples/with-copilotkit/`](./examples/with-copilotkit/README.md) for the full snippet, including the LangGraph node side.

```tsx
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { BeGenProvider, type DesignSystem } from "begeniux";
import { CopilotKitAdapter } from "begeniux/copilotkit";

const designSystem: DesignSystem = {
  cssVariables: {
    "--accent": { description: "Action color", type: "color", defaultValue: "#7c3aed" },
    "--density": { description: "Layout density", type: "length", defaultValue: "16px" },
  },
  classes: {
    "is-engaged": "High-engagement treatment",
    "is-skimming": "Low-engagement treatment",
  },
};

export default function App() {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit">
      <BeGenProvider designSystem={designSystem} pageContext={{ route: "/" }}>
        <CopilotKitAdapter />
        <YourApp />
      </BeGenProvider>
    </CopilotKitProvider>
  );
}
```

The agent gets a frontend tool called `apply_adaptations`. Whenever it decides the UI should change, it calls the tool — begeniux applies the plan, the DOM shifts, the user sees a different UI without a reload.

---

## Quick start (HTTP — any backend)

Don't use CopilotKit? Wire any HTTP endpoint:

```tsx
import { BeGenProvider, createHttpAdapter } from "begeniux";

const classify = createHttpAdapter({
  url: "/api/begen/adapt",   // your endpoint
  // POST { summary, designSystem, dom } → { adaptations, confidence, reasoning }
});

<BeGenProvider designSystem={designSystem} pageContext={{ route: "/" }} classify={classify}>
  <YourApp />
</BeGenProvider>
```

Your endpoint can call Gemini, Claude, OpenAI, a Python service, anything. You shape the response into `AdaptationPlan` and the library handles the rest.

---

## Quick start (no agent — heuristic / offline / demo)

Pass a function inline. No network, no LLM. Useful for demos, tests, offline dev:

```tsx
const classify: ClassifyFn = async ({ summary }) => {
  const engaged = summary.clicks_per_min > 6;
  return {
    adaptations: [
      {
        kind: "set-css-var",
        selector: ":root",
        name: "--accent",
        value: engaged ? "#dc2626" : "#2563eb",
      },
    ],
    confidence: 0.8,
    reasoning: engaged ? "Fast pace" : "Calm pace",
  };
};
```

See [`examples/basic/`](./examples/basic/) for a complete runnable demo using this pattern.

---

## Reading state from children

```tsx
import { useBeGenContext } from "begeniux";

function Telemetry() {
  const { summary, lastPlan, appliedAdaptations } = useBeGenContext();
  return (
    <pre>
      events: {summary?.events_seen} ·
      clicks/min: {summary?.clicks_per_min} ·
      reasoning: {lastPlan?.reasoning} ·
      mutations: {appliedAdaptations.length}
    </pre>
  );
}
```

Use it for debug overlays, telemetry strips, analytics pipelines, or to make components react to the agent's reasoning.

---

## API surface

| Export | What it does |
|---|---|
| Export | Where | What it does |
|---|---|---|
| `<BeGenProvider>` | `begeniux` | The provider. Tracks behavior, holds the engine, gates triggers, runs `classify`, exposes context. Drop-in. |
| `useBeGenContext()` | `begeniux` | Read the latest summary, last plan, applied adaptations, plus an `applyPlan(plan)` escape hatch. |
| `createHttpAdapter(opts)` | `begeniux` | Returns a `ClassifyFn` that posts the `AdaptInput` to your URL. Generic transport. |
| `useBehaviorTracker(opts)` | `begeniux` | Low-level hook used by the provider. Reach for it if you need a tracker outside a provider context. |
| `AdaptationEngine` | `begeniux` | Low-level class. Apply, revert, query mutations directly if you don't want a provider at all. |
| `snapshotVisibleSelectors(root, opts)` | `begeniux` | Returns a list of stable CSS selectors visible in the viewport. Useful when building your own classify fn. |
| `<CopilotKitAdapter />` | `begeniux/copilotkit` | Mount inside `<BeGenProvider>` to register `apply_adaptations` as a CopilotKit frontend tool. |
| `useCopilotKitAdapter(opts)` | `begeniux/copilotkit` | Hook variant of `<CopilotKitAdapter />`. |

The `/copilotkit` subpath is split out so consumers who don't use CopilotKit don't pull `@copilotkit/react-core` (and its transitive deps like KaTeX) into their bundle.

All exports are documented in [`src/index.ts`](./src/index.ts).

---

## What goes in the design system

The design system is the **vocabulary the agent is allowed to speak**. Two tiers:

```ts
const designSystem: DesignSystem = {
  cssVariables: {
    "--accent": { description: "Action color", type: "color", defaultValue: "#7c3aed" },
    "--density": { description: "Layout density", type: "length", defaultValue: "16px" },
    "--font-scale": {
      description: "Font multiplier",
      type: "number",
      range: [0.8, 1.4],
      defaultValue: "1",
    },
    "--surface-emphasis": {
      description: "Which surface gets visual emphasis",
      type: "enum",
      values: ["price", "reviews", "imagery", "specs"],
      defaultValue: "price",
    },
  },
  classes: {
    "is-engaged": "Visual treatment for engaged users",
    "is-skimming": "Visual treatment for low-engagement",
    "is-cta-prominent": "Boost CTA emphasis",
  },
  examples: [
    {
      adaptations: [
        { kind: "set-css-var", selector: ":root", name: "--density", value: "10px" },
      ],
      confidence: 0.85,
      reasoning: "Compact dense view for engaged user.",
    },
  ],
};
```

The agent receives this manifest as part of every `AdaptInput`, so it knows exactly which knobs are turnable and what each means. **Anything not declared here is invisible to the agent.** That's your safety net.

---

## Safety + scope

By default the provider tracks behavior on `document.body` and the agent can target any selector under it. You can narrow:

```tsx
<BeGenProvider
  designSystem={designSystem}
  pageContext={{ route: "/" }}
  scope={{
    allow: ["[data-begen-adapt]", ".product-card", ":root"],
    deny: ["[data-checkout]", ".payment-form"],
  }}
>
```

`scope.deny` is a hard veto — the engine refuses any adaptation whose selector matches a deny pattern. Use it to protect critical paths.

CSS-only invariants in v0.2:

- The engine refuses `set-style` for `display`, `position`, `visibility`, `float`, `clear`, `z-index`, `overflow*`, `transform-origin`. Use CSS variables and classes instead.
- The engine reverts every previous plan before applying a new one — mutations never accumulate.
- On unmount, every applied mutation is reverted. The page is restored.
- Identical consecutive plans are skipped (cheap deterministic hash).
- Empty plans are no-ops.

---

## Local development

```bash
git clone https://github.com/WagnerAgent/BeGeniux
cd BeGeniux
npm install
npm run build              # one-shot build → dist/
npm run dev                # tsup --watch

# Smoke test
cd examples/basic
npm install
npm run dev                # http://localhost:5180
```

The example imports from `../../src/index.ts` via a Vite alias, so source changes hot-reload. No CopilotKit / LangGraph / API keys needed — the example uses an inline mock classifier.

---

## Migrating from v0.1

v0.1 was a variant-picker — you handed the library `{decisive, deliberate, neutral}` components and an LLM picked one. v0.2 deletes that model entirely:

- `BeGenSurface` → removed. `BeGenProvider` is now the entire library entrypoint.
- `Variant` / `AgentDirective` → removed. `AdaptationPlan` is what the agent returns.
- `createGeminiClassifier` → removed. Browser-side LLM calls were the wrong shape; use the CopilotKit adapter or a server-side HTTP endpoint.
- `createHeuristicClassifier` → removed. It's a 5-line `ClassifyFn` if you still want one.
- `PERSONAS` → removed. `seedTrace` on the provider takes any `BehaviorEvent[]`; bring your own.

If you've already integrated v0.1, stay on v0.1.x — it's still on npm. Upgrade to v0.2 when you're ready to switch from variant-picking to live adaptation.

---

## Research lineages

- **Adaptive UIs** — Gajos & Weld, *SUPPLE: Automatically Generating User Interfaces* (IUI 2004)
- **Contextual bandits** — Li et al., *A Contextual-Bandit Approach to Personalized News Article Recommendation* (WWW 2010)
- **Implicit feedback** — Joachims et al., *Accurately Interpreting Clickthrough Data as Implicit Feedback* (SIGIR 2005)
- **In-context learning as policy** — Brown et al., *Language Models are Few-Shot Learners* (NeurIPS 2020)

The novel contribution is the combination: behavioral traces as input, LLM agents as policy, session-granularity adaptation, **live DOM mutation** as output, with developer-declared design-system invariants.

---

## Roadmap

- **v0.3** — Tool-calling agent loop (agent inspects DOM iteratively); structural mutations (insert, reorder, hide/show under invariant constraints); streaming AdaptationPlan events.
- **v0.4** — Component replacement primitive; an invariant DSL ("checkout always reachable in ≤2 clicks"); replay traces + counterfactual scoring.
- **v0.5** — Cross-session memory (with explicit consent); behavioral embeddings; multi-armed bandit policies as a non-LLM fallback.

---

## Contributing

PRs welcome. Keep the public API minimal — anything not exported from `src/index.ts` is internal. Don't bundle React or CopilotKit. Don't assume Next.js. The library should drop into Vite, CRA, Remix, Next, or anywhere React 18+ runs.

If you're working in this repo with Claude Code (or another agent), the [`.claude/skills/`](./.claude/) directory has prebaked domain knowledge about CopilotKit, AG-UI, MCP, and LangGraph integrations — read the relevant `SKILL.md` before touching adapter code.

## License

MIT — see [LICENSE](./LICENSE).
