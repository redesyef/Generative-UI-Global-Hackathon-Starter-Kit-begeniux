import * as React from "react";
import type { AgentDirective, BehaviorSummary, ClassifyFn, Variant } from "./types";
import { useBehaviorTracker } from "./useBehaviorTracker";
import { BeGenContext } from "./BeGenProvider";
import { PERSONAS } from "./personas";

export type BeGenSurfaceProps = {
  variants: Record<Variant, React.ComponentType<any>>;
  classify: ClassifyFn;
  variantProps?: Record<string, any>;
  pageContext: BehaviorSummary["page_context"];
  seedPersona?: "decisive" | "deliberate";
  rateLimitMs?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: never;
};

export function BeGenSurface(props: BeGenSurfaceProps) {
  const {
    variants,
    classify,
    variantProps,
    pageContext,
    seedPersona,
    rateLimitMs = 4000,
    className,
    style,
  } = props;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const ctx = React.useContext(BeGenContext);

  const [currentVariant, setCurrentVariant] = React.useState<Variant>("neutral");
  const [lastDirective, setLastDirective] = React.useState<AgentDirective | null>(null);
  const [lastSummary, setLastSummary] = React.useState<BehaviorSummary | null>(null);

  const lastClassifyAtRef = React.useRef(0);
  const inFlightRef = React.useRef(false);
  const classifyRef = React.useRef(classify);
  React.useEffect(() => {
    classifyRef.current = classify;
  }, [classify]);

  const ctxRef = React.useRef(ctx);
  React.useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const handleFlush = React.useCallback(async (summary: BehaviorSummary) => {
    setLastSummary(summary);
    ctxRef.current?.setSummary(summary);

    const now = Date.now();
    if (inFlightRef.current) return;
    if (now - lastClassifyAtRef.current < rateLimitMs) return;

    lastClassifyAtRef.current = now;
    inFlightRef.current = true;
    try {
      const directive = await classifyRef.current(summary);
      setLastDirective(directive);
      setCurrentVariant(directive.variant);
      ctxRef.current?.setDirective(directive);
      ctxRef.current?.setVariant(directive.variant);
    } catch {
      // Keep current variant on classifier failure.
    } finally {
      inFlightRef.current = false;
    }
  }, [rateLimitMs]);

  const seedTrace = seedPersona ? PERSONAS[seedPersona] : undefined;

  useBehaviorTracker({
    containerRef,
    onFlush: handleFlush,
    pageContext,
    seedTrace,
  });

  const ActiveComponent = variants[currentVariant] ?? variants.neutral;

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      data-begen-surface
      data-begen-variant={currentVariant}
    >
      <div
        key={currentVariant}
        style={{
          opacity: 1,
          transition: "opacity 200ms ease",
          animation: "begen-fade-in 200ms ease",
        }}
      >
        {ActiveComponent ? <ActiveComponent {...(variantProps ?? {})} /> : null}
      </div>
      <BeGenSurfaceStyles />
      {/* Expose directive/summary on a hidden node for debugging */}
      {lastDirective && (
        <span
          style={{ display: "none" }}
          data-begen-confidence={lastDirective.confidence}
          data-begen-reasoning={lastDirective.reasoning}
          data-begen-events={lastSummary?.events_seen ?? 0}
        />
      )}
    </div>
  );
}

const STYLE_INJECTED = "__begen_styles__";

function BeGenSurfaceStyles() {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if ((document as any)[STYLE_INJECTED]) return;
    const tag = document.createElement("style");
    tag.setAttribute("data-begen-styles", "");
    tag.textContent = `@keyframes begen-fade-in { from { opacity: 0 } to { opacity: 1 } }`;
    document.head.appendChild(tag);
    (document as any)[STYLE_INJECTED] = true;
  }, []);
  return null;
}
