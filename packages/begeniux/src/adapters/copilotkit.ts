// CopilotKit v2 adapter for begeniux.
//
// Pattern:
//   <CopilotKitProvider runtimeUrl="/api/copilotkit">
//     <BeGenProvider designSystem={...} pageContext={...}>
//       <CopilotKitAdapter />     // mount once, anywhere inside both providers
//       <App />
//     </BeGenProvider>
//   </CopilotKitProvider>
//
// What it does:
//   1. Registers `apply_adaptations` as a frontend tool. The agent calls this
//      tool with an AdaptationPlan; we route the plan into the provider's
//      AdaptationEngine which mutates the live DOM with full reversibility.
//
// Why a component, not a function: CopilotKit hooks (`useFrontendTool`) must
// run inside a React render. Wrapping in `<CopilotKitAdapter />` keeps the
// integration declarative.
//
// Peer-deps: `@copilotkit/react-core@>=2.0.0` and `zod@>=3` must be installed
// by the consumer. Without them, importing this module throws at runtime; the
// rest of begeniux (HTTP adapter, manual engine) still works.

import * as React from "react";
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { useBeGenContext } from "../BeGenProvider";
import type { AdaptationPlan } from "../types";

// ─── Zod schemas mirroring src/types.ts ─────────────────────────────

const adaptationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("set-css-var"),
    selector: z.string(),
    name: z.string(),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("add-class"),
    selector: z.string(),
    className: z.string(),
  }),
  z.object({
    kind: z.literal("remove-class"),
    selector: z.string(),
    className: z.string(),
  }),
  z.object({
    kind: z.literal("set-style"),
    selector: z.string(),
    property: z.string(),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("set-attribute"),
    selector: z.string(),
    name: z.string(),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("set-aria-label"),
    selector: z.string(),
    value: z.string(),
  }),
]);

const adaptationPlanSchema = z.object({
  adaptations: z.array(adaptationSchema),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  meta: z.record(z.unknown()).optional(),
});

// ─── Public API ─────────────────────────────────────────────────────

export type CopilotKitAdapterOpts = {
  /** Override the tool name registered with the agent. Default: "apply_adaptations". */
  toolName?: string;
  /** Override the tool description shown to the agent. Default: see source. */
  toolDescription?: string;
};

const DEFAULT_DESCRIPTION = `Apply CSS-only UI adaptations to the live page. Use this whenever you decide that the user would benefit from a UI change based on their behavior, current page state, and the design system the host app has declared.

Each adaptation is one of:
- set-css-var: change a CSS custom property on a target element
- add-class / remove-class: toggle a class on a target element
- set-style: set a single CSS declaration (no display/position/visibility/float/clear/z-index/overflow — those are denied for safety)
- set-attribute / set-aria-label: change an attribute, often for accessibility

You should:
- Use the design system manifest to know which CSS variables and classes are valid
- Target stable selectors (id, [data-begen-id], [data-testid], semantic tags) — avoid utility class soup
- Justify the plan in the reasoning field (one sentence)
- Set confidence ∈ [0,1]; below 0.4 means "not sure, prefer no change"`;

/**
 * React component that registers begeniux's `apply_adaptations` frontend tool
 * with CopilotKit. Mount once inside <BeGenProvider> and <CopilotKitProvider>.
 */
export function CopilotKitAdapter(
  props: CopilotKitAdapterOpts = {},
): React.ReactElement | null {
  useCopilotKitAdapter(props);
  return null;
}

/**
 * Hook variant of CopilotKitAdapter — call from your own component if you
 * want to add custom behavior alongside the registration.
 */
export function useCopilotKitAdapter(opts: CopilotKitAdapterOpts = {}): void {
  const { toolName = "apply_adaptations", toolDescription = DEFAULT_DESCRIPTION } = opts;
  const { applyPlan } = useBeGenContext();

  useFrontendTool({
    name: toolName,
    description: toolDescription,
    parameters: adaptationPlanSchema,
    handler: async (plan: AdaptationPlan) => {
      try {
        applyPlan(plan);
        return `Applied ${plan.adaptations.length} adaptation${
          plan.adaptations.length === 1 ? "" : "s"
        }. Reasoning: ${plan.reasoning}`;
      } catch (err) {
        return `Adaptation engine error: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });
}
