import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    copilotkit: "src/adapters/copilotkit.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: ["react", "react-dom", "@copilotkit/react-core", "zod"],
  sourcemap: true,
  splitting: false,
  target: "es2020",
});
