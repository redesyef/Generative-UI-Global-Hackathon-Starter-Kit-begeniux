import * as React from "react";
import type {
  Adaptation,
  AdaptationPlan,
  AdaptInput,
  BeGenContextValue,
  BehaviorEvent,
  BehaviorListener,
  BehaviorSummary,
  ClassifyFn,
  DesignSystem,
  ScopeOpts,
} from "./types";
import { useBehaviorTracker } from "./useBehaviorTracker";
import { AdaptationEngine } from "./AdaptationEngine";
import { snapshotVisibleSelectors } from "./domSnapshot";

export type BeGenProviderProps<TContext = { route: string }> = {
  /** The agent's vocabulary — what CSS variables and classes it may emit. */
  designSystem: DesignSystem;
  /** Per-page state forwarded into every BehaviorSummary. */
  pageContext: TContext;
  /**
   * Single-pass agent. Receives behavior + DOM + design system, returns a plan.
   * If omitted, the provider does NOT call any agent — it only tracks behavior
   * and exposes summaries via context. (Pair with createCopilotKitAdapter or
   * createHttpAdapter for real adaptation.)
   */
  classify?: ClassifyFn<TContext>;
  /** Restrict where the agent's adaptations may target. */
  scope?: ScopeOpts;
  /** Minimum ms between agent calls. Default 5000. */
  rateLimitMs?: number;
  /** Don't trigger an agent call until at least this many events have flushed since the last call. Default 5. */
  triggerEveryEvents?: number;
  /** Tracker idle-flush window. */
  flushAfterMs?: number;
  /** Tracker count-flush. */
  flushEveryEvents?: number;
  /** Tracker ring-buffer cap. */
  bufferSize?: number;
  /** Plug-in event sources. */
  customListeners?: BehaviorListener[];
  /** Element to scope listeners to. Default: document.body. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Pre-canned events injected on mount (for demos). */
  seedTrace?: BehaviorEvent[];
  children: React.ReactNode;
};

const BeGenContext = React.createContext<BeGenContextValue<any> | null>(null);

export function useBeGenContext<TContext = { route: string }>(): BeGenContextValue<TContext> {
  const ctx = React.useContext(BeGenContext);
  if (!ctx) {
    throw new Error("useBeGenContext must be used inside <BeGenProvider>");
  }
  return ctx as BeGenContextValue<TContext>;
}

