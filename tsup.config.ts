import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: { compilerOptions: { types: [] } },
  tsconfig: "tsconfig.build.json",
  target: "es2022",
  platform: "neutral",
  sourcemap: false,
  clean: true,
  treeshake: true,
});
