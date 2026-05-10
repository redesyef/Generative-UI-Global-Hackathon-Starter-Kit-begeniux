import type { AdaptInput, AdaptationPlan, ClassifyFn } from "../types";

export type HttpAdapterOpts = {
  /** Endpoint that accepts POST {AdaptInput} and returns AdaptationPlan. */
  url: string;
  /** Extra headers (auth, etc.). */
  headers?: Record<string, string>;
  /** Optional fetch override (testing / SSR / proxy). */
  fetchImpl?: typeof fetch;
  /** Abort the request after this many ms. Default 8000. */
  timeoutMs?: number;
  /** Custom request body shaper if your endpoint expects a different envelope. */
  bodyTransform?: (input: AdaptInput) => unknown;
  /** Custom response shaper if your endpoint returns a different envelope. */
  responseTransform?: (raw: unknown) => AdaptationPlan;
};

const FALLBACK_PLAN: AdaptationPlan = {
  adaptations: [],
  confidence: 0,
  reasoning: "HTTP adapter error.",
};

/**
 * Generic transport. Posts {summary, designSystem, dom} to the given URL and
 * expects an AdaptationPlan back. Use this when you have a custom API route
 * (Next.js, Hono, Express, anything) that calls your LLM server-side and
 * shapes the result into the contract.
 */
export function createHttpAdapter(opts: HttpAdapterOpts): ClassifyFn {
  const {
    url,
    headers,
    fetchImpl,
    timeoutMs = 8000,
    bodyTransform,
    responseTransform,
  } = opts;
  const fetcher =
    fetchImpl ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);

  return async (input) => {
    if (!fetcher) return FALLBACK_PLAN;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const body = bodyTransform ? bodyTransform(input) : input;
      const res = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) return FALLBACK_PLAN;
      const raw = (await res.json()) as unknown;
      const plan = responseTransform ? responseTransform(raw) : (raw as AdaptationPlan);
      if (!isValidPlan(plan)) return FALLBACK_PLAN;
      return plan;
    } catch {
      return FALLBACK_PLAN;
    } finally {
      clearTimeout(timer);
    }
  };
}

function isValidPlan(p: unknown): p is AdaptationPlan {
  if (!p || typeof p !== "object") return false;
  const plan = p as Partial<AdaptationPlan>;
  if (!Array.isArray(plan.adaptations)) return false;
  if (typeof plan.confidence !== "number") return false;
  if (typeof plan.reasoning !== "string") return false;
  return true;
}
