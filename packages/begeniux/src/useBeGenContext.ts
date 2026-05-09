import * as React from "react";
import { BeGenContext, type BeGenContextValue } from "./BeGenProvider";

export function useBeGenContext(): BeGenContextValue {
  const ctx = React.useContext(BeGenContext);
  if (!ctx) {
    throw new Error("useBeGenContext must be used inside <BeGenProvider>");
  }
  return ctx;
}
