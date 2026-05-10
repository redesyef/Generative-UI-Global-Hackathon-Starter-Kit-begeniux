import type { ScopeOpts } from "./types";

export type DomSnapshotOpts = {
  /** Maximum number of selectors to return (default 50). */
  maxSelectors?: number;
  /** Scope filter — only include elements whose selectors match allow / not deny. */
  scope?: ScopeOpts;
};

/**
 * Walk the visible DOM under `root` and return a deduplicated list of
 * stable CSS selectors the agent can use. Prefers semantic anchors
 * (id, data-* attributes, role, semantic tag names) over class soup.
 */
export function snapshotVisibleSelectors(
  root: HTMLElement,
  opts: DomSnapshotOpts = {},
): string[] {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return [];
  }

  const max = opts.maxSelectors ?? 50;
  const seen = new Set<string>();
  const out: string[] = [];

  const viewportH = window.innerHeight || 1;
  const viewportW = window.innerWidth || 1;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_SKIP;
      // Skip clearly invisible nodes.
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return NodeFilter.FILTER_SKIP;
      if (rect.bottom < 0 || rect.top > viewportH) return NodeFilter.FILTER_SKIP;
      if (rect.right < 0 || rect.left > viewportW) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode();
  while (node && out.length < max) {
    if (node instanceof HTMLElement) {
      const sel = pickSelector(node);
      if (sel && !seen.has(sel) && passesScope(sel, opts.scope)) {
        seen.add(sel);
        out.push(sel);
      }
    }
    node = walker.nextNode();
  }
  return out;
}

function pickSelector(el: HTMLElement): string | null {
  // 1. id (best — globally unique)
  if (el.id) return `#${cssEscape(el.id)}`;

  // 2. data-begen-id (library-recommended stable handle)
  const begenId = el.getAttribute("data-begen-id");
  if (begenId) return `[data-begen-id="${attrEscape(begenId)}"]`;

  // 3. data-testid (common stable handle in apps with tests)
  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${attrEscape(testId)}"]`;

  // 4. role attribute
  const role = el.getAttribute("role");
  if (role) return `${el.tagName.toLowerCase()}[role="${attrEscape(role)}"]`;

  // 5. semantic tag (header, main, nav, footer, aside, section with aria-label, etc.)
  const semantic = SEMANTIC_TAGS.has(el.tagName.toLowerCase());
  if (semantic) {
    const aria = el.getAttribute("aria-label");
    if (aria) {
      return `${el.tagName.toLowerCase()}[aria-label="${attrEscape(aria)}"]`;
    }
    return el.tagName.toLowerCase();
  }

  // 6. fall back to a single representative class if any
  const cls = pickStableClass(el);
  if (cls) return `.${cssEscape(cls)}`;

  return null;
}

const SEMANTIC_TAGS = new Set([
  "header",
  "main",
  "nav",
  "footer",
  "aside",
  "article",
  "section",
  "form",
  "dialog",
]);

function pickStableClass(el: HTMLElement): string | null {
  // Skip Tailwind utility-shaped classes (contain ":" or start with hash-derived hex).
  for (const cls of el.classList) {
    if (cls.includes(":")) continue; // Tailwind variants like md:flex
    if (/^[a-z]+-[a-z0-9-]+$/.test(cls)) continue; // Tailwind atoms like text-red-500
    if (cls.length < 3) continue;
    return cls;
  }
  return null;
}

function passesScope(selector: string, scope?: ScopeOpts): boolean {
  if (!scope) return true;
  if (scope.deny?.some((d) => selector === d || selector.includes(d))) {
    return false;
  }
  if (
    scope.allow &&
    !scope.allow.some((a) => selector === a || selector.includes(a))
  ) {
    return false;
  }
  return true;
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function attrEscape(s: string): string {
  return s.replace(/"/g, '\\"');
}
