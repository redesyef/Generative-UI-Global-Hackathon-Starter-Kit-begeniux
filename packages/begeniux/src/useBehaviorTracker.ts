import { useEffect, useRef, useState } from "react";
import type { BehaviorEvent, BehaviorSummary } from "./types";

export type UseBehaviorTrackerOpts = {
  containerRef: React.RefObject<HTMLElement>;
  flushEveryEvents?: number;
  flushAfterMs?: number;
  bufferSize?: number;
  onFlush: (summary: BehaviorSummary) => void;
  pageContext: BehaviorSummary["page_context"];
  seedTrace?: BehaviorEvent[];
};

const RECENT_EVENTS_CAP = 5;
const HOVER_MIN_MS = 200;

function targetLabel(el: EventTarget | null): string {
  if (!(el instanceof HTMLElement)) return "unknown";
  return (
    el.dataset.begenId ||
    el.getAttribute("data-product-id") ||
    el.getAttribute("aria-label") ||
    el.tagName.toLowerCase()
  );
}

function computeSummary(
  buffer: BehaviorEvent[],
  bufferSize: number,
  pageContext: BehaviorSummary["page_context"],
): BehaviorSummary {
  const now = Date.now();
  const windowStart = now - 60_000;

  let clicksLastMin = 0;
  let dwellSum = 0;
  let dwellCount = 0;
  let maxScroll = 0;
  const hoverTargets = new Set<string>();

  for (const ev of buffer) {
    if (ev.kind === "click" && ev.t >= windowStart) clicksLastMin += 1;
    if (ev.kind === "dwell") {
      dwellSum += ev.durationMs;
      dwellCount += 1;
    }
    if (ev.kind === "scroll" && ev.depth > maxScroll) maxScroll = ev.depth;
    if (ev.kind === "hover") hoverTargets.add(ev.target);
  }

  return {
    clicks_per_min: clicksLastMin,
    avg_dwell_ms: dwellCount === 0 ? 0 : Math.round(dwellSum / dwellCount),
    scroll_depth: Math.max(0, Math.min(1, maxScroll)),
    hover_count: hoverTargets.size,
    events_seen: Math.min(buffer.length, bufferSize),
    page_context: pageContext,
  };
}

export function useBehaviorTracker(opts: UseBehaviorTrackerOpts): {
  recentEvents: BehaviorEvent[];
} {
  const {
    containerRef,
    flushEveryEvents = 10,
    flushAfterMs = 5000,
    bufferSize = 50,
    onFlush,
    pageContext,
    seedTrace,
  } = opts;

  const bufferRef = useRef<BehaviorEvent[]>([]);
  const sinceFlushRef = useRef(0);
  const lastFlushAtRef = useRef(Date.now());
  const hoverStartRef = useRef<Map<string, number>>(new Map());
  const scrollRafRef = useRef<number | null>(null);

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
      if (next.length > RECENT_EVENTS_CAP) next.splice(0, next.length - RECENT_EVENTS_CAP);
      return next;
    });

    if (sinceFlushRef.current >= flushEveryEvents) {
      flush();
    }
  };

  const flush = () => {
    const summary = computeSummary(bufferRef.current, bufferSize, pageContextRef.current);
    sinceFlushRef.current = 0;
    lastFlushAtRef.current = Date.now();
    onFlushRef.current(summary);
  };

  useEffect(() => {
    if (seedTrace && seedTrace.length > 0) {
      const buf = bufferRef.current;
      // Rebase t values so the latest seed event aligns with Date.now().
      // Personas use small relative timestamps; this ensures click-per-min
      // and freshness-based metrics see them as recent activity.
      const maxT = seedTrace.reduce((m, e) => (e.t > m ? e.t : m), -Infinity);
      const now = Date.now();
      const offset = Number.isFinite(maxT) ? now - maxT : 0;
      const rebased = seedTrace.map((e) => ({ ...e, t: e.t + offset }));
      buf.push(...rebased);
      if (buf.length > bufferSize) buf.splice(0, buf.length - bufferSize);
      const summary = computeSummary(buf, bufferSize, pageContextRef.current);
      sinceFlushRef.current = 0;
      lastFlushAtRef.current = Date.now();
      onFlushRef.current(summary);
    }
    // mount-only seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onClick = (e: MouseEvent) => {
      pushEvent({ kind: "click", target: targetLabel(e.target), t: Date.now() });
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

    const computeScrollDepth = () => {
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || 1;
      const elementH = el.scrollHeight || rect.height || 1;
      const visibleBottom = Math.min(rect.bottom, viewportH);
      const scrolledPast = Math.max(0, visibleBottom - rect.top);
      return Math.max(0, Math.min(1, scrolledPast / elementH));
    };

    const onScroll = () => {
      if (scrollRafRef.current != null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        pushEvent({ kind: "scroll", depth: computeScrollDepth(), t: Date.now() });
      });
    };

    el.addEventListener("click", onClick);
    el.addEventListener("mouseover", onMouseOver);
    el.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });

    const interval = window.setInterval(() => {
      if (Date.now() - lastFlushAtRef.current >= flushAfterMs) {
        flush();
      }
    }, Math.max(250, Math.floor(flushAfterMs / 4)));

    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("mouseover", onMouseOver);
      el.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
      window.clearInterval(interval);
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, flushAfterMs, flushEveryEvents, bufferSize]);

  return { recentEvents };
}
