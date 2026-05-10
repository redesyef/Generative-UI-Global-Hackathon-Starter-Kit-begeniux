import { useEffect, useRef, useState } from "react";
import type {
  BehaviorEvent,
  BehaviorListener,
  BehaviorSummary,
} from "./types";

export type UseBehaviorTrackerOpts<TContext = { route: string }> = {
  /** DOM element to scope listeners to. Defaults to document.body. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Flush after this many events. Default 10. */
  flushEveryEvents?: number;
  /** Flush after this many ms of idle. Default 5000. */
  flushAfterMs?: number;
  /** Ring buffer cap. Default 50. */
  bufferSize?: number;
  /** Called on every flush with the computed summary. */
  onFlush: (summary: BehaviorSummary<TContext>) => void;
  /** Page context (route, etc.) — included in every summary. */
  pageContext: TContext;
  /** Optional pre-canned events injected on mount. */
  seedTrace?: BehaviorEvent[];
  /** Plug-in event sources beyond the built-ins. */
  customListeners?: BehaviorListener[];
};

const RECENT_EVENTS_CAP = 10;
const HOVER_MIN_MS = 200;
const RAGE_CLICK_WINDOW_MS = 1000;
const RAGE_CLICK_THRESHOLD = 3;
const INPUT_THROTTLE_MS = 1000;

function targetLabel(el: EventTarget | null): string {
  if (!(el instanceof HTMLElement)) return "unknown";
  const begenId = el.getAttribute("data-begen-id");
  if (begenId) return `[data-begen-id="${begenId}"]`;
  if (el.id) return `#${el.id}`;
  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;
  return el.tagName.toLowerCase();
}

function computeSummary<TContext>(
  buffer: BehaviorEvent[],
  bufferSize: number,
  pageContext: TContext,
  custom: Record<string, number | string | boolean>,
): BehaviorSummary<TContext> {
  const now = Date.now();
  const windowStart = now - 60_000;

  let clicksLastMin = 0;
  let rageClicks = 0;
  let dwellSum = 0;
  let dwellCount = 0;
  let maxScroll = 0;
  let formInteractions = 0;
  let errorsSeen = 0;
  const hoverTargets = new Set<string>();
  let viewportW =
    typeof window !== "undefined" ? window.innerWidth || 0 : 0;
  let viewportH =
    typeof window !== "undefined" ? window.innerHeight || 0 : 0;

  for (const ev of buffer) {
    switch (ev.kind) {
      case "click":
        if (ev.t >= windowStart) clicksLastMin += 1;
        break;
      case "rage-click":
        rageClicks += 1;
        break;
      case "dwell":
        dwellSum += ev.durationMs;
        dwellCount += 1;
        break;
      case "scroll":
        if (ev.depth > maxScroll) maxScroll = ev.depth;
        break;
      case "hover":
        hoverTargets.add(ev.target);
        break;
      case "input":
      case "submit":
        formInteractions += 1;
        break;
      case "error":
        errorsSeen += 1;
        break;
      case "viewport-change":
        viewportW = ev.width;
        viewportH = ev.height;
        break;
      default:
        break;
    }
  }

  return {
    clicks_per_min: clicksLastMin,
    rage_clicks: rageClicks,
    avg_dwell_ms: dwellCount === 0 ? 0 : Math.round(dwellSum / dwellCount),
    scroll_depth: Math.max(0, Math.min(1, maxScroll)),
    hover_count: hoverTargets.size,
    form_interactions: formInteractions,
    errors_seen: errorsSeen,
    events_seen: Math.min(buffer.length, bufferSize),
    viewport: { width: viewportW, height: viewportH },
    custom,
    page_context: pageContext,
  };
}