export function BeGenProvider<TContext = { route: string }>(
  props: BeGenProviderProps<TContext>,
): React.ReactElement {
  const {
    designSystem,
    pageContext,
    classify,
    scope,
    rateLimitMs = 5000,
    triggerEveryEvents = 5,
    flushAfterMs = 5000,
    flushEveryEvents = 10,
    bufferSize = 50,
    customListeners,
    containerRef,
    seedTrace,
    children,
  } = props;

  // Engine is created lazily once document.body exists (post-mount).
  const engineRef = React.useRef<AdaptationEngine | null>(null);

  const [summary, setSummary] = React.useState<BehaviorSummary<TContext> | null>(null);
  const [lastPlan, setLastPlan] = React.useState<AdaptationPlan | null>(null);
  const [appliedAdaptations, setAppliedAdaptations] = React.useState<
    ReadonlyArray<Adaptation>
  >([]);

  const lastClassifyAtRef = React.useRef(0);
  const inFlightRef = React.useRef(false);
  const eventsSinceClassifyRef = React.useRef(0);
  const lastPlanHashRef = React.useRef<string | null>(null);

  const classifyRef = React.useRef(classify);
  React.useEffect(() => {
    classifyRef.current = classify;
  }, [classify]);

  const designSystemRef = React.useRef(designSystem);
  React.useEffect(() => {
    designSystemRef.current = designSystem;
  }, [designSystem]);

  const pageContextRef = React.useRef(pageContext);
  React.useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  const scopeRef = React.useRef(scope);
  React.useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  // Mount the engine once we're in the browser.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = containerRef?.current ?? document.body;
    if (!root) return;
    engineRef.current = new AdaptationEngine({
      root,
      scope: scopeRef.current,
      onEvent: () => {
        if (engineRef.current) {
          setAppliedAdaptations(engineRef.current.getApplied().slice());
        }
      },
    });
    return () => {
      engineRef.current?.revertAll();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFlush = React.useCallback(
    async (s: BehaviorSummary<TContext>) => {
      setSummary(s);
      eventsSinceClassifyRef.current += 1;

      const fn = classifyRef.current;
      if (!fn) return;
      if (inFlightRef.current) return;
      const now = Date.now();
      if (now - lastClassifyAtRef.current < rateLimitMs) return;
      if (eventsSinceClassifyRef.current < triggerEveryEvents) return;

      lastClassifyAtRef.current = now;
      eventsSinceClassifyRef.current = 0;
      inFlightRef.current = true;

      try {
        const root =
          (containerRef?.current ?? (typeof document !== "undefined" ? document.body : null)) ??
          null;
        const visibleSelectors = root
          ? snapshotVisibleSelectors(root, { scope: scopeRef.current })
          : [];

        const route =
          (s.page_context as unknown as { route?: string })?.route ?? "/";

        const input: AdaptInput<TContext> = {
          summary: s,
          designSystem: designSystemRef.current,
          dom: { visibleSelectors, route },
        };

        const plan = await fn(input);
        if (!plan || !Array.isArray(plan.adaptations)) return;

        // Skip identical consecutive plans.
        const hash = hashPlan(plan);
        if (hash === lastPlanHashRef.current) return;
        lastPlanHashRef.current = hash;

        setLastPlan(plan);
        engineRef.current?.apply(plan);
      } catch {
        // Classifier failure: keep current state.
      } finally {
        inFlightRef.current = false;
      }
    },
    [rateLimitMs, triggerEveryEvents, containerRef],
  );

  useBehaviorTracker<TContext>({
    containerRef,
    onFlush: handleFlush,
    pageContext,
    seedTrace,
    customListeners,
    flushAfterMs,
    flushEveryEvents,
    bufferSize,
  });

  const recentEventsRef = React.useRef<ReadonlyArray<BehaviorEvent>>([]);
  // We don't expose recentEvents directly from tracker into context here to
  // avoid extra renders; consumers needing a live event stream can use
  // useBehaviorTracker directly.

  const applyPlan = React.useCallback((plan: AdaptationPlan) => {
    if (!plan || !Array.isArray(plan.adaptations)) return;
    const hash = hashPlan(plan);
    if (hash === lastPlanHashRef.current) return;
    lastPlanHashRef.current = hash;
    setLastPlan(plan);
    engineRef.current?.apply(plan);
  }, []);

  const getDesignSystem = React.useCallback(
    () => designSystemRef.current,
    [],
  );

  const value = React.useMemo<BeGenContextValue<TContext>>(
    () => ({
      summary,
      lastPlan,
      appliedAdaptations,
      recentEvents: recentEventsRef.current,
      applyPlan,
      getDesignSystem,
    }),
    [summary, lastPlan, appliedAdaptations, applyPlan, getDesignSystem],
  );

  return (
    <BeGenContext.Provider value={value as BeGenContextValue<any>}>
      {children}
    </BeGenContext.Provider>
  );
}

function hashPlan(plan: AdaptationPlan): string {
  // Cheap deterministic hash for skip-if-identical comparison.
  // Order-sensitive: agent emitting adaptations in different orders is treated as different intent.
  const parts = plan.adaptations.map((a) => {
    switch (a.kind) {
      case "set-css-var":
        return `v|${a.selector}|${a.name}|${a.value}`;
      case "add-class":
        return `+|${a.selector}|${a.className}`;
      case "remove-class":
        return `-|${a.selector}|${a.className}`;
      case "set-style":
        return `s|${a.selector}|${a.property}|${a.value}`;
      case "set-attribute":
        return `a|${a.selector}|${a.name}|${a.value}`;
      case "set-aria-label":
        return `l|${a.selector}|${a.value}`;
    }
  });
  return parts.join("\n");
}
