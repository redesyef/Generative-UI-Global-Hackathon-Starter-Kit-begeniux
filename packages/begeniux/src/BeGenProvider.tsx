import * as React from "react";
import type { AgentDirective, BehaviorSummary, Variant } from "./types";

export type BeGenContextValue = {
  variant: Variant;
  directive: AgentDirective | null;
  summary: BehaviorSummary | null;
  setVariant: (v: Variant) => void;
  setDirective: (d: AgentDirective) => void;
  setSummary: (s: BehaviorSummary) => void;
};

export const BeGenContext = React.createContext<BeGenContextValue | null>(null);

export function BeGenProvider({ children }: { children: React.ReactNode }) {
  const [variant, setVariant] = React.useState<Variant>("neutral");
  const [directive, setDirective] = React.useState<AgentDirective | null>(null);
  const [summary, setSummary] = React.useState<BehaviorSummary | null>(null);

  const value = React.useMemo<BeGenContextValue>(
    () => ({ variant, directive, summary, setVariant, setDirective, setSummary }),
    [variant, directive, summary],
  );

  return <BeGenContext.Provider value={value}>{children}</BeGenContext.Provider>;
}
