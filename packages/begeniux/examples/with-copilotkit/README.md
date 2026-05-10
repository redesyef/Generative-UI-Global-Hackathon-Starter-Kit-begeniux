# Canonical wiring: begeniux + CopilotKit + LangGraph

This example shows the canonical end-to-end integration:

```
┌──────────────────────────────────────────────────────────┐
│  Your React app                                          │
│   <CopilotKitProvider runtimeUrl="/api/copilotkit">      │
│     <BeGenProvider designSystem={...}>                   │
│       <CopilotKitAdapter />   ← registers the tool       │
│       <App />                                             │
│     </BeGenProvider>                                      │
│   </CopilotKitProvider>                                   │
└─────────────────────────────────┬────────────────────────┘
                                  │ CopilotKit SSE / AG-UI
                                  ▼
                         /api/copilotkit  →  Hono BFF
                                              │
                                              ▼
                                    LangGraph (Gemini / Claude)
                                    • reads behavior summary
                                    • reasons over design system
                                    • calls apply_adaptations(plan)
```

It's not a runnable Vite project because it needs the full hackathon stack
(CopilotKit Runtime + LangGraph). Drop these snippets into a project that
already has all three.

## 1. React side

```tsx
"use client";

import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { BeGenProvider, type DesignSystem } from "begeniux";
import { CopilotKitAdapter } from "begeniux/copilotkit";

const designSystem: DesignSystem = {
  cssVariables: {
    "--accent": {
      description: "Primary action color",
      type: "color",
      defaultValue: "#7c3aed",
    },
    "--density": {
      description: "Layout density (smaller = compact, larger = spacious)",
      type: "length",
      defaultValue: "16px",
    },
  },
  classes: {
    "is-engaged": "Visual treatment for high-engagement state",
    "is-skimming": "Visual treatment for low-engagement state",
  },
};

export default function App() {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit">
      <BeGenProvider
        designSystem={designSystem}
        pageContext={{ route: "/" }}
        rateLimitMs={5000}
        triggerEveryEvents={5}
      >
        <CopilotKitAdapter />
        <YourApp />
      </BeGenProvider>
    </CopilotKitProvider>
  );
}
```

That's it. The adapter registers an `apply_adaptations` frontend tool. The
agent — whatever shape your LangGraph is — calls it whenever it decides the
UI should change.

## 2. LangGraph side (Python)

The agent needs to *see* the behavior summary and the design system so it
can decide adaptations. With CopilotKit's standard middleware, expose them
via agent state and prompt the agent to consider them.

```python
# langgraph-node.py
from typing import Any
from langchain_core.messages import SystemMessage
from langchain.agents import create_agent

ADAPTIVE_UI_INSTRUCTIONS = """
You are an adaptive UI agent. The user is interacting with a React app
that exposes a `apply_adaptations` tool. Whenever you observe behavior
that suggests a UI change would help (frustration, fast browsing,
deliberate research, accessibility gaps), call `apply_adaptations`
with a plan that uses ONLY:

  - CSS variables declared in the design system
  - Class names declared in the design system

Selectors should be stable: prefer `:root`, `[data-begen-id="..."]`,
`#id`, semantic tags, role attributes — avoid utility class soup.

Each plan replaces the previous one (the engine reverts before applying),
so emit a complete picture, not deltas.

Set confidence < 0.4 if you're unsure — the engine will skip low-confidence
or empty plans.
"""

def build_adaptive_agent(model, frontend_tools: list[Any]):
    return create_agent(
        model=model,
        tools=frontend_tools,
        system_prompt=ADAPTIVE_UI_INSTRUCTIONS,
    )
```

The `frontend_tools` arrive automatically via `CopilotKitMiddleware` —
your Python code doesn't need to know that `apply_adaptations` exists by
name. It's just one of the tools the agent can call.

## 3. Wire the agent into CopilotKit Runtime

In your BFF (or wherever you stand up the CopilotKit runtime):

```ts
import {
  CopilotRuntime,
  createCopilotEndpoint,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@ag-ui/langgraph";

const runtime = new CopilotRuntime({
  agents: {
    default: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_URL ?? "http://localhost:8123",
      graphId: "default",
    }),
  },
});

export const app = createCopilotEndpoint({
  runtime,
  basePath: "/api/copilotkit",
});
```

## 4. What you get

- The user clicks, scrolls, dwells → behavior tracker accumulates events
- Provider rate-limits and forwards the summary into agent state
- Agent (when it runs) sees the summary and design system, decides adaptations
- Tool call lands in the browser → AdaptationEngine applies → DOM mutates
- Next plan cleanly reverts the previous one (no stale mutations stacking up)

## 5. Where to look in this monorepo

If you cloned the begeniux source repo (where this README lives), the
hackathon starter kit at `apps/` already wires CopilotKit + Hono BFF +
LangGraph. The library at `packages/begeniux/` integrates with that stack
via the CopilotKit adapter. To smoke-test:

```bash
# in monorepo root
npm run dev:full   # 3010 frontend, 4010 BFF, 8133 LangGraph, 3011 MCP
```

Drop `<BeGenProvider>` + `<CopilotKitAdapter />` into any client component
under `apps/frontend/src/app/leads/` and ask the agent to "make the page
more compact" — it should call `apply_adaptations` and the CSS variables
on `:root` will update in real time.
