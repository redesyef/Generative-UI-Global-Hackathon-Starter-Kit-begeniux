// Components
export { BeGenProvider } from "./BeGenProvider";
export { BeGenSurface } from "./BeGenSurface";

// Hooks
export { useBehaviorTracker } from "./useBehaviorTracker";
export { useBeGenContext } from "./useBeGenContext";

// Classifier helpers
export { createGeminiClassifier } from "./classifier/gemini";
export { createHeuristicClassifier } from "./classifier/heuristic";

// Persona trace presets
export { PERSONAS } from "./personas";

// Types
export type {
  BehaviorEvent,
  BehaviorSummary,
  Variant,
  AgentDirective,
  ClassifyFn,
} from "./types";
export type { BeGenSurfaceProps } from "./BeGenSurface";
export type { BeGenContextValue } from "./BeGenProvider";
export type { CreateGeminiClassifierOpts } from "./classifier/gemini";
export type { UseBehaviorTrackerOpts } from "./useBehaviorTracker";
