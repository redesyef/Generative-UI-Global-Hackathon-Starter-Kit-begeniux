import type { BehaviorEvent } from "./types";

// Persona traces use *relative* t values (ms). The tracker rebases them so the
// latest event becomes Date.now() at mount, keeping clicks_per_min meaningful.

function buildDecisive(): BehaviorEvent[] {
  // ~12 fast clicks across 6 product targets, short dwells, deep scroll.
  const events: BehaviorEvent[] = [];
  const productIds = ["p-101", "p-102", "p-103", "p-104", "p-105", "p-106"];
  let t = 0;

  for (let i = 0; i < 12; i++) {
    t += 1500;
    events.push({ kind: "click", target: productIds[i % productIds.length], t });
  }
  for (let i = 0; i < 6; i++) {
    t += 800;
    events.push({
      kind: "dwell",
      target: productIds[i % productIds.length],
      durationMs: 600 + i * 80,
      t,
    });
  }
  for (let i = 0; i < 6; i++) {
    t += 1200;
    events.push({
      kind: "scroll",
      depth: Math.min(0.95, 0.4 + i * 0.1),
      t,
    });
  }
  for (let i = 0; i < 2; i++) {
    t += 600;
    events.push({
      kind: "hover",
      target: productIds[i],
      durationMs: 250,
      t,
    });
  }

  return events;
}

function buildDeliberate(): BehaviorEvent[] {
  // ~3 clicks across 6 distinct hover targets, long dwells, modest scroll.
  const events: BehaviorEvent[] = [];
  const productIds = ["p-201", "p-202", "p-203", "p-204", "p-205", "p-206"];
  let t = 0;

  for (let i = 0; i < 6; i++) {
    t += 5500;
    const target = productIds[i];
    events.push({ kind: "hover", target, durationMs: 1800 + i * 200, t });
    t += 200;
    events.push({
      kind: "dwell",
      target,
      durationMs: 5000 + i * 400,
      t,
    });
  }
  for (let i = 0; i < 3; i++) {
    t += 4000;
    events.push({ kind: "click", target: productIds[i], t });
  }
  for (let i = 0; i < 5; i++) {
    t += 1500;
    events.push({
      kind: "scroll",
      depth: Math.min(0.6, 0.2 + i * 0.08),
      t,
    });
  }

  return events;
}

export const PERSONAS: Record<"decisive" | "deliberate", BehaviorEvent[]> = {
  get decisive() {
    return buildDecisive();
  },
  get deliberate() {
    return buildDeliberate();
  },
};
