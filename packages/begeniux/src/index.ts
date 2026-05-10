// ─── Provider + hooks (high-level API) ──────────────────────────────
export { BeGenProvider, useBeGenContext } from "./BeGenProvider";
export type { BeGenProviderProps } from "./BeGenProvider";

// ─── Low-level escape hatches ───────────────────────────────────────
export { useBehaviorTracker } from "./useBehaviorTracker";
export type { UseBehaviorTrackerOpts } from "./useBehaviorTracker";

export { AdaptationEngine } from "./AdaptationEngine";
export type {
  AdaptationEngineEvent,
  AdaptationEngineOpts,
} from "./AdaptationEngine";

export { snapshotVisibleSelectors } from "./domSnapshot";
export type { DomSnapshotOpts } from "./domSnapshot";

// ─── Adapters (transport layer) ─────────────────────────────────────
// HTTP adapter is dependency-free, lives in main entry.
// CopilotKit adapter lives in subpath "begeniux/copilotkit" so consumers
// who don't use CopilotKit pay zero bundle cost.
export { createHttpAdapter } from "./adapters/http";
export type { HttpAdapterOpts } from "./adapters/http";

// ─── Types (the contract) ───────────────────────────────────────────
export type {
  Adaptation,
  AdaptationPlan,
  AdaptInput,
  BehaviorEvent,
  BehaviorListener,
  BehaviorSummary,
  BeGenContextValue,
  ClassifyFn,
  CssVariableSpec,
  DesignSystem,
  ScopeOpts,
} from "./types";
