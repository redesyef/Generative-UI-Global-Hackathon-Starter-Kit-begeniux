import type { Adaptation, AdaptationPlan, ScopeOpts } from "./types";

// CSS properties whose values can structurally break a layout — agents
// must not touch these via set-style. Variables (custom properties) and
// classes are the safe channels for layout-affecting design tokens.
const STRUCTURAL_PROPERTY_DENY = new Set([
  "display",
  "position",
  "visibility",
  "float",
  "clear",
  "z-index",
  "overflow",
  "overflow-x",
  "overflow-y",
  "transform-origin",
]);

type RevertFn = () => void;

export type AdaptationEngineEvent =
  | { kind: "applied"; adaptation: Adaptation; matched: number }
  | { kind: "skipped"; adaptation: Adaptation; reason: string }
  | { kind: "reverted"; count: number };

export type AdaptationEngineOpts = {
  root: HTMLElement;
  scope?: ScopeOpts;
  onEvent?: (e: AdaptationEngineEvent) => void;
};

export class AdaptationEngine {
  private root: HTMLElement;
  private scope: ScopeOpts;
  private onEvent?: (e: AdaptationEngineEvent) => void;
  private revertLog: RevertFn[] = [];
  private appliedSnapshot: Adaptation[] = [];

  constructor(opts: AdaptationEngineOpts) {
    this.root = opts.root;
    this.scope = opts.scope ?? {};
    this.onEvent = opts.onEvent;
  }

  /** Apply a plan. Reverts the previous plan first so mutations don't accumulate. */
  apply(plan: AdaptationPlan): void {
    this.revertAll();
    for (const adaptation of plan.adaptations) {
      this.applyOne(adaptation);
    }
  }

  /** Roll back every adaptation applied since the last revertAll. */
  revertAll(): void {
    if (this.revertLog.length === 0) return;
    const count = this.revertLog.length;
    // Revert in reverse order so dependent mutations unwind cleanly.
    for (let i = this.revertLog.length - 1; i >= 0; i--) {
      try {
        this.revertLog[i]();
      } catch {
        // Tolerate revert failures (e.g. element detached). Continue.
      }
    }
    this.revertLog = [];
    this.appliedSnapshot = [];
    this.onEvent?.({ kind: "reverted", count });
  }

  /** Read-only view of currently applied adaptations (for telemetry). */
  getApplied(): ReadonlyArray<Adaptation> {
    return this.appliedSnapshot;
  }

  // ── Internals ──────────────────────────────────────────────────────

  private applyOne(adaptation: Adaptation): void {
    const elements = this.resolveTargets(adaptation);
    if (elements === null) return; // skipped (logged)
    if (elements.length === 0) {
      this.onEvent?.({ kind: "skipped", adaptation, reason: "no-match" });
      return;
    }

    // Property-level safety: structural CSS properties via set-style are denied.
    if (
      adaptation.kind === "set-style" &&
      STRUCTURAL_PROPERTY_DENY.has(adaptation.property.toLowerCase())
    ) {
      this.onEvent?.({
        kind: "skipped",
        adaptation,
        reason: `structural-property-denied:${adaptation.property}`,
      });
      return;
    }

    for (const el of elements) {
      const revert = this.applyToElement(el, adaptation);
      if (revert) this.revertLog.push(revert);
    }
    this.appliedSnapshot.push(adaptation);
    this.onEvent?.({
      kind: "applied",
      adaptation,
      matched: elements.length,
    });
  }

  private resolveTargets(adaptation: Adaptation): HTMLElement[] | null {
    const sel = adaptation.selector;
    if (!sel || typeof sel !== "string") {
      this.onEvent?.({
        kind: "skipped",
        adaptation,
        reason: "invalid-selector",
      });
      return null;
    }

    if (this.scope.deny?.some((d) => this.selectorMatchesPattern(sel, d))) {
      this.onEvent?.({ kind: "skipped", adaptation, reason: "scope-deny" });
      return null;
    }
    if (
      this.scope.allow &&
      !this.scope.allow.some((a) => this.selectorMatchesPattern(sel, a))
    ) {
      this.onEvent?.({
        kind: "skipped",
        adaptation,
        reason: "scope-not-in-allow",
      });
      return null;
    }

    let nodes: NodeListOf<Element>;
    try {
      // `:root` and `html` should resolve to documentElement, which lives above this.root.
      // Allow them as a special case so design tokens land where Tailwind reads them.
      if (sel === ":root" || sel === "html") {
        return [document.documentElement];
      }
      nodes = this.root.querySelectorAll(sel);
    } catch {
      this.onEvent?.({
        kind: "skipped",
        adaptation,
        reason: "selector-syntax-error",
      });
      return null;
    }
    return Array.from(nodes).filter(
      (n): n is HTMLElement => n instanceof HTMLElement,
    );
  }

  private selectorMatchesPattern(selector: string, pattern: string): boolean {
    // Cheap conservative check: an exact match or pattern is a substring.
    // For real apps the scope.allow/deny lists should be specific.
    if (selector === pattern) return true;
    return selector.includes(pattern);
  }

  private applyToElement(
    el: HTMLElement,
    adaptation: Adaptation,
  ): RevertFn | null {
    switch (adaptation.kind) {
      case "set-css-var": {
        const prev = el.style.getPropertyValue(adaptation.name);
        const prevPriority = el.style.getPropertyPriority(adaptation.name);
        el.style.setProperty(adaptation.name, adaptation.value);
        return () => {
          if (prev) el.style.setProperty(adaptation.name, prev, prevPriority);
          else el.style.removeProperty(adaptation.name);
        };
      }
      case "add-class": {
        if (el.classList.contains(adaptation.className)) return null;
        el.classList.add(adaptation.className);
        return () => el.classList.remove(adaptation.className);
      }
      case "remove-class": {
        if (!el.classList.contains(adaptation.className)) return null;
        el.classList.remove(adaptation.className);
        return () => el.classList.add(adaptation.className);
      }
      case "set-style": {
        const prop = adaptation.property;
        const prev = el.style.getPropertyValue(prop);
        const prevPriority = el.style.getPropertyPriority(prop);
        el.style.setProperty(prop, adaptation.value);
        return () => {
          if (prev) el.style.setProperty(prop, prev, prevPriority);
          else el.style.removeProperty(prop);
        };
      }
      case "set-attribute": {
        const had = el.hasAttribute(adaptation.name);
        const prev = el.getAttribute(adaptation.name);
        el.setAttribute(adaptation.name, adaptation.value);
        return () => {
          if (had && prev !== null) el.setAttribute(adaptation.name, prev);
          else el.removeAttribute(adaptation.name);
        };
      }
      case "set-aria-label": {
        const had = el.hasAttribute("aria-label");
        const prev = el.getAttribute("aria-label");
        el.setAttribute("aria-label", adaptation.value);
        return () => {
          if (had && prev !== null) el.setAttribute("aria-label", prev);
          else el.removeAttribute("aria-label");
        };
      }
      default: {
        // Exhaustiveness check
        const _exhaustive: never = adaptation;
        void _exhaustive;
        return null;
      }
    }
  }
}
