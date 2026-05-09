import type { ClassifyFn } from "../types";

export function createHeuristicClassifier(): ClassifyFn {
  return async (summary) => {
    if (summary.events_seen < 10) {
      return {
        variant: "neutral",
        confidence: 0.5,
        reasoning: "Insufficient events.",
      };
    }
    if (summary.clicks_per_min > 8 && summary.avg_dwell_ms < 2000) {
      return {
        variant: "decisive",
        confidence: 0.8,
        reasoning: "Fast pace, low dwell.",
      };
    }
    if (summary.avg_dwell_ms > 4000 && summary.hover_count > 2) {
      return {
        variant: "deliberate",
        confidence: 0.8,
        reasoning: "Slow pace, multi-hover.",
      };
    }
    return {
      variant: "neutral",
      confidence: 0.6,
      reasoning: "Mixed signals.",
    };
  };
}
