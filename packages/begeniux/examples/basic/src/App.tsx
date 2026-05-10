import { useEffect, useMemo } from "react";
import {
  BeGenProvider,
  createHttpAdapter,
  useBeGenContext,
  type AdaptInput,
  type AdaptationPlan,
  type ClassifyFn,
  type DesignSystem,
} from "begeniux";

// ─── Design system the agent is allowed to speak ────────────────────

const designSystem: DesignSystem = {
  cssVariables: {
    "--begen-accent": {
      description: "Brand accent color used for CTAs and emphasis.",
      type: "color",
      defaultValue: "#7c3aed",
    },
    "--begen-density": {
      description: "Layout density (smaller = compact, larger = spacious).",
      type: "length",
      defaultValue: "16px",
    },
  },
  classes: {
    "is-engaged": "Visual treatment for high-engagement state.",
    "is-skimming": "Visual treatment for low-engagement state.",
  },
};

// ─── Mock classifier — returns a canned plan based on a tiny heuristic ─
// Stands in for a real LangGraph endpoint. No LLM, no network.

const mockClassify: ClassifyFn = async (input: AdaptInput) => {
  const s = input.summary;
  if (s.events_seen < 5) {
    return {
      adaptations: [],
      confidence: 0.4,
      reasoning: "Too few events to commit to a change yet.",
    };
  }

  const engaged = s.clicks_per_min > 6 || s.hover_count > 3;
  if (engaged) {
    return {
      adaptations: [
        { kind: "set-css-var", selector: ":root", name: "--begen-accent", value: "#dc2626" },
        { kind: "set-css-var", selector: ":root", name: "--begen-density", value: "10px" },
        { kind: "add-class", selector: "main", className: "is-engaged" },
        { kind: "remove-class", selector: "main", className: "is-skimming" },
      ],
      confidence: 0.82,
      reasoning: "High click rate and multi-target hovers — emphasize action affordances.",
    };
  }

  return {
    adaptations: [
      { kind: "set-css-var", selector: ":root", name: "--begen-accent", value: "#2563eb" },
      { kind: "set-css-var", selector: ":root", name: "--begen-density", value: "20px" },
      { kind: "add-class", selector: "main", className: "is-skimming" },
      { kind: "remove-class", selector: "main", className: "is-engaged" },
    ],
    confidence: 0.7,
    reasoning: "Calm pace — give the user breathing room.",
  };
};

// In a real app you'd swap the mockClassify for createHttpAdapter pointing at
// your endpoint. Both satisfy ClassifyFn — the provider doesn't care which.
//
//   const classify = createHttpAdapter({ url: "/api/begen/adapt" });

const classify = mockClassify;

// ─── UI ─────────────────────────────────────────────────────────────

function GlobalStyles() {
  return (
    <style>
      {`
:root { --begen-accent: ${designSystem.cssVariables!["--begen-accent"].defaultValue}; --begen-density: 16px; }
body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #0b0c0f; color: #f5f5f7; }
main { padding: var(--begen-density); transition: padding 200ms ease; max-width: 900px; margin: 0 auto; }
h1 { margin: 0 0 8px; font-size: 28px; }
p { opacity: 0.7; margin: 0 0 16px; }
button {
  background: var(--begen-accent);
  color: white;
  padding: var(--begen-density) calc(var(--begen-density) * 1.5);
  border: 0;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 200ms ease;
}
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--begen-density); margin-top: 24px; }
.card { padding: var(--begen-density); background: #18181b; border-radius: 8px; transition: padding 200ms ease; }
.card h3 { margin: 0 0 4px; font-size: 16px; }
.card p { margin: 0; font-size: 13px; }
.is-engaged .card { background: #1c1c22; }
.is-skimming .card { background: #15151b; }
.tele { margin-top: 32px; padding: 16px; background: #15151b; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 12px; }
.tele h4 { margin: 0 0 8px; opacity: 0.6; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
.row { display: flex; justify-content: space-between; padding: 2px 0; }
.row strong { opacity: 0.5; }
`}
    </style>
  );
}

function Telemetry() {
  const { summary, lastPlan, appliedAdaptations } = useBeGenContext();
  return (
    <div className="tele">
      <h4>Telemetry</h4>
      {summary && (
        <>
          <div className="row">
            <span>events seen</span>
            <strong>{summary.events_seen}</strong>
          </div>
          <div className="row">
            <span>clicks/min</span>
            <strong>{summary.clicks_per_min}</strong>
          </div>
          <div className="row">
            <span>avg dwell ms</span>
            <strong>{summary.avg_dwell_ms}</strong>
          </div>
          <div className="row">
            <span>hover count</span>
            <strong>{summary.hover_count}</strong>
          </div>
          <div className="row">
            <span>rage clicks</span>
            <strong>{summary.rage_clicks}</strong>
          </div>
        </>
      )}
      {lastPlan && (
        <>
          <h4 style={{ marginTop: 12 }}>Last plan</h4>
          <div className="row">
            <span>confidence</span>
            <strong>{lastPlan.confidence.toFixed(2)}</strong>
          </div>
          <div className="row">
            <span>reasoning</span>
            <strong style={{ textAlign: "right", maxWidth: "60%" }}>
              {lastPlan.reasoning}
            </strong>
          </div>
          <div className="row">
            <span>applied</span>
            <strong>{appliedAdaptations.length} mutation(s)</strong>
          </div>
        </>
      )}
    </div>
  );
}

function Demo() {
  const cards = useMemo(
    () => [
      { id: "card-1", title: "Card one", body: "Hover me, click me, dwell on me." },
      { id: "card-2", title: "Card two", body: "Behavior signals drive CSS changes." },
      { id: "card-3", title: "Card three", body: "No variants — the agent emits live mutations." },
    ],
    [],
  );

  return (
    <main data-begen-id="demo-main">
      <h1>begeniux · drop-in adaptive UI</h1>
      <p>
        Click rapidly to flip into <em>engaged</em> mode. Sit still for a moment to drift back to{" "}
        <em>skimming</em>. The accent color, layout density, and card backgrounds all update live —
        no page reload, no variants pre-baked.
      </p>
      <button data-begen-id="demo-cta">Click me a bunch</button>
      <div className="cards">
        {cards.map((c) => (
          <div key={c.id} className="card" data-begen-id={c.id}>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </div>
        ))}
      </div>
      <Telemetry />
    </main>
  );
}

export function App() {
  // Acknowledge unused import for editor warnings; kept for the docstring example below.
  void createHttpAdapter;
  useEffect(() => {
    document.title = "begeniux · basic example";
  }, []);

  return (
    <>
      <GlobalStyles />
      <BeGenProvider
        designSystem={designSystem}
        pageContext={{ route: "/" }}
        classify={classify}
        rateLimitMs={2000}
        triggerEveryEvents={3}
      >
        <Demo />
      </BeGenProvider>
    </>
  );
}
