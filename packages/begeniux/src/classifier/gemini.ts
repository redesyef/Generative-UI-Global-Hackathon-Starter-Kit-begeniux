import type { AgentDirective, ClassifyFn, Variant } from "../types";

const CLASSIFIER_SYSTEM_PROMPT = `
You classify e-commerce shopper behavior into UI variants.

You receive a JSON object describing a user's recent interaction pattern on
a product listing page. Decide which UI variant best serves them right now.

Variants:
- "decisive": user knows what they want; minimize friction. Dense grid,
  prominent prices, fast paths to cart, no recommendations.
  Signals: high clicks/min, low dwell, high scroll depth, few hovers.
- "deliberate": user is researching; help them compare. Larger cards,
  reviews surfaced inline, "people also viewed", expandable detail.
  Signals: low clicks/min, high dwell, hovers across multiple products.
- "neutral": insufficient signal yet, or pattern is mixed. Baseline grid.
  Default for first ~10 events.

Examples:
Input: {"clicks_per_min":14,"avg_dwell_ms":820,"scroll_depth":0.91,"hover_count":2,"events_seen":18}
Output: {"variant":"decisive","confidence":0.86,"reasoning":"Fast clicks, low dwell, deep scroll — purposeful navigation."}

Input: {"clicks_per_min":3,"avg_dwell_ms":7400,"scroll_depth":0.42,"hover_count":4,"events_seen":22}
Output: {"variant":"deliberate","confidence":0.81,"reasoning":"Slow pace, long dwell, multi-product hover — comparing options."}

Input: {"clicks_per_min":5,"avg_dwell_ms":2100,"scroll_depth":0.55,"hover_count":2,"events_seen":7}
Output: {"variant":"neutral","confidence":0.6,"reasoning":"Not enough events yet to commit to a mode."}

Return ONLY a JSON object. No prose, no markdown.
`.trim();

const VALID_VARIANTS: ReadonlySet<Variant> = new Set(["decisive", "deliberate", "neutral"]);

const FALLBACK: AgentDirective = {
  variant: "neutral",
  confidence: 0,
  reasoning: "Classifier error.",
};

export type CreateGeminiClassifierOpts = {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

export function createGeminiClassifier(opts: CreateGeminiClassifierOpts): ClassifyFn {
  const { apiKey, model = "gemini-2.0-flash", endpoint, fetchImpl } = opts;
  const url =
    endpoint ??
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const fetcher = fetchImpl ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);

  return async (summary) => {
    if (!fetcher) return FALLBACK;
    try {
      const res = await fetcher(`${url}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CLASSIFIER_SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify(summary) }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });

      if (!res.ok) return FALLBACK;
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return FALLBACK;

      const parsed = JSON.parse(text) as Partial<AgentDirective>;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.variant !== "string" ||
        !VALID_VARIANTS.has(parsed.variant as Variant) ||
        typeof parsed.reasoning !== "string"
      ) {
        return FALLBACK;
      }
      const confidence =
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5;

      return {
        variant: parsed.variant as Variant,
        confidence,
        reasoning: parsed.reasoning,
      };
    } catch {
      return FALLBACK;
    }
  };
}