export function useBehaviorTracker<TContext = { route: string }>(
  opts: UseBehaviorTrackerOpts<TContext>,
): { recentEvents: BehaviorEvent[] } {
  const {
    containerRef,
    flushEveryEvents = 10,
    flushAfterMs = 5000,
    bufferSize = 50,
    onFlush,
    pageContext,
    seedTrace,
    customListeners,
  } = opts;

  const bufferRef = useRef<BehaviorEvent[]>([]);
  const sinceFlushRef = useRef(0);
  const lastFlushAtRef = useRef(Date.now());
  const hoverStartRef = useRef<Map<string, number>>(new Map());
  const focusStartRef = useRef<Map<string, number>>(new Map());
  const lastInputAtRef = useRef<Map<string, number>>(new Map());
  const recentClicksRef = useRef<Map<string, number[]>>(new Map());
  const scrollRafRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const customSlotRef = useRef<Record<string, number | string | boolean>>({});

  const onFlushRef = useRef(onFlush);
  const pageContextRef = useRef(pageContext);
  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  const [recentEvents, setRecentEvents] = useState<BehaviorEvent[]>([]);

  const pushEvent = (ev: BehaviorEvent) => {
    const buf = bufferRef.current;
    buf.push(ev);
    if (buf.length > bufferSize) buf.splice(0, buf.length - bufferSize);
    sinceFlushRef.current += 1;

    setRecentEvents((prev) => {
      const next = [...prev, ev];
      if (next.length > RECENT_EVENTS_CAP) {
        next.splice(0, next.length - RECENT_EVENTS_CAP);
      }
      return next;
    });

    if (sinceFlushRef.current >= flushEveryEvents) {
      flush();
    }
  };

  const flush = () => {
    const summary = computeSummary(
      bufferRef.current,
      bufferSize,
      pageContextRef.current,
      customSlotRef.current,
    );
    sinceFlushRef.current = 0;
    lastFlushAtRef.current = Date.now();
    onFlushRef.current(summary);
  };

  // Seed trace handler (mount-only, rebases t to "now")
  useEffect(() => {
    if (!seedTrace || seedTrace.length === 0) return;
    const buf = bufferRef.current;
    const maxT = seedTrace.reduce((m, e) => (e.t > m ? e.t : m), -Infinity);
    const now = Date.now();
    const offset = Number.isFinite(maxT) ? now - maxT : 0;
    const rebased = seedTrace.map((e) => ({ ...e, t: e.t + offset }));
    buf.push(...rebased);
    if (buf.length > bufferSize) buf.splice(0, buf.length - bufferSize);
    const summary = computeSummary(
      buf,
      bufferSize,
      pageContextRef.current,
      customSlotRef.current,
    );
    sinceFlushRef.current = 0;
    lastFlushAtRef.current = Date.now();
    onFlushRef.current(summary);
    // mount-only seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main listener wiring
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const el =
      containerRef?.current ??
      (typeof document !== "undefined" ? document.body : null);
    if (!el) return;

    const onClick = (e: MouseEvent) => {
      const label = targetLabel(e.target);
      const t = Date.now();
      pushEvent({ kind: "click", target: label, t });

      // Rage-click detection
      const recent = recentClicksRef.current.get(label) ?? [];
      const filtered = recent.filter(
        (then) => t - then < RAGE_CLICK_WINDOW_MS,
      );
      filtered.push(t);
      recentClicksRef.current.set(label, filtered);
      if (filtered.length >= RAGE_CLICK_THRESHOLD) {
        pushEvent({
          kind: "rage-click",
          target: label,
          count: filtered.length,
          t,
        });
        recentClicksRef.current.set(label, []);
      }
    };

    const onMouseOver = (e: MouseEvent) => {
      const label = targetLabel(e.target);
      if (!hoverStartRef.current.has(label)) {
        hoverStartRef.current.set(label, Date.now());
      }
    };

    const onMouseOut = (e: MouseEvent) => {
      const label = targetLabel(e.target);
      const started = hoverStartRef.current.get(label);
      if (started == null) return;
      hoverStartRef.current.delete(label);
      const durationMs = Date.now() - started;
      if (durationMs < HOVER_MIN_MS) return;
      const t = Date.now();
      pushEvent({ kind: "hover", target: label, durationMs, t });
      pushEvent({ kind: "dwell", target: label, durationMs, t });
    };

    const onFocusIn = (e: FocusEvent) => {
      const label = targetLabel(e.target);
      focusStartRef.current.set(label, Date.now());
      pushEvent({ kind: "focus", target: label, t: Date.now() });
    };

    const onFocusOut = (e: FocusEvent) => {
      const label = targetLabel(e.target);
      const started = focusStartRef.current.get(label);
      if (started == null) return;
      focusStartRef.current.delete(label);
      const durationMs = Date.now() - started;
      if (durationMs < HOVER_MIN_MS) return;
      pushEvent({
        kind: "blur",
        target: label,
        durationMs,
        t: Date.now(),
      });
    };

    const onInput = (e: Event) => {
      const target = e.target;
      if (
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement &&
            (target as HTMLElement).isContentEditable)
        )
      ) {
        return;
      }
      const label = targetLabel(target);
      const now = Date.now();
      const last = lastInputAtRef.current.get(label) ?? 0;
      if (now - last < INPUT_THROTTLE_MS) return;
      lastInputAtRef.current.set(label, now);
      pushEvent({ kind: "input", target: label, t: now });
    };

    const onSubmit = (e: Event) => {
      const label = targetLabel(e.target);
      pushEvent({ kind: "submit", target: label, t: Date.now() });
    };

    const computeScrollDepth = () => {
      const rect = el.getBoundingClientRect();
      const viewportHCalc = window.innerHeight || 1;
      const elementH = el.scrollHeight || rect.height || 1;
      const visibleBottom = Math.min(rect.bottom, viewportHCalc);
      const scrolledPast = Math.max(0, visibleBottom - rect.top);
      return Math.max(0, Math.min(1, scrolledPast / elementH));
    };

    const onScroll = () => {
      if (scrollRafRef.current != null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        pushEvent({
          kind: "scroll",
          depth: computeScrollDepth(),
          t: Date.now(),
        });
      });
    };

    const onResize = () => {
      if (resizeRafRef.current != null) return;
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        pushEvent({
          kind: "viewport-change",
          width: window.innerWidth,
          height: window.innerHeight,
          t: Date.now(),
        });
      });
    };

    const onError = (e: ErrorEvent) => {
      pushEvent({
        kind: "error",
        message: String(e.message ?? "unknown"),
        t: Date.now(),
      });
    };

    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      pushEvent({
        kind: "error",
        message: `unhandled-rejection: ${String(e.reason ?? "unknown")}`,
        t: Date.now(),
      });
    };

    el.addEventListener("click", onClick);
    el.addEventListener("mouseover", onMouseOver);
    el.addEventListener("mouseout", onMouseOut);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("input", onInput);
    el.addEventListener("submit", onSubmit);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    // Custom listeners (plug-in)
    const cleanups: Array<() => void> = [];
    if (customListeners) {
      for (const listener of customListeners) {
        try {
          const cleanup = listener.attach(el, pushEvent);
          cleanups.push(cleanup);
        } catch {
          // Listener attach failure is non-fatal.
        }
      }
    }

    const interval = window.setInterval(() => {
      if (Date.now() - lastFlushAtRef.current >= flushAfterMs) {
        flush();
      }
    }, Math.max(250, Math.floor(flushAfterMs / 4)));

    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("mouseover", onMouseOver);
      el.removeEventListener("mouseout", onMouseOut);
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      el.removeEventListener("input", onInput);
      el.removeEventListener("submit", onSubmit);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.clearInterval(interval);
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Tolerate cleanup errors.
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, flushAfterMs, flushEveryEvents, bufferSize]);

  return { recentEvents };
}
