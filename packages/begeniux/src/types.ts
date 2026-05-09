export type BehaviorEvent =
  | { kind: "click"; target: string; t: number }
  | { kind: "scroll"; depth: number; t: number }
  | { kind: "hover"; target: string; durationMs: number; t: number }
  | { kind: "dwell"; target: string; durationMs: number; t: number };

export type BehaviorSummary = {
  clicks_per_min: number;
  avg_dwell_ms: number;
  scroll_depth: number;
  hover_count: number;
  events_seen: number;
  page_context: {
    route: string;
    visible_product_ids: string[];
  };
};

export type Variant = "decisive" | "deliberate" | "neutral";

export type AgentDirective = {
  variant: Variant;
  confidence: number;
  reasoning: string;
};

export type ClassifyFn = (summary: BehaviorSummary) => Promise<AgentDirective>;
