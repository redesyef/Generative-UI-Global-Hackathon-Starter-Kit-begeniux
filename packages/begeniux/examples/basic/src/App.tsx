import {
  BeGenProvider,
  BeGenSurface,
  createHeuristicClassifier,
  useBeGenContext,
} from "begeniux";

const classify = createHeuristicClassifier();

const cardBase: React.CSSProperties = {
  padding: "32px",
  borderRadius: "12px",
  fontWeight: 600,
  textAlign: "center",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  color: "white",
};

function DecisiveMock() {
  return <div style={{ ...cardBase, background: "#dc2626" }}>DECISIVE</div>;
}
function DeliberateMock() {
  return <div style={{ ...cardBase, background: "#2563eb" }}>DELIBERATE</div>;
}
function NeutralMock() {
  return <div style={{ ...cardBase, background: "#52525b" }}>NEUTRAL</div>;
}

const variants = {
  decisive: DecisiveMock,
  deliberate: DeliberateMock,
  neutral: NeutralMock,
};

function Telemetry({ label }: { label: string }) {
  const ctx = useBeGenContext();
  return (
    <div style={{ fontSize: "12px", marginTop: "12px", opacity: 0.7 }}>
      <div>
        <strong>{label}</strong> · variant: {ctx.variant}
      </div>
      {ctx.directive && (
        <div>
          confidence: {ctx.directive.confidence.toFixed(2)} · {ctx.directive.reasoning}
        </div>
      )}
      {ctx.summary && (
        <div>
          events: {ctx.summary.events_seen} · clicks/min: {ctx.summary.clicks_per_min} · dwell:{" "}
          {ctx.summary.avg_dwell_ms}ms · hovers: {ctx.summary.hover_count}
        </div>
      )}
    </div>
  );
}

function Surface({
  label,
  seedPersona,
}: {
  label: string;
  seedPersona?: "decisive" | "deliberate";
}) {
  return (
    <BeGenProvider>
      <div style={{ flex: 1, padding: "24px", border: "1px solid #2a2a30", borderRadius: "12px" }}>
        <h2 style={{ marginTop: 0 }}>{label}</h2>
        <BeGenSurface
          variants={variants}
          classify={classify}
          pageContext={{ route: "/example", visible_product_ids: [] }}
          seedPersona={seedPersona}
        />
        <Telemetry label={label} />
      </div>
    </BeGenProvider>
  );
}

export function App() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px" }}>
      <h1 style={{ marginBottom: "4px" }}>begeniux</h1>
      <p style={{ marginTop: 0, opacity: 0.6 }}>
        Two surfaces, two seeded personas, one heuristic classifier. No API keys, no network.
      </p>
      <div style={{ display: "flex", gap: "24px", marginTop: "32px" }}>
        <Surface label="Seeded: decisive" seedPersona="decisive" />
        <Surface label="Seeded: deliberate" seedPersona="deliberate" />
      </div>
      <div style={{ marginTop: "32px" }}>
        <Surface label="Unseeded — interact to flip" />
      </div>
    </main>
  );
}
