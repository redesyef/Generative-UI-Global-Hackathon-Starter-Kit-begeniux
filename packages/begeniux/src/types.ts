// ─── Behavior events ────────────────────────────────────────────────

export type BehaviorEvent =
  | { kind: "click"; target: string; t: number }
  | { kind: "rage-click"; target: string; count: number; t: number }
  | { kind: "scroll"; depth: number; t: number }
  | { kind: "hover"; target: string; durationMs: number; t: number }
  | { kind: "dwell"; target: string; durationMs: number; t: number }
  | { kind: "focus"; target: string; t: number }
  | { kind: "blur"; target: string; durationMs: number; t: number }
  | { kind: "input"; target: string; t: number }
  | { kind: "submit"; target: string; t: number }
  | { kind: "viewport-change"; width: number; height: number; t: number }
  | { kind: "error"; message: string; t: number }
  | { kind: "custom"; name: string; data: Record<string, unknown>; t: number };

// ─── Behavior summary (the input the agent reasons over) ────────────

export type BehaviorSummary<TContext = { route: string }> = {
  clicks_per_min: number;
  rage_clicks: number;
  avg_dwell_ms: number;
  scroll_depth: number;
  hover_count: number;
  form_interactions: number;
  errors_seen: number;
  events_seen: number;
  viewport: { width: number; height: number };
  custom: Record<string, number | string | boolean>;
  page_context: TContext;
};

// ─── Adaptations (CSS-only union for v0.2) ──────────────────────────

export type Adaptation =
  | { kind: "set-css-var"; selector: string; name: string; value: string }
  | { kind: "add-class"; selector: string; className: string }
  | { kind: "remove-class"; selector: string; className: string }
  | { kind: "set-style"; selector: string; property: string; value: string }
  | { kind: "set-attribute"; selector: string; name: string; value: string }
  | { kind: "set-aria-label"; selector: string; value: string };

export type AdaptationPlan = {
  adaptations: Adaptation[];
  confidence: number;
  reasoning: string;
  meta?: Record<string, unknown>;
};

// ─── Agent contract (single-pass) ───────────────────────────────────

export type AdaptInput<TContext = { route: string }> = {
  summary: BehaviorSummary<TContext>;
  designSystem: DesignSystem;
  dom: { visibleSelectors: string[]; route: string };
};

export type ClassifyFn<TContext = { route: string }> = (
  input: AdaptInput<TContext>,
) => Promise<AdaptationPlan>;

// ─── Design-system manifest (the agent's vocabulary) ────────────────

export type CssVariableSpec =
  | { description: string; type: "color"; defaultValue?: string }
  | { description: string; type: "length"; defaultValue?: string }
  | {
      description: string;
      type: "number";
      range?: [number, number];
      defaultValue?: string;
    }
  | { description: string; type: "string"; defaultValue?: string }
  | {
      description: string;
      type: "enum";
      values: string[];
      defaultValue?: string;
    };

export type DesignSystem = {
  cssVariables?: Record<string, CssVariableSpec>;
  classes?: Record<string, string>;
  examples?: AdaptationPlan[];
};

// ─── Provider props + context value ─────────────────────────────────

export type ScopeOpts = {
  allow?: string[];
  deny?: string[];
};

export type BehaviorListener = {
  attach: (
    target: HTMLElement,
    push: (e: BehaviorEvent) => void,
  ) => () => void;
};

export type BeGenContextValue<TContext = { route: string }> = {
  summary: BehaviorSummary<TContext> | null;
  lastPlan: AdaptationPlan | null;
  appliedAdaptations: ReadonlyArray<Adaptation>;
  recentEvents: ReadonlyArray<BehaviorEvent>;
  /**
   * Apply an AdaptationPlan via the provider's engine. Used by external
   * adapters (e.g. CopilotKit frontend tool handler) that source plans
   * outside the provider's `classify` loop.
   */
  applyPlan: (plan: AdaptationPlan) => void;
  /** Read-only access to the active design system. */
  getDesignSystem: () => DesignSystem;
};
